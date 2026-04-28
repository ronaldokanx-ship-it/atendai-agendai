import { Router, type IRouter } from "express";
import { eq, desc, sum, and, gte, lt } from "drizzle-orm";
import { db, aiLogsTable, clinicsTable } from "@workspace/db";
import { ListAiLogsParams, ListAiLogsQueryParams, ListAiLogsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clinics/:clinicId/ai-logs", async (req, res): Promise<void> => {
  const params = ListAiLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = ListAiLogsQueryParams.safeParse(req.query);
  const limit = query.success && query.data.limit ? query.data.limit : 50;

  const logs = await db
    .select()
    .from(aiLogsTable)
    .where(eq(aiLogsTable.clinicId, params.data.clinicId))
    .orderBy(desc(aiLogsTable.createdAt))
    .limit(limit);

  res.json(ListAiLogsResponse.parse(logs));
});

/**
 * GET /clinics/:clinicId/ai-usage
 * Retorna tokens consumidos no mês atual e total histórico,
 * além da data de criação da clínica (para cálculo de economia total).
 */
router.get("/clinics/:clinicId/ai-usage", async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  if (!Number.isInteger(clinicId) || clinicId <= 0) { res.status(400).json({ error: "ID inválido" }); return; }

  // Início e fim do mês corrente
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [allTime] = await db
    .select({ total: sum(aiLogsTable.tokensUsed) })
    .from(aiLogsTable)
    .where(eq(aiLogsTable.clinicId, clinicId));

  const [thisMonth] = await db
    .select({ total: sum(aiLogsTable.tokensUsed) })
    .from(aiLogsTable)
    .where(
      and(
        eq(aiLogsTable.clinicId, clinicId),
        gte(aiLogsTable.createdAt, monthStart),
        lt(aiLogsTable.createdAt, monthEnd),
      ),
    );

  const [clinic] = await db
    .select({ createdAt: clinicsTable.createdAt })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId));

  res.json({
    totalTokensAllTime: Number(allTime?.total ?? 0),
    totalTokensThisMonth: Number(thisMonth?.total ?? 0),
    clinicCreatedAt: clinic?.createdAt ?? null,
  });
});

export default router;
