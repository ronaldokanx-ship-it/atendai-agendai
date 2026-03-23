import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clinicsTable } from "@workspace/db";
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

const router: IRouter = Router();

router.get("/clinics", async (req, res): Promise<void> => {
  const clinics = await db.select().from(clinicsTable).orderBy(clinicsTable.id);
  res.json(ListClinicsResponse.parse(clinics));
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

  res.status(201).json(GetClinicResponse.parse(clinic));
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

  res.json(GetClinicResponse.parse(clinic));
});

router.patch("/clinics/:id", async (req, res): Promise<void> => {
  const params = UpdateClinicParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateClinicBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [clinic] = await db
    .update(clinicsTable)
    .set(parsed.data)
    .where(eq(clinicsTable.id, params.data.id))
    .returning();

  if (!clinic) {
    res.status(404).json({ error: "Clinic not found" });
    return;
  }

  res.json(UpdateClinicResponse.parse(clinic));
});

export default router;
