import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, clinicsTable, handoffsTable, handoffMessagesTable, aiLogsTable } from "@workspace/db";
import { clinicToChannel, waText } from "../lib/whatsapp-provider";

const router: IRouter = Router();

function parseClinicId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /clinics/:clinicId/handoffs
 * Lista handoffs ativos (endedAt IS NULL)
 */
router.get("/clinics/:clinicId/handoffs", async (req, res): Promise<void> => {
  const clinicId = parseClinicId(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }
  const handoffs = await db
    .select()
    .from(handoffsTable)
    .where(and(eq(handoffsTable.clinicId, clinicId), isNull(handoffsTable.endedAt)))
    .orderBy(desc(handoffsTable.startedAt));
  res.json(handoffs);
});

/**
 * POST /clinics/:clinicId/handoffs
 * Atendente assume uma conversa (cria handoff ativo)
 */
router.post("/clinics/:clinicId/handoffs", async (req, res): Promise<void> => {
  const clinicId = parseClinicId(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }
  const patientPhone: string = req.body?.patientPhone;
  if (!patientPhone) {
    res.status(400).json({ error: "patientPhone obrigatório" });
    return;
  }

  // Verifica handoff já ativo
  const [existing] = await db
    .select({ id: handoffsTable.id })
    .from(handoffsTable)
    .where(and(eq(handoffsTable.clinicId, clinicId), eq(handoffsTable.patientPhone, patientPhone), isNull(handoffsTable.endedAt)));

  if (existing) {
    res.status(409).json({ error: "Já existe um handoff ativo para este contato" });
    return;
  }

  const attendantId = req.auth?.userId ?? null;
  const [handoff] = await db
    .insert(handoffsTable)
    .values({ clinicId, patientPhone, attendantId })
    .returning();

  res.status(201).json(handoff);
});

/**
 * DELETE /clinics/:clinicId/handoffs/:phone
 * Encerra um handoff ativo (seta endedAt)
 */
router.delete("/clinics/:clinicId/handoffs/:phone", async (req, res): Promise<void> => {
  const clinicId = parseClinicId(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }
  const phone = req.params.phone;
  if (!phone) { res.status(400).json({ error: "phone obrigatório" }); return; }

  const [updated] = await db
    .update(handoffsTable)
    .set({ endedAt: new Date() })
    .where(and(eq(handoffsTable.clinicId, clinicId), eq(handoffsTable.patientPhone, phone), isNull(handoffsTable.endedAt)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Nenhum handoff ativo encontrado para este contato" });
    return;
  }

  res.status(204).end();
});

/**
 * GET /clinics/:clinicId/handoffs/:phone/messages
 * Retorna histórico mesclado: ai_logs + handoff_messages ordenados por createdAt
 */
router.get("/clinics/:clinicId/handoffs/:phone/messages", async (req, res): Promise<void> => {
  const clinicId = parseClinicId(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }
  const phone = req.params.phone;
  if (!phone) { res.status(400).json({ error: "phone obrigatório" }); return; }
  const limit = req.query.limit ? Number(req.query.limit) : 100;

  // Busca os últimos ai_logs para o telefone
  const aiMessages = await db
    .select({ id: aiLogsTable.id, userMessage: aiLogsTable.userMessage, aiResponse: aiLogsTable.aiResponse, createdAt: aiLogsTable.createdAt })
    .from(aiLogsTable)
    .where(and(eq(aiLogsTable.clinicId, clinicId), eq(aiLogsTable.patientPhone, phone)))
    .orderBy(desc(aiLogsTable.createdAt))
    .limit(limit);

  // Busca mensagens de handoff para o telefone
  const handoffMsgs = await db
    .select()
    .from(handoffMessagesTable)
    .where(and(eq(handoffMessagesTable.clinicId, clinicId), eq(handoffMessagesTable.patientPhone, phone)))
    .orderBy(desc(handoffMessagesTable.createdAt))
    .limit(limit);

  // Converte ai_logs em dois items por registro (patient → ai)
  type HistoryItem = { id: number; source: "ai" | "attendant" | "patient"; content: string; patientPhone: string; createdAt: Date };
  const items: HistoryItem[] = [];

  for (const log of aiMessages) {
    // Mensagem do paciente
    items.push({
      id: log.id * 1000,       // id sintético para evitar colisão
      source: "patient",
      content: log.userMessage,
      patientPhone: phone,
      createdAt: log.createdAt,
    });
    // Resposta da IA (1ms depois para garantir ordem)
    items.push({
      id: log.id * 1000 + 1,
      source: "ai",
      content: log.aiResponse,
      patientPhone: phone,
      createdAt: new Date(log.createdAt.getTime() + 1),
    });
  }

  for (const msg of handoffMsgs) {
    items.push({
      id: msg.id * 10000 + 5000, // id sintético
      source: msg.direction === "out" ? "attendant" : "patient",
      content: msg.content,
      patientPhone: phone,
      createdAt: msg.createdAt,
    });
  }

  // Ordena por data crescente
  items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  res.json(items);
});

/**
 * POST /clinics/:clinicId/handoffs/:phone/messages
 * Atendente envia mensagem pelo WhatsApp
 */
router.post("/clinics/:clinicId/handoffs/:phone/messages", async (req, res): Promise<void> => {
  const clinicId = parseClinicId(req.params.clinicId);
  if (!clinicId) { res.status(400).json({ error: "clinicId inválido" }); return; }
  const phone = req.params.phone;
  if (!phone) { res.status(400).json({ error: "phone obrigatório" }); return; }
  const content: string = req.body?.content;
  if (!content) {
    res.status(400).json({ error: "content obrigatório" });
    return;
  }
  const attendantId = req.auth?.userId ?? null;

  // Busca provedor WhatsApp da clínica
  const [clinic] = await db.select({
    evolutionInstanceName: clinicsTable.evolutionInstanceName,
    whatsappPhoneNumberId: clinicsTable.whatsappPhoneNumberId,
    whatsappAccessToken: clinicsTable.whatsappAccessToken,
    whatsappProvider: clinicsTable.whatsappProvider,
  }).from(clinicsTable).where(eq(clinicsTable.id, clinicId));

  // Envia pelo WhatsApp (Evolution ou Meta API) se disponível
  if (clinic) {
    try {
      const channel = clinicToChannel(clinic);
      await waText(channel, phone, content);
    } catch (err) {
      req.log.error({ err }, "[Handoff] Falha ao enviar mensagem pelo WhatsApp");
    }
  }

  // Salva no banco
  const [msg] = await db
    .insert(handoffMessagesTable)
    .values({ clinicId, patientPhone: phone, direction: "out", content, attendantId })
    .returning();

  const item = {
    id: msg.id * 10000 + 5000,
    source: "attendant" as const,
    content: msg.content,
    patientPhone: phone,
    createdAt: msg.createdAt,
  };

  res.status(201).json(item);
});

export default router;
