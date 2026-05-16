/**
 * mercadopago-webhook.ts
 *
 * Webhook para notificações de pagamento do Mercado Pago.
 *
 * POST /api/webhooks/mercadopago
 *
 * Fluxo:
 * 1. Valida assinatura HMAC-SHA256 (header x-signature)
 * 2. Obtém status do pagamento via API do MP
 * 3. Busca agendamento pelo paymentIntentId ou externalReference
 * 4. Aprovado → confirma agendamento + notifica paciente via WhatsApp
 * 5. Rejeitado/expirado → cancela reserva + notifica paciente
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { eq, or } from "drizzle-orm";
import { db, clinicsTable, appointmentsTable } from "@workspace/db";
import { getMercadoPagoPaymentStatus } from "../lib/mercado-pago";
import { sendTextMessage, isEvolutionConfigured } from "../lib/evolution-api";
import { sendMetaTextMessage, isMetaConfigured } from "../lib/meta-api";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MP_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "";

// ─── Validação de assinatura ──────────────────────────────────────────────────

/**
 * Valida o header x-signature do Mercado Pago.
 * Formato: "ts=1234567890,v1=hexhash"
 *
 * O hash é HMAC-SHA256 de: "id:{paymentId};request-id:{requestId};ts:{ts};"
 */
function validateMpSignature(
  paymentId: string,
  requestId: string,
  signature: string,
): boolean {
  if (!MP_WEBHOOK_SECRET) return true; // dev sem secret → skip

  const [tsPart, v1Part] = signature.split(",");
  const ts = tsPart?.split("=")[1] ?? "";
  const hash = v1Part?.split("=")[1] ?? "";

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ─── Envio de notificação via WhatsApp ───────────────────────────────────────

async function notifyPatient(
  clinic: typeof clinicsTable.$inferSelect,
  phone: string,
  message: string,
): Promise<void> {
  // Tenta Evolution API primeiro (se configurada)
  if (isEvolutionConfigured() && clinic.evolutionInstanceName) {
    await sendTextMessage(clinic.evolutionInstanceName, phone, message).catch((err) => {
      logger.warn({ err }, "[MPWebhook] Falha ao enviar via Evolution API");
    });
    return;
  }

  // Fallback: Meta Cloud API
  if (
    isMetaConfigured({
      phoneNumberId: clinic.whatsappPhoneNumberId ?? undefined,
      accessToken: clinic.whatsappAccessToken ?? undefined,
    })
  ) {
    await sendMetaTextMessage(
      { phoneNumberId: clinic.whatsappPhoneNumberId!, accessToken: clinic.whatsappAccessToken! },
      phone,
      message,
    ).catch((err) => {
      logger.warn({ err }, "[MPWebhook] Falha ao enviar via Meta API");
    });
  }
}

// ─── POST /api/webhooks/mercadopago ──────────────────────────────────────────

router.post("/webhooks/mercadopago", async (req: Request, res: Response): Promise<void> => {
  // Responde imediatamente (Mercado Pago retenta se não receber em 22s)
  res.status(200).json({ ok: true });

  const body = req.body as Record<string, unknown>;

  // Ignora notificações que não são de pagamento
  const notificationType = String(body?.type ?? body?.action ?? "");
  if (!notificationType.includes("payment")) {
    logger.debug({ type: notificationType }, "[MPWebhook] Notificação ignorada (não é pagamento)");
    return;
  }

  const paymentId = String((body?.data as Record<string, unknown>)?.id ?? body?.id ?? "");
  if (!paymentId || paymentId === "undefined") {
    logger.warn({ body }, "[MPWebhook] Sem payment_id no payload");
    return;
  }

  // Valida assinatura
  const signature = String(req.headers["x-signature"] ?? "");
  const requestId = String(req.headers["x-request-id"] ?? "");
  if (signature && !validateMpSignature(paymentId, requestId, signature)) {
    logger.warn({ paymentId }, "[MPWebhook] Assinatura inválida");
    return;
  }

  logger.info({ paymentId }, "[MPWebhook] Notificação de pagamento recebida");

  // ── Busca agendamento pelo payment_intent_id ou external_reference ─────────
  const [appt] = await db
    .select()
    .from(appointmentsTable)
    .where(
      or(
        eq(appointmentsTable.paymentIntentId, paymentId),
        eq(appointmentsTable.externalReference, paymentId),
      ),
    )
    .limit(1);

  if (!appt) {
    logger.warn({ paymentId }, "[MPWebhook] Nenhum agendamento encontrado para este pagamento");
    return;
  }

  // Busca clínica para obter access token do MP e dados de WhatsApp
  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.id, appt.clinicId));

  if (!clinic) return;

  // Precisa do access token da clínica para consultar o status
  const accessToken = clinic.mercadoPagoAccessToken ?? process.env.MERCADO_PAGO_ACCESS_TOKEN ?? "";
  if (!accessToken) {
    logger.error({ clinicId: clinic.id }, "[MPWebhook] Access token do Mercado Pago não configurado");
    return;
  }

  // ── Consulta status do pagamento ──────────────────────────────────────────
  let payment: Awaited<ReturnType<typeof getMercadoPagoPaymentStatus>>;
  try {
    payment = await getMercadoPagoPaymentStatus(accessToken, paymentId);
  } catch (err) {
    logger.error({ err, paymentId }, "[MPWebhook] Erro ao consultar status do pagamento");
    return;
  }

  logger.info({ paymentId, status: payment.status, apptId: appt.id }, "[MPWebhook] Status do pagamento consultado");

  const dt = new Date(appt.scheduledAt);
  const dateLabel = dt.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const timeLabel = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  // ── Aprovado ──────────────────────────────────────────────────────────────
  if (payment.status === "approved") {
    await db
      .update(appointmentsTable)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        reservationExpiresAt: null,
      })
      .where(eq(appointmentsTable.id, appt.id));

    const msg =
      `✅ *Pagamento recebido! Agendamento confirmado!*\n\n` +
      `📅 *Data:* ${dateLabel}\n` +
      `🕐 *Horário:* ${timeLabel}\n` +
      `🔖 *ID:* #${appt.id}\n\n` +
      `Aguardamos você! 😊`;

    await notifyPatient(clinic, appt.patientPhone, msg);
    logger.info({ apptId: appt.id }, "[MPWebhook] Agendamento confirmado após pagamento aprovado");
  }

  // ── Rejeitado / Cancelado / Expirado ─────────────────────────────────────
  else if (["rejected", "cancelled", "expired"].includes(payment.status)) {
    await db
      .update(appointmentsTable)
      .set({
        status: "cancelled",
        paymentStatus: payment.status === "expired" ? "expired" : "failed",
        reservationExpiresAt: null,
      })
      .where(eq(appointmentsTable.id, appt.id));

    const msg =
      `❌ *Pagamento não realizado.*\n\n` +
      `O horário reservado em *${dateLabel}* às *${timeLabel}* foi liberado.\n\n` +
      `Para reagendar, fale comigo novamente! 😊`;

    await notifyPatient(clinic, appt.patientPhone, msg);
    logger.info({ apptId: appt.id, status: payment.status }, "[MPWebhook] Reserva cancelada — pagamento não realizado");
  }
  // Demais status (pending, in_process, etc.) — aguarda próxima notificação
});

export default router;
