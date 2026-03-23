import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, aiLogsTable } from "@workspace/db";
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

export default router;
