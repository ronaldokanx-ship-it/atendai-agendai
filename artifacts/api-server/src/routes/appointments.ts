import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, appointmentsTable } from "@workspace/db";
import {
  ListAppointmentsParams,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  UpdateAppointmentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clinics/:clinicId/appointments", async (req, res): Promise<void> => {
  const params = ListAppointmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = ListAppointmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [eq(appointmentsTable.clinicId, params.data.clinicId)];
  if (query.data.status) {
    conditions.push(eq(appointmentsTable.status, query.data.status));
  }

  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(and(...conditions))
    .orderBy(appointmentsTable.scheduledAt);

  res.json(ListAppointmentsResponse.parse(appointments));
});

router.patch("/clinics/:clinicId/appointments/:id", async (req, res): Promise<void> => {
  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [appointment] = await db
    .update(appointmentsTable)
    .set(parsed.data)
    .where(and(eq(appointmentsTable.id, params.data.id), eq(appointmentsTable.clinicId, params.data.clinicId)))
    .returning();

  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  res.json(UpdateAppointmentResponse.parse(appointment));
});

export default router;
