import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";
import { db, clinicsTable, servicesTable, appointmentsTable, aiLogsTable, professionalsTable, professionalServicesTable, patientsTable, professionalSchedulesTable, productsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, desc, or, ilike } from "drizzle-orm";
import { logger } from "./logger";

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY must be set");
}

// Cliente principal — OpenRouter (acesso a múltiplos modelos gratuitos)
// timeout: 8s por modelo — evita travar 60s esperando um 429 do OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  timeout: 8_000,
  defaultHeaders: {
    "HTTP-Referer": "https://clinicai.app",
    "X-Title": "ClinicAI",
  },
});

// Cliente primário — Gemini (Google AI; suporte nativo a function calling e alta qualidade)
const geminiClient = process.env.GEMINI_API_KEY
  ? new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: process.env.GEMINI_API_KEY,
      timeout: 15_000,
    })
  : null;

// Cliente secundário — Groq (latência ultra-baixa; ativado quando Gemini e OpenRouter esgotam rate limit)
const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

// Modelos Gemini — primário; suportam function calling nativo
const GEMINI_MODEL_ROTATION = [
  "gemini-2.0-flash",         // mais rápido, ideal para atendimento em tempo real
  "gemini-2.0-flash-lite",    // fallback leve — gemini-1.5-flash descontinuado via OpenAI-compat
];

/** Verifica se um erro é AbortError (timeout manual via AbortController) */
function isAbortError(err: unknown): boolean {
  return (
    (err as { name?: string })?.name === "AbortError" ||
    (err as { code?: string })?.code === "ERR_CANCELED" ||
    ((err as { message?: string })?.message ?? "").toLowerCase().includes("abort") ||
    ((err as { message?: string })?.message ?? "").toLowerCase().includes("timeout")
  );
}
const geminiCooldowns = new Map<string, number>();
let geminiGlobalCooldownUntil = 0;

// Modelos OpenRouter — secundário (gratuitos); todos suportam tool use (function calling)
const AI_PRIMARY_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const AI_FALLBACK_MODEL = "qwen/qwen3-next-80b-a3b-instruct:free";
// Lista completa para rotação manual em caso de 429 — providers distintos = rate limits independentes
const AI_MODEL_ROTATION = [
  "meta-llama/llama-3.3-70b-instruct:free",  // Meta · 65K ctx
  "qwen/qwen3-next-80b-a3b-instruct:free",    // Qwen · 262K ctx
  "openai/gpt-oss-120b:free",                 // OpenAI OSS · 131K ctx · native tool use
  "nvidia/nemotron-3-super-120b-a12b:free",   // NVIDIA · 262K ctx · multi-agent
  "qwen/qwen3-coder:free",                     // Qwen3 Coder · 262K ctx · function calling
  "openai/gpt-oss-20b:free",                   // OpenAI OSS 20B · 131K ctx · function calling
  "nvidia/nemotron-nano-9b-v2:free",          // NVIDIA Nemotron Nano 9B · 128K ctx · tool use
];

// Modelos Groq em ordem de preferência — suportam function calling
const GROQ_MODEL_ROTATION = [
  "llama-3.3-70b-versatile",  // 70B · 131K ctx · 280 TPS · melhor qualidade
  // llama-3.1-8b-instant removido: system prompt excede o limite de 6000 TPM do modelo 8B
];

/**
 * Cooldown por modelo após receber 429 (compartilhado entre requisições).
 * Evita retries inúteis enquanto o rate limit do modelo ainda está ativo.
 */
const MODEL_COOLDOWN_MS = 20_000; // 20 segundos — modelos gratuitos recuperam rápido
const modelCooldowns = new Map<string, number>(); // model → disponível após timestamp

/**
 * Cooldown global do OpenRouter — ativado quando TODOS os modelos falham com 429 numa
 * mesma rodada. Evita repetir 7 requisições HTTP que vão falhar na próxima mensagem.
 * Quando ativo, vai direto para Groq sem nem tentar OpenRouter.
 */
let openRouterGlobalCooldownUntil = 0;

const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Verifica horários disponíveis para uma data ESPECÍFICA. ATENÇÃO: Só chame esta ferramenta quando (1) o cliente já CONFIRMOU EXPLICITAMENTE que quer agendar (disse 'sim', 'quero', 'pode ser', 'vamos' etc.) E (2) tiver uma data EXATA em YYYY-MM-DD. Se o paciente não informou a data ou mencionou apenas um dia da semana (ex: 'quarta', 'amanhã'), use find_available_dates. NUNCA chame esta ferramenta após uma pergunta informacional ('pode me ajudar?', 'vocês têm X?') — responda primeiro, pergunte se quer agendar, aguarde confirmação. Quando um profissional é especificado, retorna apenas os slots desse profissional.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          serviceId: {
            type: "number",
            description: "Optional service ID to filter professionals and availability",
          },
          professionalId: {
            type: "number",
            description: "Optional professional ID. When provided, returns only that professional's available slots.",
          },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Cria um agendamento para o paciente. IMPORTANTE: use SEMPRE o nome exato do parâmetro 'scheduledAt' (NUNCA 'datetime' ou 'date'). Use SEMPRE 'serviceId' como número inteiro (NUNCA 'service' ou o nome do serviço como string). Use SEMPRE 'professionalId' como número inteiro (NUNCA 'professional' ou o nome). O telefone do paciente é injetado automaticamente — não inclua 'patientPhone' nos args.",
      parameters: {
        type: "object",
        properties: {
          patientName: {
            type: "string",
            description: "Nome completo do paciente. Use o nome que ele informou na conversa.",
          },
          serviceId: {
            type: "number",
            description: "ID NUMÉRICO do serviço (ex: 4). Pegue o ID exato da lista de Serviços do system prompt. NUNCA use o nome do serviço como string neste campo.",
          },
          professionalId: {
            type: "number",
            description: "ID NUMÉRICO do profissional (ex: 3). Pegue o ID exato da lista de Profissionais do system prompt. NUNCA use o nome como string.",
          },
          scheduledAt: {
            type: "string",
            description: "Data e hora do agendamento em formato ISO 8601 UTC. Exemplo: '2026-04-18T10:00:00.000Z'. ATENÇÃO: este campo se chama 'scheduledAt', NUNCA use 'datetime', 'date_time', 'date' ou qualquer outro nome. Use SEMPRE o horário exato que o paciente selecionou via seleção interativa.",
          },
          notes: {
            type: "string",
            description: "Observações adicionais opcionais sobre o agendamento.",
          },
        },
        required: ["patientName", "scheduledAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "faq_lookup",
      description: "Search the clinic knowledge base for answers to common questions",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or topic to search for",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Busca produtos/itens da empresa pelo nome, descrição ou categoria. Use quando o cliente perguntar sobre produtos, preços de produtos, disponibilidade de um item específico, ou quando quiser apresentar opções de produtos. Retorna nome, descrição, preço, link (produto digital) e URLs de imagem/áudio para compartilhar com o cliente.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Nome, categoria ou descrição do produto que o cliente quer encontrar. Deixe vazio para listar todos os produtos disponíveis.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_options",
      description: "Apresenta opções clicáveis ao paciente pelo WhatsApp. Use para: escolha entre serviços, escolha de profissional, confirmação de ações (sim/não). PROIBIDO usar para apresentar horários disponíveis — para horários use EXCLUSIVAMENTE check_availability. IDs das opções devem ser prefixos válidos como 'SVC|N', 'DATE|YYYY-MM-DD' — NUNCA use IDs genéricos como 'slot_1', 'opt_1', 'time_1'.",
      parameters: {
        type: "object",
        properties: {
          header: {
            type: "string",
            description: "Título curto e claro da pergunta (max 60 chars). Ex: 'Qual serviço?'",
          },
          body: {
            type: "string",
            description: "Mensagem completa ao paciente explicando o que precisa escolher.",
          },
          footerText: {
            type: "string",
            description: "Nota de rodapé opcional (max 60 chars). Ex: 'Clínica Vida Eterna'",
          },
          options: {
            type: "array",
            description: "Lista de opções para o paciente escolher",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Identificador único (ex: 'svc_1', 'prof_2', 'confirm')" },
                label: { type: "string", description: "Texto do botão/item (max 24 chars)" },
                description: { type: "string", description: "Descrição opcional (max 72 chars)" },
              },
              required: ["id", "label"],
            },
          },
        },
        required: ["header", "body", "options"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_available_dates",
      description: "Busca as próximas datas com disponibilidade real na agenda. ATENÇÃO CRÍTICA: Só chame quando o cliente já CONFIRMOU EXPLICITAMENTE que quer agendar (disse 'sim', 'quero', 'pode ser', 'vamos', 'tá bom', 'quero agendar' etc.). Se ele apenas perguntou sobre um serviço (ex: 'isso pode me ajudar?', 'vocês têm X?', 'como funciona?'), NÃO chame esta ferramenta — responda a dúvida primeiro e pergunte 'Gostaria de agendar?', depois chame. Use em dois casos após confirmação: (1) quando o cliente NÃO especificou uma data — nunca assuma a data de hoje; (2) quando precisar sugerir datas alternativas após um dia sem vagas. NUNCA calcule dias da semana manualmente — este tool retorna datas e dias da semana garantidamente corretos.",
      parameters: {
        type: "object",
        properties: {
          fromDate: {
            type: "string",
            description: "Data inicial da busca em formato YYYY-MM-DD (geralmente hoje)",
          },
          serviceId: {
            type: "number",
            description: "ID do serviço para filtrar profissionais (opcional)",
          },
          professionalId: {
            type: "number",
            description: "ID do profissional específico (opcional)",
          },
          maxDays: {
            type: "number",
            description: "Quantos dias à frente pesquisar (padrão 14, máximo 30)",
          },
        },
        required: ["fromDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_patient_info",
      description: "Salva ou atualiza os dados do cliente/paciente (nome, telefone real, anotações de interesse). Use assim que souber o nome do cliente, o número de telefone real (quando vier de WhatsApp Privacy), ou quando ele mencionar interesses relevantes. Pode ser chamado múltiplas vezes — as anotações são acumuladas.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Nome completo do cliente. Informe apenas se ele tiver dito o nome.",
          },
          phone: {
            type: "string",
            description: "Número de telefone real do cliente (ex: 5584912345678). Use apenas quando o cliente informar o número voluntariamente — nunca invente. Remove espaços, parênteses e hífens antes de salvar.",
          },
          notes: {
            type: "string",
            description: "Anotação sobre o interesse ou contexto do cliente (ex: 'Interessado no Curso EAD', 'Relatou ansiedade', 'Perguntou sobre o Hypnex - emagrecimento'). Seja conciso.",
          },
        },
        required: [],
      },
    },
  },
];

interface ClinicConfig {
  id: number;
  aiName: string;
  aiPersonalityPrompt: string;
  knowledgeBase: string;
  clinicType: string;
  schedulingEnabled: boolean;
}

/** Retorna as ferramentas disponíveis conforme o modo da empresa */
function getTools(schedulingEnabled: boolean): OpenAI.Chat.ChatCompletionTool[] {
  if (schedulingEnabled) return AI_TOOLS;
  // Empresas sem agendamento só têm acesso a faq_lookup, search_products, list_options e save_patient_info
  const NON_SCHEDULING = new Set(["faq_lookup", "search_products", "list_options", "save_patient_info"]);
  return AI_TOOLS.filter(t => {
    if (t.type !== "function") return false;
    const tool = t as { type: "function"; function: { name: string } };
    return NON_SCHEDULING.has(tool.function.name);
  });
}

export interface InteractiveSlotRow {
  id: string;       // "S|profId|svcId|iso" | "M|date|svc|prof|offset" | "OD"
  title: string;    // "09:00"
  description?: string; // "Dr. Carlos · Cardiologia"
}

export interface InteractiveList {
  type: "list";
  header: string;
  body: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: InteractiveSlotRow[];
  }>;
}

/** Escolha interativa via botões (≤3 opções) ou lista (>3 opções) */
export interface InteractiveChoice {
  header: string;
  body: string;
  footerText?: string;
  options: Array<{ id: string; label: string; description?: string }>;
}

interface ToolResult {
  text: string;
  interactiveList?: InteractiveList;
  interactiveChoice?: InteractiveChoice;
}

// ─── Helpers de fuso BRT (UTC-3, sem horário de verão no Brasil desde 2019) ──
/** Timestamp UTC da meia-noite BRT para a data YYYY-MM-DD */
const brtMidnightMs = (d: string) => new Date(`${d}T03:00:00Z`).getTime();
/** Dia da semana BRT (0=Dom…6=Sáb) */
const brtDayOfWeek = (d: string) => new Date(`${d}T03:00:00Z`).getUTCDay();
/** Formata Date/string/number no fuso BRT */
const fmtBRT = (dt: Date | string | number, opts: Intl.DateTimeFormatOptions = {}) =>
  new Date(dt as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });

// ─── Constantes de limites do WhatsApp ───────────────────────────────────────
const WA_MAX_CONTENT_ROWS = 8;  // 8 slots + 2 linhas de ação = 10 total (limite WA)

// ─── Dias da semana em PT-BR (calculados em TypeScript, nunca pela IA) ───────
const DAY_NAMES_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Gera InteractiveChoice com as próximas datas disponíveis para o profissional/serviço.
 * Usado quando check_availability não encontra slots, para evitar que a IA invente datas.
 */
async function buildAlternativeDatesChoice(
  clinicId: number,
  fromDate: string,
  serviceId?: number,
  professionalId?: number,
): Promise<InteractiveChoice | null> {
  let qualifiedProfIds: number[] = [];
  if (serviceId) {
    const links = await db
      .select({ professionalId: professionalServicesTable.professionalId })
      .from(professionalServicesTable)
      .where(eq(professionalServicesTable.serviceId, serviceId));
    qualifiedProfIds = links.map(l => l.professionalId);
  }
  const profFilter = professionalId
    ? [eq(professionalsTable.id, professionalId)]
    : qualifiedProfIds.length > 0
      ? [inArray(professionalsTable.id, qualifiedProfIds)]
      : [];

  const profs = await db
    .select({ id: professionalsTable.id })
    .from(professionalsTable)
    .where(and(eq(professionalsTable.clinicId, clinicId), eq(professionalsTable.active, true), ...profFilter));

  if (profs.length === 0) return null;

  const schedules = await db
    .select({ professionalId: professionalSchedulesTable.professionalId, dayOfWeek: professionalSchedulesTable.dayOfWeek })
    .from(professionalSchedulesTable)
    .where(and(
      inArray(professionalSchedulesTable.professionalId, profs.map(p => p.id)),
      eq(professionalSchedulesTable.isBlock, false),
    ));

  const workDaySet = new Set(schedules.map(s => `${s.professionalId}:${s.dayOfWeek}`));
  const fromMs = brtMidnightMs(fromDate);
  const options: Array<{ id: string; label: string; description: string }> = [];

  for (let d = 1; d <= 30 && options.length < 5; d++) {
    const ms = fromMs + d * 24 * 60 * 60 * 1000;
    const dateStr = new Date(ms).toISOString().slice(0, 10);
    const dow = new Date(ms).getUTCDay(); // dayBaseMs está em T03:00:00Z, então getUTCDay é correto
    if (profs.some(p => workDaySet.has(`${p.id}:${dow}`))) {
      // Verificar disponibilidade real — datas com todos os slots ocupados não são sugeridas
      const { interactiveList } = await buildAvailabilityList(clinicId, dateStr, serviceId, professionalId);
      if (interactiveList) {
        const [y, mo, day] = dateStr.split("-");
        options.push({
          id: `DATE|${dateStr}`,
          label: `${DAY_NAMES_SHORT[dow]} ${day}/${mo}`,
          description: `${DAY_NAMES_FULL[dow]}, ${day}/${mo}/${y}`,
        });
      }
    }
  }

  if (options.length === 0) return null;

  return {
    header: "📅 Outras datas disponíveis",
    body: "Essa data não tem horários disponíveis 😕 Mas olha — separei as próximas datas com vaga pra você. Qual fica melhor?",
    options,
  };
}

/**
 * Remove vazamentos de JSON/código do texto de resposta da IA.
 * Limpa markdown code blocks e linhas JSON antes de enviar ao paciente.
 */
// Nomes de ferramentas — usados para filtrar pseudo-chamadas geradas em modo noTools
const TOOL_NAMES_REGEX = /\b(save_patient_info|book_appointment|check_availability|list_options|find_available_dates|faq_lookup|search_products)\s*[>({]/;

function sanitizeReply(reply: string): string {
  // Remove blocos ```...``` (incluindo ```json)
  let clean = reply.replace(/```[\s\S]*?```/g, "");

  // ── Pré-limpeza: remove blocos JSON que aparecem antes do texto normal ────
  // Caso 1: objeto JSON completo colado ao início — {"key":val}Texto aqui...
  clean = clean.replace(/^\{[^{}]*\}\s*/s, "");
  // Caso 2: fragmento JSON multilinha no início (sem { abrindo, ou com })
  // Ex: "serviceId": 2,\n  "date": "..."}Texto
  clean = clean.replace(/^(?:[ \t]*"[a-zA-Z_][a-zA-Z0-9_]*"\s*:[^\n]+\n)+[ \t]*\}?\s*/m, "");

  // Converte markdown para formato WhatsApp ANTES de filtrar linhas
  // WhatsApp usa *bold*, _italic_, ~strike~, `mono` — NÃO suporta **bold** ou __italic__
  clean = clean
    .replace(/\*\*\*(.+?)\*\*\*/g, "*$1*")   // ***text*** → *text* (bold)
    .replace(/\*\*(.+?)\*\*/g, "*$1*")        // **text** → *text* (bold)
    .replace(/__(.+?)__/g, "_$1_")             // __text__ → _text_ (italic)
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")     // # heading → *heading* (bold)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [text](url) → text (remove links)

  // Remove pseudo-chamadas de ferramentas que modelos geram quando não têm function calling
  // Ex: "save_patient_info>{\"name\": \"Flavio\"}" ou "book_appointment({...})"
  clean = clean
    .split("\n")
    .filter(line => !TOOL_NAMES_REGEX.test(line))
    .join("\n");

  // Remove rótulos de ferramentas gerados como markdown bold standalone
  // Ex: "*Save Patient Info*" ou "*Book Appointment*" em linhas isoladas
  clean = clean
    .split("\n")
    .filter(line => !/^\s*\*[A-Z][a-zA-Z\s]{2,30}\*\s*$/.test(line.trim()))
    .join("\n");

  // Remove linhas que são JSON (estruturas de dados)
  // — Cobertura ampliada: qualquer par "chave": valor (não só chaves conhecidas)
  clean = clean
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (/^"[a-zA-Z_][a-zA-Z0-9_]*"\s*:/.test(t)) return false;          // "chave": valor
      if (/^[{[\]{}],?\s*$/.test(t)) return false;                          // linha só com {, }, [, ]
      if (/^\s*[{[\]]/.test(t)) return false;                               // começa com { [ ]
      if (/^\s*\{.*\}\s*$/.test(t)) return false;                          // objeto inline
      if (/^\s*\[.*\]\s*$/.test(t)) return false;                          // array inline
      if (/^\s*"(?:header|body|options|footerText|id|label|description|type)"\s*:/.test(t)) return false;
      return true;
    })
    .join("\n");

  // Remove } ] que ficam sozinhos/colados no início de linhas após filtrar o JSON
  // Ex: "}Aqui estão os horários..." → "Aqui estão os horários..."
  clean = clean.replace(/^[}\]],?\s*/gm, "");

  // ── FIX: Remove raciocínio interno em inglês (chain-of-thought vazando) ──────
  // Ex: "We need to call check_availability with date 2026-04-22, service physiotherapy."
  // Estes são pensamentos internos da IA que não devem aparecer na resposta ao paciente.
  clean = clean.replace(
    /(?:we need to|i need to|i will call|i'll call|we should call|we must call|need to call|going to call|i am going to call)\s+[\w_]+[^.!?\n]*[.!?]?\s*/gi,
    ""
  );
  // Também captura variantes no início de linha ou parágrafo
  clean = clean.replace(
    /^(?:we|i)\s+(?:need to|will|should|must|am going to)\s+(?:call|use|invoke|check|run)\s+[\w_]+[^.\n]*\.?\s*/gim,
    ""
  );

  // Colapsa múltiplas linhas em branco
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();

  // Remove referências técnicas de ID que a IA não deveria incluir na resposta
  // Ex: "[ID:3]", "(ID: 5)", "(ID 2)" — vêm do texto de resultado das tools
  clean = clean
    .replace(/\[ID:\s*\d+\]/g, "")
    .replace(/\(ID[:\s]\s*\d+\)/g, "")
    .trim();

  return clean || "Como posso ajudar?";
}

/**
 * Gera a lista interativa de horários disponíveis (paginada).
 * Exportada para ser usada tanto pelo AI tool quanto pelo webhook de paginação.
 */
export async function buildAvailabilityList(
  clinicId: number,
  date: string,
  serviceId?: number,
  professionalId?: number,
  offset = 0,
): Promise<{ text: string; interactiveList: InteractiveList | null; noSlotsChoice?: InteractiveChoice }> {
  const startOfDay = new Date(`${date}T00:00:00Z`);
  const endOfDay = new Date(`${date}T23:59:59Z`);

  let qualifiedProfessionalIds: number[] = [];
  if (serviceId) {
    const links = await db
      .select({ professionalId: professionalServicesTable.professionalId })
      .from(professionalServicesTable)
      .where(eq(professionalServicesTable.serviceId, serviceId));
    qualifiedProfessionalIds = links.map(l => l.professionalId);
  }

  const profFilter = professionalId
    ? [eq(professionalsTable.id, professionalId)]
    : qualifiedProfessionalIds.length > 0
      ? [inArray(professionalsTable.id, qualifiedProfessionalIds)]
      : [];

  const professionals = await db
    .select()
    .from(professionalsTable)
    .where(and(eq(professionalsTable.clinicId, clinicId), eq(professionalsTable.active, true), ...profFilter));

  if (professionals.length === 0) {
    return { text: `Nenhum profissional disponível para este serviço em ${date}.`, interactiveList: null };
  }

  const bookedSlots = await db
    .select({
      scheduledAt: appointmentsTable.scheduledAt,
      professionalId: appointmentsTable.professionalId,
      durationMinutes: servicesTable.durationMinutes,
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(
      and(
        eq(appointmentsTable.clinicId, clinicId),
        gte(appointmentsTable.scheduledAt, startOfDay),
        lte(appointmentsTable.scheduledAt, endOfDay),
        inArray(appointmentsTable.professionalId, professionals.map(p => p.id)),
      ),
    );

  const blockedByProfessional = new Map<number, Array<{ start: number; end: number }>>();
  for (const slot of bookedSlots) {
    if (slot.professionalId == null) continue;
    const start = new Date(slot.scheduledAt).getTime();
    const end = start + (slot.durationMinutes ?? 60) * 60 * 1000;
    if (!blockedByProfessional.has(slot.professionalId)) blockedByProfessional.set(slot.professionalId, []);
    blockedByProfessional.get(slot.professionalId)!.push({ start, end });
  }

  let slotDuration = 60;
  if (serviceId) {
    const [svc] = await db.select({ durationMinutes: servicesTable.durationMinutes }).from(servicesTable).where(eq(servicesTable.id, serviceId)).limit(1);
    if (svc) slotDuration = svc.durationMinutes;
  }

  // Fuso BRT: meia-noite BRT = T03:00:00Z
  const dayBaseMs = brtMidnightMs(date);
  const dayOfWeek = brtDayOfWeek(date);
  // Hora atual em BRT para evitar mostrar slots já passados hoje
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  const todayStrBRT = brtNow.toISOString().slice(0, 10);
  const minMinuteOfDay = date === todayStrBRT
    ? (brtNow.getUTCHours() + 1) * 60 + brtNow.getUTCMinutes()
    : 0;

  // Load schedules for all relevant professionals for this day
  const scheduleRows = await db
    .select()
    .from(professionalSchedulesTable)
    .where(
      and(
        inArray(professionalSchedulesTable.professionalId, professionals.map(p => p.id)),
        eq(professionalSchedulesTable.dayOfWeek, dayOfWeek),
      )
    );

  // Separate work windows and block windows per professional
  const workWindowsByProf = new Map<number, Array<{ start: number; end: number }>>();
  const scheduleBlocksByProf = new Map<number, Array<{ start: number; end: number }>>();
  for (const row of scheduleRows) {
    if (!row.isBlock) {
      if (!workWindowsByProf.has(row.professionalId)) workWindowsByProf.set(row.professionalId, []);
      workWindowsByProf.get(row.professionalId)!.push({ start: row.startMinute, end: row.endMinute });
    } else {
      if (!scheduleBlocksByProf.has(row.professionalId)) scheduleBlocksByProf.set(row.professionalId, []);
      scheduleBlocksByProf.get(row.professionalId)!.push({ start: row.startMinute, end: row.endMinute });
    }
  }

  // Coleta TODOS os slots livres de todos os profissionais
  interface SlotEntry { profId: number; profName: string; profSpec: string; min: number; isoSlot: string; timeStr: string; }
  const allSlots: SlotEntry[] = [];
  const textLines: string[] = [];

  for (const prof of professionals) {
    // If professional has no schedule configured for this day, they are unavailable
    const workWindows = workWindowsByProf.get(prof.id);
    if (!workWindows || workWindows.length === 0) {
      textLines.push(`${prof.name}: sem atendimento neste dia da semana`);
      continue;
    }

    const apptBlocked = blockedByProfessional.get(prof.id) ?? [];
    const schedBlocks = scheduleBlocksByProf.get(prof.id) ?? [];

    const freeSlots: string[] = [];
    for (const window of workWindows) {
      const winStart = Math.max(window.start, minMinuteOfDay);
      const winEnd = window.end;
      for (let min = winStart; min + slotDuration <= winEnd; min += slotDuration) {
        // Skip if inside a schedule block (e.g. lunch)
        const insideBlock = schedBlocks.some(b => min < b.end && min + slotDuration > b.start);
        if (insideBlock) continue;

        const slotStartMs = dayBaseMs + min * 60 * 1000;
        const slotEndMs = slotStartMs + slotDuration * 60 * 1000;
        // Skip if conflicts with an existing appointment
        if (apptBlocked.some(b => b.start < slotEndMs && b.end > slotStartMs)) continue;

        const h = Math.floor(min / 60);
        const m = min % 60;
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const isoSlot = new Date(slotStartMs).toISOString();
        allSlots.push({ profId: prof.id, profName: prof.name, profSpec: prof.specialty ?? "", min, isoSlot, timeStr });
        freeSlots.push(timeStr);
      }
    }
    if (freeSlots.length > 0) {
      textLines.push(`${prof.name} (${prof.specialty ?? "Geral"}) [ID:${prof.id}]: ${freeSlots.join(", ")}`);
    } else {
      textLines.push(`${prof.name}: sem horários livres neste dia`);
    }
  }

  const displayDate = new Date(dayBaseMs).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
  const text = `Disponibilidade em ${date}:\n${textLines.join("\n")}`;

  if (allSlots.length === 0) {
    // Sem horários: já gera botões de datas alternativas para não forçar outra chamada do modelo
    const altDates = await buildAlternativeDatesChoice(clinicId, date, serviceId, professionalId);
    return {
      text: `Não há horários disponíveis em ${displayDate}.`,
      interactiveList: null,
      noSlotsChoice: altDates ?? undefined,
    };
  }

  // Página atual de slots
  const pageSlots = allSlots.slice(offset, offset + WA_MAX_CONTENT_ROWS);
  const hasMore = allSlots.length > offset + WA_MAX_CONTENT_ROWS;

  // Agrupa por profissional mantendo ordem
  const sectionMap = new Map<number, { profName: string; rows: InteractiveSlotRow[] }>();
  for (const s of pageSlots) {
    if (!sectionMap.has(s.profId)) sectionMap.set(s.profId, { profName: s.profName, rows: [] });
    sectionMap.get(s.profId)!.rows.push({
      id: `S|${s.profId}|${serviceId ?? ""}|${s.isoSlot}`,
      title: s.timeStr,
      description: s.profSpec || undefined,
    });
  }

  const sections: InteractiveList["sections"] = [...sectionMap.values()].map(sec => ({
    title: `${sec.profName} — ${displayDate}`,
    rows: sec.rows,
  }));

  // Seção de ações de navegação
  const actionRows: InteractiveSlotRow[] = [];
  if (hasMore) {
    actionRows.push({
      id: `M|${date}|${serviceId ?? ""}|${professionalId ?? ""}|${offset + WA_MAX_CONTENT_ROWS}`,
      title: "Ver mais horários ▸",
      description: `${allSlots.length - offset - WA_MAX_CONTENT_ROWS} horário(s) restante(s)`,
    });
  }
  actionRows.push({ id: "OD", title: "🗓 Outro dia", description: "Escolher uma data diferente" });

  if (sections.length === 0) {
    sections.push({ title: "Opções", rows: actionRows });
  } else {
    sections.push({ title: "─ Navegação ─", rows: actionRows });
  }

  const interactiveList: InteractiveList = {
    type: "list",
    header: `📅 Horários — ${displayDate}`,
    body: offset > 0
      ? `Mais horários disponíveis (página ${Math.floor(offset / WA_MAX_CONTENT_ROWS) + 1}) 👇\nToque no horário de sua preferência.`
      : "Toque no horário que preferir para agendar! 👇",
    buttonText: "🕐 Ver horários",
    sections,
  };

  return { text, interactiveList };
}

/**
 * Converte sequências assistant(tool_calls) + tool(result) em mensagens de texto simples.
 * O Groq rejeita com 400 histórico de tool_calls gerado por outros providers (ex: OpenRouter),
 * pois faz validação cruzada do histórico contra os tools enviados na requisição.
 */
function flattenToolCallsInMessages(msgs: OpenAI.Chat.ChatCompletionMessageParam[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  let i = 0;
  while (i < msgs.length) {
    const msg = msgs[i];
    const asst = msg as { role: string; tool_calls?: unknown[] };
    if (asst.role === "assistant" && Array.isArray(asst.tool_calls) && asst.tool_calls.length > 0) {
      // Coletar todos os resultados de tool subsequentes
      const results: string[] = [];
      let j = i + 1;
      while (j < msgs.length && msgs[j].role === "tool") {
        const t = msgs[j] as OpenAI.Chat.ChatCompletionToolMessageParam;
        const c = typeof t.content === "string" ? t.content : "";
        if (c && c !== "ok") results.push(c);
        j++;
      }
      // Substituir toda a sequência por uma mensagem de texto
      out.push({ role: "assistant" as const, content: results.length > 0 ? results.join("\n") : "Consulta realizada." });
      i = j;
    } else if (msg.role === "tool") {
      i++; // mensagem tool órfã — ignorar
    } else {
      out.push(msg);
      i++;
    }
  }
  return out;
}

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  clinicId: number,
  patientPhone: string
): Promise<ToolResult> {
  try {
    if (toolName === "check_availability") {
      const { date, serviceId, professionalId } = args as { date: string; serviceId?: number; professionalId?: number };

      // Validar se o profissional existe, está ativo e pertence à clínica
      if (professionalId) {
        const [profCheck] = await db
          .select({ id: professionalsTable.id, name: professionalsTable.name })
          .from(professionalsTable)
          .where(and(eq(professionalsTable.id, professionalId), eq(professionalsTable.clinicId, clinicId), eq(professionalsTable.active, true)))
          .limit(1);
        if (!profCheck) {
          return { text: `Erro: profissional ID ${professionalId} não encontrado ou não está ativo nesta clínica. Use SOMENTE os profissionais listados no sistema com seus IDs exatos. Se o cliente pediu um profissional que não existe, informe-o gentilmente e apresente os disponíveis.` };
        }
        // Validar se o profissional realiza o serviço solicitado
        if (serviceId) {
          const [link] = await db
            .select({ professionalId: professionalServicesTable.professionalId })
            .from(professionalServicesTable)
            .where(and(eq(professionalServicesTable.professionalId, professionalId), eq(professionalServicesTable.serviceId, serviceId)))
            .limit(1);
          if (!link) {
            return { text: `${profCheck.name} não está cadastrado para realizar este serviço (ID ${serviceId}). Chame check_availability sem professionalId para ver todos os profissionais disponíveis para este serviço, ou verifique quais serviços cada profissional realiza na lista do sistema.` };
          }
        }
      }

      const result = await buildAvailabilityList(clinicId, date, serviceId, professionalId);
      // Se não há slots, já retorna os botões de datas alternativas prontos
      if (result.noSlotsChoice) {
        return {
          text: result.text,
          interactiveChoice: result.noSlotsChoice,
        };
      }
      return { text: result.text, interactiveList: result.interactiveList ?? undefined };
    }

    if (toolName === "list_options") {
      const { header, body, footerText, options } = args as {
        header: string;
        body: string;
        footerText?: string;
        options: Array<{ id: string; label: string; description?: string }>;
      };

      // ── Guard: detecta uso indevido de list_options para horários ───────────
      // IDs como "slot_1", "time_2", "14:00", "opt_1", "manha", "tarde" são falsos — não têm isoSlot real.
      // Se detectados, bloqueia e instrui a IA a usar check_availability.
      const FAKE_SLOT_ID = /^(?:slot_?\d+|time_?\d+|opt_?\d+|horario_?\d+|\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}T[\d:.+\-Z]*|manh[aã]|tarde|noite|morning|afternoon|evening|period_?\w*)$/i;
      const hasTimeLikeLabels = options.some(o => /^\d{1,2}:\d{2}$/.test(o.label.trim()));
      const hasTimePeriodLabels = options.some(o => /^(?:manh[a\u00e3]|tarde|noite|morning|afternoon|evening)$/i.test(o.label.trim()));
      const hasFakeIds = options.some(o => FAKE_SLOT_ID.test(o.id.trim()));
      const isSchedulingCtx = /hor[a\u00e1]r|agend|slot|dispon[i\u00ed]v/i.test(`${header} ${body}`);
      if (hasTimeLikeLabels || hasFakeIds || (hasTimePeriodLabels && isSchedulingCtx)) {
        logger.warn(
          { header, optionIds: options.map(o => o.id) },
          "[AntiHallucination] list_options usada com horários/IDs falsos — bloqueado"
        );
        return {
          text: "ERRO: você usou list_options para apresentar horários, o que é proibido. Horários NUNCA devem ser apresentados como opções manuais — eles podem ser inventados e não refletem a agenda real. Use check_availability passando a data e o serviceId corretos para obter os horários reais do sistema. Se não houver horários, o próprio sistema apresentará as datas alternativas automaticamente.",
        };
      }
      // corrigimos o dia da semana em TypeScript e normalizamos para DATE|
      const dayNamesBRT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      const dayNamesShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const correctedOptions = options.map(o => {
        const dateMatch = /^(?:date_|DATE\|)(\d{4}-\d{2}-\d{2})$/.exec(o.id);
        if (dateMatch) {
          const dateStr = dateMatch[1];
          const dow = brtDayOfWeek(dateStr);
          const [y, mo, d] = dateStr.split("-");
          return {
            id: `DATE|${dateStr}`,
            label: `${dayNamesShort[dow]} ${d}/${mo}/${y}`,
            description: dayNamesBRT[dow],
          };
        }
        return o;
      });

      // Enforce WhatsApp limits: máx 10 opções, truncar campos
      const MAX_OPTIONS = 10;
      const normalizedOptions = correctedOptions
        .slice(0, MAX_OPTIONS)
        .map(o => ({
          id: o.id,
          label: o.label.slice(0, 24),
          description: o.description?.slice(0, 72),
        }));

      const interactiveChoice: InteractiveChoice = {
        header: header.slice(0, 60),
        body: body.slice(0, 1024),
        footerText: footerText?.slice(0, 60),
        options: normalizedOptions,
      };
      return {
        text: "Opções apresentadas ao paciente. Aguarde a seleção.",
        interactiveChoice,
      };
    }

    if (toolName === "find_available_dates") {
      const { fromDate, serviceId, professionalId, maxDays = 14 } = args as {
        fromDate: string; serviceId?: number; professionalId?: number; maxDays?: number;
      };

      // Profissionais qualificados (mesma lógica do buildAvailabilityList)
      let qualifiedProfIds: number[] = [];
      if (serviceId) {
        const links = await db
          .select({ professionalId: professionalServicesTable.professionalId })
          .from(professionalServicesTable)
          .where(eq(professionalServicesTable.serviceId, serviceId));
        qualifiedProfIds = links.map(l => l.professionalId);
      }
      const profFilter = professionalId
        ? [eq(professionalsTable.id, professionalId)]
        : qualifiedProfIds.length > 0
          ? [inArray(professionalsTable.id, qualifiedProfIds)]
          : [];

      const profs = await db
        .select({ id: professionalsTable.id })
        .from(professionalsTable)
        .where(and(eq(professionalsTable.clinicId, clinicId), eq(professionalsTable.active, true), ...profFilter));

      if (profs.length === 0) {
        return { text: "Nenhum profissional disponível para este serviço." };
      }

      // Janelas de trabalho configuradas (todos os dias da semana, sem bloqueios)
      const schedules = await db
        .select({ professionalId: professionalSchedulesTable.professionalId, dayOfWeek: professionalSchedulesTable.dayOfWeek })
        .from(professionalSchedulesTable)
        .where(and(
          inArray(professionalSchedulesTable.professionalId, profs.map(p => p.id)),
          eq(professionalSchedulesTable.isBlock, false),
        ));

      const workDaySet = new Set(schedules.map(s => `${s.professionalId}:${s.dayOfWeek}`));
      const limit = Math.min(Number(maxDays) || 14, 30);
      const fromMs = brtMidnightMs(fromDate);
      const dayNamesBRT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      const availableDates: Array<{ dateStr: string; dow: number; displayDate: string }> = [];

      for (let d = 1; d <= limit && availableDates.length < 5; d++) {
        const ms = fromMs + d * 24 * 60 * 60 * 1000;
        const dateStr = new Date(ms).toISOString().slice(0, 10);
        const dow = new Date(ms).getUTCDay();
        if (profs.some(p => workDaySet.has(`${p.id}:${dow}`))) {
          // Verificar disponibilidade real — datas com todos os slots ocupados não são sugeridas
          const { interactiveList } = await buildAvailabilityList(clinicId, dateStr, serviceId, professionalId);
          if (interactiveList) {
            const [y, mo, day] = dateStr.split("-");
            availableDates.push({ dateStr, dow, displayDate: `${day}/${mo}/${y}` });
          }
        }
      }

      if (availableDates.length === 0) {
        return { text: `Nenhuma data com disponibilidade nos próximos ${limit} dias. Verifique a agenda dos profissionais.` };
      }

      const dayNamesShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const interactiveChoice: InteractiveChoice = {
        header: "📅 Escolha uma data",
        body: "Escolha a data que funciona melhor pra você 👇",
        options: availableDates.map(({ dateStr, dow, displayDate }) => ({
          id: `DATE|${dateStr}`,
          label: `${dayNamesShort[dow]} ${displayDate}`,
          description: dayNamesBRT[dow],
        })),
      };

      return {
        text: `Próximas datas com disponibilidade apresentadas ao paciente via botões interativos. Aguarde a seleção.`,
        interactiveChoice,
      };
    }

    if (toolName === "book_appointment") {
      // ── Normaliza aliases comuns gerados por modelos diferentes ─────────────
      // Modelos frequentemente usam nomes errados: datetime, date_time, service, name, etc.
      const rawArgs = args as Record<string, unknown>;

      // scheduledAt pode vir como 'datetime', 'dateTime', 'date_time', 'date', 'appointment_datetime'
      const scheduledAt: string | undefined =
        (typeof rawArgs.scheduledAt === "string" ? rawArgs.scheduledAt : undefined) ??
        (typeof rawArgs.datetime === "string" ? rawArgs.datetime : undefined) ??
        (typeof rawArgs.dateTime === "string" ? rawArgs.dateTime : undefined) ??
        (typeof rawArgs.date_time === "string" ? rawArgs.date_time : undefined) ??
        (typeof rawArgs.appointment_datetime === "string" ? rawArgs.appointment_datetime : undefined);

      if (!scheduledAt) {
        return { text: "Erro interno: parâmetro 'scheduledAt' ausente na chamada book_appointment. Peça ao paciente para selecionar o horário novamente via lista interativa." };
      }

      // serviceId pode vir como number ou como string com nome do serviço (erro comum)
      let serviceId: number | undefined;
      if (typeof rawArgs.serviceId === "number") {
        serviceId = rawArgs.serviceId;
      } else if (typeof rawArgs.serviceId === "string" && /^\d+$/.test(rawArgs.serviceId)) {
        serviceId = parseInt(rawArgs.serviceId, 10);
      } else if (typeof rawArgs.service === "string" && rawArgs.service) {
        // IA usou 'service' com nome — tenta resolver pelo nome
        const [svcByName] = await db
          .select({ id: servicesTable.id })
          .from(servicesTable)
          .where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.active, true)))
          .limit(1);
        // Busca por similaridade de nome (case-insensitive)
        const allSvcs = await db
          .select({ id: servicesTable.id, name: servicesTable.name })
          .from(servicesTable)
          .where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.active, true)));
        const svcName = (rawArgs.service as string).toLowerCase();
        const matched = allSvcs.find(s => s.name.toLowerCase().includes(svcName) || svcName.includes(s.name.toLowerCase()));
        if (matched) serviceId = matched.id;
      }

      // professionalId pode vir como number ou string
      let professionalId: number | undefined;
      if (typeof rawArgs.professionalId === "number") {
        professionalId = rawArgs.professionalId;
      } else if (typeof rawArgs.professionalId === "string" && /^\d+$/.test(rawArgs.professionalId)) {
        professionalId = parseInt(rawArgs.professionalId, 10);
      }

      // patientName pode vir como 'name', 'patient_name', 'patient'
      const patientName: string =
        (typeof rawArgs.patientName === "string" ? rawArgs.patientName : undefined) ??
        (typeof rawArgs.name === "string" ? rawArgs.name : undefined) ??
        (typeof rawArgs.patient_name === "string" ? rawArgs.patient_name : undefined) ??
        "Paciente";

      const notes: string | undefined = typeof rawArgs.notes === "string" ? rawArgs.notes : undefined;

      // ── Validação: profissional deve existir e pertencer à clínica ──────────
      if (professionalId) {
        const [profCheck] = await db
          .select({ id: professionalsTable.id, name: professionalsTable.name, active: professionalsTable.active })
          .from(professionalsTable)
          .where(and(eq(professionalsTable.id, professionalId), eq(professionalsTable.clinicId, clinicId)))
          .limit(1);

        if (!profCheck) {
          return { text: `Erro: o profissional informado (ID ${professionalId}) não existe nesta clínica. Use apenas os profissionais listados no sistema e seus IDs corretos.` };
        }
        if (!profCheck.active) {
          return { text: `O profissional ${profCheck.name} não está ativo no momento. Por favor, escolha outro profissional disponível.` };
        }
      }

      // ── Validação: serviço deve existir e pertencer à clínica ───────────────
      if (serviceId) {
        const [svcCheck] = await db
          .select({ id: servicesTable.id, active: servicesTable.active })
          .from(servicesTable)
          .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.clinicId, clinicId)))
          .limit(1);

        if (!svcCheck) {
          return { text: `Erro: o serviço informado (ID ${serviceId}) não existe nesta clínica. Use apenas os serviços listados no sistema.` };
        }
      }

      // Rejeitar agendamentos no passado (mínimo 1 hora de antecedência)
      const appointmentMs = new Date(scheduledAt).getTime();
      const nowMs = Date.now();
      if (appointmentMs < nowMs - 60 * 1000) {
        const d = fmtBRT(scheduledAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
        return { text: `Não é possível agendar para ${d} pois este horário já passou. Por favor, escolha uma data e horário futuros.` };
      }

      // Buscar duração do serviço (usado tanto no conflito quanto no insert)
      let newDuration = 60;
      if (serviceId) {
        const [svc] = await db
          .select({ durationMinutes: servicesTable.durationMinutes })
          .from(servicesTable)
          .where(eq(servicesTable.id, serviceId))
          .limit(1);
        if (svc) newDuration = svc.durationMinutes;
      }

      const newStart = new Date(scheduledAt).getTime();
      const newEnd = newStart + newDuration * 60 * 1000;
      const scheduledDateStr = scheduledAt.slice(0, 10);
      const dayStart = new Date(brtMidnightMs(scheduledDateStr));
      const dayEnd   = new Date(brtMidnightMs(scheduledDateStr) + 24 * 60 * 60 * 1000 - 1);

      // Verificar se o profissional tem agenda configurada para este dia da semana
      if (professionalId) {
        const bookingDayOfWeek = brtDayOfWeek(scheduledDateStr);
        const bookingMinute = (new Date(scheduledAt).getTime() - brtMidnightMs(scheduledDateStr)) / 60000;

        const profSchedule = await db
          .select()
          .from(professionalSchedulesTable)
          .where(
            and(
              eq(professionalSchedulesTable.professionalId, professionalId),
              eq(professionalSchedulesTable.dayOfWeek, bookingDayOfWeek),
            )
          );

        const workWindows = profSchedule.filter(s => !s.isBlock);
        if (workWindows.length === 0) {
          const [prof] = await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, professionalId));
          const dayNames = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
          return { text: `${prof?.name ?? "Este profissional"} não atende na ${dayNames[bookingDayOfWeek]}. Por favor, escolha outro dia disponível.` };
        }

        // Verificar se o horário está dentro de uma janela de trabalho
        const inWorkWindow = workWindows.some(w => bookingMinute >= w.startMinute && bookingMinute + newDuration <= w.endMinute);
        if (!inWorkWindow) {
          const [prof] = await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, professionalId));
          return { text: `O horário solicitado está fora do expediente de ${prof?.name ?? "o profissional"}. Por favor, escolha um horário disponível na agenda.` };
        }

        // Verificar se o horário está em um bloqueio (almoço, intervalo, etc.)
        const blocks = profSchedule.filter(s => s.isBlock);
        const inBlock = blocks.some(b => bookingMinute < b.endMinute && bookingMinute + newDuration > b.startMinute);
        if (inBlock) {
          const [prof] = await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, professionalId));
          return { text: `O horário solicitado coincide com um bloqueio na agenda de ${prof?.name ?? "o profissional"} (ex: horário de almoço). Por favor, escolha outro horário.` };
        }
      }

      // Verificar conflito de horário para o profissional escolhido (considerando duração)
      if (professionalId) {
        const existing = await db
          .select({
            scheduledAt: appointmentsTable.scheduledAt,
            durationMinutes: servicesTable.durationMinutes,
          })
          .from(appointmentsTable)
          .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
          .where(
            and(
              eq(appointmentsTable.clinicId, clinicId),
              eq(appointmentsTable.professionalId, professionalId),
              gte(appointmentsTable.scheduledAt, dayStart),
              lte(appointmentsTable.scheduledAt, dayEnd)
            )
          );

        const conflict = existing.find(e => {
          const eStart = new Date(e.scheduledAt).getTime();
          const eEnd   = eStart + (e.durationMinutes ?? 60) * 60 * 1000;
          return eStart < newEnd && eEnd > newStart;
        });

        if (conflict) {
          const [prof] = await db
            .select({ name: professionalsTable.name })
            .from(professionalsTable)
            .where(eq(professionalsTable.id, professionalId));
          const conflictStart = new Date(conflict.scheduledAt);
          const conflictEnd   = new Date(conflictStart.getTime() + (conflict.durationMinutes ?? 60) * 60 * 1000);
          return { text: `Horário indisponível: ${prof?.name ?? "o profissional"} já possui um agendamento das ${fmtBRT(conflictStart, { hour: "2-digit", minute: "2-digit" })} às ${fmtBRT(conflictEnd, { hour: "2-digit", minute: "2-digit" })} em ${fmtBRT(conflictStart, { day: "2-digit", month: "2-digit", year: "numeric" })}. Por favor, escolha outro horário.` };
        }
      }

      // Verificar se o paciente já tem agendamento no mesmo horário (independente de profissional)
      {
        const patientConflict = await db
          .select({
            scheduledAt: appointmentsTable.scheduledAt,
            durationMinutes: servicesTable.durationMinutes,
          })
          .from(appointmentsTable)
          .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
          .where(
            and(
              eq(appointmentsTable.clinicId, clinicId),
              eq(appointmentsTable.patientPhone, patientPhone),
              gte(appointmentsTable.scheduledAt, dayStart),
              lte(appointmentsTable.scheduledAt, dayEnd)
            )
          );

        const conflict = patientConflict.find(e => {
          const eStart = new Date(e.scheduledAt).getTime();
          const eEnd   = eStart + (e.durationMinutes ?? 60) * 60 * 1000;
          return eStart < newEnd && eEnd > newStart;
        });

        if (conflict) {
          const conflictStart = new Date(conflict.scheduledAt);
          return { text: `Você já possui um agendamento às ${fmtBRT(conflictStart, { hour: "2-digit", minute: "2-digit" })} em ${fmtBRT(conflictStart, { day: "2-digit", month: "2-digit", year: "numeric" })}. Por favor, escolha outro horário.` };
        }
      }

      // Upsert do paciente: busca por telefone, cria se não existir
      let patientId: number | null = null;
      const [existingPatient] = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, patientPhone)))
        .limit(1);

      if (existingPatient) {
        patientId = existingPatient.id;
      } else {
        const [newPatient] = await db
          .insert(patientsTable)
          .values({ clinicId, name: patientName, phone: patientPhone })
          .returning({ id: patientsTable.id });
        patientId = newPatient.id;
        logger.info({ patientId, patientPhone, patientName }, "Novo paciente cadastrado via WhatsApp");
      }

      const [appointment] = await db
        .insert(appointmentsTable)
        .values({
          clinicId,
          patientId,
          patientName,
          patientPhone,
          serviceId: serviceId ?? null,
          professionalId: professionalId ?? null,
          scheduledAt: new Date(scheduledAt),
          status: "pending",
          notes: notes ?? null,
        })
        .returning();

      let professionalName = "";
      if (professionalId) {
        const [prof] = await db
          .select({ name: professionalsTable.name })
          .from(professionalsTable)
          .where(eq(professionalsTable.id, professionalId));
        if (prof) professionalName = ` com ${prof.name}`;
      }

      const bookingDateStr = fmtBRT(scheduledAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
      return { text: `✅ Prontinho, ${patientName}! Seu agendamento está confirmado para *${bookingDateStr}*${professionalName}. Em breve você recebe uma confirmação. Qualquer dúvida, estou por aqui! 😊` };
    }

    if (toolName === "faq_lookup") {
      const { query } = args as { query: string };
      const [clinicData] = await db.select({ knowledgeBase: clinicsTable.knowledgeBase }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));

      if (!clinicData?.knowledgeBase) {
        return { text: "Não encontrei informações específicas sobre esse assunto. Por favor, entre em contato direto conosco." };
      }

      const kb = clinicData.knowledgeBase;
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

      // Busca por parágrafo mais relevante (scoring por palavras-chave)
      const paragraphs = kb.split(/\n{2,}/).filter(p => p.trim().length > 0);
      let bestParagraph = "";
      let bestScore = 0;

      for (const para of paragraphs) {
        const paraLower = para.toLowerCase();
        // Score básico: substring exato da query
        let score = paraLower.includes(query.toLowerCase()) ? 10 : 0;
        // Score adicional: cada palavra relevante encontrada
        for (const word of queryWords) {
          if (paraLower.includes(word)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestParagraph = para;
        }
      }

      // Se o KB for pequeno (<800 chars), retorna tudo
      if (kb.length <= 800) {
        return { text: `Encontrei no nosso guia:\n\n${kb}` };
      }

      if (bestScore > 0 && bestParagraph) {
        return { text: `Encontrei no nosso guia:\n\n${bestParagraph}` };
      }

      return { text: "Não encontrei informações específicas sobre isso na nossa base de conhecimento. Por favor, entre em contato direto conosco para mais detalhes." };
    }

    if (toolName === "search_products") {
      const { query } = args as { query?: string };
      const q = query?.trim() ?? "";

      const whereClause = q
        ? and(
            eq(productsTable.clinicId, clinicId),
            or(
              ilike(productsTable.name, `%${q}%`),
              ilike(productsTable.description, `%${q}%`),
              ilike(productsTable.category, `%${q}%`)
            )
          )
        : eq(productsTable.clinicId, clinicId);

      const products = await db
        .select()
        .from(productsTable)
        .where(whereClause)
        .orderBy(productsTable.name);

      if (products.length === 0) {
        return { text: q
          ? `Não encontrei produtos relacionados a "${q}". Posso ajudar com outra coisa?`
          : "Ainda não há produtos cadastrados." };
      }

      // Serializar para texto legível pela IA
      const lines = products
        .filter(p => p.available)
        .map(p => {
          const price = p.price != null ? `R$ ${Number(p.price).toFixed(2).replace(".", ",")}` : "Sob consulta";
          const parts: string[] = [`• *${p.name}*`];
          if (p.category) parts.push(`  Categoria: ${p.category}`);
          if (p.description) parts.push(`  ${p.description}`);
          parts.push(`  Preço: ${price}`);
          if (p.link) parts.push(`  🔗 Link: ${p.link}`);
          if (p.imageUrls) {
            const imgs = p.imageUrls.split("\n").filter(Boolean);
            if (imgs.length > 0) parts.push(`  📷 Imagem: ${imgs[0]}`);
          }
          if (p.audioUrl) parts.push(`  🎙️ Áudio: ${p.audioUrl}`);
          return parts.join("\n");
        });

      const unavailable = products.filter(p => !p.available).length;
      const header = `Encontrei ${lines.length} produto(s)${q ? ` para "${q}"` : ""}:\n\n`;
      const footer = unavailable > 0 ? `\n\n_(${unavailable} produto(s) fora de estoque não exibido(s))_` : "";
      return { text: header + lines.join("\n\n") + footer };
    }

    if (toolName === "save_patient_info") {
      const { name, phone: rawPhoneInput, notes } = args as { name?: string; phone?: string; notes?: string };

      if (!name && !rawPhoneInput && !notes) {
        return { text: "" }; // Nada a salvar
      }

      // Normalizar telefone informado pelo paciente (somente dígitos)
      const realPhone = rawPhoneInput ? rawPhoneInput.replace(/\D/g, "") || null : null;

      // Buscar paciente existente
      const [existing] = await db
        .select({ id: patientsTable.id, name: patientsTable.name, notes: patientsTable.notes, realPhone: patientsTable.realPhone })
        .from(patientsTable)
        .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, patientPhone)))
        .limit(1);

      if (existing) {
        // Atualiza nome (se fornecido e diferente) e acumula anotações
        const updatedNotes = notes
          ? (existing.notes ? `${existing.notes}\n${notes}` : notes)
          : existing.notes;
        const updatedName = name || existing.name;
        // Só sobrescreve real_phone se ainda não estava preenchido
        const updatedRealPhone = existing.realPhone ?? realPhone;

        await db
          .update(patientsTable)
          .set({ name: updatedName, notes: updatedNotes, realPhone: updatedRealPhone })
          .where(eq(patientsTable.id, existing.id));

        logger.info({ patientId: existing.id, name: updatedName, realPhone, notes }, "Paciente atualizado via save_patient_info");
      } else {
        // Cria novo registro com o que foi informado
        await db
          .insert(patientsTable)
          .values({ clinicId, name: name || "Desconhecido", phone: patientPhone, realPhone, notes: notes ?? null });

        logger.info({ patientPhone, name, realPhone, notes }, "Novo paciente criado via save_patient_info");
      }

      return { text: "" }; // Resposta invisível — a IA já trata o fluxo conversacional
    }

    return { text: `Função '${toolName}' não reconhecida.` };
  } catch (err) {
    logger.error({ err, toolName }, "Tool execution failed");
    return { text: `Erro ao processar a solicitação. Por favor, tente novamente.` };
  }
}

export async function processWhatsAppMessage(params: {
  clinicId: number;
  patientPhone: string;
  userMessage: string;
  messageType: "text" | "audio";
  clinic: ClinicConfig;
}): Promise<{ reply: string; tokensUsed: number; appointmentId?: number; interactiveList?: InteractiveList; interactiveChoice?: InteractiveChoice; logId?: number }> {
  const { clinicId, patientPhone, userMessage, messageType, clinic } = params;

  // ── Carregar dados em paralelo ────────────────────────────────────────────
  const [knownPatientRows, services, profRows] = await Promise.all([
    // Paciente já cadastrado pelo telefone
    db
      .select({ id: patientsTable.id, name: patientsTable.name, notes: patientsTable.notes, realPhone: patientsTable.realPhone })
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, patientPhone)))
      .limit(1),

    // Serviços ativos da clínica
    db
      .select()
      .from(servicesTable)
      .where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.active, true))),

    // Profissionais ativos + serviços que realizam
    db
      .select({
        profId: professionalsTable.id,
        profName: professionalsTable.name,
        specialty: professionalsTable.specialty,
        serviceId: professionalServicesTable.serviceId,
        serviceName: servicesTable.name,
      })
      .from(professionalsTable)
      .leftJoin(professionalServicesTable, eq(professionalServicesTable.professionalId, professionalsTable.id))
      .leftJoin(servicesTable, eq(servicesTable.id, professionalServicesTable.serviceId))
      .where(and(eq(professionalsTable.clinicId, clinicId), eq(professionalsTable.active, true))),
  ]);

  const knownPatient = knownPatientRows[0] ?? null;

  // Montar texto de serviços
  const servicesText = services.length > 0
    ? services.map(s => `- ${s.name} [ID:${s.id}] — R$ ${Number(s.price).toFixed(2)}, duração ${s.durationMinutes} min${s.description ? ` — ${s.description}` : ""}`).join("\n")
    : "Nenhum serviço cadastrado.";

  // Agrupar profissionais com seus serviços
  const profMap = new Map<number, { name: string; specialty: string | null; services: string[] }>();
  for (const row of profRows) {
    if (!profMap.has(row.profId)) profMap.set(row.profId, { name: row.profName, specialty: row.specialty, services: [] });
    if (row.serviceName) profMap.get(row.profId)!.services.push(row.serviceName);
  }
  const professionalsText = profMap.size > 0
    ? [...profMap.entries()].map(([id, p]) => {
        const svcs = p.services.length > 0 ? ` — realiza: ${p.services.join(", ")}` : "";
        return `- ${p.name} (${p.specialty ?? "Geral"}) [ID:${id}]${svcs}`;
      }).join("\n")
    : "Nenhum profissional cadastrado.";

  // Histórico de agendamentos do paciente (últimos 4, para dar contexto)
  let patientHistoryText = "";
  if (knownPatient) {
    const recentAppts = await db
      .select({
        scheduledAt: appointmentsTable.scheduledAt,
        status: appointmentsTable.status,
        serviceName: servicesTable.name,
        professionalName: professionalsTable.name,
      })
      .from(appointmentsTable)
      .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
      .leftJoin(professionalsTable, eq(appointmentsTable.professionalId, professionalsTable.id))
      .where(and(eq(appointmentsTable.clinicId, clinicId), eq(appointmentsTable.patientId, knownPatient.id)))
      .orderBy(desc(appointmentsTable.scheduledAt))
      .limit(4);

    if (recentAppts.length > 0) {
      patientHistoryText = "\n\n### Histórico de agendamentos do paciente\n" + recentAppts.map(a => {
        const d = new Date(a.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const svc = a.serviceName ? ` — ${a.serviceName}` : "";
        const prof = a.professionalName ? ` com ${a.professionalName}` : "";
        return `- ${d}${svc}${prof} [${a.status}]`;
      }).join("\n");
    }
  }

  const clinicTypeLabel = {
    medical: "Clínica Médica",
    veterinary: "Clínica Veterinária",
    vet: "Clínica Veterinária",
    dental: "Clínica Odontológica",
    beauty: "Empresa de Estética e Beleza",
    education: "Centro de Educação",
    retail: "Loja / Comércio",
    food: "Restaurante / Alimentos",
    technology: "Empresa de Tecnologia",
    services: "Empresa de Serviços",
    other: "Empresa",
  }[clinic.clinicType] ?? "Empresa";

  // Clínicas de saúde usam "paciente"; demais usam "cliente"
  const isHealthClinic = ["medical", "veterinary", "vet", "dental"].includes(clinic.clinicType);
  const clientLabel = isHealthClinic ? "paciente" : "cliente";
  const clientLabelCap = isHealthClinic ? "Paciente" : "Cliente";

  const todayFormatted = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

  const systemPrompt = `Você é ${clinic.aiName}, assistente virtual de atendimento da ${clinicTypeLabel}.

## Sua Identidade e Missão
${clinic.aiPersonalityPrompt || `Seu objetivo é proporcionar um atendimento acolhedor, eficiente e humanizado, ajudando os ${clientLabel}s a obter o melhor atendimento disponível.`}

> *INSTRUÇÃO OBRIGATÓRIA DE IDENTIDADE*: Siga rigorosamente o tom de voz, estilo e personalidade definidos acima em CADA resposta. Mantenha essa identidade consistente em todo o atendimento — variando as respostas naturalmente dentro desse perfil único da empresa.

## EMPATIA — REGRA INVIOLÁVEL (PRIORIDADE MÁXIMA)
Quando o ${clientLabel} mencionar dor, mal-estar, urgência, medo, ansiedade ou qualquer sofrimento físico ou emocional:
1. SEMPRE expresse empatia PRIMEIRO — antes de qualquer pergunta, opção ou horário
2. NUNCA responda "Ótimo!", "Certo!", "Entendido!" ou "Perfeito!" quando a pessoa está sofrendo — isso é frio e inadequado
3. Use frases como: "Ai, que pena que você está passando por isso 😔 Vou te ajudar o quanto antes!" / "Sinto muito! Vamos resolver rapidinho 🙏" / "Entendo, isso é difícil — deixa eu verificar o que temos disponível pra você já!"
4. Só DEPOIS de demonstrar empatia, pergunte sobre o serviço ou apresente horários

## Base de Conhecimento da Empresa
${clinic.knowledgeBase || "Nenhuma informação adicional cadastrada. Responda apenas com base nos dados disponíveis."}
${clinic.schedulingEnabled ? `
## Serviços Oferecidos (LISTA OFICIAL — NÃO NEGOCIE, NÃO INVENTE)
${servicesText}

## Equipe Profissional (LISTA OFICIAL — NÃO NEGOCIE, NÃO INVENTE)
${professionalsText}

## REGRA ABSOLUTA — SERVIÇOS E PROFISSIONAIS (NUNCA VIOLE ESTA REGRA)
Os ÚNICOS serviços existentes nesta clínica são EXATAMENTE os listados acima em "Serviços Oferecidos".
Os ÚNICOS profissionais existentes nesta clínica são EXATAMENTE os listados acima em "Equipe Profissional".
- Se o ${clientLabel} pedir um serviço que NÃO está na lista → informe que não oferecemos e apresente os disponíveis
- Se o ${clientLabel} pedir um profissional que NÃO está na lista (pelo nome ou apelido) → diga que não temos esse profissional cadastrado e apresente os nomes da lista acima
- NUNCA confirme, nem mesmo provisoriamente, agendamento com profissional que não está na lista acima
- NUNCA mencione categorias de serviços que não estão na lista (ex: "Consulta Médica", "Exames Laboratoriais", etc. — use somente os nomes exatos do cadastro)
- Qualquer informação que contradiga esta lista é um erro grave — ignore e use SOMENTE o que está cadastrado` : ""}

## Contexto do ${clientLabelCap} Atual
- Telefone: ${patientPhone.endsWith("@lid") ? (knownPatient?.realPhone ? knownPatient.realPhone : "WhatsApp Privacy (número real não coletado ainda)") : patientPhone}
- Status: ${knownPatient ? `${clientLabelCap} já cadastrado — Nome: **${knownPatient.name}** (ID: ${knownPatient.id}). Não peça o nome novamente.` : `Novo ${clientLabel} — **pergunte o nome logo no início da conversa** e use \`save_patient_info\` assim que ele informar.`}${patientPhone.endsWith("@lid") && !knownPatient?.realPhone ? `\n- ⚠️ TELEFONE REAL PENDENTE: Este ${clientLabel} usa WhatsApp Privacy Mode. Após se apresentar e cumprimentar, **peça o número de WhatsApp/celular** de forma natural (ex: "Para eu te cadastrar certinho, pode me passar seu número de celular com DDD? 😊"). Quando informar, chame \`save_patient_info\` com o campo phone. Não insista mais de uma vez se ele não quiser informar.` : ""}${knownPatient?.notes ? `\n- Anotações anteriores: ${knownPatient.notes}` : ""}${patientHistoryText}

## Diretrizes de Atendimento
- Responda sempre em português brasileiro, com linguagem cordial, empática, descontraída e acessível — como uma recepcionista atenciosa, não um robô.
- Seja proativo e acolhedor: demonstre interesse genuíno, use o nome do ${clientLabel} quando souber, e ofereça a melhor orientação.
- Use emojis com moderação para tornar a conversa mais calorosa 😊.
- Nunca invente preços, informações${clinic.schedulingEnabled ? ", horários ou profissionais" : ""} — use somente os dados acima e as ferramentas disponíveis.
- PROIBIDO exibir IDs técnicos (ex: "ID 7", "[ID:4]", "(ID 2)") em qualquer mensagem. Use apenas nomes.
- PROIBIDO exibir JSON, código ou estruturas de dados na resposta. As ferramentas enviam os widgets interativos; você só escreve o texto de acompanhamento.
- PROIBIDO ABSOLUTO: JAMAIS escreva chamadas de ferramentas no texto da resposta. Exemplos do que NUNCA fazer: "save_patient_info>{"name": "..."}", "*Book Appointment*", "check_availability({...})". As ferramentas são executadas pelo sistema automaticamente via function calling — se você escrever isso no texto, o paciente vê o código interno, o que é um erro grave de segurança.
- PROIBIDO responder de forma robótica ou mecânica. Prefira variações naturais como: "Consegui alguns horários disponíveis pra você 😊 — qual fica melhor?" / "Perfeito! Dá uma olhada abaixo e me diz qual prefere 👇" / "Prontinho! Agendamento confirmado com sucesso! 🎉 Qualquer dúvida, estou aqui."
- EMPATIA EM PRIMEIRO LUGAR: Se o ${clientLabel} mencionar dor, mal-estar, urgência, preocupação ou qualquer sofrimento, reconheça e demonstre empatia genuína ANTES de apresentar horários ou opções. NUNCA responda "Ótimo!" ou "Perfeito!" a relatos de dor ou sofrimento. Prefira: "Ai, que pena que você está passando por isso 😔 Vou te ajudar a encontrar um horário o quanto antes!" / "Sinto muito! Vamos resolver isso logo 🙏"
- Para dúvidas gerais sobre a empresa, políticas ou serviços: use \`faq_lookup\`.
- Para apresentar ou pesquisar produtos cadastrados (preços, links, imagens): use \`search_products\`. Se o cliente perguntar sobre um produto específico ou pedir para ver o catálogo, use esta ferramenta.

⚠️ REGRA CRÍTICA — PRODUTOS E PREÇOS: NUNCA responda preços, marcas, descrições ou disponibilidade de produtos a partir do seu conhecimento de treinamento. Mesmo que você conheça preços de marcas populares (Royal Canin, Nestlé, Pedigree, Hills, Premier etc.), esses valores são dados históricos de treinamento e NÃO refletem os preços reais desta empresa. Para QUALQUER pergunta sobre produto, preço ou disponibilidade de item, chame OBRIGATORIAMENTE \`search_products\` antes de responder — sem exceção. Responder preços de memória causa desinformação grave ao cliente.
- Captura de dados do ${clientLabel}: Sempre que souber o nome do ${clientLabel}, chame \`save_patient_info\` imediatamente. Quando o ${clientLabel} informar o número de telefone (especialmente usuários WhatsApp Privacy), chame \`save_patient_info\` com o campo phone. Quando o ${clientLabel} mencionar interesses, chame \`save_patient_info\` com uma anotação concisa. Não avise o ${clientLabel} que está salvando — faça de forma transparente.
${clinic.schedulingEnabled ? `- PROIBIDO calcular dias da semana — você erra com frequência. O sistema calcula e exibe automaticamente.
- PROIBIDO usar list_options para apresentar datas — use find_available_dates, que gera os botões com dias corretos.
- PROIBIDO ABSOLUTO usar list_options para apresentar horários — use check_availability. Horários apresentados via list_options são INVENTADOS e não têm base real na agenda.
- PROIBIDO ABSOLUTO usar list_options com opções de período ("Manhã", "Tarde", "Noite") — períodos não são horários reais. Use check_availability para os horários exatos.
- RESPONDA SEMPRE EM PORTUGUÊS. Pensamentos internos em inglês jamais devem aparecer na resposta.

## FLUXO CONVERSACIONAL — REGRA FUNDAMENTAL (NUNCA VIOLE)
O atendimento tem DOIS momentos distintos que NUNCA devem ser confundidos:

**MOMENTO 1 — Conversação (prioridade máxima):**
Quando o ${clientLabel} faz uma PERGUNTA ou menciona um sintoma/problema SEM pedir agendamento explicitamente — RESPONDA primeiro, demonstre empatia se necessário, DEPOIS ofereça: "Gostaria de agendar um(a) [Serviço]?"

Mensagens que são PERGUNTAS INFORMACIONAIS (não iniciam agendamento diretamente):
- "[Serviço] pode me ajudar com isso?" → Responda a dúvida + pergunte se quer agendar
- "Vocês têm [especialidade]/[serviço]?" → Informe o que temos + pergunte se quer agendar
- "Quanto custa [serviço]?" → Informe o preço + pergunte se quer agendar
- "Isso é bom para [problema/sintoma]?" → Explique + pergunte se quer agendar
- "Como funciona [tratamento]?" → Explique + pergunte se quer agendar

Mensagens que são SOLICITAÇÕES DIRETAS DE AGENDAMENTO (pode ir direto para as ferramentas):
- "Quero agendar", "Quero marcar", "Preciso de horário", "Quero uma consulta de..."
- "Sim", "Quero", "Pode ser", "Vamos" (em resposta à sua pergunta "Gostaria de agendar?")
- "Tem vaga para [serviço]?", "Tem horário disponível?"

**MOMENTO 2 — Agendamento (somente após confirmação explícita):**
Só chame \`find_available_dates\` ou \`check_availability\` quando o ${clientLabel} tiver confirmado EXPLICITAMENTE que quer agendar.

⚠️ NUNCA interprete uma pergunta informacional como intenção implícita de agendar.
⚠️ NUNCA mostre datas ou horários antes do ${clientLabel} confirmar que quer agendar.
⚠️ Mensagens como "X pode me ajudar?", "vocês têm Y?", "isso serve para Z?" SÃO SEMPRE perguntas — responda e depois ofereça o agendamento.

## Fluxo de Agendamento (somente após confirmação explícita do ${clientLabel})
1. Entenda o serviço desejado. Use \`list_options\` para apresentar os SERVIÇOS (não horários, não períodos) interativamente se necessário.
   - ATENÇÃO: Se o ${clientLabel} mencionar um profissional por nome: verifique se esse nome está EXATAMENTE na lista "Equipe Profissional" acima. Se NÃO estiver cadastrado, informe gentilmente e apresente os disponíveis. NUNCA invente um professionalId.
2. **Antes de chamar check_availability, você PRECISA ter a data em formato YYYY-MM-DD.**
   - Se o ${clientLabel} NÃO mencionou uma data específica: NUNCA assuma a data de hoje. Chame \`find_available_dates\` para mostrar as próximas datas reais disponíveis.
   - Se o ${clientLabel} mencionou APENAS um dia da semana (ex: "quarta", "sexta", "amanhã") SEM uma data: NUNCA calcule a data manualmente — chame \`find_available_dates\` e deixe o paciente selecionar pelo botão correto. Cálculo manual de datas é proibido pois causa erros.
   - Somente chame \`check_availability\` quando tiver a data EXATA confirmada pelo ${clientLabel} (ex: "23/04", "dia 22", ou selecionada via botão interativo).
3. Use \`check_availability(date, serviceId)\` para verificar horários REAIS. NUNCA apresente horários de outra forma.
   - Se houver slots → o sistema envia a lista interativa automaticamente. Escreva apenas uma frase curta de introdução.
   - Se NÃO houver slots → o sistema já envia os botões com próximas datas disponíveis automaticamente. Escreva apenas: "Não há horários disponíveis em [data]. Selecione uma das próximas datas abaixo:" e pare — não liste datas no texto.
4. Após o ${clientLabel} selecionar horário ([SELEÇÃO]), use \`book_appointment\` imediatamente.
5. Após confirmar, ofereça orientações da base de conhecimento.` : ""}

REGRA CRÍTICA — WIDGETS INTERATIVOS: Quando uma ferramenta já envia conteúdo interativo (lista/botões), sua resposta de texto deve ser apenas uma frase curta e humana de introdução. Nunca repita as opções no texto. Prefira: "Ótimo! Aqui estão os horários disponíveis 😊 — qual fica melhor pra você?" ou variações naturais.

## REGRA INVIOLÁVEL — DISPONIBILIDADE DE HORÁRIOS (NUNCA VIOLE)
NUNCA liste horários, vagas ou disponibilidade no corpo do texto da resposta:
- Horários são apresentados EXCLUSIVAMENTE através de listas interativas geradas por \`check_availability\`. Se você escrever "09:00", "14:00" ou qualquer horário como opção no texto, você está INVENTANDO — isso passa informação FALSA ao ${clientLabel}.
- SEMPRE chame \`check_availability\` antes de afirmar que existe ou não existe disponibilidade em qualquer data.
- Se \`check_availability\` retornar sem slots (nenhum horário livre): informe gentilmente que não há horários nessa data e aguarde o ${clientLabel} selecionar outra data pelos botões interativos. NÃO invente datas alternativas no texto.
- Se o ${clientLabel} digitar um horário como texto (ex: "14:00", "às 10h", "de manhã"): NÃO confirme, NÃO agende, NÃO diga que vai reservar. Chame \`check_availability\` para a data mencionada e mostre a lista real para o ${clientLabel} selecionar corretamente.
- NUNCA responda "vou encaminhar para a equipe" ou "vou reservar provisoriamente" — você tem acesso direto ao sistema e DEVE usar \`book_appointment\` após seleção interativa.

REGRA ABSOLUTA — AGENDAMENTO:
- NUNCA escreva confirmação de agendamento no texto da resposta antes de chamar book_appointment. A confirmação vem EXCLUSIVAMENTE do retorno da ferramenta book_appointment.
- NUNCA invente ou assuma profissionais. Use SOMENTE os profissionais listados acima com seus IDs exatos. Se o ${clientLabel} mencionar um nome que não está na lista, informe gentilmente que esse profissional não está disponível e apresente os cadastrados.
- **NUNCA** chame \`book_appointment\` sem ter o horário exato (ISO 8601) confirmado pelo ${clientLabel} via seleção interativa (\`[SELEÇÃO]\`) — nunca assuma nem invente horários.
- **SEMPRE** inclua a data e hora completas na confirmação. O retorno da ferramenta já formata corretamente — não resuma nem altere o texto de confirmação.
- **REGRA CRÍTICA DE PARÂMETROS** em \`book_appointment\`: o campo de data/hora DEVE se chamar \`scheduledAt\` (NUNCA \`datetime\`, \`date\`, \`date_time\`). O campo de serviço DEVE ser \`serviceId\` como número inteiro (NUNCA \`service\` como string). O campo de profissional DEVE ser \`professionalId\` como número inteiro (NUNCA \`professional\` como string). O nome do paciente DEVE ser \`patientName\` (NUNCA \`name\`).

## Data de Referência
Hoje é ${todayFormatted}.`;

  // Carregar histórico dos últimos 20 turnos da conversa (janela de contexto 60k+ suporta)
  const recentLogs = await db
    .select({ userMessage: aiLogsTable.userMessage, aiResponse: aiLogsTable.aiResponse })
    .from(aiLogsTable)
    .where(and(eq(aiLogsTable.clinicId, clinicId), eq(aiLogsTable.patientPhone, patientPhone)))
    .orderBy(desc(aiLogsTable.id))
    .limit(20);

  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = recentLogs
    .reverse()
    .flatMap(log => [
      { role: "user" as const, content: log.userMessage },
      { role: "assistant" as const, content: log.aiResponse },
    ]);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages,
    { role: "user", content: userMessage },
  ];

  let totalTokens = 0;
  let finalReply = "";
  let appointmentId: number | undefined;
  let capturedInteractiveList: InteractiveList | undefined;
  let capturedInteractiveChoice: InteractiveChoice | undefined;
  // Contexto das opções mostradas ao paciente — salvo no ai_log para preservar contexto na próxima mensagem
  let listOptionsContext: string | undefined;
  // Texto de confirmação do book_appointment — forçado como finalReply para garantir que a resposta ao paciente contenha os detalhes do agendamento
  let capturedBookingConfirmation: string | undefined;

  const callWithRetry = async (noTools = false): Promise<{ response: ChatCompletion; usedGroq: boolean }> => {
    // Quando noTools=true, sanitiza mensagens para remover tool_calls do histórico (compatível com todos os providers)
    const activeTools = noTools ? undefined : getTools(clinic.schedulingEnabled);
    const effectiveMessages = noTools ? flattenToolCallsInMessages(messages) : messages;

    // ── Fase 0: Gemini (primário) ─────────────────────────────────────────────
    if (geminiClient) {
      const now = Date.now();
      if (geminiGlobalCooldownUntil <= now) {
        // Gemini rejeita histórico de tool_calls criado por outro provider (OpenRouter) → achatar
        const hasToolHistory = effectiveMessages.some(m =>
          (m as { role: string }).role === "tool" ||
          ((m as { tool_calls?: unknown[] }).tool_calls?.length ?? 0) > 0
        );
        const geminiMessages = hasToolHistory ? flattenToolCallsInMessages(messages) : effectiveMessages;
        // Quando achatamos o histórico, não faz sentido enviar tool definitions (IA não terá contexto)
        const geminiTools = hasToolHistory ? undefined : activeTools;

        for (const model of GEMINI_MODEL_ROTATION) {
          const cooldownUntil = geminiCooldowns.get(model);
          if (cooldownUntil && Date.now() < cooldownUntil) {
            logger.debug({ model, remainingS: Math.ceil((cooldownUntil - Date.now()) / 1000) }, "Gemini modelo em cooldown — pulando");
            continue;
          }
          // AbortController garante timeout mesmo que o SDK não dispare internamente
          const geminiCtrl = new AbortController();
          const geminiTimer = setTimeout(() => geminiCtrl.abort(), 15_000);
          try {
            logger.info({ model, hasToolHistory }, "Tentando Gemini (primário)");
            const response = await geminiClient.chat.completions.create({
              model,
              max_tokens: 2048,
              messages: geminiMessages,
              ...(geminiTools ? { tools: geminiTools, tool_choice: "auto" as const } : {}),
              stream: false,
            }, { signal: geminiCtrl.signal }) as ChatCompletion;
            clearTimeout(geminiTimer);
            if (!response?.choices?.length) {
              logger.warn({ model }, "Gemini — resposta sem choices, pulando");
              continue;
            }
            geminiGlobalCooldownUntil = 0;
            return { response, usedGroq: false };
          } catch (err: unknown) {
            clearTimeout(geminiTimer);
            if (isAbortError(err)) {
              logger.warn({ model }, "Gemini — timeout (15s), pulando para próximo modelo");
              continue;
            }
            const status = (err as { status?: number })?.status;
            if (status === 429) {
              geminiCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
              logger.warn({ model, cooldownS: MODEL_COOLDOWN_MS / 1000 }, "429 Gemini — modelo em cooldown");
              continue;
            }
            const errMsg = (err as { message?: string })?.message ?? String(err);
            logger.warn({ model, status, error: errMsg }, "Gemini — erro inesperado, tentando próximo");
            continue;
          }
        }
        // Todos os modelos Gemini falharam — ativa cooldown global do Gemini
        geminiGlobalCooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
        logger.warn({ cooldownS: MODEL_COOLDOWN_MS / 1000 }, "Gemini — todos os modelos indisponíveis, usando OpenRouter como fallback");
      } else {
        logger.debug({ remainingS: Math.ceil((geminiGlobalCooldownUntil - Date.now()) / 1000) }, "Gemini em cooldown global — indo para OpenRouter");
      }
    }

    // ── Fase 1: OpenRouter (secundário) ──────────────────────────────────────
    // Verifica cooldown global primeiro (evita 7 requisições desnecessárias quando OpenRouter está saturado)
    const now = Date.now();
    if (openRouterGlobalCooldownUntil > now) {
      logger.debug(
        { remainingS: Math.ceil((openRouterGlobalCooldownUntil - now) / 1000) },
        "OpenRouter em cooldown global — indo direto para Groq"
      );
    } else {
      let allSkipped = true; // todos os modelos foram pulados por cooldown individual?
      let allFailed429 = true; // todos os modelos tentados retornaram 429?
      let anyAttempted = false;
      // Deadline global: abandona o OpenRouter após 28s mesmo que ainda haja modelos — cai para Groq
      const PHASE1_DEADLINE = Date.now() + 28_000;
      const PHASE1_MODEL_TIMEOUT_MS = 6_000; // timeout por modelo (menor que o anterior de 8s)

      for (const model of AI_MODEL_ROTATION) {
        // Guard de prazo global — evita que a fase inteira bloqueie por mais de 28s
        if (Date.now() > PHASE1_DEADLINE) {
          logger.warn({ remainingModels: AI_MODEL_ROTATION.indexOf(model) }, "OpenRouter — prazo global de 28s excedido, indo direto para Groq");
          openRouterGlobalCooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
          break;
        }
        const cooldownUntil = modelCooldowns.get(model);
        if (cooldownUntil && Date.now() < cooldownUntil) {
          logger.debug({ model, remainingS: Math.ceil((cooldownUntil - Date.now()) / 1000) }, "Modelo em cooldown — pulando");
          continue;
        }
        allSkipped = false;
        anyAttempted = true;

        // AbortController explícito: garante corte em 6s mesmo que o SDK não dispare
        const orCtrl = new AbortController();
        const orTimer = setTimeout(() => orCtrl.abort(), PHASE1_MODEL_TIMEOUT_MS);
        logger.info({ model }, "OpenRouter — tentando modelo");
        try {
          const response = await openai.chat.completions.create({
            model,
            max_tokens: 2048,
            messages: effectiveMessages,
            ...(activeTools ? { tools: activeTools, tool_choice: "auto" as const } : {}),
            stream: false,
          }, { signal: orCtrl.signal }) as ChatCompletion;
          clearTimeout(orTimer);
          // Valida resposta — alguns providers retornam { error: ... } com HTTP 200
          if (!response?.choices?.length) {
            logger.warn({ model }, "OpenRouter — resposta sem choices (erro mascarado como 200), pulando");
            continue;
          }
          // Sucesso — limpa cooldown global se havia
          openRouterGlobalCooldownUntil = 0;
          return { response, usedGroq: false };
        } catch (err: unknown) {
          clearTimeout(orTimer);
          // Timeout (AbortController disparou) — pula para o próximo modelo imediatamente
          if (isAbortError(err)) {
            logger.warn({ model, timeoutMs: PHASE1_MODEL_TIMEOUT_MS }, "OpenRouter — timeout, pulando modelo");
            allFailed429 = false;
            continue;
          }
          const status = (err as { status?: number })?.status;
          if (status === 429) {
            modelCooldowns.set(model, Date.now() + MODEL_COOLDOWN_MS);
            logger.warn({ model, cooldownS: MODEL_COOLDOWN_MS / 1000 }, "429 OpenRouter — modelo em cooldown");
            await new Promise(resolve => setTimeout(resolve, 200));
            continue;
          }
          allFailed429 = false;
          // 402 = endpoint com restrição de acesso/billing — cooldown moderado para não desperdiçar slots
          if (status === 402) {
            modelCooldowns.set(model, Date.now() + 5 * 60 * 1000); // 5 min
            logger.warn({ model }, "402 OpenRouter — modelo com restrição de acesso, cooldown 5min");
            await new Promise(resolve => setTimeout(resolve, 200));
            continue;
          }
          // Para qualquer outro erro (404 modelo inexistente, 503 etc.) — pular para o próximo modelo
          const errMsg = (err as { message?: string })?.message ?? String(err);
          logger.warn({ model, status, error: errMsg }, "OpenRouter — erro inesperado, pulando modelo");
          continue;
        }
      }

      // Se todos os modelos tentados falharam com 429, ativa cooldown global para economizar
      // requisições desnecessárias nas próximas mensagens até o rate limit abrir
      if (anyAttempted && allFailed429) {
        openRouterGlobalCooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
        logger.warn(
          { cooldownS: MODEL_COOLDOWN_MS / 1000 },
          "OpenRouter — todos os modelos com 429, ativando cooldown global"
        );
      } else if (allSkipped) {
        // Todos já estavam em cooldown individual — ativa global também
        openRouterGlobalCooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
      }
    }
    if (groqClient) {
      logger.warn("OpenRouter indisponível (todos em cooldown) — ativando fallback Groq");
      // Groq rejeita tool_calls de outros providers no histórico — sempre sanitizar
      const groqMessages = noTools ? effectiveMessages : flattenToolCallsInMessages(messages);

      for (let gi = 0; gi < GROQ_MODEL_ROTATION.length; gi++) {
        const groqModel = GROQ_MODEL_ROTATION[gi];
        // llama-3.1-8b-instant tem limite de 6000 TPM — truncar histórico e reduzir max_tokens
        const isSmallModel = groqModel === "llama-3.1-8b-instant";
        const groqMsgs = isSmallModel
          ? [groqMessages[0], ...groqMessages.slice(-4)]  // system + últimas 4 mensagens
          : groqMessages;
        const groqMaxTokens = isSmallModel ? 512 : 2048;
        try {
          logger.info({ groqModel, noTools, msgCount: groqMsgs.length }, "Tentando Groq como fallback");
          const response = await groqClient.chat.completions.create({
            model: groqModel,
            max_tokens: groqMaxTokens,
            messages: groqMsgs,
            ...(activeTools ? { tools: activeTools, tool_choice: "auto" as const } : {}),
            stream: false,
          }) as ChatCompletion;
          // Valida resposta — Groq pode retornar corpo de erro com HTTP 200 (ex: timeout)
          if (!response?.choices?.length) {
            throw new Error(`Groq retornou resposta sem choices: ${JSON.stringify(response)}`);
          }
          return { response, usedGroq: true };
        } catch (groqErr: unknown) {
          const groqStatus = (groqErr as { status?: number })?.status;
          const groqMsg = (groqErr as { message?: string })?.message ?? "";
          logger.warn({ groqModel, status: groqStatus, error: groqMsg }, "Groq fallback falhou");
          // Groq 400 "Failed to call a function" — histórico tem tool_calls incompatíveis
          // Retry imediato sem tools para garantir pelo menos uma resposta de texto
          if (groqStatus === 400 && groqMsg.includes("function") && !noTools) {
            logger.warn({ groqModel }, "Groq 400 function error — retentando sem tools");
            try {
              const cleanMsgs = flattenToolCallsInMessages(messages);
              const response = await groqClient.chat.completions.create({
                model: groqModel,
                max_tokens: 2048,
                messages: cleanMsgs,
                stream: false,
              }) as ChatCompletion;
              if (response?.choices?.length) {
                return { response, usedGroq: true };
              }
              logger.warn({ groqModel }, "Groq retry-sem-tools retornou resposta sem choices");
            } catch {
              // Ignora — deixa o throw abaixo acontecer
            }
          }
          if (gi < GROQ_MODEL_ROTATION.length - 1) continue;
        }
      }
    }

    throw new Error("Todos os provedores de IA estão indisponíveis. Tente novamente em instantes.");
  };

  let loopDepth = 0;
  const MAX_LOOP_DEPTH = 6;
  const runLoop = async (forceNoTools = false): Promise<void> => {
    if (++loopDepth > MAX_LOOP_DEPTH) {
      finalReply = "Desculpe, tive um problema interno. Pode tentar novamente? 🙏";
      return;
    }
    const { response, usedGroq } = await callWithRetry(forceNoTools);

    // Guard defensivo — nunca deveria chegar aqui com choices vazio (callWithRetry já valida),
    // mas protege contra qualquer edge case futuro
    if (!response?.choices?.length) {
      logger.error({ usedGroq }, "runLoop: response sem choices após callWithRetry — abortando loop");
      finalReply = "Desculpe, ocorreu um problema técnico. Pode tentar novamente? 🙏";
      return;
    }

    const choice = response.choices[0];
    totalTokens += response.usage?.total_tokens ?? 0;

    // Alguns modelos retornam finish_reason "stop" mesmo com tool_calls — verificar o campo diretamente
    if ((choice.finish_reason === "tool_calls" || (choice.message.tool_calls && choice.message.tool_calls.length > 0)) && choice.message.tool_calls?.length) {
      messages.push(choice.message);

      // Rastreia se alguma ferramenta interativa (widget) foi executada nesta iteração
      let hadInteractiveTool = false;

      for (const toolCall of choice.message.tool_calls.filter((tc: OpenAI.Chat.ChatCompletionMessageToolCall): tc is ChatCompletionMessageFunctionToolCall => tc.type === "function")) {
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          toolArgs = {};
        }

        logger.info({ toolName: toolCall.function.name, args: toolArgs }, "Executing AI tool call");
        const toolResult = await executeToolCall(toolCall.function.name, toolArgs, clinicId, patientPhone);

        // Regra: primeiro widget capturado vence — evita que IA envie 2 widgets no mesmo turno
        if (toolCall.function.name === "check_availability" && toolResult.interactiveList && !capturedInteractiveList) {
          capturedInteractiveList = toolResult.interactiveList;
          hadInteractiveTool = true;
        }
        // check_availability sem slots retorna interactiveChoice de datas alternativas
        if (toolCall.function.name === "check_availability" && toolResult.interactiveChoice && !capturedInteractiveList && !capturedInteractiveChoice) {
          capturedInteractiveChoice = toolResult.interactiveChoice;
          hadInteractiveTool = true;
          listOptionsContext = `Datas alternativas apresentadas: ${toolResult.interactiveChoice.options.map(o => o.label).join(", ")}`;
        }
        if ((toolCall.function.name === "list_options" || toolCall.function.name === "find_available_dates") && toolResult.interactiveChoice && !capturedInteractiveList && !capturedInteractiveChoice) {
          capturedInteractiveChoice = toolResult.interactiveChoice;
          hadInteractiveTool = true;
          // Salva contexto das opções para o próximo turno — resolve perda de contexto após seleção
          listOptionsContext = `${toolResult.interactiveChoice.header}: ${toolResult.interactiveChoice.options.map(o => o.label).join(", ")}`;
        }

        if (toolCall.function.name === "book_appointment" && toolResult.text.includes("ID: #")) {
          const match = /ID: #(\d+)/.exec(toolResult.text);
          if (match) {
            appointmentId = parseInt(match[1], 10);
          }
          // Captura o texto de confirmação para usar como finalReply — evita que a IA gere
          // resposta vaga ("fico feliz que deu certo") sem os detalhes do agendamento
          capturedBookingConfirmation = toolResult.text;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          // Groq rejeita content vazio ("") com 400 — usa placeholder quando não há texto
          content: toolResult.text || "ok",
        });
      }

      // Força próxima iteração sem tools SOMENTE quando um widget interativo foi enviado
      // (nesse caso a IA só precisa gerar texto de acompanhamento, não mais tool calls).
      // NOTA: NÃO propagamos usedGroq aqui — o Groq suporta function calling;
      // o histórico é sanitizado por flattenToolCallsInMessages antes de cada chamada Groq.
      await runLoop(hadInteractiveTool);
    } else {
      finalReply = sanitizeReply(choice.message.content ?? "");
      // Se o conteúdo estava vazio mas há um widget interativo, usa texto de acompanhamento neutro
      if (!finalReply && capturedInteractiveList) {
        finalReply = "Aqui estão os horários disponíveis 👇";
      } else if (!finalReply && capturedInteractiveChoice) {
        finalReply = "Selecione uma das opções abaixo 👇";
      } else if (!finalReply) {
        finalReply = "Desculpe, não consegui processar sua mensagem.";
      }
    }
  };

  await runLoop();

  // Se o book_appointment confirmou com sucesso, usa esse texto diretamente como finalReply
  // para garantir que o paciente receba os detalhes do agendamento (data, hora, profissional).
  // Também salva no ai_log para que no próximo turno a IA saiba que o agendamento foi feito.
  if (capturedBookingConfirmation) {
    finalReply = capturedBookingConfirmation;
  }

  // ── Guard anti-fabricação de horários ─────────────────────────────────────
  // Se a IA listou horários no texto (ex: "09:00", "14:00") sem ter gerado uma lista
  // interativa real via check_availability, a resposta provavelmente é inventada.
  // Bloqueia e substitui por uma mensagem que pede confirmação do serviço/data.
  if (!capturedInteractiveList && !capturedInteractiveChoice) {
    const timesInReply = finalReply.match(/\b(?:[01]?\d|2[0-3]):\d{2}\b/g) ?? [];
    const hasMultipleTimes = timesInReply.length >= 2;
    const hasAvailabilityContext = /horário|disponív|vaga|slot|agenda/i.test(finalReply);
    if (hasMultipleTimes && hasAvailabilityContext) {
      logger.warn(
        { clinicId, patientPhone, timesFound: timesInReply, replyPreview: finalReply.slice(0, 200) },
        "[AntiHallucination] IA listou horários sem chamar check_availability — resposta bloqueada"
      );
      finalReply = "Para verificar os horários reais disponíveis, preciso confirmar: qual serviço você deseja e para qual data? Vou buscar a disponibilidade real para você! 😊";
    }
  }

  // Quando a IA apresentou opções via list_options/find_available_dates/check_availability (alternativas),
  // enriquece o ai_log com o contexto das opções — preserva contexto na próxima mensagem do paciente.
  const aiResponseToSave = listOptionsContext
    ? `${finalReply.trim()}\n\n[Opções apresentadas ao paciente: ${listOptionsContext}]`
    : finalReply;

  const [insertedLog] = await db.insert(aiLogsTable).values({
    clinicId,
    patientPhone,
    userMessage,
    aiResponse: aiResponseToSave,
    tokensUsed: totalTokens,
    messageType,
  }).returning({ id: aiLogsTable.id });

  return { reply: finalReply, tokensUsed: totalTokens, appointmentId, interactiveList: capturedInteractiveList, interactiveChoice: capturedInteractiveChoice, logId: insertedLog?.id };
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio from URL: ${audioUrl}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const file = new File([buffer], "audio.ogg", { type: "audio/ogg" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "json",
    language: "pt",
  });

  return transcription.text;
}
