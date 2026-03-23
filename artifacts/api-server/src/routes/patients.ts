import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, patientsTable, appointmentsTable, aiLogsTable } from "@workspace/db";
import {
  ListPatientsParams,
  ListPatientsQueryParams,
  ListPatientsResponse,
  CreatePatientParams,
  CreatePatientBody,
  GetPatientParams,
  GetPatientResponse,
  UpdatePatientParams,
  UpdatePatientBody,
  UpdatePatientResponse,
  DeletePatientParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clinics/:clinicId/patients", async (req, res): Promise<void> => {
  const params = ListPatientsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = ListPatientsQueryParams.safeParse(req.query);
  const search = query.success ? query.data.search : undefined;

  let patients;
  if (search) {
    patients = await db
      .select()
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.clinicId, params.data.clinicId),
          or(
            ilike(patientsTable.name, `%${search}%`),
            ilike(patientsTable.phone, `%${search}%`)
          )
        )
      )
      .orderBy(patientsTable.name);
  } else {
    patients = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.clinicId, params.data.clinicId))
      .orderBy(patientsTable.name);
  }

  res.json(ListPatientsResponse.parse(patients));
});

router.post("/clinics/:clinicId/patients", async (req, res): Promise<void> => {
  const params = CreatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [patient] = await db
    .insert(patientsTable)
    .values({ ...parsed.data, clinicId: params.data.clinicId })
    .returning();

  res.status(201).json(patient);
});

router.get("/clinics/:clinicId/patients/:id", async (req, res): Promise<void> => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.id, params.data.id),
        eq(patientsTable.clinicId, params.data.clinicId)
      )
    );

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.clinicId, params.data.clinicId),
        eq(appointmentsTable.patientId, params.data.id)
      )
    )
    .orderBy(appointmentsTable.scheduledAt);

  const aiLogs = await db
    .select()
    .from(aiLogsTable)
    .where(
      and(
        eq(aiLogsTable.clinicId, params.data.clinicId),
        eq(aiLogsTable.patientPhone, patient.phone)
      )
    )
    .orderBy(aiLogsTable.createdAt);

  res.json(GetPatientResponse.parse({ ...patient, appointments, aiLogs }));
});

router.patch("/clinics/:clinicId/patients/:id", async (req, res): Promise<void> => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [patient] = await db
    .update(patientsTable)
    .set(parsed.data)
    .where(
      and(
        eq(patientsTable.id, params.data.id),
        eq(patientsTable.clinicId, params.data.clinicId)
      )
    )
    .returning();

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json(UpdatePatientResponse.parse(patient));
});

router.delete("/clinics/:clinicId/patients/:id", async (req, res): Promise<void> => {
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(patientsTable)
    .where(
      and(
        eq(patientsTable.id, params.data.id),
        eq(patientsTable.clinicId, params.data.clinicId)
      )
    );

  res.sendStatus(204);
});

export default router;
