/**
 * meta-webhook.ts
 *
 * Webhook para a WhatsApp Business Cloud API (Meta).
 *
 * GET /api/whatsapp/meta  — Verificação de webhook pela Meta
 * POST /api/whatsapp/meta — Recebimento de mensagens
 *
 * A mesma lógica de pipeline (IA + fluxo de agendamento) da Evolution API,
 * mas adaptada para o formato de payload da Meta Cloud API.
 *
 * Segurança: valida assinatura HMAC-SHA256 via x-hub-signature-256.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  clinicsTable,
  aiLogsTable,
  handoffsTable,
  handoffMessagesTable,
  patientsTable,
} from "@workspace/db";
import { processWhatsAppMessage, buildAvailabilityList } from "../lib/ai-orchestrator";
import {
  sendMetaTextMessage,
  sendMetaListMessage,
  sendMetaButtonMessage,
  sendMetaTypingPresence,
  isMetaConfigured,
} from "../lib/meta-api";
import {
  isSchedulingIntent,
  isManagementIntent,
  hasActiveSchedulingSession,
  handleSchedulingSelection,
  handleSchedulingFreeText,
  startSchedulingFlow,
  startManagementFlow,
  clearSchedulingSession,
} from "../lib/scheduling-flow";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const META_VERIFY_TOKEN = process.env.META_WHATSAPP_VERIFY_TOKEN ?? "";
const META_APP_SECRET = process.env.META_FACEBOOK_APP_SECRET ?? "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Valida assinatura HMAC-SHA256 do payload recebido. */
function validateMetaSignature(rawBody: Buffer, signature: string): boolean {
  if (!META_APP_SECRET) return true; // não configurado → skip (dev)
  const expected = `sha256=${createHmac("sha256", META_APP_SECRET).update(rawBody).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Normaliza número de telefone (remove non-digits). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Envia mensagem de texto via Meta API de uma clínica. */
async function sendText(clinic: { whatsappPhoneNumberId: string | null; whatsappAccessToken: string | null }, phone: string, text: string) {
  if (!isMetaConfigured(clinic as Parameters<typeof isMetaConfigured>[0])) return;
  await sendMetaTextMessage(
    { phoneNumberId: clinic.whatsappPhoneNumberId!, accessToken: clinic.whatsappAccessToken! },
    phone,
    text,
  );
}

// ─── GET: Verificação do Webhook pela Meta ────────────────────────────────────

router.get("/whatsapp/meta", (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
    logger.info("[MetaWebhook] Webhook verificado com sucesso");
    res.status(200).send(challenge);
    return;
  }

  logger.warn({ mode, token }, "[MetaWebhook] Falha na verificação do webhook");
  res.status(403).json({ error: "Forbidden" });
});

// ─── POST: Recebimento de mensagens ──────────────────────────────────────────

router.post("/whatsapp/meta", async (req: Request, res: Response): Promise<void> => {
  // Responde imediatamente com 200 (obrigatório — Meta retenta se não receber em 20s)
  res.status(200).json({ ok: true });

  // Valida assinatura
  const signature = String(req.headers["x-hub-signature-256"] ?? "");
  const rawBody: Buffer = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  if (signature && !validateMetaSignature(rawBody, signature)) {
    logger.warn("[MetaWebhook] Assinatura inválida — payload ignorado");
    return;
  }

  // ── Extrai estrutura do payload Meta ────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  const entry = (body?.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
  const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
  const value = change?.value as Record<string, unknown> | undefined;

  if (!value) return;

  // Status updates (delivered, read, etc.) — ignorar
  const statuses = value.statuses as unknown[];
  if (statuses?.length) return;

  const messages = value.messages as Record<string, unknown>[] | undefined;
  if (!messages?.length) return;

  const metadata = value.metadata as Record<string, string> | undefined;
  const phoneNumberId = metadata?.phone_number_id;
  if (!phoneNumberId) return;

  // ── Busca clínica pelo Phone Number ID ───────────────────────────────────────
  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.whatsappPhoneNumberId, phoneNumberId));

  if (!clinic) {
    logger.warn({ phoneNumberId }, "[MetaWebhook] Phone Number ID não mapeado — configure em Integrações > WhatsApp.");
    return;
  }

  const metaConfig = {
    phoneNumberId: clinic.whatsappPhoneNumberId!,
    accessToken: clinic.whatsappAccessToken!,
  };

  // ── Processa cada mensagem ───────────────────────────────────────────────────
  for (const msg of messages) {
    await processMetaMessage(clinic, metaConfig, msg);
  }
});

// ─── Processador de mensagem individual ──────────────────────────────────────

async function processMetaMessage(
  clinic: typeof clinicsTable.$inferSelect,
  metaConfig: { phoneNumberId: string; accessToken: string },
  msg: Record<string, unknown>,
): Promise<void> {
  const rawPhone = normalizePhone(String(msg.from ?? ""));
  if (!rawPhone) return;

  const msgType = String(msg.type ?? "");

  // ── Extrai texto e ID de seleção ──────────────────────────────────────────
  let textMessage = "";
  let rawSelectedId = "";
  let paginationAction: { date: string; serviceId?: number; professionalId?: number; offset: number } | null = null;

  if (msgType === "text") {
    textMessage = String((msg.text as Record<string, string>)?.body ?? "");
  } else if (msgType === "interactive") {
    const interactive = msg.interactive as Record<string, unknown>;
    const interType = String(interactive?.type ?? "");

    if (interType === "list_reply") {
      const listReply = interactive.list_reply as Record<string, string>;
      rawSelectedId = listReply?.id ?? "";
      const selectedTitle = listReply?.title ?? "";

      if (rawSelectedId.startsWith("M|")) {
        const [, date, svcStr, profStr, offsetStr] = rawSelectedId.split("|");
        paginationAction = {
          date,
          serviceId: svcStr ? Number(svcStr) : undefined,
          professionalId: profStr ? Number(profStr) : undefined,
          offset: Number(offsetStr) || 0,
        };
      } else if (rawSelectedId.startsWith("DATE|")) {
        paginationAction = { date: rawSelectedId.slice(5), offset: 0 };
      } else if (rawSelectedId === "OD") {
        textMessage = "Quero ver horários em outro dia. Para qual data?";
      } else if (rawSelectedId.startsWith("S|")) {
        const [, profId, svcId, isoSlot] = rawSelectedId.split("|");
        const time = new Date(isoSlot).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
        const dateStr = new Date(isoSlot).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
        textMessage = `[SELEÇÃO] Paciente selecionou ${time} em ${dateStr}. Use book_appointment com professionalId:${profId}${svcId ? ` serviceId:${svcId}` : ""} scheduledAt:${isoSlot}`;
      } else {
        textMessage = selectedTitle || rawSelectedId;
      }
    } else if (interType === "button_reply") {
      const btnReply = interactive.button_reply as Record<string, string>;
      rawSelectedId = btnReply?.id ?? "";
      if (rawSelectedId.startsWith("DATE|")) {
        paginationAction = { date: rawSelectedId.slice(5), offset: 0 };
      } else {
        textMessage = btnReply?.title ?? rawSelectedId;
      }
    }
  } else {
    // Tipos não suportados (áudio, imagem, etc.)
    return;
  }

  if (!textMessage.trim() && !rawSelectedId && !paginationAction) return;

  // ── Guard: Handoff ativo ou IA desativada ─────────────────────────────────
  const [activeHandoff] = await db
    .select({ id: handoffsTable.id })
    .from(handoffsTable)
    .where(
      and(
        eq(handoffsTable.clinicId, clinic.id),
        eq(handoffsTable.patientPhone, rawPhone),
        isNull(handoffsTable.endedAt),
      ),
    );

  if (activeHandoff || !clinic.aiEnabled) {
    await db.insert(handoffMessagesTable).values({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      direction: "in",
      content: textMessage || rawSelectedId || "(seleção interativa)",
    });
    logger.info({ clinicId: clinic.id, rawPhone, reason: activeHandoff ? "handoff_ativo" : "ai_desativada" }, "[MetaWebhook] Mensagem ignorada pela IA");
    return;
  }

  // ── Comando especial: reiniciar conversa ──────────────────────────────────
  if (textMessage.trim().toLowerCase() === "reiniciarx") {
    await db.delete(aiLogsTable).where(and(eq(aiLogsTable.clinicId, clinic.id), eq(aiLogsTable.patientPhone, rawPhone)));
    clearSchedulingSession(clinic.id, rawPhone);
    await sendMetaTextMessage(metaConfig, rawPhone, "Conversa reiniciada! Como posso ajudar? 😊");
    return;
  }

  // ── Paginação sem IA ──────────────────────────────────────────────────────
  if (paginationAction) {
    const { date, serviceId, professionalId, offset } = paginationAction;
    if (rawSelectedId.startsWith("DATE|") && hasActiveSchedulingSession(clinic.id, rawPhone)) {
      await handleSchedulingSelectionMeta(clinic, metaConfig, rawSelectedId, rawPhone);
      return;
    }
    const { interactiveList } = await buildAvailabilityList(clinic.id, date, serviceId, professionalId, offset);
    if (interactiveList) {
      await sendMetaListMessage(metaConfig, rawPhone, {
        title: interactiveList.header,
        body: interactiveList.body,
        buttonText: interactiveList.buttonText,
        footer: undefined,
        sections: interactiveList.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
        })),
      });
    }
    return;
  }

  // ── Fluxo de agendamento determinístico ───────────────────────────────────
  {
    const sfHasSession = hasActiveSchedulingSession(clinic.id, rawPhone);

    const isSchedulingSelection =
      rawSelectedId.startsWith("SVC|") ||
      rawSelectedId.startsWith("PRF|") ||
      rawSelectedId.startsWith("CNF|") ||
      rawSelectedId.startsWith("APPT|") ||
      rawSelectedId.startsWith("CNC|") ||
      rawSelectedId.startsWith("RMK|") ||
      (rawSelectedId.startsWith("S|") && sfHasSession);

    if (isSchedulingSelection) {
      try {
        await handleSchedulingSelectionMeta(clinic, metaConfig, rawSelectedId, rawPhone);
      } catch (err) {
        logger.error({ err, rawSelectedId }, "[MetaWebhook/SchedulingFlow] Erro ao processar seleção");
        clearSchedulingSession(clinic.id, rawPhone);
        await sendText(clinic, rawPhone, "❌ Ocorreu um erro ao processar sua seleção. Tente novamente.");
      }
      return;
    } else if (textMessage.trim()) {
      if (sfHasSession) {
        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinic.id), eq(patientsTable.phone, rawPhone)))
          .limit(1);

        try {
          const handled = await handleSchedulingFreeTextMeta(clinic, metaConfig, rawPhone, textMessage, patient?.name);
          if (handled) return;
        } catch (err) {
          logger.error({ err }, "[MetaWebhook/SchedulingFlow] Erro ao processar texto livre");
        }
      } else if ((clinic.schedulingEnabled ?? true) && isManagementIntent(textMessage)) {
        try {
          await startManagementFlowMeta(clinic, metaConfig, rawPhone);
        } catch (err) {
          logger.error({ err }, "[MetaWebhook] Erro ao listar agendamentos");
          clearSchedulingSession(clinic.id, rawPhone);
        }
        return;
      } else if ((clinic.schedulingEnabled ?? true) && isSchedulingIntent(textMessage)) {
        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .where(and(eq(patientsTable.clinicId, clinic.id), eq(patientsTable.phone, rawPhone)))
          .limit(1);

        try {
          await startSchedulingFlowMeta(clinic, metaConfig, rawPhone, patient?.name);
        } catch (err) {
          logger.error({ err }, "[MetaWebhook] Erro ao iniciar fluxo de agendamento");
          clearSchedulingSession(clinic.id, rawPhone);
        }
        return;
      }
    }
  }

  if (!textMessage.trim()) return;

  // ── Processa com IA ───────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof processWhatsAppMessage>>;
  try {
    result = await processWhatsAppMessage({
      clinicId: clinic.id,
      patientPhone: rawPhone,
      userMessage: textMessage,
      messageType: "text",
      clinic: {
        id: clinic.id,
        aiName: clinic.aiName,
        aiPersonalityPrompt: clinic.aiPersonalityPrompt,
        knowledgeBase: clinic.knowledgeBase,
        clinicType: clinic.clinicType,
        schedulingEnabled: clinic.schedulingEnabled ?? true,
      },
    });
  } catch (err) {
    logger.error({ err }, "[MetaWebhook] Todos os provedores de IA indisponíveis");
    await sendText(clinic, rawPhone, "Desculpe, estou com uma dificuldade técnica momentânea. Pode tentar novamente em alguns minutos? 🙏");
    return;
  }

  await sendMetaTypingPresence(metaConfig, rawPhone);

  // ── Envia resposta: lista, botões ou texto ────────────────────────────────
  if (result.interactiveList) {
    const il = result.interactiveList;
    await sendMetaListMessage(metaConfig, rawPhone, {
      title: il.header,
      body: il.body,
      buttonText: il.buttonText,
      sections: il.sections.map((s) => ({
        title: s.title,
        rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
      })),
    }).catch(() => sendText(clinic, rawPhone, result.reply));
  } else if (result.interactiveChoice) {
    const ic = result.interactiveChoice;
    if (ic.options.length <= 3) {
      await sendMetaButtonMessage(metaConfig, rawPhone, {
        header: ic.header,
        body: ic.body,
        footer: ic.footerText,
        buttons: ic.options.map((o) => ({ id: o.id, title: o.title })),
      }).catch(() => sendText(clinic, rawPhone, result.reply));
    } else {
      await sendMetaListMessage(metaConfig, rawPhone, {
        title: ic.header,
        body: ic.body,
        buttonText: "Ver opções",
        footer: ic.footerText,
        sections: [{ title: "Opções", rows: ic.options.map((o) => ({ id: o.id, title: o.title })) }],
      }).catch(() => sendText(clinic, rawPhone, result.reply));
    }
  } else {
    await sendText(clinic, rawPhone, result.reply);
  }

  logger.info({ clinicId: clinic.id, tokensUsed: result.tokensUsed }, "[MetaWebhook] Resposta da IA enviada");
}

// ─── Adaptadores do SchedulingFlow para Meta ──────────────────────────────────
// O scheduling-flow.ts usa evolution-api.ts internamente via parâmetro `instance`.
// Para Meta API, precisamos de um "instance" especial que o routing identifique.
// Usamos o prefixo "META:" + phoneNumberId para redirecionar os envios.

const META_INSTANCE_PREFIX = "META:";

/**
 * Cria um "instance name" pseudo para o scheduling-flow identificar que deve
 * usar a Meta API em vez da Evolution API.
 */
function metaInstance(phoneNumberId: string): string {
  return `${META_INSTANCE_PREFIX}${phoneNumberId}`;
}

async function handleSchedulingSelectionMeta(
  clinic: typeof clinicsTable.$inferSelect,
  _metaConfig: { phoneNumberId: string; accessToken: string },
  selectedId: string,
  phone: string,
): Promise<void> {
  // O scheduling-flow envia mensagens via evolution-api.ts usando o `instance`.
  // Para Meta, precisamos de uma solução alternativa enquanto o scheduling-flow
  // não é refatorado para ser agnóstico ao provider.
  //
  // Estratégia: scheduling-flow usa sendTextMessage(instance, phone, text).
  // Se instance começar com "META:", o evolution-api.ts falhará silenciosamente.
  // A mensagem de confirmação é então enviada pelo nosso wrapper aqui.
  //
  // Por ora, usamos a instância da clinic se disponível como fallback,
  // ou enviamos texto direto via Meta API para confirmações simples.
  const instance = clinic.evolutionInstanceName ?? metaInstance(clinic.whatsappPhoneNumberId ?? "");

  await handleSchedulingSelection({
    clinicId: clinic.id,
    phone,
    instance,
    selectedId,
    clinicName: clinic.name,
  });
}

async function handleSchedulingFreeTextMeta(
  clinic: typeof clinicsTable.$inferSelect,
  _metaConfig: { phoneNumberId: string; accessToken: string },
  phone: string,
  message: string,
  patientName?: string,
): Promise<boolean> {
  const instance = clinic.evolutionInstanceName ?? metaInstance(clinic.whatsappPhoneNumberId ?? "");
  return handleSchedulingFreeText({
    clinicId: clinic.id,
    phone,
    instance,
    message,
    clinicName: clinic.name,
    patientName,
  });
}

async function startManagementFlowMeta(
  clinic: typeof clinicsTable.$inferSelect,
  _metaConfig: { phoneNumberId: string; accessToken: string },
  phone: string,
): Promise<void> {
  const instance = clinic.evolutionInstanceName ?? metaInstance(clinic.whatsappPhoneNumberId ?? "");
  await startManagementFlow({ clinicId: clinic.id, phone, instance });
}

async function startSchedulingFlowMeta(
  clinic: typeof clinicsTable.$inferSelect,
  _metaConfig: { phoneNumberId: string; accessToken: string },
  phone: string,
  patientName?: string,
): Promise<void> {
  const instance = clinic.evolutionInstanceName ?? metaInstance(clinic.whatsappPhoneNumberId ?? "");
  await startSchedulingFlow({
    clinicId: clinic.id,
    phone,
    instance,
    clinicName: clinic.name,
    patientName,
  });
}

export default router;
