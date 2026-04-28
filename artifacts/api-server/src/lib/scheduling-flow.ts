/**
 * scheduling-flow.ts
 *
 * State machine para o fluxo determinístico de agendamento via WhatsApp.
 *
 * Fluxo:
 *   [1] Usuário expressa intenção de agendar
 *   [2] Sistema apresenta lista de serviços  (estado: svc_select)
 *   [3] Usuário escolhe serviço
 *   [4] Sistema apresenta profissionais       (estado: prof_select)
 *   [5] Usuário escolhe profissional
 *   [6] Sistema apresenta datas disponíveis  (estado: date_select)
 *   [7] Usuário escolhe data
 *   [8] Sistema apresenta horários           (estado: slot_select)
 *   [9] Usuário escolhe horário
 *  [10] Sistema exibe resumo + botões        (estado: confirming)
 *  [11] Usuário confirma → agendamento criado no DB
 *       Usuário cancela → sessão limpa
 *
 * A IA NÃO é chamada durante este fluxo — todas as respostas são templates.
 */

import { AsyncLocalStorage } from "async_hooks";
import {
  db,
  servicesTable,
  professionalsTable,
  professionalServicesTable,
  professionalSchedulesTable,
  appointmentsTable,
  patientsTable,
  clinicsTable,
} from "@workspace/db";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { buildAvailabilityList } from "./ai-orchestrator";
import {
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  sendTypingPresence,
} from "./evolution-api";
import { createMercadoPagoPixPayment } from "./mercado-pago";
import { logger } from "./logger";

// ─── Test Mode Capture (AsyncLocalStorage) ────────────────────────────────────
// Permite que o endpoint de teste (/whatsapp/test) capture as mensagens do fluxo
// de agendamento em vez de enviá-las via Evolution API. Usa AsyncLocalStorage para
// não precisar alterar nenhuma assinatura de função interna.

interface CaptureBuffer {
  texts: string[];
  lastList?: {
    title: string;
    description: string;
    buttonText: string;
    sections: Array<{ title: string; rows: Array<{ rowId: string; title: string; description?: string }> }>;
  };
  lastButtons?: {
    description: string;
    buttons: Array<{ buttonId: string; displayText: string }>;
  };
}

const captureStorage = new AsyncLocalStorage<CaptureBuffer>();

/** Executa fn dentro de um contexto de captura e retorna o buffer coletado. */
export async function runSchedulingWithCapture<T>(fn: () => Promise<T>): Promise<{ result: T; capture: CaptureBuffer }> {
  const capture: CaptureBuffer = { texts: [] };
  const result = await captureStorage.run(capture, fn);
  return { result, capture };
}

/** Converte o buffer de captura no formato esperado pelo endpoint de teste. */
export function captureToTestResponse(capture: CaptureBuffer | undefined): {
  reply: string;
  appointmentId: null;
  interactiveList: unknown | null;
  interactiveChoice: unknown | null;
} {
  if (!capture) return { reply: "", appointmentId: null, interactiveList: null, interactiveChoice: null };

  let interactiveList: unknown = null;
  let interactiveChoice: unknown = null;

  if (capture.lastList) {
    interactiveList = {
      type: "list",
      header: capture.lastList.title,
      body: capture.lastList.description,
      button: capture.lastList.buttonText,
      sections: capture.lastList.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({ id: r.rowId, title: r.title, description: r.description })),
      })),
    };
  }

  if (capture.lastButtons) {
    interactiveChoice = {
      header: "",
      body: capture.lastButtons.description,
      options: capture.lastButtons.buttons.map((b) => ({ id: b.buttonId, label: b.displayText })),
    };
  }

  const textParts = capture.texts;
  const reply = textParts.join("\n\n") || (interactiveList ? "Selecione uma opção abaixo:" : interactiveChoice ? "Confirme sua seleção:" : "");

  return { reply, appointmentId: null, interactiveList, interactiveChoice };
}

// ─── Wrappers internos de envio com suporte a captura ────────────────────────
// Substitui chamadas diretas à evolution-api.ts — transparente para as funções do fluxo.

async function _sfText(instance: string, phone: string, text: string): Promise<void> {
  const buf = captureStorage.getStore();
  if (buf) { buf.texts.push(text); return; }
  await sendTextMessage(instance, phone, text);
}

async function _sfList(instance: string, phone: string, opts: {
  title: string; description: string; buttonText: string;
  sections: Array<{ title: string; rows: Array<{ rowId: string; title: string; description?: string }> }>;
}): Promise<void> {
  const buf = captureStorage.getStore();
  if (buf) { buf.lastList = opts; return; }
  await sendListMessage(instance, phone, opts);
}

async function _sfButtons(instance: string, phone: string, opts: {
  description: string; buttons: Array<{ buttonId: string; displayText: string }>;
}): Promise<void> {
  const buf = captureStorage.getStore();
  if (buf) { buf.lastButtons = opts; return; }
  await sendButtonMessage(instance, phone, opts);
}

async function _sfTyping(instance: string, phone: string): Promise<void> {
  if (captureStorage.getStore()) return; // pula indicador de digitação em modo de teste
  await sendTypingPresence(instance, phone);
}


// ─── Types ────────────────────────────────────────────────────────────────────

type SchedulingState =
  | "svc_select"
  | "prof_select"
  | "date_select"
  | "slot_select"
  | "confirming"
  | "appt_list"    // listando agendamentos do paciente
  | "rescheduling"; // remarcando (reusa date_select → slot_select → confirming)

interface SchedulingSession {
  state: SchedulingState;
  serviceId?: number;
  serviceName?: string;
  professionalId?: number | null; // null = sem preferência
  professionalName?: string;
  selectedDate?: string;
  selectedSlot?: string;           // ISO 8601
  selectedAppointmentId?: number;  // ID do agendamento sendo remarcado/cancelado
  expiresAt: number;
}

// ─── Session Store (in-memory) ────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min
const schedulingSessions = new Map<string, SchedulingSession>();

function sessionKey(clinicId: number, phone: string): string {
  return `${clinicId}:${phone}`;
}

function getSession(clinicId: number, phone: string): SchedulingSession | undefined {
  const key = sessionKey(clinicId, phone);
  const s = schedulingSessions.get(key);
  if (s && Date.now() > s.expiresAt) {
    schedulingSessions.delete(key);
    return undefined;
  }
  return s;
}

function setSession(
  clinicId: number,
  phone: string,
  session: Omit<SchedulingSession, "expiresAt">,
): void {
  schedulingSessions.set(sessionKey(clinicId, phone), {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export function clearSchedulingSession(clinicId: number, phone: string): void {
  schedulingSessions.delete(sessionKey(clinicId, phone));
}

export function hasActiveSchedulingSession(clinicId: number, phone: string): boolean {
  return getSession(clinicId, phone) !== undefined;
}

// ─── Intent Detection (keyword-based, sem chamar a IA) ───────────────────────

const SCHEDULING_KEYWORDS = [
  // Intenção explícita
  "agendar",
  "agendamento",
  "marcar",
  "horario",
  "horarios",
  "reservar",
  "remarcar",
  "remarcar consulta",
  "remarcar agendamento",
  "reagendar",
  // Tipos de serviço (contexto de clínica)
  "consulta",
  "consultas",
  "sessao",
  "sessoes",
  "atendimento",
  "procedimento",
  "tratamento",
  // Ações sobre agendamentos
  "ver agendamento",
  "meus agendamentos",
  "minha consulta",
  "minhas consultas",
  "cancelar consulta",
  "cancelar agendamento",
  "quero agendar",
  "quero marcar",
  "quero remarcar",
  "quero cancelar",
  "gostaria de agendar",
  "gostaria de marcar",
  "posso agendar",
  "posso marcar",
  // Frases com serviço implícito (variações comuns)
  "quero uma consulta",
  "preciso de uma consulta",
  "preciso marcar",
  "preciso agendar",
  "tem horario",
  "tem vaga",
  "disponibilidade",
  // "para [dia da semana]" ou "pra [dia da semana]" em contexto de clínica = intenção de agendamento
  "para sabado", "pra sabado",
  "para domingo", "pra domingo",
  "para segunda", "pra segunda",
  "para terca", "pra terca",
  "para quarta", "pra quarta",
  "para quinta", "pra quinta",
  "para sexta", "pra sexta",
  "para amanha", "pra amanha",
  "para hoje", "pra hoje",
  "para dia", "pra dia",
  "para semana", "pra semana",
  "para o dia", "pra o dia",
  // REMOVIDOS: "quero um/uma", "preciso de um/uma", "quero fazer", "fazer um/uma" — muito genéricos,
  // causavam falso-positivo (ex: "quero uma explicação", "fazer uma pergunta").
  // REMOVIDOS: " sabado", " domingo" etc. solo — causavam falso-positivo (ex: "você abre sábado?").
  // Casos borderline são tratados pela IA conversacional com a nova regra de confirmação.
  // Frases específicas ainda cobertas: "para sabado", "pra sabado", "quero agendar", etc.
];

/** Retorna true se a mensagem expressa intenção de agendamento. */
export function isSchedulingIntent(message: string): boolean {
  // Normaliza: minúsculas + remove acentos + remove pontuação não-alfanumérica
  const norm = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

  return SCHEDULING_KEYWORDS.some((kw) => {
    const kwNorm = kw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ");
    return norm.includes(kwNorm);
  });
}

// ─── Management Intent ────────────────────────────────────────────────────────

const MANAGEMENT_KEYWORDS = [
  "meu agendamento",
  "meus agendamentos",
  "minha consulta",
  "minhas consultas",
  "ver agendamento",
  "ver consulta",
  "consultar agendamento",
  "cancelar consulta",
  "cancelar agendamento",
  "remarcar consulta",
  "remarcar agendamento",
  "reagendar",
  "remontar",
  "desmarcar",
  "desmarcar consulta",
  "ver minha consulta",
  "quero cancelar",
  "quero remarcar",
  "quero ver minha",
];

/** Retorna true se a mensagem expressa intenção de gerenciar agendamentos existentes. */
export function isManagementIntent(message: string): boolean {
  const norm = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");

  return MANAGEMENT_KEYWORDS.some((kw) => {
    const kwNorm = kw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ");
    return norm.includes(kwNorm);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Data atual no fuso BRT (UTC-3) no formato YYYY-MM-DD */
function todayBRT(): string {
  // BRT = UTC-3: subtrai 3h para normalizar, então pega slice de ISO
  const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brtNow.toISOString().slice(0, 10);
}

/** Busca próximas datas (até 6) com disponibilidade para o serviço/profissional. */
async function getAvailableDates(
  clinicId: number,
  serviceId?: number,
  professionalId?: number | null,
): Promise<string[]> {
  let qualifiedProfIds: number[] = [];
  if (serviceId) {
    const links = await db
      .select({ professionalId: professionalServicesTable.professionalId })
      .from(professionalServicesTable)
      .where(eq(professionalServicesTable.serviceId, serviceId));
    qualifiedProfIds = links.map((l) => l.professionalId);
  }

  const profFilter = professionalId
    ? [eq(professionalsTable.id, professionalId)]
    : qualifiedProfIds.length > 0
      ? [inArray(professionalsTable.id, qualifiedProfIds)]
      : [];

  const profs = await db
    .select({ id: professionalsTable.id })
    .from(professionalsTable)
    .where(
      and(
        eq(professionalsTable.clinicId, clinicId),
        eq(professionalsTable.active, true),
        ...profFilter,
      ),
    );

  if (profs.length === 0) return [];

  const schedules = await db
    .select({
      professionalId: professionalSchedulesTable.professionalId,
      dayOfWeek: professionalSchedulesTable.dayOfWeek,
    })
    .from(professionalSchedulesTable)
    .where(
      and(
        inArray(
          professionalSchedulesTable.professionalId,
          profs.map((p) => p.id),
        ),
        eq(professionalSchedulesTable.isBlock, false),
      ),
    );

  const workDaySet = new Set(schedules.map((s) => `${s.professionalId}:${s.dayOfWeek}`));
  // Usar data BRT para evitar bug de data errada perto de meia-noite
  const today = todayBRT();
  const fromMs = new Date(`${today}T03:00:00Z`).getTime();
  const dates: string[] = [];

  for (let d = 1; d <= 30 && dates.length < 6; d++) {
    const ms = fromMs + d * 24 * 60 * 60 * 1000;
    const dateStr = new Date(ms).toISOString().slice(0, 10);
    const dow = new Date(ms).getUTCDay();
    if (profs.some((p) => workDaySet.has(`${p.id}:${dow}`))) {
      // Verificar disponibilidade real — datas com todos os slots ocupados não são exibidas
      const { interactiveList } = await buildAvailabilityList(
        clinicId,
        dateStr,
        serviceId,
        professionalId ?? undefined,
      );
      if (interactiveList) dates.push(dateStr);
    }
  }

  return dates;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

async function showServiceSelection(
  clinicId: number,
  phone: string,
  instance: string,
  clinicName: string,
  patientName?: string,
): Promise<void> {
  const services = await db
    .select({ id: servicesTable.id, name: servicesTable.name, description: servicesTable.description })
    .from(servicesTable)
    .where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.active, true)));

  if (services.length === 0) {
    await _sfText(
      instance,
      phone,
      "😔 No momento não temos serviços disponíveis para agendamento. Entre em contato pelo telefone da clínica.",
    );
    return;
  }

  // 1 único serviço → pula diretamente para profissionais
  if (services.length === 1) {
    const svc = services[0];
    setSession(clinicId, phone, { state: "prof_select", serviceId: svc.id, serviceName: svc.name });
    await showProfessionalSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
    return;
  }

  setSession(clinicId, phone, { state: "svc_select" });

  const greeting = patientName ? `Olá, ${patientName}! ` : "Olá! ";

  await _sfList(instance, phone, {
    title: "🗓️ Agendamento",
    description: `${greeting}Qual serviço você gostaria de agendar?`,
    buttonText: "Ver serviços",
    sections: [
      {
        title: `Serviços — ${clinicName}`,
        rows: services.map((s) => ({
          rowId: `SVC|${s.id}`,
          title: s.name,
          description: s.description ?? "",
        })),
      },
    ],
  });
}

async function showProfessionalSelection(
  clinicId: number,
  phone: string,
  instance: string,
  session: SchedulingSession,
): Promise<void> {
  // Busca profissionais vinculados ao serviço e ativos
  const allLinked = await db
    .select({
      id: professionalsTable.id,
      name: professionalsTable.name,
      specialty: professionalsTable.specialty,
    })
    .from(professionalsTable)
    .innerJoin(
      professionalServicesTable,
      eq(professionalServicesTable.professionalId, professionalsTable.id),
    )
    .where(
      and(
        eq(professionalServicesTable.serviceId, session.serviceId!),
        eq(professionalsTable.clinicId, clinicId),
        eq(professionalsTable.active, true),
      ),
    );

  if (allLinked.length === 0) {
    await _sfText(
      instance,
      phone,
      "😔 Não há profissionais cadastrados para este serviço. Entre em contato com a clínica.",
    );
    clearSchedulingSession(clinicId, phone);
    return;
  }

  // Filtra apenas profissionais que têm agenda de trabalho cadastrada (ao menos 1 dia não-bloqueante)
  const scheduleRows = await db
    .selectDistinct({ professionalId: professionalSchedulesTable.professionalId })
    .from(professionalSchedulesTable)
    .where(
      and(
        inArray(
          professionalSchedulesTable.professionalId,
          allLinked.map((p) => p.id),
        ),
        eq(professionalSchedulesTable.isBlock, false),
      ),
    );

  const profsWithScheduleSet = new Set(scheduleRows.map((r) => r.professionalId));
  const professionals = allLinked.filter((p) => profsWithScheduleSet.has(p.id));

  if (professionals.length === 0) {
    await _sfText(
      instance,
      phone,
      "😔 No momento não há horários disponíveis para este serviço. Entre em contato com a clínica.",
    );
    clearSchedulingSession(clinicId, phone);
    return;
  }

  // Apenas 1 profissional qualificado → pula a seleção automaticamente
  if (professionals.length === 1) {
    const prof = professionals[0];
    setSession(clinicId, phone, {
      ...session,
      state: "date_select",
      professionalId: prof.id,
      professionalName: prof.name,
    });
    await _sfText(
      instance,
      phone,
      `👤 Profissional: *${prof.name}*${prof.specialty ? ` — ${prof.specialty}` : ""}\n\nEscolha a data para seu agendamento:`,
    );
    await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
    return;
  }

  // Múltiplos profissionais → exibe lista com opção "Sem preferência"
  const rows = [
    ...professionals.map((p) => ({
      rowId: `PRF|${p.id}`,
      title: p.name,
      description: p.specialty ?? "",
    })),
    { rowId: "PRF|0", title: "Sem preferência", description: "Qualquer profissional disponível" },
  ];

  await _sfList(instance, phone, {
    title: "👤 Profissional",
    description: `Ótimo! Para *${session.serviceName}*, qual profissional você prefere?`,
    buttonText: "Ver profissionais",
    sections: [{ title: "Profissionais disponíveis", rows }],
  });
}

async function showDateSelection(
  clinicId: number,
  phone: string,
  instance: string,
  session: SchedulingSession,
): Promise<void> {
  const dates = await getAvailableDates(clinicId, session.serviceId, session.professionalId);

  if (dates.length === 0) {
    await _sfText(
      instance,
      phone,
      "😔 Não encontrei datas disponíveis nos próximos 30 dias. Entre em contato pelo telefone da clínica para verificar a agenda.",
    );
    clearSchedulingSession(clinicId, phone);
    return;
  }

  const profContext = session.professionalId ? ` com ${session.professionalName}` : "";

  await _sfList(instance, phone, {
    title: "📅 Data",
    description: `Quais datas estão disponíveis para *${session.serviceName}*${profContext}?`,
    buttonText: "Ver datas",
    sections: [
      {
        title: "Datas disponíveis",
        rows: dates.map((d) => {
          const [y, mo, day] = d.split("-");
          const dow = new Date(`${d}T03:00:00Z`).getUTCDay();
          return {
            rowId: `DATE|${d}`,
            title: `${DAY_NAMES_SHORT[dow]}, ${day}/${mo}`,
            description: `${day}/${mo}/${y}`,
          };
        }),
      },
    ],
  });
}

async function showSlotSelection(
  clinicId: number,
  phone: string,
  instance: string,
  session: SchedulingSession,
  date: string,
): Promise<void> {
  try {
    const { interactiveList } = await buildAvailabilityList(
      clinicId,
      date,
      session.serviceId,
      session.professionalId ?? undefined,
      0,
    );

    if (!interactiveList) {
      // Sem horários nesta data (pode ser race condition — slots se esgotaram após a data ser exibida)
      // Volta para seleção de data — getAvailableDates() agora verifica disponibilidade real,
      // então essa data não aparecerá novamente na lista.
      await _sfText(
        instance,
        phone,
        "😕 Que pena! Os horários dessa data acabaram de ser preenchidos. Vou buscar outras datas disponíveis para você!",
      );
      setSession(clinicId, phone, { ...session, state: "date_select", selectedDate: undefined });
      await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
      return;
    }

    await _sfList(instance, phone, {
      title: interactiveList.header,
      description: interactiveList.body,
      buttonText: interactiveList.buttonText,
      sections: interactiveList.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({ rowId: r.id, title: r.title, description: r.description })),
      })),
    });
  } catch (err) {
    logger.error({ err, clinicId, phone, date }, "[SchedulingFlow] Erro ao exibir horários disponíveis");
    await _sfText(
      instance,
      phone,
      "❌ Não consegui carregar os horários agora. Por favor, tente novamente em instantes ou entre em contato com a clínica.",
    ).catch(() => {});
    clearSchedulingSession(clinicId, phone);
  }
}

async function showConfirmation(
  phone: string,
  instance: string,
  session: SchedulingSession,
): Promise<void> {
  const { selectedSlot, serviceName, professionalName } = session;
  if (!selectedSlot) return;

  const dt = new Date(selectedSlot);
  const dateLabel = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  const timeLabel = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const text =
    `✅ *Confirme seu agendamento:*\n\n` +
    `📋 *Serviço:* ${serviceName ?? "—"}\n` +
    `👤 *Profissional:* ${professionalName ?? "—"}\n` +
    `📅 *Data:* ${dateLabel}\n` +
    `🕐 *Horário:* ${timeLabel}\n\n` +
    `Deseja confirmar?`;

  await _sfButtons(instance, phone, {
    description: text,
    buttons: [
      { buttonId: "CNF|yes", displayText: "✅ Confirmar" },
      { buttonId: "CNF|no", displayText: "❌ Cancelar" },
    ],
  });
}

// ─── Book Appointment ─────────────────────────────────────────────────────────

async function confirmAndBook(
  clinicId: number,
  phone: string,
  instance: string,
  session: SchedulingSession,
  clinicName: string,
): Promise<void> {
  const { serviceId, professionalId, selectedSlot } = session;

  if (!selectedSlot) {
    await _sfText(
      instance,
      phone,
      "❌ Erro interno: horário não selecionado. Por favor, reinicie o agendamento.",
    );
    clearSchedulingSession(clinicId, phone);
    return;
  }

  try {
    // Buscar paciente pelo telefone (criado pelo fluxo conversacional ou primeiro contato)
    const [patient] = await db
      .select({ id: patientsTable.id, name: patientsTable.name })
      .from(patientsTable)
      .where(and(eq(patientsTable.clinicId, clinicId), eq(patientsTable.phone, phone)));

    const patientName = patient?.name ?? "Paciente";

    // ── Verificar conflito de horário antes de inserir ───────────────────────
    const slotStart = new Date(selectedSlot);
    const slotEnd = new Date(slotStart);

    // Buscar duração do serviço
    let durationMinutes = 60;
    if (serviceId) {
      const [svcRow] = await db
        .select({ durationMinutes: servicesTable.durationMinutes })
        .from(servicesTable)
        .where(eq(servicesTable.id, serviceId))
        .limit(1);
      if (svcRow) durationMinutes = svcRow.durationMinutes;
    }
    slotEnd.setTime(slotStart.getTime() + durationMinutes * 60 * 1000);

    // Checar conflito por profissional (se definido)
    if (professionalId) {
      const conflictingAppts = await db
        .select({ scheduledAt: appointmentsTable.scheduledAt })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.clinicId, clinicId),
            eq(appointmentsTable.professionalId, professionalId),
            gte(appointmentsTable.scheduledAt, new Date(slotStart.getTime() - durationMinutes * 60 * 1000)),
            lte(appointmentsTable.scheduledAt, slotEnd),
          ),
        );

      const hasConflict = conflictingAppts.some((a) => {
        const aStart = new Date(a.scheduledAt).getTime();
        const aEnd = aStart + durationMinutes * 60 * 1000;
        return aStart < slotEnd.getTime() && aEnd > slotStart.getTime();
      });

      if (hasConflict) {
        clearSchedulingSession(clinicId, phone);
        await _sfText(
          instance,
          phone,
          "😕 Poxa, esse horário acabou de ser ocupado por outro paciente. Vou te mostrar novas opções — não vai demorar!",
        );
        // Reiniciar a partir da seleção de data para o mesmo serviço/profissional
        setSession(clinicId, phone, {
          state: "date_select",
          serviceId: session.serviceId,
          serviceName: session.serviceName,
          professionalId: session.professionalId,
          professionalName: session.professionalName,
        });
        await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
        return;
      }
    }

    // Inserir ou atualizar agendamento
    let appointmentId: number;
    const isRescheduling = !!session.selectedAppointmentId;

    if (isRescheduling) {
      // Remarcação: atualiza o agendamento existente
      await db
        .update(appointmentsTable)
        .set({
          scheduledAt: slotStart,
          serviceId: serviceId ?? undefined,
          professionalId: professionalId ?? undefined,
          status: "confirmed",
          notes: "Remarcado via WhatsApp",
        })
        .where(
          and(
            eq(appointmentsTable.id, session.selectedAppointmentId!),
            eq(appointmentsTable.clinicId, clinicId),
            eq(appointmentsTable.patientPhone, phone),
          ),
        );
      appointmentId = session.selectedAppointmentId!;
    } else {
      // Novo agendamento
      const [appointment] = await db
        .insert(appointmentsTable)
        .values({
          clinicId,
          patientId: patient?.id ?? undefined,
          serviceId: serviceId ?? undefined,
          professionalId: professionalId ?? undefined,
          patientName,
          patientPhone: phone,
          scheduledAt: slotStart,
          status: "confirmed",
          notes: "Agendamento via WhatsApp (fluxo guiado)",
        })
        .returning({ id: appointmentsTable.id });
      appointmentId = appointment.id;
    }

    clearSchedulingSession(clinicId, phone);

    const dt = new Date(selectedSlot);
    const dateLabel = dt.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
    const timeLabel = dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });

    // ── Verificar se a clínica usa Mercado Pago e o serviço tem preço > 0 ─────
    if (!isRescheduling && serviceId) {
      const [clinicRow] = await db
        .select({ mercadoPagoAccessToken: clinicsTable.mercadoPagoAccessToken })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, clinicId))
        .limit(1);

      const mpAccessToken = clinicRow?.mercadoPagoAccessToken ?? process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "";

      // Busca preço do serviço (já temos durationMinutes acima, reutilizamos)
      const [svcPriceRow] = await db
        .select({ price: servicesTable.price, name: servicesTable.name })
        .from(servicesTable)
        .where(eq(servicesTable.id, serviceId))
        .limit(1);

      const servicePrice = Number(svcPriceRow?.price ?? 0);

      if (mpAccessToken && servicePrice > 0) {
        try {
          const externalRef = `AGD_${Date.now()}_C${clinicId}_A${appointmentId}`;
          const pix = await createMercadoPagoPixPayment({
            accessToken: mpAccessToken,
            amount: servicePrice,
            description: session.serviceName ?? svcPriceRow?.name ?? "Agendamento",
            payerName: patientName,
            externalReference: externalRef,
            expirationMinutes: 30,
          });

          // Salva os dados de pagamento no agendamento
          await db
            .update(appointmentsTable)
            .set({
              paymentIntentId: pix.paymentId,
              externalReference: externalRef,
              paymentStatus: "pending_payment",
              paymentAmount: String(servicePrice),
              status: "pending",
              reservationExpiresAt: pix.expiresAt,
            })
            .where(eq(appointmentsTable.id, appointmentId));

          const pixMsg =
            `🎉 *Agendamento reservado!*\n\n` +
            `📋 *Serviço:* ${session.serviceName ?? "—"}\n` +
            `👤 *Profissional:* ${session.professionalName ?? "—"}\n` +
            `📅 *Data:* ${dateLabel}\n` +
            `🕐 *Horário:* ${timeLabel}\n` +
            `💰 *Valor:* R$ ${servicePrice.toFixed(2)}\n` +
            `🔖 *ID:* #${appointmentId}\n\n` +
            `💳 *Para confirmar seu horário, efetue o pagamento via PIX:*\n\n` +
            `Copie o código abaixo:\n\`${pix.qrCode}\`\n\n` +
            `⏳ *Expira em 30 minutos.* Após o pagamento, você receberá uma confirmação automática.`;

          await _sfText(instance, phone, pixMsg);
          logger.info({ clinicId, phone, appointmentId, paymentId: pix.paymentId }, "[SchedulingFlow] Pagamento PIX gerado");
          return;
        } catch (err) {
          logger.warn({ err, clinicId, appointmentId }, "[SchedulingFlow] Falha ao gerar PIX — confirmando agendamento sem pagamento");
          // Fallback: confirma o agendamento normalmente sem pagamento
        }
      }
    }

    const successMsg =
      `${isRescheduling ? "🔄" : "🎉"} *${isRescheduling ? "Agendamento remarcado!" : "Agendamento confirmado!"}*\n\n` +
      `📋 *Serviço:* ${session.serviceName ?? "—"}\n` +
      `👤 *Profissional:* ${session.professionalName ?? "—"}\n` +
      `📅 *Data:* ${dateLabel}\n` +
      `🕐 *Horário:* ${timeLabel}\n` +
      `🔖 *ID:* #${appointmentId}\n\n` +
      `Aguardamos você na ${clinicName}! 😊\n` +
      `Para cancelar ou remarcar, entre em contato com a recepção.`;

    await _sfText(instance, phone, successMsg);

    logger.info(
      { clinicId, phone, appointmentId },
      "[SchedulingFlow] Agendamento criado via fluxo guiado",
    );
  } catch (err) {
    logger.error({ err, clinicId, phone }, "[SchedulingFlow] Erro ao criar/remarcar agendamento");
    clearSchedulingSession(clinicId, phone);
    await _sfText(
      instance,
      phone,
      "❌ Não foi possível salvar o agendamento no momento. Por favor, entre em contato diretamente com a clínica.",
    );
  }
}

// ─── Appointment Management ───────────────────────────────────────────────────

/** Mostra lista de agendamentos futuros do paciente com botões para cada um. */
async function showAppointmentList(
  clinicId: number,
  phone: string,
  instance: string,
): Promise<void> {
  const now = new Date();

  const appts = await db
    .select({
      id: appointmentsTable.id,
      scheduledAt: appointmentsTable.scheduledAt,
      status: appointmentsTable.status,
      serviceId: appointmentsTable.serviceId,
      professionalId: appointmentsTable.professionalId,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.clinicId, clinicId),
        eq(appointmentsTable.patientPhone, phone),
        gte(appointmentsTable.scheduledAt, now),
        inArray(appointmentsTable.status, ["scheduled", "pending", "confirmed"]),
      ),
    )
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(8);

  if (appts.length === 0) {
    await _sfText(
      instance,
      phone,
      "😊 Você não tem agendamentos futuros. Quer marcar um horário agora?",
    );
    clearSchedulingSession(clinicId, phone);
    return;
  }

  // Busca nomes de serviços e profissionais em paralelo
  const svcIds = [...new Set(appts.map((a) => a.serviceId).filter(Boolean))] as number[];
  const profIds = [...new Set(appts.map((a) => a.professionalId).filter(Boolean))] as number[];

  const [svcRows, profRows] = await Promise.all([
    svcIds.length > 0
      ? db.select({ id: servicesTable.id, name: servicesTable.name }).from(servicesTable).where(inArray(servicesTable.id, svcIds))
      : Promise.resolve([]),
    profIds.length > 0
      ? db.select({ id: professionalsTable.id, name: professionalsTable.name }).from(professionalsTable).where(inArray(professionalsTable.id, profIds))
      : Promise.resolve([]),
  ]);

  const svcMap = new Map(svcRows.map((s) => [s.id, s.name]));
  const profMap = new Map(profRows.map((p) => [p.id, p.name]));

  const rows = appts.map((a) => {
    const dt = new Date(a.scheduledAt);
    const dateLabel = dt.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    const timeLabel = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    const svcName = a.serviceId ? (svcMap.get(a.serviceId) ?? "Serviço") : "Serviço";
    const profName = a.professionalId ? (profMap.get(a.professionalId) ?? "") : "";
    const description = profName ? `${timeLabel} — ${profName}` : timeLabel;

    return {
      rowId: `APPT|${a.id}`,
      title: `${dateLabel} — ${svcName}`,
      description,
    };
  });

  setSession(clinicId, phone, { state: "appt_list" });

  await _sfList(instance, phone, {
    title: "📋 Meus Agendamentos",
    description: "Selecione um agendamento para ver as opções:",
    buttonText: "Ver agendamentos",
    sections: [{ title: "Próximos agendamentos", rows }],
  });
}

/** Cancela um agendamento (atualiza status para 'cancelled'). */
async function cancelAppointment(
  clinicId: number,
  phone: string,
  instance: string,
  appointmentId: number,
): Promise<void> {
  try {
    const [appt] = await db
      .select({ id: appointmentsTable.id, scheduledAt: appointmentsTable.scheduledAt, clinicId: appointmentsTable.clinicId })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.clinicId, clinicId),
          eq(appointmentsTable.patientPhone, phone),
        ),
      )
      .limit(1);

    if (!appt) {
      await _sfText(instance, phone, "❌ Agendamento não encontrado ou não pertence a este número.");
      clearSchedulingSession(clinicId, phone);
      return;
    }

    await db
      .update(appointmentsTable)
      .set({ status: "cancelled" })
      .where(eq(appointmentsTable.id, appointmentId));

    const dt = new Date(appt.scheduledAt);
    const dateLabel = dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
    const timeLabel = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

    clearSchedulingSession(clinicId, phone);
    await _sfText(
      instance,
      phone,
      `✅ Agendamento do dia *${dateLabel}* às *${timeLabel}* foi cancelado com sucesso.\n\nSe precisar reagendar, é só chamar! 😊`,
    );

    logger.info({ clinicId, phone, appointmentId }, "[SchedulingFlow] Agendamento cancelado");
  } catch (err) {
    logger.error({ err, appointmentId }, "[SchedulingFlow] Erro ao cancelar agendamento");
    clearSchedulingSession(clinicId, phone);
    await _sfText(instance, phone, "❌ Não foi possível cancelar o agendamento. Entre em contato com a clínica.");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inicia o fluxo de agendamento.
 * Chamado quando isSchedulingIntent() é true e não há sessão ativa,
 * ou quando o usuário quer reiniciar o fluxo.
 */
export async function startSchedulingFlow(params: {
  clinicId: number;
  phone: string;
  instance: string;
  clinicName: string;
  patientName?: string;
}): Promise<void> {
  const { clinicId, phone, instance, clinicName, patientName } = params;
  await _sfTyping(instance, phone);
  await showServiceSelection(clinicId, phone, instance, clinicName, patientName);
}

/**
 * Inicia o fluxo de gestão de agendamentos (consultar, cancelar, remarcar).
 * Chamado quando isManagementIntent() é true e não há sessão ativa.
 */
export async function startManagementFlow(params: {
  clinicId: number;
  phone: string;
  instance: string;
}): Promise<void> {
  const { clinicId, phone, instance } = params;
  await _sfTyping(instance, phone);
  await showAppointmentList(clinicId, phone, instance);
}

/**
 * Processa uma seleção de lista/botão dentro do fluxo de agendamento.
 *
 * @returns true  se a seleção foi tratada pelo fluxo (não chamar a IA)
 * @returns false se a seleção não pertence ao fluxo (chamar a IA normalmente)
 */
export async function handleSchedulingSelection(params: {
  clinicId: number;
  phone: string;
  instance: string;
  selectedId: string;
  clinicName: string;
}): Promise<boolean> {
  const { clinicId, phone, instance, selectedId, clinicName } = params;

  // ── Serviço selecionado ───────────────────────────────────────────────────
  if (selectedId.startsWith("SVC|")) {
    const serviceId = parseInt(selectedId.split("|")[1], 10);
    if (isNaN(serviceId)) return false;

    logger.info({ clinicId, phone, serviceId }, "[SchedulingFlow] SVC| selecionado — buscando serviço");

    const [service] = await db
      .select({ id: servicesTable.id, name: servicesTable.name })
      .from(servicesTable)
      .where(
        and(
          eq(servicesTable.id, serviceId),
          eq(servicesTable.clinicId, clinicId),
          eq(servicesTable.active, true),
        ),
      );

    if (!service) {
      logger.warn({ clinicId, phone, serviceId }, "[SchedulingFlow] Serviço não encontrado ou inativo — retornando false");
      return false;
    }

    logger.info({ clinicId, phone, serviceId, serviceName: service.name }, "[SchedulingFlow] Serviço encontrado — iniciando seleção de profissional");
    setSession(clinicId, phone, { state: "prof_select", serviceId, serviceName: service.name });
    await _sfTyping(instance, phone);
    await showProfessionalSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
    return true;
  }

  const session = getSession(clinicId, phone);

  // ── Agendamento selecionado da lista → mostra botões cancelar/remarcar ────
  if (selectedId.startsWith("APPT|")) {
    const appointmentId = parseInt(selectedId.split("|")[1], 10);
    if (isNaN(appointmentId)) return false;

    const [appt] = await db
      .select({
        id: appointmentsTable.id,
        scheduledAt: appointmentsTable.scheduledAt,
        serviceId: appointmentsTable.serviceId,
        professionalId: appointmentsTable.professionalId,
        status: appointmentsTable.status,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.clinicId, clinicId),
          eq(appointmentsTable.patientPhone, phone),
        ),
      )
      .limit(1);

    if (!appt) return false;

    const dt = new Date(appt.scheduledAt);
    const dateLabel = dt.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
    });
    const timeLabel = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

    // Preserva o appointmentId na sessão para o próximo passo
    setSession(clinicId, phone, { ...( session ?? { state: "appt_list" } ), state: "appt_list", selectedAppointmentId: appointmentId });

    await _sfTyping(instance, phone);
    await _sfButtons(instance, phone, {
      description: `📋 *Agendamento selecionado:*\n\n📅 ${dateLabel}\n🕐 ${timeLabel}\n\nO que deseja fazer?`,
      buttons: [
        { buttonId: `RMK|${appointmentId}`, displayText: "🔄 Remarcar" },
        { buttonId: `CNC|${appointmentId}`, displayText: "❌ Cancelar" },
      ],
    });
    return true;
  }

  // ── Cancelar agendamento ──────────────────────────────────────────────────
  if (selectedId.startsWith("CNC|")) {
    const appointmentId = parseInt(selectedId.split("|")[1], 10);
    if (isNaN(appointmentId)) return false;
    await _sfTyping(instance, phone);
    await cancelAppointment(clinicId, phone, instance, appointmentId);
    return true;
  }

  // ── Remarcar agendamento → reutiliza fluxo de data/horário ───────────────
  if (selectedId.startsWith("RMK|")) {
    const appointmentId = parseInt(selectedId.split("|")[1], 10);
    if (isNaN(appointmentId)) return false;

    const [appt] = await db
      .select({
        id: appointmentsTable.id,
        serviceId: appointmentsTable.serviceId,
        professionalId: appointmentsTable.professionalId,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.id, appointmentId),
          eq(appointmentsTable.clinicId, clinicId),
          eq(appointmentsTable.patientPhone, phone),
        ),
      )
      .limit(1);

    if (!appt) return false;

    // Busca nomes do serviço e profissional
    let serviceName = "Serviço";
    let professionalName: string | undefined;

    if (appt.serviceId) {
      const [s] = await db.select({ name: servicesTable.name }).from(servicesTable).where(eq(servicesTable.id, appt.serviceId)).limit(1);
      serviceName = s?.name ?? serviceName;
    }
    if (appt.professionalId) {
      const [p] = await db.select({ name: professionalsTable.name }).from(professionalsTable).where(eq(professionalsTable.id, appt.professionalId)).limit(1);
      professionalName = p?.name;
    }

    // Inicia fluxo de remarcação — reusa date_select com os mesmos serviço/profissional
    setSession(clinicId, phone, {
      state: "rescheduling",
      serviceId: appt.serviceId ?? undefined,
      serviceName,
      professionalId: appt.professionalId ?? null,
      professionalName,
      selectedAppointmentId: appointmentId,
    });

    await _sfTyping(instance, phone);
    await _sfText(
      instance,
      phone,
      `🔄 Vamos remarcar seu agendamento de *${serviceName}*.\nEscolha a nova data:`,
    );
    await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
    return true;
  }

  // ── Profissional selecionado ──────────────────────────────────────────────
  if (selectedId.startsWith("PRF|") && session?.state === "prof_select") {
    const profIdStr = selectedId.split("|")[1];
    const professionalId = profIdStr === "0" ? null : parseInt(profIdStr, 10);
    let professionalName = "Qualquer profissional";

    if (professionalId) {
      const [prof] = await db
        .select({ name: professionalsTable.name })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, professionalId));
      professionalName = prof?.name ?? "Profissional";
    }

    setSession(clinicId, phone, { ...session, state: "date_select", professionalId, professionalName });
    await _sfTyping(instance, phone);
    await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
    return true;
  }

  // ── Data selecionada ──────────────────────────────────────────────────────
  if (selectedId.startsWith("DATE|") && (session?.state === "date_select" || session?.state === "rescheduling")) {
    const date = selectedId.slice(5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

    setSession(clinicId, phone, { ...session, state: "slot_select", selectedDate: date });
    await _sfTyping(instance, phone);
    await showSlotSelection(clinicId, phone, instance, getSession(clinicId, phone)!, date);
    return true;
  }

  // ── Slot selecionado (prefixo S|profId|svcId|isoSlot gerado por buildAvailabilityList) ──
  // ── Slot selecionado — SEMPRE mostra confirmação, independente de ter sessão ativa ──
  // Isso garante que qualquer slot S| (do fluxo guiado OU da IA) passe pela confirmação
  // antes de ser agendado, evitando agendamentos acidentais sem consentimento explícito.
  if (selectedId.startsWith("S|")) {
    const parts = selectedId.split("|");
    const isoSlot = parts[3];
    if (!isoSlot) return false;

    const slotProfId = parts[1] ? parseInt(parts[1], 10) : null;
    const slotSvcId = parts[2] ? parseInt(parts[2], 10) : undefined;

    // Busca nomes do profissional e serviço (da sessão ou do banco)
    let slotProfName = session?.professionalName ?? "Profissional";
    if (slotProfId && slotProfId !== session?.professionalId) {
      const [p] = await db
        .select({ name: professionalsTable.name })
        .from(professionalsTable)
        .where(eq(professionalsTable.id, slotProfId));
      slotProfName = p?.name ?? slotProfName;
    }

    let slotSvcName = session?.serviceName ?? "Serviço";
    if (slotSvcId && slotSvcId !== session?.serviceId) {
      const [s] = await db
        .select({ name: servicesTable.name })
        .from(servicesTable)
        .where(eq(servicesTable.id, slotSvcId));
      slotSvcName = s?.name ?? slotSvcName;
    }

    // Cria/atualiza sessão com estado confirming — preserva dados da sessão anterior se houver
    setSession(clinicId, phone, {
      state: "confirming",
      selectedSlot: isoSlot,
      professionalId: slotProfId ?? session?.professionalId ?? null,
      professionalName: slotProfName,
      serviceId: slotSvcId ?? session?.serviceId,
      serviceName: slotSvcName,
      selectedDate: session?.selectedDate,
      selectedAppointmentId: session?.selectedAppointmentId,
    });

    await _sfTyping(instance, phone);
    await showConfirmation(phone, instance, getSession(clinicId, phone)!);
    return true;
  }

  // ── Confirmação ───────────────────────────────────────────────────────────
  if (selectedId.startsWith("CNF|") && session?.state === "confirming") {
    const answer = selectedId.split("|")[1];

    if (answer === "no") {
      clearSchedulingSession(clinicId, phone);
      await _sfTyping(instance, phone);
      await _sfText(
        instance,
        phone,
        "Tudo bem! Agendamento cancelado 😊 Se precisar, é só chamar!",
      );
      return true;
    }

    if (answer === "yes") {
      await _sfTyping(instance, phone);
      await confirmAndBook(clinicId, phone, instance, session, clinicName);
      return true;
    }
  }

  // ── Paginação de slots dentro do fluxo (M| gerado por buildAvailabilityList) ──
  if (selectedId.startsWith("M|") && session?.state === "slot_select") {
    // Paginação: deixa o whatsapp.ts tratar normalmente (buildAvailabilityList direto)
    return false;
  }

  return false;
}

/**
 * Processa texto livre durante uma sessão ativa.
 * Permite que o usuário cancele com "cancelar" ou reinicie o fluxo.
 *
 * @returns true  se foi tratado pelo fluxo (não chamar a IA)
 * @returns false se deve ser passado à IA
 */
export async function handleSchedulingFreeText(params: {
  clinicId: number;
  phone: string;
  instance: string;
  message: string;
  clinicName: string;
  patientName?: string;
}): Promise<boolean> {
  const { clinicId, phone, instance, message, clinicName, patientName } = params;
  const session = getSession(clinicId, phone);
  if (!session) return false;

  const lower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Cancelamento explícito
  if (lower.includes("cancelar") || lower.includes("sair") || lower.includes("nao quero")) {
    // Se estiver numa sessão de remarcação/lista, a palavra "cancelar" pode ser sobre o agendamento
    // Só encerra o fluxo se for "sair" ou "nao quero"
    const isExitIntent = lower.includes("sair") || lower.includes("nao quero");
    const isCancelSession = lower.includes("cancelar") && (lower.includes("fluxo") || lower.includes("atendimento") || lower.includes("isso"));
    if (isExitIntent || isCancelSession) {
      clearSchedulingSession(clinicId, phone);
      await _sfTyping(instance, phone);
      await _sfText(instance, phone, "Tudo bem! Cancelei o atendimento 😊 Como posso ajudar?");
      return true;
    }
    // "cancelar" sem contexto de saída → pode ser intenção de cancelar consulta
    if (isManagementIntent(message)) {
      clearSchedulingSession(clinicId, phone);
      await _sfTyping(instance, phone);
      await showAppointmentList(clinicId, phone, instance);
      return true;
    }
    // Cancelar durante o fluxo de agendamento ativo → encerra o fluxo
    clearSchedulingSession(clinicId, phone);
    await _sfTyping(instance, phone);
    await _sfText(instance, phone, "Tudo bem! Cancelei o agendamento 😊 Como posso ajudar?");
    return true;
  }

  // Nova intenção de agendamento → reinicia o fluxo
  if (isSchedulingIntent(message)) {
    clearSchedulingSession(clinicId, phone);
    await startSchedulingFlow({ clinicId, phone, instance, clinicName, patientName });
    return true;
  }

  // Qualquer outro texto durante o fluxo → reapresenta o estado atual
  await _sfTyping(instance, phone);

  switch (session.state) {
    case "svc_select": {
      // Tenta casar o texto com nome de serviço (acontece quando a IA exibe opções com IDs
      // não-SVC| e o paciente clica, enviando o label de texto em vez do ID estruturado)
      const lowerNorm = lower.replace(/[^a-z0-9 ]/g, " ");
      const allServices = await db
        .select({ id: servicesTable.id, name: servicesTable.name })
        .from(servicesTable)
        .where(and(eq(servicesTable.clinicId, clinicId), eq(servicesTable.active, true)));

      const matchedService = allServices.find((s) => {
        const svcNorm = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
        return lowerNorm.includes(svcNorm);
      });

      if (matchedService) {
        logger.info({ clinicId, phone, matchedService }, "[SchedulingFlow] Serviço detectado por nome de texto — avançando sessão");
        setSession(clinicId, phone, { ...session, state: "prof_select", serviceId: matchedService.id, serviceName: matchedService.name });
        await showProfessionalSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
        break;
      }

      await showServiceSelection(clinicId, phone, instance, clinicName, patientName);
      break;
    }
    case "prof_select": {
      // Tenta casar o texto com nome de profissional
      const lowerNorm = lower.replace(/[^a-z0-9 ]/g, " ");

      if (lowerNorm.includes("sem preferencia") || lowerNorm.includes("qualquer") || lowerNorm.includes("tanto faz")) {
        setSession(clinicId, phone, { ...session, state: "date_select", professionalId: null, professionalName: "Qualquer profissional" });
        await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
        break;
      }

      const linkedProfs = await db
        .select({ id: professionalsTable.id, name: professionalsTable.name })
        .from(professionalsTable)
        .innerJoin(professionalServicesTable, eq(professionalServicesTable.professionalId, professionalsTable.id))
        .where(
          and(
            eq(professionalServicesTable.serviceId, session.serviceId!),
            eq(professionalsTable.clinicId, clinicId),
            eq(professionalsTable.active, true),
          ),
        );

      const matchedProf = linkedProfs.find((p) => {
        const profNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();
        return lowerNorm.includes(profNorm);
      });

      if (matchedProf) {
        logger.info({ clinicId, phone, matchedProf }, "[SchedulingFlow] Profissional detectado por nome de texto — avançando sessão");
        setSession(clinicId, phone, { ...session, state: "date_select", professionalId: matchedProf.id, professionalName: matchedProf.name });
        await showDateSelection(clinicId, phone, instance, getSession(clinicId, phone)!);
        break;
      }

      await showProfessionalSelection(clinicId, phone, instance, session);
      break;
    }
    case "date_select": {
      // Tenta detectar referência a dia da semana (ex: "tem pra sexta?", "e quinta?")
      const dowMap: Record<string, number> = {
        domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
      };
      const mentionedEntry = Object.entries(dowMap).find(([name]) => lower.includes(name));
      if (mentionedEntry) {
        const [, targetDow] = mentionedEntry;
        const availableDates = await getAvailableDates(clinicId, session.serviceId, session.professionalId);
        const matchingDate = availableDates.find(d => new Date(d + "T12:00:00Z").getUTCDay() === targetDow);
        if (matchingDate) {
          setSession(clinicId, phone, { ...session, state: "slot_select", selectedDate: matchingDate });
          await showSlotSelection(clinicId, phone, instance, getSession(clinicId, phone)!, matchingDate);
        } else {
          const dowNames: Record<number, string> = {
            0: "domingo", 1: "segunda-feira", 2: "terça-feira", 3: "quarta-feira",
            4: "quinta-feira", 5: "sexta-feira", 6: "sábado",
          };
          await _sfText(instance, phone, `Não há horários disponíveis na ${dowNames[targetDow]} nas próximas semanas. Escolha uma das datas listadas 👇`);
          await showDateSelection(clinicId, phone, instance, session);
        }
        break;
      }

      // Tenta detectar referência a dia numérico (ex: "dia 23", "23/04", "pra 23")
      const numDateMatch = lower.match(/(?:dia\s+|para\s+|pra\s+)?(\d{1,2})(?:\/(\d{1,2}))?/);
      if (numDateMatch) {
        const dayNum = parseInt(numDateMatch[1], 10);
        const monthNum = numDateMatch[2] ? parseInt(numDateMatch[2], 10) : null;
        const availableDates = await getAvailableDates(clinicId, session.serviceId, session.professionalId);
        const matchingDate = availableDates.find(d => {
          const [, mo, dy] = d.split("-").map(Number);
          return dy === dayNum && (monthNum === null || mo === monthNum);
        });
        if (matchingDate) {
          setSession(clinicId, phone, { ...session, state: "slot_select", selectedDate: matchingDate });
          await showSlotSelection(clinicId, phone, instance, getSession(clinicId, phone)!, matchingDate);
        } else {
          const label = monthNum ? `${String(dayNum).padStart(2,"0")}/${String(monthNum).padStart(2,"0")}` : `dia ${dayNum}`;
          await _sfText(instance, phone, `Não há horários disponíveis para o ${label}. Escolha uma das datas listadas 👇`);
          await showDateSelection(clinicId, phone, instance, session);
        }
        break;
      }

      await showDateSelection(clinicId, phone, instance, session);
      break;
    }
    case "slot_select":
      if (session.selectedDate) {
        await showSlotSelection(clinicId, phone, instance, session, session.selectedDate);
      }
      break;
    case "confirming":
      await showConfirmation(phone, instance, session);
      break;
  }

  return true;
}
