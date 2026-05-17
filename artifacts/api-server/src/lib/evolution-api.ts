/**
 * Evolution API client — integração WhatsApp via Baileys (código aberto).
 *
 * ─── DELAY HUMANO ────────────────────────────────────────────────────────────
 * Nunca envie mensagens instantâneas idênticas para muitos números.
 * Este módulo aplica um delay aleatório de 5 a 15 segundos entre cada
 * disparo para simular comportamento humano e evitar banimento de conta.
 *
 * ─── WEBHOOK DE RETORNO ──────────────────────────────────────────────────────
 * O status de cada mensagem enviada (PENDING → SERVER_ACK → DELIVERY_ACK → READ)
 * é recebido pelo endpoint POST /api/whatsapp/evolution e gravado em
 * ai_logs.delivery_status, permitindo feedback em tempo real no painel SaaS.
 *
 * Configuração necessária no .env:
 *   EVOLUTION_API_URL=http://localhost:8080
 *   EVOLUTION_API_KEY=evo-key-change-me-in-production
 */

import { logger } from "./logger";

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";
// URL base pública do servidor de API, acessível pelo container Docker
const EVOLUTION_WEBHOOK_BASE = (process.env.EVOLUTION_WEBHOOK_URL ?? "http://host.docker.internal:3000").replace(/\/$/, "");

/** Labels legíveis para cada status de entrega da Evolution API */
export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  ERROR: "Falha no envio",
  PENDING: "Pendente",
  SERVER_ACK: "Enviado ao servidor",
  DELIVERY_ACK: "Entregue",
  READ: "Lido",
  PLAYED: "Áudio reproduzido",
};

/** Verifica se a integração com Evolution API está configurada no ambiente */
export function isEvolutionConfigured(): boolean {
  return Boolean(EVOLUTION_API_URL && EVOLUTION_API_KEY);
}

/**
 * Delay humano: aguarda entre 5 e 15 segundos antes de enviar.
 *
 * Regra de ouro anti-banimento:
 * - Nunca dispare para muitos números ao mesmo tempo
 * - Varie sempre o intervalo (aqui: aleatório dentro da janela)
 * - Simule "status de digitando" antes do texto chegar (ver sendTyping)
 */
async function humanDelay(): Promise<void> {
  const ms = 2_000 + Math.random() * 3_000; // 2–5 segundos
  logger.info({ delayMs: Math.round(ms) }, "[Evolution] Aplicando delay humano antes do envio");
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Normaliza um número de telefone ou JID para o formato canônico do WhatsApp.
 *
 * Aceita:
 * - Dígitos puros (ex: "5511999999999") → "5511999999999@s.whatsapp.net"
 * - JID com device ID (ex: "5511999999999:5@s.whatsapp.net") → "5511999999999@s.whatsapp.net"
 * - JID @lid (ex: "117871283851460@lid") → "117871283851460@lid" (preservado)
 * - JID @c.us (ex: "5511999999999@c.us") → "5511999999999@c.us"
 */
function toJid(jidOrPhone: string): string {
  // Se contém @, é um JID — normaliza removendo device ID mas preservando o sufixo (@s.whatsapp.net, @lid, etc.)
  if (jidOrPhone.includes("@")) {
    const atIdx = jidOrPhone.indexOf("@");
    const user = jidOrPhone.slice(0, atIdx).split(":")[0]; // remove :deviceId se presente
    const suffix = jidOrPhone.slice(atIdx); // mantém @s.whatsapp.net, @lid, @c.us, etc.
    return `${user}${suffix}`;
  }
  // Número puro (somente dígitos)
  const digits = jidOrPhone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

/**
 * Envia mensagem de texto via Evolution API com delay humano.
 *
 * @param instanceName  Nome da instância configurada no Evolution API
 * @param to            Número do destinatário (só dígitos, ex: "5511999999999")
 * @param text          Texto da mensagem
 * @returns             ID da mensagem gerado pelo WhatsApp (para rastreio)
 */
export async function sendTextMessage(
  instanceName: string,
  to: string,
  text: string,
): Promise<string | null> {
  await humanDelay();

  const jid = toJid(to);

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: jid,
          text,
          delay: 0, // delay já aplicado acima
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { status: res.status, body, instance: instanceName, jid },
        "[Evolution] Falha ao enviar mensagem",
      );

      // exists:false (400): número não encontrado via onWhatsApp.
      // Causas: privacy mode, rate limiting do WhatsApp, ou JID @lid.
      // O patch aplicado na Evolution API (bypass de contatos conhecidos) deve resolver isso
      // automaticamente — se ainda ocorrer, verifique o patch em whatsapp.baileys.service.js.
      if (res.status === 400 && body.includes("exists")) {
        logger.warn(
          { jid, instance: instanceName },
          "[Evolution] exists:false — certifique-se de que o patch de bypass está aplicado na Evolution API",
        );
      }

      return null;
    }

    const json = (await res.json()) as { key?: { id?: string } };
    const messageId = json?.key?.id ?? null;
    logger.info({ messageId, jid, instance: instanceName }, "[Evolution] Mensagem enviada com sucesso");
    return messageId;
  } catch (err) {
    logger.error({ err, instance: instanceName, jid }, "[Evolution] Erro ao enviar mensagem");
    return null;
  }
}

/** Estado de conexão de uma instância Evolution API */
export type InstanceConnectionState = "open" | "close" | "connecting";

/**
 * Configura o webhook de uma instância na Evolution API.
 * Falha silenciosa — loga erro mas não interrompe o fluxo.
 */
async function ensureWebhookConfigured(instanceName: string): Promise<void> {
  try {
    // Verifica se já está configurado
    const checkRes = await fetch(
      `${EVOLUTION_API_URL}/webhook/find/${encodeURIComponent(instanceName)}`,
      { headers: { apikey: EVOLUTION_API_KEY }, signal: AbortSignal.timeout(8_000) },
    );
    if (checkRes.ok) {
      const existing = await checkRes.text();
      if (existing && existing !== '"null"' && existing !== "null") return; // já configurado
    }

    // Configura o webhook
    const webhookUrl = `${EVOLUTION_WEBHOOK_BASE}/api/whatsapp/evolution`;
    await fetch(`${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    logger.info({ instance: instanceName, webhookUrl }, "[Evolution] Webhook configurado automaticamente");
  } catch (err) {
    logger.warn({ err, instance: instanceName }, "[Evolution] Falha ao configurar webhook — verifique manualmente");
  }
}

/**
 * Cria uma instância na Evolution API (WHATSAPP-BAILEYS) se ela ainda não existir.
 * Retorna true em caso de sucesso ou instância já existente.
 */
async function ensureInstanceExists(instanceName: string): Promise<boolean> {
  // verifica se já existe
  try {
    const checkRes = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      { headers: { apikey: EVOLUTION_API_KEY }, signal: AbortSignal.timeout(8_000) },
    );
    if (checkRes.ok) {
      // Instância existe — garante webhook configurado
      void ensureWebhookConfigured(instanceName);
      return true;
    }
  } catch {
    return false;
  }

  // cria a instância
  try {
    const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    logger.info(
      { instance: instanceName, status: createRes.status },
      "[Evolution] Instância criada automaticamente",
    );
    if (createRes.ok) {
      // Aguarda um instante para a instância ficar pronta antes de configurar o webhook
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      void ensureWebhookConfigured(instanceName);
    }
    return createRes.ok;
  } catch (err) {
    logger.error({ err, instance: instanceName }, "[Evolution] Falha ao criar instância");
    return false;
  }
}

/**
 * Retorna o estado atual de conexão de uma instância.
 * Retorna "close" silenciosamente em caso de erro (instância inexistente, API offline, etc.).
 */
export async function getInstanceState(instanceName: string): Promise<InstanceConnectionState> {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${encodeURIComponent(instanceName)}`,
      {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return "close";
    const json = (await res.json()) as { instance?: { state?: string } };
    const state = json?.instance?.state;
    if (state === "open" || state === "connecting") return state;
    return "close";
  } catch {
    return "close";
  }
}

/**
 * Tenta obter QR code chamando /instance/connect.
 * Retorna o base64 do QR ou null se a instância não estiver acessível em memória
 * ou a sessão estiver corrompida (Evolution retorna 200 com { error: true }).
 */
async function doConnect(instanceName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(instanceName)}`,
      {
        headers: { apikey: EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { base64?: string; error?: boolean };
    // A Evolution API retorna 200 com { error: true } quando a sessão está corrompida
    if (json?.error) return null;
    return json?.base64 ?? null;
  } catch {
    return null;
  }
}

/**
 * Deleta completamente uma instância da Evolution API (memória + banco).
 * Usado como recuperação quando a sessão está corrompida (ex: device_removed 401).
 */
async function deleteInstance(instanceName: string): Promise<void> {
  try {
    await fetch(
      `${EVOLUTION_API_URL}/instance/delete/${encodeURIComponent(instanceName)}`,
      {
        method: "DELETE",
        headers: { apikey: EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
    logger.info({ instance: instanceName }, "[Evolution] Instância deletada para recriação");
  } catch (err) {
    logger.warn({ err, instance: instanceName }, "[Evolution] Falha ao deletar instância");
  }
}

/**
 * Obtém o QR code atual da instância para pareamento do WhatsApp.
 *
 * Fluxo de recuperação automática:
 * 1. Garante que a instância existe (cria se necessário)
 * 2. Tenta obter o QR via /instance/connect
 * 3. Se falhar (sessão corrompida por device_removed ou instância fora de memória):
 *    - Deleta a instância completamente
 *    - Recria do zero (nova sessão limpa)
 *    - Tenta novamente
 *
 * Retorna a string base64 (data:image/png;base64,...) ou null se não disponível.
 */
export async function getInstanceQrCode(instanceName: string): Promise<string | null> {
  const exists = await ensureInstanceExists(instanceName);
  if (!exists) return null;

  const qr = await doConnect(instanceName);
  if (qr) return qr;

  // Connect falhou: sessão corrompida (ex: desconexão por device_removed/401)
  // ou instância fora da memória do Baileys.
  // Estratégia: deletar completamente e recriar para forçar sessão limpa.
  logger.warn(
    { instance: instanceName },
    "[Evolution] Connect falhou — recriando instância para nova sessão QR",
  );
  await deleteInstance(instanceName);
  await new Promise<void>((resolve) => setTimeout(resolve, 2_000));

  const recreated = await ensureInstanceExists(instanceName);
  if (!recreated) return null;

  await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  return doConnect(instanceName);
}

/**
 * Desconecta (logout) a instância da Evolution API.
 * Falha silenciosa — não crítico.
 */
export async function logoutInstance(instanceName: string): Promise<void> {
  try {
    await fetch(
      `${EVOLUTION_API_URL}/instance/logout/${encodeURIComponent(instanceName)}`,
      {
        method: "DELETE",
        headers: { apikey: EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    // silencioso
  }
}

/**
 * Envia mensagem de lista interativa (menu scrollável) pelo WhatsApp.
 * Limite do WhatsApp: máx. 10 seções, máx. 10 linhas por seção e máx. 10 linhas no total.
 * Usa delay humano interno — mesmo comportamento anti-banimento do sendTextMessage.
 */
export async function sendListMessage(
  instanceName: string,
  to: string,
  opts: {
    title: string;
    description: string;
    footerText?: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{ rowId: string; title: string; description?: string }>;
    }>;
  },
): Promise<string | null> {
  await humanDelay();
  const jid = toJid(to);

  // Enforce Meta limits
  const MAX_TOTAL_ROWS = 10;
  const MAX_SECTIONS = 10;
  let totalRows = 0;
  const safeSections = opts.sections.slice(0, MAX_SECTIONS).map(s => ({
    title: s.title.slice(0, 24),
    rows: s.rows
      .filter(() => totalRows < MAX_TOTAL_ROWS)
      .map(r => {
        totalRows++;
        return {
          rowId: r.rowId,
          title: r.title.slice(0, 24),
          description: r.description?.slice(0, 72),
        };
      }),
  })).filter(s => s.rows.length > 0);

  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendList/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          number: jid,
          title: opts.title.slice(0, 60),
          description: opts.description.slice(0, 1024),
          footerText: (opts.footerText ?? "").slice(0, 60),
          buttonText: opts.buttonText.slice(0, 20),
          sections: safeSections,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body, instance: instanceName }, "[Evolution] Falha ao enviar lista interativa");
      return null;
    }
    const json = (await res.json()) as { key?: { id?: string } };
    const messageId = json?.key?.id ?? null;
    logger.info({ messageId, jid, instance: instanceName }, "[Evolution] Lista interativa enviada");
    return messageId;
  } catch (err) {
    logger.error({ err, instance: instanceName }, "[Evolution] Erro ao enviar lista interativa");
    return null;
  }
}

/**
 * Envia mensagem com botões interativos (máx. 3 botões) pelo WhatsApp.
 * Usa delay humano interno.
 */
export async function sendButtonMessage(
  instanceName: string,
  to: string,
  opts: {
    title?: string;
    description: string;
    footerText?: string;
    buttons: Array<{ buttonId: string; displayText: string }>;
  },
): Promise<string | null> {
  await humanDelay();
  const jid = toJid(to);
  // Enforce Meta limit: máx 3 botões
  const safeButtons = opts.buttons.slice(0, 3);
  try {
    const res = await fetch(
      `${EVOLUTION_API_URL}/message/sendButtons/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({
          number: jid,
          title: (opts.title ?? "").slice(0, 60),
          description: opts.description.slice(0, 1024),
          footerText: (opts.footerText ?? "").slice(0, 60),
          buttons: safeButtons.map((b) => ({
            buttonId: b.buttonId,
            buttonText: { displayText: b.displayText.slice(0, 20) },
            type: 1,
          })),
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body, instance: instanceName }, "[Evolution] Falha ao enviar botões interativos");
      return null;
    }
    const json = (await res.json()) as { key?: { id?: string } };
    const messageId = json?.key?.id ?? null;
    logger.info({ messageId, jid, instance: instanceName }, "[Evolution] Botões interativos enviados");
    return messageId;
  } catch (err) {
    logger.error({ err, instance: instanceName }, "[Evolution] Erro ao enviar botões interativos");
    return null;
  }
}

/**
 * Envia sinal de "digitando..." antes da resposta real.
 * Melhora a experiência do usuário e torna o comportamento mais humano.
 * Falha silenciosa — não crítico para o fluxo principal.
 */
export async function sendTypingPresence(instanceName: string, to: string): Promise<void> {
  const jid = toJid(to);
  try {
    await fetch(
      `${EVOLUTION_API_URL}/chat/sendPresence/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: jid,
          presence: "composing",
          delay: 4_000,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    // não crítico — apenas feedback visual ao usuário
  }
}

/**
 * Tenta resolver um JID @lid para o número de telefone real via Evolution API.
 *
 * Estratégia em duas etapas:
 * 1. POST /chat/whatsappNumbers → chama onWhatsApp() nos servidores do WhatsApp;
 *    em alguns cenários os servidores retornam o JID real (@s.whatsapp.net).
 * 2. POST /contact/findContacts → busca no cache de contatos da instância;
 *    se o contato foi sincronizado (agenda, histórico), o JID real pode estar lá.
 *
 * Retorna apenas dígitos do telefone (ex: "5584912345678") ou null se não resolveu.
 * Falha silenciosa — não interrompe o fluxo principal.
 */
export async function resolveLidPhone(
  instanceName: string,
  lidJid: string,
): Promise<string | null> {
  if (!lidJid.endsWith("@lid")) return null;

  try {
    // ── Estratégia 1: onWhatsApp() via /chat/whatsappNumbers ─────────────────
    // Os servidores do WhatsApp podem retornar o JID real para um @lid passado como input.
    const waRes = await fetch(
      `${EVOLUTION_API_URL}/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ numbers: [lidJid] }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (waRes.ok) {
      const waData = await waRes.json() as Array<{ exists?: boolean; jid?: string; number?: string }>;
      const entry = Array.isArray(waData) ? waData[0] : null;
      const realJid = entry?.jid ?? null;
      // Considera resolvido apenas se retornar um @s.whatsapp.net diferente do @lid original
      if (realJid && realJid.endsWith("@s.whatsapp.net")) {
        const phone = realJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
        if (phone) {
          logger.info({ lidJid, realJid, phone, instance: instanceName }, "[Evolution] @lid resolvido via whatsappNumbers");
          return phone;
        }
      }
    }
  } catch {
    // Tenta próxima estratégia
  }

  try {
    // ── Estratégia 2: cache de contatos da instância ──────────────────────────
    // Contatos previamente sincronizados podem ter o JID real mapeado para o @lid.
    const cRes = await fetch(
      `${EVOLUTION_API_URL}/contact/findContacts/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ where: { id: lidJid } }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (cRes.ok) {
      const contacts = await cRes.json() as Array<{ id?: string; lid?: string; phone?: string }>;
      // Procura contato mapeado com JID real
      const matched = Array.isArray(contacts)
        ? contacts.find(c => c.id && c.id.endsWith("@s.whatsapp.net"))
        : null;
      if (matched?.id) {
        const phone = matched.id.replace("@s.whatsapp.net", "").replace(/\D/g, "");
        if (phone) {
          logger.info({ lidJid, realJid: matched.id, phone, instance: instanceName }, "[Evolution] @lid resolvido via findContacts");
          return phone;
        }
      }
    }
  } catch {
    // Falha silenciosa — @lid permanece como identificador
  }

  logger.debug({ lidJid, instance: instanceName }, "[Evolution] @lid não resolvido — mantendo como identificador");
  return null;
}

