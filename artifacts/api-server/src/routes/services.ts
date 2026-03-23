import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, servicesTable } from "@workspace/db";
import {
  ListServicesParams,
  ListServicesResponse,
  CreateServiceParams,
  CreateServiceBody,
  UpdateServiceParams,
  UpdateServiceBody,
  UpdateServiceResponse,
  DeleteServiceParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clinics/:clinicId/services", async (req, res): Promise<void> => {
  const params = ListServicesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const services = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.clinicId, params.data.clinicId))
    .orderBy(servicesTable.id);

  res.json(ListServicesResponse.parse(services.map(s => ({ ...s, price: Number(s.price) }))));
});

router.post("/clinics/:clinicId/services", async (req, res): Promise<void> => {
  const params = CreateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db
    .insert(servicesTable)
    .values({ ...parsed.data, clinicId: params.data.clinicId })
    .returning();

  res.status(201).json({ ...service, price: Number(service.price) });
});

router.patch("/clinics/:clinicId/services/:id", async (req, res): Promise<void> => {
  const params = UpdateServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db
    .update(servicesTable)
    .set(parsed.data)
    .where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.clinicId, params.data.clinicId)))
    .returning();

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json(UpdateServiceResponse.parse({ ...service, price: Number(service.price) }));
});

router.delete("/clinics/:clinicId/services/:id", async (req, res): Promise<void> => {
  const params = DeleteServiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(servicesTable)
    .where(and(eq(servicesTable.id, params.data.id), eq(servicesTable.clinicId, params.data.clinicId)));

  res.sendStatus(204);
});

export default router;
