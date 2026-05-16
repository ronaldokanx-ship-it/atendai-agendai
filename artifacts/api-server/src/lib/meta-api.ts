/**
 * meta-api.ts
 *
 * Cliente para a WhatsApp Business Cloud API (Meta).
 * Espelha a interface de evolution-api.ts para uso intercambiável no pipeline.
 *
 * Referência: https://graph.facebook.com/v17.0/{phone_number_id}/messages
 */

import { logger } from "./logger";

const META_API_VERSION = "v17.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MetaClinicConfig {
  phoneNumberId: string;
  accessToken: string;
}

export interface MetaTextPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { body: string; preview_url?: boolean };
}

export interface MetaInteractiveListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface MetaInteractiveListPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "list";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      button: string;
      sections: MetaInteractiveListSection[];
    };
  };
}

export interface MetaInteractiveButtonPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons: { type: "reply"; reply: { id: string; title: string } }[];
    };
  };
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Verifica se uma clínica tem a Meta API configurada. */
export function isMetaConfigured(config: Partial<MetaClinicConfig>): config is MetaClinicConfig {
  return !!config.phoneNumberId && !!config.accessToken;
}

/** Formata o número para o padrão E.164 sem '+'. Ex: 55849999...
 * Normaliza celulares brasileiros de 12 dígitos (55 + DDD + 8 dígitos)
 * para 13 dígitos inserindo o 9 após o DDD (padrão desde 2012). */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Brasil (55) + DDD (2) + número antigo 8 dígitos = 12 → insere 9 após DDD
  if (digits.startsWith("55") && digits.length === 12) {
    return digits.slice(0, 4) + "9" + digits.slice(4);
  }
  return digits;
}

/** Faz POST na API da Meta e trata erros HTTP. Retorna o messageId gerado pela Meta. */
async function metaPost(
  config: MetaClinicConfig,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const url = `${META_BASE_URL}/${config.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text().catch(() => "");
  if (!res.ok) {
    logger.error(
      { status: res.status, body: responseText, phoneNumberId: config.phoneNumberId },
      "[MetaAPI] Erro ao enviar mensagem",
    );
    throw new Error(`Meta API ${res.status}: ${responseText}`);
  }

  // Extrai messageId da resposta { messages: [{ id: "wamid...." }] }
  try {
    const json = JSON.parse(responseText) as { messages?: { id: string }[] };
    return json.messages?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Funções de envio ─────────────────────────────────────────────────────────

/** Envia mensagem de texto simples via Meta Cloud API. Sem delay artificial — API oficial não tem risco de ban. */
export async function sendMetaTextMessage(
  config: MetaClinicConfig,
  phone: string,
  text: string,
): Promise<void> {
  const payload: MetaTextPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(phone),
    type: "text",
    text: { body: text },
  };

  const messageId = await metaPost(config, payload);
  logger.info({ phone, textLength: text.length, messageId }, "[MetaAPI] Texto enviado");
}

/** Envia lista interativa (menus de seleção). Máx 10 itens por seção, 10 seções. */
export async function sendMetaListMessage(
  config: MetaClinicConfig,
  phone: string,
  list: {
    title?: string;
    body: string;
    buttonText: string;
    footer?: string;
    sections: MetaInteractiveListSection[];
  },
): Promise<void> {
  const payload: MetaInteractiveListPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(phone),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: list.body },
      action: {
        button: list.buttonText.slice(0, 20), // máx 20 chars
        sections: list.sections.map((s) => ({
          title: s.title.slice(0, 24), // máx 24 chars
          rows: s.rows.map((r) => ({
            id: r.id.slice(0, 200),      // máx 200 chars
            title: r.title.slice(0, 24), // máx 24 chars
            description: r.description?.slice(0, 72), // máx 72 chars
          })),
        })),
      },
    },
  };

  if (list.title) {
    payload.interactive.header = { type: "text", text: list.title.slice(0, 60) };
  }
  if (list.footer) {
    payload.interactive.footer = { text: list.footer.slice(0, 60) };
  }

  await metaPost(config, payload);
  logger.info({ phone, sections: list.sections.length }, "[MetaAPI] Lista enviada");
}

/** Envia botões interativos (máx 3 botões). */
export async function sendMetaButtonMessage(
  config: MetaClinicConfig,
  phone: string,
  message: {
    header?: string;
    body: string;
    footer?: string;
    buttons: { id: string; title: string }[];
  },
): Promise<void> {
  // Meta aceita no máximo 3 botões
  const buttons = message.buttons.slice(0, 3);

  const payload: MetaInteractiveButtonPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(phone),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: message.body },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: {
            id: b.id.slice(0, 256),     // máx 256 chars
            title: b.title.slice(0, 20), // máx 20 chars
          },
        })),
      },
    },
  };

  if (message.header) {
    payload.interactive.header = { type: "text", text: message.header.slice(0, 60) };
  }
  if (message.footer) {
    payload.interactive.footer = { text: message.footer.slice(0, 60) };
  }

  await metaPost(config, payload);
  logger.info({ phone, buttons: buttons.length }, "[MetaAPI] Botões enviados");
}

/**
 * Simula "digitando..." — Meta não suporta nativo como Evolution.
 * Função vazia mantida para compatibilidade de interface.
 */
export async function sendMetaTypingPresence(
  _config: MetaClinicConfig,
  _phone: string,
): Promise<void> {
  // Intencional: Meta Cloud API não tem endpoint de typing indicator público.
}
