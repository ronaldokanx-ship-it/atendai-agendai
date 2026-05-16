import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicsTable, aiLogsTable, patientsTable } from "@workspace/db";
import type { Clinic } from "@workspace/db";
import {
  ListClinicsResponse,
  GetClinicParams,
  GetClinicResponse,
  CreateClinicBody,
  UpdateClinicParams,
  UpdateClinicBody,
  UpdateClinicResponse,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { getInstanceState, getInstanceQrCode, logoutInstance } from "../lib/evolution-api";
import { processWhatsAppMessage } from "../lib/ai-orchestrator";
import { and, eq as eqD } from "drizzle-orm";
import {
  hasActiveSchedulingSession,
  handleSchedulingSelection,
  handleSchedulingFreeText,
  isSchedulingIntent,
  isManagementIntent,
  startSchedulingFlow,
  startManagementFlow,
  clearSchedulingSession,
  runSchedulingWithCapture,
  captureToTestResponse,
} from "../lib/scheduling-flow";

const router: IRouter = Router();

/** Mascara chaves sensíveis: retorna os últimos 4 caracteres precedidos de asteriscos */
function maskKey(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

/** Prepara o objeto clínica para resposta da API, mascarando campos sensíveis */
function toPublicClinic(clinic: Clinic) {
  return {
    ...clinic,
    aiExternalApiKey: maskKey(clinic.aiExternalApiKey),
    asaasApiKey: maskKey(clinic.asaasApiKey),
    mercadoPagoAccessToken: maskKey(clinic.mercadoPagoAccessToken),
    whatsappAccessToken: maskKey(clinic.whatsappAccessToken),
    // whatsappPhoneNumberId não é sensível — retorna como está
  };
}

router.get("/clinics", async (req, res): Promise<void> => {
  const clinics = await db.select().from(clinicsTable).orderBy(clinicsTable.id);
  res.json(ListClinicsResponse.parse(clinics.map(toPublicClinic)));
});

router.post("/clinics", async (req, res): Promise<void> => {
  const parsed = CreateClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [clinic] = await db
    .insert(clinicsTable)
    .values({ ...parsed.data, apiKey: randomUUID() })
    .returning();

  res.status(201).json(GetClinicResponse.parse(toPublicClinic(clinic)));
});

router.get("/clinics/:id", async (req, res): Promise<void> => {
  const params = GetClinicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.id, params.data.id));

  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.json(GetClinicResponse.parse(toPublicClinic(clinic)));
});

router.patch("/clinics/:id", async (req, res): Promise<void> => {
  const params = UpdateClinicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Atendentes não podem alterar configurações da empresa
  const role = req.auth?.role;
  if (role === "attendant" || role === "staff") {
    res.status(403).json({ error: "Atendentes não podem alterar configurações da empresa" });
    return;
  }

  const parsed = UpdateClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Supervisores não podem alterar campos sensíveis de integração e controles de liga/desliga
  const OWNER_ONLY_FIELDS = ["aiEnabled", "schedulingEnabled", "asaasApiKey", "mercadoPagoAccessToken", "whatsappPhoneNumberId", "whatsappAccessToken", "evolutionInstanceName", "aiExternalApiKey", "whatsappProvider"];
  if (role === "supervisor") {
    for (const field of OWNER_ONLY_FIELDS) {
      if (field in parsed.data) {
        delete (parsed.data as Record<string, unknown>)[field];
      }
    }
  }

  // Campos NOT NULL no banco — string vazia é mantida como string vazia (não converte para null)
  const NOT_NULL_FIELDS = new Set(["name", "aiName", "clinicType"]);

  // Se o campo vier como string vazia E for nullable, interpreta como "limpar o valor"
  // Para campos NOT NULL, string vazia é mantida (será rejeitada pelo frontend via validação)
  // ou simplesmente ignorada se for mesmo vazia
  const updateData = Object.fromEntries(
    Object.entries(parsed.data)
      .map(([k, v]) => [k, (!NOT_NULL_FIELDS.has(k) && v === "") ? null : v])
      .filter(([k, v]) => {
        // Remove campos NOT NULL que vieram como string vazia ou null
        if (NOT_NULL_FIELDS.has(k as string) && (v === null || v === "")) return false;
        return true;
      })
  );

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Nenhum campo permitido para atualizar" });
    return;
  }

  const [clinic] = await db
    .update(clinicsTable)
    .set(updateData)
    .where(eq(clinicsTable.id, params.data.id))
    .returning();

  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.json(UpdateClinicResponse.parse(toPublicClinic(clinic)));
});

// ─── WhatsApp / Evolution API ──────────────────────────────────────────────

/** GET /clinics/:id/whatsapp/status — retorna estado de conexão da instância */
router.get("/clinics/:id/whatsapp/status", async (req, res): Promise<void> => {
  const params = GetClinicParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [clinic] = await db
    .select({ evolutionInstanceName: clinicsTable.evolutionInstanceName })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, params.data.id));

  if (!clinic?.evolutionInstanceName) {
    res.json({ state: "not_configured" });
    return;
  }

  const state = await getInstanceState(clinic.evolutionInstanceName);
  res.json({ state });
});

/** GET /clinics/:id/whatsapp/qr — obtém QR code para pareamento */
router.get("/clinics/:id/whatsapp/qr", async (req, res): Promise<void> => {
  const params = GetClinicParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [clinic] = await db
    .select({ evolutionInstanceName: clinicsTable.evolutionInstanceName })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, params.data.id));

  if (!clinic?.evolutionInstanceName) {
    res.status(400).json({ error: "Instância não configurada" });
    return;
  }

  const qrCode = await getInstanceQrCode(clinic.evolutionInstanceName);
  if (!qrCode) {
    res.status(503).json({ error: "QR code não disponível" });
    return;
  }

  res.json({ qrCode });
});

/** DELETE /clinics/:id/whatsapp/disconnect — desconecta instância */
router.delete("/clinics/:id/whatsapp/disconnect", async (req, res): Promise<void> => {
  const params = GetClinicParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const [clinic] = await db
    .select({ evolutionInstanceName: clinicsTable.evolutionInstanceName })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, params.data.id));

  if (clinic?.evolutionInstanceName) {
    await logoutInstance(clinic.evolutionInstanceName);
  }

  res.json({ ok: true });
});

/**
 * POST /clinics/:id/whatsapp/test
 * Endpoint exclusivo para a página "Testar IA" do painel.
 * Usa autenticação JWT (sem precisar expor apiKey no frontend).
 * Aceita { from, message, messageType } e retorna a resposta da IA incluindo
 * interactiveList e interactiveChoice (botões/listas).
 * Também processa o comando especial "reiniciarx" para resetar histórico.
 */
router.post("/clinics/:id/whatsapp/test", async (req, res): Promise<void> => {
  const params = GetClinicParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const { from, message, messageType = "text" } = req.body as {
    from?: string; message?: string; messageType?: string;
  };

  if (!from || !message) {
    res.status(400).json({ error: "Campos 'from' e 'message' são obrigatórios" });
    return;
  }

  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, params.data.id));
  if (!clinic) { res.status(404).json({ error: "Clínica não encontrada" }); return; }

  // Comando especial: reinicia histórico
  if (message.trim().toLowerCase() === "reiniciarx") {
    await db.delete(aiLogsTable).where(
      and(eqD(aiLogsTable.clinicId, clinic.id), eqD(aiLogsTable.patientPhone, from)),
    );
    clearSchedulingSession(clinic.id, from);
    res.json({ reply: "Conversa reiniciada! 😊", appointmentId: null, interactiveList: null, interactiveChoice: null });
    return;
  }

  const instance = clinic.evolutionInstanceName ?? "";

  // ── Fluxo de agendamento determinístico (igual ao webhook Evolution) ─────────
  // Verifica seleções de lista/botões do fluxo (SVC|, PRF|, DATE|, CNF|, etc.)
  const sfHasSession = hasActiveSchedulingSession(clinic.id, from);

  req.log.info({ clinicId: clinic.id, from, message, sfHasSession }, "[TestEndpoint] Mensagem recebida");

  const isSchedulingSelection =
    message.startsWith("SVC|") ||
    message.startsWith("PRF|") ||
    message.startsWith("CNF|") ||
    message.startsWith("APPT|") ||
    message.startsWith("CNC|") ||
    message.startsWith("RMK|") ||
    message.startsWith("DATE|") ||
    message.startsWith("S|"); // Sempre intercepta S| para garantir confirmação antes do booking

  if (isSchedulingSelection) {
    const { result: handled, capture } = await runSchedulingWithCapture(() =>
      handleSchedulingSelection({
        clinicId: clinic.id,
        phone: from,
        instance,
        selectedId: message,
        clinicName: clinic.name,
      }),
    );
    if (handled) {
      res.json(captureToTestResponse(capture));
      return;
    }
    // handled=false → não era uma seleção do fluxo → cai no processamento normal abaixo
  } else if (message.trim()) {
    if (sfHasSession) {
      // Texto durante sessão ativa
      const [patient] = await db
        .select({ name: patientsTable.name })
        .from(patientsTable)
        .where(and(eqD(patientsTable.clinicId, clinic.id), eqD(patientsTable.phone, from)))
        .limit(1);

      const { result: handled, capture } = await runSchedulingWithCapture(() =>
        handleSchedulingFreeText({
          clinicId: clinic.id,
          phone: from,
          instance,
          message,
          clinicName: clinic.name,
          patientName: patient?.name,
        }),
      );
      if (handled) {
        res.json(captureToTestResponse(capture));
        return;
      }
    } else if ((clinic.schedulingEnabled ?? true) && isManagementIntent(message)) {
      const { capture } = await runSchedulingWithCapture(() =>
        startManagementFlow({ clinicId: clinic.id, phone: from, instance }),
      );
      res.json(captureToTestResponse(capture));
      return;
    } else if ((clinic.schedulingEnabled ?? true) && isSchedulingIntent(message)) {
      const [patient] = await db
        .select({ name: patientsTable.name })
        .from(patientsTable)
        .where(and(eqD(patientsTable.clinicId, clinic.id), eqD(patientsTable.phone, from)))
        .limit(1);

      const { capture } = await runSchedulingWithCapture(() =>
        startSchedulingFlow({
          clinicId: clinic.id,
          phone: from,
          instance,
          clinicName: clinic.name,
          patientName: patient?.name,
        }),
      );
      res.json(captureToTestResponse(capture));
      return;
    }
  }

  // ── Processamento pela IA (fallback quando scheduling flow não interceptou) ─
  const result = await processWhatsAppMessage({
    clinicId: clinic.id,
    patientPhone: from,
    userMessage: message,
    messageType: messageType as "text" | "audio",
    clinic: {
      id: clinic.id,
      aiName: clinic.aiName,
      aiPersonalityPrompt: clinic.aiPersonalityPrompt,
      knowledgeBase: clinic.knowledgeBase,
      clinicType: clinic.clinicType,
      schedulingEnabled: clinic.schedulingEnabled ?? true,
    },
  });

  res.json({
    reply: result.reply,
    appointmentId: result.appointmentId ?? null,
    interactiveList: result.interactiveList ?? null,
    interactiveChoice: result.interactiveChoice ?? null,
  });
});

/**
 * POST /clinics/:id/meta-discover-phones
 * Recebe o user access token retornado pelo Facebook Login SDK e consulta a
 * Graph API para listar todos os números WhatsApp Business vinculados à conta.
 * Usado pelo botão "Conectar com Meta" no painel de configurações.
 */
router.post("/clinics/:id/meta-discover-phones", async (req, res): Promise<void> => {
  const idParsed = parseInt(req.params.id, 10);
  if (isNaN(idParsed)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { userAccessToken } = req.body as { userAccessToken?: unknown };
  if (!userAccessToken || typeof userAccessToken !== "string" || userAccessToken.length < 10) {
    res.status(400).json({ error: "userAccessToken ausente ou inválido" });
    return;
  }

  // Consulta WABAs (WhatsApp Business Accounts) e seus números via Graph API
  const url = `https://graph.facebook.com/v17.0/me?fields=whatsapp_business_accounts%7Bphone_numbers%7Bid%2Cdisplay_phone_number%2Cverified_name%7D%7D&access_token=${encodeURIComponent(userAccessToken)}`;

  let graphRes: Response;
  try {
    graphRes = await fetch(url);
  } catch {
    res.status(502).json({ error: "Erro de conexão com a Meta Graph API" });
    return;
  }

  type GraphResponse = {
    error?: { message?: string };
    whatsapp_business_accounts?: {
      data: Array<{
        phone_numbers?: {
          data: Array<{ id: string; display_phone_number: string; verified_name: string }>;
        };
      }>;
    };
  };
  const data = (await graphRes.json()) as GraphResponse;

  if (!graphRes.ok || data.error) {
    res.status(400).json({ error: data.error?.message ?? "Erro ao consultar Meta Graph API" });
    return;
  }

  const phoneNumbers: Array<{ id: string; displayPhone: string; name: string }> = [];
  for (const waba of data.whatsapp_business_accounts?.data ?? []) {
    for (const phone of waba.phone_numbers?.data ?? []) {
      phoneNumbers.push({ id: phone.id, displayPhone: phone.display_phone_number, name: phone.verified_name });
    }
  }

  res.json({ phoneNumbers });
});

export default router;
