import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, clinicsTable, usersTable, aiLogsTable, appointmentsTable } from "@workspace/db";
import { eq, isNull, count, desc, and, max, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";
const TOKEN_EXPIRY = "7d";
const BOOTSTRAP_SECRET = process.env.ADMIN_BOOTSTRAP_SECRET ?? "";

// POST /api/admin/bootstrap
// Cria o primeiro superadmin se ainda não existir nenhum.
// Protegido por ADMIN_BOOTSTRAP_SECRET no body.
router.post("/admin/bootstrap", async (req, res): Promise<void> => {
  const { secret, name, email, password } = req.body ?? {};

  if (!BOOTSTRAP_SECRET) {
    res.status(503).json({ error: "ADMIN_BOOTSTRAP_SECRET não configurado no servidor" });
    return;
  }
  if (secret !== BOOTSTRAP_SECRET) {
    res.status(401).json({ error: "Secret inválido" });
    return;
  }
  if (typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "name inválido" });
    return;
  }
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "email inválido" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "password deve ter pelo menos 8 caracteres" });
    return;
  }

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "superadmin"))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Superadmin já existe" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db.insert(usersTable).values({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: "superadmin",
    clinicId: null,
  }).returning({ id: usersTable.id, name: usersTable.name });

  res.status(201).json({ message: "Superadmin criado com sucesso", id: user.id, name: user.name });
});

// GET /api/admin/clinics — lista todas as clínicas com métricas
router.get("/admin/clinics", requireAuth, requireSuperAdmin, async (_req, res): Promise<void> => {
  const clinics = await db
    .select({
      id: clinicsTable.id,
      name: clinicsTable.name,
      clinicType: clinicsTable.clinicType,
      phone: clinicsTable.phone,
      createdAt: clinicsTable.createdAt,
      isBlocked: clinicsTable.isBlocked,
      blockedReason: clinicsTable.blockedReason,
      blockedAt: clinicsTable.blockedAt,
    })
    .from(clinicsTable)
    .orderBy(desc(clinicsTable.createdAt));

  const owners = await db
    .select({
      clinicId: usersTable.clinicId,
      ownerName: usersTable.name,
      ownerEmail: usersTable.email,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "owner"));

  const ownersByClinic = Object.fromEntries(
    owners.map((o) => [o.clinicId, { name: o.ownerName, email: o.ownerEmail }])
  );

  // Métricas: total de mensagens IA e último atendimento por clínica
  const aiStats = await db
    .select({
      clinicId: aiLogsTable.clinicId,
      totalMessages: count(),
      lastActivity: max(aiLogsTable.createdAt),
    })
    .from(aiLogsTable)
    .groupBy(aiLogsTable.clinicId);

  const aiByClinic = Object.fromEntries(
    aiStats.map((s) => [s.clinicId, { totalMessages: Number(s.totalMessages), lastActivity: s.lastActivity }])
  );

  // Total de agendamentos por clínica
  const aptStats = await db
    .select({
      clinicId: appointmentsTable.clinicId,
      totalAppointments: count(),
    })
    .from(appointmentsTable)
    .groupBy(appointmentsTable.clinicId);

  const aptByClinic = Object.fromEntries(
    aptStats.map((s) => [s.clinicId, Number(s.totalAppointments)])
  );

  // Contagem de usuários por clínica
  const userStats = await db
    .select({
      clinicId: usersTable.clinicId,
      totalUsers: count(),
    })
    .from(usersTable)
    .where(sql`${usersTable.clinicId} IS NOT NULL`)
    .groupBy(usersTable.clinicId);

  const usersByClinic = Object.fromEntries(
    userStats.map((s) => [s.clinicId, Number(s.totalUsers)])
  );

  const result = clinics.map((c) => ({
    ...c,
    owner: ownersByClinic[c.id] ?? null,
    totalMessages: aiByClinic[c.id]?.totalMessages ?? 0,
    lastActivity: aiByClinic[c.id]?.lastActivity ?? null,
    totalAppointments: aptByClinic[c.id] ?? 0,
    totalUsers: usersByClinic[c.id] ?? 0,
  }));

  res.json(result);
});

// GET /api/admin/stats — totais gerais
router.get("/admin/stats", requireAuth, requireSuperAdmin, async (_req, res): Promise<void> => {
  const [{ total }] = await db.select({ total: count() }).from(clinicsTable);
  res.json({ totalClinics: Number(total) });
});

// DELETE /api/admin/clinics/:id — exclui clínica e todos os dados em cascata
router.delete("/admin/clinics/:id", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const [clinic] = await db.select({ id: clinicsTable.id, name: clinicsTable.name })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, id))
    .limit(1);

  if (!clinic) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }

  // cascade delete elimina services, professionals, patients, appointments, ai_logs, users
  await db.delete(clinicsTable).where(eq(clinicsTable.id, id));

  res.json({ message: `Clínica "${clinic.name}" excluída com sucesso` });
});

// PATCH /api/admin/clinics/:clinicId/reset-owner-password — redefine senha do owner
router.patch("/admin/clinics/:clinicId/reset-owner-password", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const clinicId = Number(req.params.clinicId);
  if (!clinicId || isNaN(clinicId)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const { newPassword } = req.body ?? {};
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Nova senha deve ter pelo menos 8 caracteres" });
    return;
  }

  const [owner] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.clinicId, clinicId), eq(usersTable.role, "owner")))
    .limit(1);

  if (!owner) {
    res.status(404).json({ error: "Owner não encontrado para esta empresa" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, owner.id));

  res.json({ message: `Senha de ${owner.name} (${owner.email}) redefinida com sucesso` });
});

// PATCH /api/admin/clinics/:id/block — bloqueia clínica
router.patch("/admin/clinics/:id/block", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  const { reason } = req.body ?? {};

  await db.update(clinicsTable).set({
    isBlocked: true,
    blockedReason: typeof reason === "string" && reason.trim() ? reason.trim() : "Inadimplência",
    blockedAt: new Date(),
  }).where(eq(clinicsTable.id, id));

  res.json({ message: "Clínica bloqueada com sucesso" });
});

// PATCH /api/admin/clinics/:id/unblock — desbloqueia clínica
router.patch("/admin/clinics/:id/unblock", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return; }

  await db.update(clinicsTable).set({
    isBlocked: false,
    blockedReason: null,
    blockedAt: null,
  }).where(eq(clinicsTable.id, id));

  res.json({ message: "Clínica desbloqueada com sucesso" });
});

// POST /api/admin/create-superadmin — cria superadmin adicional (protegido pelo BOOTSTRAP_SECRET)
router.post("/admin/create-superadmin", async (req, res): Promise<void> => {
  const { secret, name, email, password } = req.body ?? {};

  if (!BOOTSTRAP_SECRET || secret !== BOOTSTRAP_SECRET) {
    res.status(401).json({ error: "Secret inválido" });
    return;
  }
  if (typeof name !== "string" || name.trim().length < 2) { res.status(400).json({ error: "name inválido" }); return; }
  if (typeof email !== "string" || !email.includes("@")) { res.status(400).json({ error: "email inválido" }); return; }
  if (typeof password !== "string" || password.length < 8) { res.status(400).json({ error: "password deve ter pelo menos 8 caracteres" }); return; }

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing.length > 0) {
    // Atualiza se já existir
    await db.update(usersTable).set({ name: name.trim(), passwordHash, role: "superadmin" })
      .where(eq(usersTable.id, existing[0].id));
    res.json({ message: "Superadmin atualizado com sucesso", id: existing[0].id });
    return;
  }

  const [user] = await db.insert(usersTable).values({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: "superadmin",
    clinicId: null,
  }).returning({ id: usersTable.id, name: usersTable.name });

  res.status(201).json({ message: "Superadmin criado com sucesso", id: user.id, name: user.name });
});

export default router;
