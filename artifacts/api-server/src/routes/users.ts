import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, userActivityLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireSameClinic, requireOwner } from "../middlewares/auth";

const router = Router();

type MemberRole = "supervisor" | "attendant";
const ALLOWED_ROLES: MemberRole[] = ["supervisor", "attendant"];

// ─── GET /api/clinics/:clinicId/users ───────────────────────────────────────
// Lista todos os usuários da clínica (sem hash de senha)
router.get(
  "/clinics/:clinicId/users",
  requireAuth,
  requireSameClinic,
  async (req, res): Promise<void> => {
    const clinicId = Number(req.params.clinicId);

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        active: usersTable.active,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.clinicId, clinicId))
      .orderBy(usersTable.createdAt);

    res.json(users);
  },
);

// ─── POST /api/clinics/:clinicId/users ──────────────────────────────────────
// Cria novo membro (atendente ou supervisor) — apenas owner
router.post(
  "/clinics/:clinicId/users",
  requireAuth,
  requireSameClinic,
  requireOwner,
  async (req, res): Promise<void> => {
    const clinicId = Number(req.params.clinicId);
    const { name, email, password, role } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length < 2) {
      res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres" });
      return;
    }
    if (typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "E-mail inválido" });
      return;
    }
    if (typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Senha deve ter pelo menos 6 caracteres" });
      return;
    }
    if (!ALLOWED_ROLES.includes(role as MemberRole)) {
      res.status(400).json({ error: "Cargo inválido. Use 'supervisor' ou 'attendant'" });
      return;
    }

    // Verificar email único
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "E-mail já cadastrado" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(usersTable)
      .values({
        clinicId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        role: role as MemberRole,
        active: true,
      })
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        active: usersTable.active,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json(user);
  },
);

// ─── PATCH /api/clinics/:clinicId/users/:userId ──────────────────────────────
// Atualiza nome, cargo, status ou senha de um membro — apenas owner
router.patch(
  "/clinics/:clinicId/users/:userId",
  requireAuth,
  requireSameClinic,
  requireOwner,
  async (req, res): Promise<void> => {
    const clinicId = Number(req.params.clinicId);
    const userId = Number(req.params.userId);
    const requesterId = req.auth!.userId;

    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    // Buscar usuário alvo
    const [target] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.clinicId, clinicId)))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    // Proteções
    if (target.role === "superadmin") {
      res.status(403).json({ error: "Não é possível editar superadmin" });
      return;
    }
    if (target.role === "owner" && target.id !== requesterId) {
      res.status(403).json({ error: "Apenas o próprio dono pode alterar seus dados" });
      return;
    }

    const { name, role, active, newPassword } = req.body ?? {};
    const updates: Record<string, unknown> = {};

    if (typeof name === "string" && name.trim().length >= 2) {
      updates.name = name.trim();
    }
    if (ALLOWED_ROLES.includes(role as MemberRole) && target.role !== "owner") {
      updates.role = role;
    }
    if (typeof active === "boolean") {
      updates.active = active;
    }
    if (typeof newPassword === "string" && newPassword.length >= 6) {
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nenhum campo válido para atualizar" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(and(eq(usersTable.id, userId), eq(usersTable.clinicId, clinicId)))
      .returning({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        active: usersTable.active,
        createdAt: usersTable.createdAt,
      });

    res.json(updated);
  },
);

// ─── DELETE /api/clinics/:clinicId/users/:userId ─────────────────────────────
// Remove membro da empresa — apenas owner
router.delete(
  "/clinics/:clinicId/users/:userId",
  requireAuth,
  requireSameClinic,
  requireOwner,
  async (req, res): Promise<void> => {
    const clinicId = Number(req.params.clinicId);
    const userId = Number(req.params.userId);
    const requesterId = req.auth!.userId;

    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    if (userId === requesterId) {
      res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.clinicId, clinicId)))
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    if (target.role === "superadmin") {
      res.status(403).json({ error: "Não é possível excluir superadmin" });
      return;
    }

    await db.delete(usersTable).where(and(eq(usersTable.id, userId), eq(usersTable.clinicId, clinicId)));

    res.json({ ok: true });
  },
);

// ─── GET /api/clinics/:clinicId/users/:userId/activity ───────────────────────
// Histórico de atividade de um usuário
// Owner vê qualquer usuário; outros veem apenas o próprio
router.get(
  "/clinics/:clinicId/users/:userId/activity",
  requireAuth,
  requireSameClinic,
  async (req, res): Promise<void> => {
    const clinicId = Number(req.params.clinicId);
    const userId = Number(req.params.userId);
    const requesterId = req.auth!.userId;
    const requesterRole = req.auth!.role;

    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: "ID inválido" });
      return;
    }

    // Apenas owner e supervisor podem ver atividade de outros usuários
    if (requesterRole !== "owner" && requesterRole !== "supervisor" && requesterId !== userId) {
      res.status(403).json({ error: "Acesso negado" });
      return;
    }

    const logs = await db
      .select()
      .from(userActivityLogsTable)
      .where(
        and(
          eq(userActivityLogsTable.clinicId, clinicId),
          eq(userActivityLogsTable.userId, userId),
        ),
      )
      .orderBy(desc(userActivityLogsTable.createdAt))
      .limit(100);

    res.json(logs);
  },
);

export default router;
