/**
 * mercado-pago.ts
 *
 * Cliente Mercado Pago para criação de pagamentos PIX e consulta de status.
 * Usa a API REST diretamente (sem SDK) para evitar dependências extras.
 *
 * Referência: https://api.mercadopago.com/v1/payments
 */

import { logger } from "./logger";

const MP_BASE_URL = "https://api.mercadopago.com";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MercadoPagoPixResult {
  paymentId: string;
  status: string;                // "pending" | "approved" | "rejected" etc.
  qrCode: string;                // Código copia-e-cola PIX
  qrCodeBase64?: string;         // QR code em base64 (imagem)
  expiresAt: Date;
}

export interface CreatePixPaymentParams {
  accessToken: string;
  amount: number;                // Valor em BRL (ex: 150.00)
  description: string;           // Nome do serviço
  payerName: string;             // Nome do paciente
  payerEmail?: string;           // E-mail (usa genérico se não informado)
  externalReference: string;     // ID único — ex: "AGD_20260417_C3_A15"
  expirationMinutes?: number;    // Padrão: 30
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Formata data ISO 8601 com offset de São Paulo (-03:00). */
function toBrasiliaISO(date: Date): string {
  const offset = -3 * 60; // UTC-3
  const local = new Date(date.getTime() + offset * 60_000);
  return local.toISOString().replace("Z", "-03:00");
}

/** Faz uma requisição autenticada na API do Mercado Pago. */
async function mpRequest<T>(
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `${path}-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({ error: "invalid_json" }));

  if (!res.ok) {
    logger.error(
      { status: res.status, path, response: json },
      "[MercadoPago] Erro na requisição",
    );
    throw new Error(`MercadoPago ${res.status}: ${JSON.stringify(json)}`);
  }

  return json as T;
}

// ─── Funções principais ───────────────────────────────────────────────────────

/**
 * Cria um pagamento PIX no Mercado Pago.
 * Retorna o ID do pagamento, QR Code copia-e-cola e data de expiração.
 */
export async function createMercadoPagoPixPayment(
  params: CreatePixPaymentParams,
): Promise<MercadoPagoPixResult> {
  const {
    accessToken,
    amount,
    description,
    payerName,
    payerEmail,
    externalReference,
    expirationMinutes = 30,
  } = params;

  const expiresAt = new Date(Date.now() + expirationMinutes * 60_000);

  // Divide nome em firstName / lastName
  const nameParts = payerName.trim().split(" ");
  const firstName = nameParts[0] ?? "Cliente";
  const lastName = nameParts.slice(1).join(" ") || "ClinicAI";

  const paymentData = {
    transaction_amount: amount,
    description: description.slice(0, 255),
    payment_method_id: "pix",
    payer: {
      email: payerEmail ?? "cliente@clinicai.app",
      first_name: firstName,
      last_name: lastName,
    },
    external_reference: externalReference,
    date_of_expiration: toBrasiliaISO(expiresAt),
    metadata: {
      integration_type: "clinicai_whatsapp",
    },
  };

  const response = await mpRequest<{
    id: number;
    status: string;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
      };
    };
  }>("POST", "/v1/payments", accessToken, paymentData);

  const qrCode =
    response.point_of_interaction?.transaction_data?.qr_code ?? "";
  const qrCodeBase64 =
    response.point_of_interaction?.transaction_data?.qr_code_base64;

  if (!qrCode) {
    throw new Error("[MercadoPago] QR Code não retornado pela API");
  }

  logger.info(
    { paymentId: response.id, externalReference, amount },
    "[MercadoPago] PIX criado com sucesso",
  );

  return {
    paymentId: String(response.id),
    status: response.status,
    qrCode,
    qrCodeBase64,
    expiresAt,
  };
}

/**
 * Consulta o status de um pagamento pelo ID.
 * Retorna string de status: "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back"
 */
export async function getMercadoPagoPaymentStatus(
  accessToken: string,
  paymentId: string,
): Promise<{
  id: string;
  status: string;
  externalReference: string | null;
  amount: number;
}> {
  const response = await mpRequest<{
    id: number;
    status: string;
    external_reference: string | null;
    transaction_amount: number;
  }>("GET", `/v1/payments/${paymentId}`, accessToken);

  return {
    id: String(response.id),
    status: response.status,
    externalReference: response.external_reference,
    amount: response.transaction_amount,
  };
}
