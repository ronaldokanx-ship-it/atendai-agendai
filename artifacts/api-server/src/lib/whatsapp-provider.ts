/**
 * whatsapp-provider.ts
 *
 * Camada de abstração unificada para provedores de WhatsApp.
 * Permite que o sistema opere com Evolution API (Baileys) ou
 * WhatsApp Business Cloud API (Meta) de forma transparente.
 *
 * ─── USO ─────────────────────────────────────────────────────────────────────
 * 1. Obtenha o contexto da clínica:
 *      const channel = clinicToChannel(clinic);
 * 2. Use as funções wa* para enviar mensagens:
 *      await waText(channel, phone, "Olá!");
 *      await waList(channel, phone, { ... });
 *
 * ─── PROVEDORES SUPORTADOS ────────────────────────────────────────────────────
 * - "evolution" (padrão): Evolution API (auto-hospedada, via Baileys)
 * - "meta": WhatsApp Business Cloud API (Meta/Facebook, oficial)
 */

import {
  sendTextMessage,
  sendListMessage,
  sendButtonMessage,
  sendTypingPresence,
} from "./evolution-api";
import {
  sendMetaTextMessage,
  sendMetaListMessage,
  sendMetaButtonMessage,
  sendMetaTypingPresence,
  type MetaClinicConfig,
} from "./meta-api";
import { logger } from "./logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type WhatsAppProviderType = "evolution" | "meta";

/**
 * Contexto de canal WhatsApp da clínica.
 * Contém todas as credenciais necessárias para ambos os provedores,
 * mas apenas o provedor ativo (`provider`) será usado para envio.
 */
export interface WhatsAppChannelContext {
  provider: WhatsAppProviderType;
  // Evolution API
  evolutionInstance?: string;    // nome da instância no Evolution API
  // Meta Cloud API
  metaPhoneNumberId?: string;   // Phone Number ID do número de negócios
  metaAccessToken?: string;     // Token de acesso permanente (System User)
}

export interface WaListSection {
  title: string;
  rows: Array<{ rowId: string; title: string; description?: string }>;
}

export interface WaListOpts {
  title: string;
  description: string;
  buttonText: string;
  sections: WaListSection[];
}

export interface WaButtonOpts {
  description: string;
  buttons: Array<{ buttonId: string; displayText: string }>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Cria um WhatsAppChannelContext a partir do registro de uma clínica.
 * O campo `whatsappProvider` da clínica determina qual API será usada.
 * Fallback para "evolution" se o campo não estiver preenchido.
 */
export function clinicToChannel(clinic: {
  whatsappProvider?: string | null;
  evolutionInstanceName?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappAccessToken?: string | null;
}): WhatsAppChannelContext {
  const provider: WhatsAppProviderType =
    clinic.whatsappProvider === "meta" ? "meta" : "evolution";

  return {
    provider,
    evolutionInstance: clinic.evolutionInstanceName ?? undefined,
    metaPhoneNumberId: clinic.whatsappPhoneNumberId ?? undefined,
    metaAccessToken: clinic.whatsappAccessToken ?? undefined,
  };
}

// ─── Guard de configuração ────────────────────────────────────────────────────

function assertMetaConfig(channel: WhatsAppChannelContext): MetaClinicConfig | null {
  if (!channel.metaPhoneNumberId || !channel.metaAccessToken) {
    logger.warn("[WAProvider] Meta Cloud API não configurada — phoneNumberId e accessToken são obrigatórios");
    return null;
  }
  return { phoneNumberId: channel.metaPhoneNumberId, accessToken: channel.metaAccessToken };
}

function assertEvolutionConfig(channel: WhatsAppChannelContext): string | null {
  if (!channel.evolutionInstance) {
    logger.warn("[WAProvider] Evolution API não configurada — evolutionInstanceName é obrigatório");
    return null;
  }
  return channel.evolutionInstance;
}

// ─── Funções de envio unificadas ──────────────────────────────────────────────

/**
 * Envia mensagem de texto via o provedor configurado na clínica.
 * Evolution: delay 5-15s (anti-banimento)
 * Meta: delay 2-5s (simula digitação)
 */
export async function waText(
  channel: WhatsAppChannelContext,
  phone: string,
  text: string,
): Promise<void> {
  if (channel.provider === "meta") {
    const cfg = assertMetaConfig(channel);
    if (!cfg) return;
    await sendMetaTextMessage(cfg, phone, text);
  } else {
    const instance = assertEvolutionConfig(channel);
    if (!instance) return;
    await sendTextMessage(instance, phone, text);
  }
}

/**
 * Envia lista interativa (menu de seleção).
 * Evolution: usa formato rowId/description
 * Meta: converte para formato id/body conforme especificação da API
 */
export async function waList(
  channel: WhatsAppChannelContext,
  phone: string,
  opts: WaListOpts,
): Promise<void> {
  if (channel.provider === "meta") {
    const cfg = assertMetaConfig(channel);
    if (!cfg) return;
    await sendMetaListMessage(cfg, phone, {
      title: opts.title,
      body: opts.description,
      buttonText: opts.buttonText,
      sections: opts.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({
          id: r.rowId,
          title: r.title,
          description: r.description,
        })),
      })),
    });
  } else {
    const instance = assertEvolutionConfig(channel);
    if (!instance) return;
    await sendListMessage(instance, phone, opts);
  }
}

/**
 * Envia botões interativos (confirmação sim/não, escolha rápida).
 * Evolution: até 3 botões com buttonId/displayText
 * Meta: até 3 botões com id/title; se >3, converte para lista interativa
 */
export async function waButtons(
  channel: WhatsAppChannelContext,
  phone: string,
  opts: WaButtonOpts,
): Promise<void> {
  if (channel.provider === "meta") {
    const cfg = assertMetaConfig(channel);
    if (!cfg) return;

    if (opts.buttons.length <= 3) {
      await sendMetaButtonMessage(cfg, phone, {
        body: opts.description,
        buttons: opts.buttons.map((b) => ({
          id: b.buttonId,
          title: b.displayText,
        })),
      });
    } else {
      // Meta não suporta mais de 3 botões → converte para lista
      await sendMetaListMessage(cfg, phone, {
        body: opts.description,
        buttonText: "Ver opções",
        sections: [
          {
            title: "Opções",
            rows: opts.buttons.map((b) => ({
              id: b.buttonId,
              title: b.displayText,
            })),
          },
        ],
      });
    }
  } else {
    const instance = assertEvolutionConfig(channel);
    if (!instance) return;
    await sendButtonMessage(instance, phone, opts);
  }
}

/**
 * Envia indicador de digitação ("digitando...").
 * Evolution: usa presença de digitação nativa do WhatsApp
 * Meta: sem suporte nativo — delay já está embutido em sendMetaTextMessage
 */
export async function waTyping(
  channel: WhatsAppChannelContext,
  phone: string,
): Promise<void> {
  if (channel.provider === "meta") {
    const cfg = assertMetaConfig(channel);
    if (!cfg) return;
    await sendMetaTypingPresence(cfg, phone);
  } else {
    const instance = assertEvolutionConfig(channel);
    if (!instance) return;
    await sendTypingPresence(instance, phone);
  }
}
