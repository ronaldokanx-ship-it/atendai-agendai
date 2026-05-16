import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db, professionalsTable, professionalServicesTable, professionalSchedulesTable } from "@workspace/db";
import {
  ListProfessionalsParams,
  ListProfessionalsQueryParams,
  ListProfessionalsResponse,
  CreateProfessionalParams,
  CreateProfessionalBody,
  GetProfessionalParams,
  GetProfessionalResponse,
  UpdateProfessionalParams,
  UpdateProfessionalBody,
  UpdateProfessionalResponse,
  DeleteProfessionalParams,
  SetProfessionalServicesParams,
  SetProfessionalServicesBody,
  SetProfessionalServicesResponse,
  GetProfessionalScheduleParams,
  SetProfessionalScheduleParams,
  SetProfessionalScheduleBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getProfessionalServiceIds(professionalId: number): Promise<number[]> {
  const links = await db
    .select({ serviceId: professionalServicesTable.serviceId })
    .from(professionalServicesTable)
    .where(eq(professionalServicesTable.professionalId, professionalId));
  return links.map((l) => l.serviceId);
}

router.get("/clinics/:clinicId/professionals", async (req, res): Promise<void> => {
  const params = ListProfessionalsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = ListProfessionalsQueryParams.safeParse(req.query);
  const serviceId = query.success ? query.data.serviceId : undefined;

  if (serviceId) {
    const links = await db
      .select({ professionalId: professionalServicesTable.professionalId })
      .from(professionalServicesTable)
      .where(eq(professionalServicesTable.serviceId, serviceId));

    const professionalIds = links.map((l) => l.professionalId);

    if (professionalIds.length === 0) {
      res.json(ListProfessionalsResponse.parse([]));
      return;
    }

    const professionals = await db
      .select()
      .from(professionalsTable)
      .where(
        and(
          eq(professionalsTable.clinicId, params.data.clinicId),
          eq(professionalsTable.active, true),
          inArray(professionalsTable.id, professionalIds)
        )
      )
      .orderBy(professionalsTable.name);

    res.json(ListProfessionalsResponse.parse(professionals));
    return;
  }

  const professionals = await db
    .select()
    .from(professionalsTable)
    .where(eq(professionalsTable.clinicId, params.data.clinicId))
    .orderBy(professionalsTable.name);

  res.json(ListProfessionalsResponse.parse(professionals));
});

router.post("/clinics/:clinicId/professionals", async (req, res): Promise<void> => {
  const params = CreateProfessionalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { serviceIds, ...professionalData } = parsed.data;

  const [professional] = await db
    .insert(professionalsTable)
    .values({ ...professionalData, clinicId: params.data.clinicId })
    .returning();

  if (serviceIds && serviceIds.length > 0) {
    await db.insert(professionalServicesTable).values(
      serviceIds.map((sid) => ({ professionalId: professional.id, serviceId: sid }))
    );
  }

  res.status(201).json(professional);
});

router.get("/clinics/:clinicId/professionals/:id", async (req, res): Promise<void> => {
  const params = GetProfessionalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [professional] = await db
    .select()
    .from(professionalsTable)
    .where(
      and(
        eq(professionalsTable.id, params.data.id),
        eq(professionalsTable.clinicId, params.data.clinicId)
      )
    );

  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }

  const serviceIds = await getProfessionalServiceIds(professional.id);
  res.json(GetProfessionalResponse.parse({ ...professional, serviceIds }));
});

router.patch("/clinics/:clinicId/professionals/:id", async (req, res): Promise<void> => {
  const params = UpdateProfessionalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProfessionalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [professional] = await db
    .update(professionalsTable)
    .set(parsed.data)
    .where(
      and(
        eq(professionalsTable.id, params.data.id),
        eq(professionalsTable.clinicId, params.data.clinicId)
      )
    )
    .returning();

  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }

  res.json(UpdateProfessionalResponse.parse(professional));
});

router.delete("/clinics/:clinicId/professionals/:id", async (req, res): Promise<void> => {
  const params = DeleteProfessionalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(professionalsTable)
    .where(
      and(
        eq(professionalsTable.id, params.data.id),
        eq(professionalsTable.clinicId, params.data.clinicId)
      )
    );

  res.sendStatus(204);
});

router.put("/clinics/:clinicId/professionals/:id/services", async (req, res): Promise<void> => {
  const params = SetProfessionalServicesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SetProfessionalServicesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [professional] = await db
    .select()
    .from(professionalsTable)
    .where(
      and(
        eq(professionalsTable.id, params.data.id),
        eq(professionalsTable.clinicId, params.data.clinicId)
      )
    );

  if (!professional) {
    res.status(404).json({ error: "Professional not found" });
    return;
  }

  await db
    .delete(professionalServicesTable)
    .where(eq(professionalServicesTable.professionalId, params.data.id));

  if (parsed.data.serviceIds.length > 0) {
    await db.insert(professionalServicesTable).values(
      parsed.data.serviceIds.map((sid) => ({
        professionalId: params.data.id,
        serviceId: sid,
      }))
    );
  }

  const serviceIds = await getProfessionalServiceIds(params.data.id);
  res.json(SetProfessionalServicesResponse.parse({ ...professional, serviceIds }));
});

// ─── GET /clinics/:clinicId/professionals/:id/schedule ─────────────────────
router.get("/clinics/:clinicId/professionals/:id/schedule", async (req, res): Promise<void> => {
  const params = GetProfessionalScheduleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [prof] = await db
    .select({ id: professionalsTable.id })
    .from(professionalsTable)
    .where(and(eq(professionalsTable.id, params.data.id), eq(professionalsTable.clinicId, params.data.clinicId)));
  if (!prof) { res.status(404).json({ error: "Professional not found" }); return; }

  const schedule = await db
    .select()
    .from(professionalSchedulesTable)
    .where(eq(professionalSchedulesTable.professionalId, params.data.id))
    .orderBy(professionalSchedulesTable.dayOfWeek, professionalSchedulesTable.startMinute);

  res.json(schedule);
});

// ─── PUT /clinics/:clinicId/professionals/:id/schedule ──────────────────────
router.put("/clinics/:clinicId/professionals/:id/schedule", async (req, res): Promise<void> => {
  const params = SetProfessionalScheduleParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = SetProfessionalScheduleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [prof] = await db
    .select({ id: professionalsTable.id })
    .from(professionalsTable)
    .where(and(eq(professionalsTable.id, params.data.id), eq(professionalsTable.clinicId, params.data.clinicId)));
  if (!prof) { res.status(404).json({ error: "Professional not found" }); return; }

  // Replace all entries atomically
  await db.delete(professionalSchedulesTable).where(eq(professionalSchedulesTable.professionalId, params.data.id));

  if (parsed.data.entries.length > 0) {
    await db.insert(professionalSchedulesTable).values(
      parsed.data.entries.map(e => ({ ...e, professionalId: params.data.id }))
    );
  }

  const schedule = await db
    .select()
    .from(professionalSchedulesTable)
    .where(eq(professionalSchedulesTable.professionalId, params.data.id))
    .orderBy(professionalSchedulesTable.dayOfWeek, professionalSchedulesTable.startMinute);

  res.json(schedule);
});

export default router;
