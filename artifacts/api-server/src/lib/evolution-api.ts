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
  const ms = 5_000 + Math.random() * 10_000; // 5–15 segundos
  logger.info({ delayMs: Math.round(ms) }, "[Evolution] Aplicando delay humano antes do envio");
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Garante formato JID correto para WhatsApp (@s.whatsapp.net) */
function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.includes("@") ? digits : `${digits}@s.whatsapp.net`;
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
          options: { presence: "composing", delay: 4_000 },
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    // não crítico — apenas feedback visual ao usuário
  }
}
