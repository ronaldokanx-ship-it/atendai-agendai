import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, clinicsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "../lib/activity-logger";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";
const TOKEN_EXPIRY = "7d";

type BusinessType = "medical" | "veterinary" | "dental" | "beauty" | "education" | "retail" | "food" | "technology" | "services" | "other";

const VALID_BUSINESS_TYPES: BusinessType[] = ["medical", "veterinary", "dental", "beauty", "education", "retail", "food", "technology", "services", "other"];

function validateRegister(body: unknown): { companyName: string; clinicType: BusinessType; ownerName: string; email: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.companyName !== "string" || b.companyName.trim().length < 2) return null;
  if (typeof b.ownerName !== "string" || b.ownerName.trim().length < 2) return null;
  if (typeof b.email !== "string" || !b.email.includes("@")) return null;
  if (typeof b.password !== "string" || b.password.length < 6) return null;
  const clinicType: BusinessType = VALID_BUSINESS_TYPES.includes(b.clinicType as BusinessType) ? (b.clinicType as BusinessType) : "other";
  return { companyName: b.companyName.trim(), clinicType, ownerName: b.ownerName.trim(), email: b.email.trim().toLowerCase(), password: b.password };
}

function validateLogin(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.email !== "string" || !b.email.includes("@")) return null;
  if (typeof b.password !== "string" || b.password.length === 0) return null;
  return { email: b.email.trim().toLowerCase(), password: b.password };
}

// POST /api/auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const data = validateRegister(req.body);
  if (!data) {
    res.status(400).json({ error: "Dados inválidos. Preencha todos os campos corretamente." });
    return;
  }

  const { companyName, clinicType, ownerName, email, password } = data;

  const existingUser = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    res.status(409).json({ error: "E-mail já cadastrado" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const apiKey = randomUUID();

  const result = await db.transaction(async (tx) => {
    const [clinic] = await tx.insert(clinicsTable).values({
      name: companyName,
      phone: `temp-${Date.now()}`,
      apiKey,
      clinicType,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      subscriptionStatus: "trial",
    }).returning({ id: clinicsTable.id, name: clinicsTable.name });

    const [user] = await tx.insert(usersTable).values({
      clinicId: clinic.id,
      name: ownerName,
      email,
      passwordHash,
      role: "owner",
    }).returning({ id: usersTable.id, name: usersTable.name, role: usersTable.role, clinicId: usersTable.clinicId });

    return { clinic, user };
  });

  const token = jwt.sign(
    { userId: result.user.id, clinicId: result.clinic.id, role: result.user.role, name: result.user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY },
  );

  res.status(201).json({ token, clinicId: result.clinic.id, name: result.user.name, role: result.user.role });
});

// POST /api/auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const data = validateLogin(req.body);
  if (!data) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { email, password } = data;

  const [user] = await db.select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || !user.active) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, clinicId: user.clinicId, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY },
  );

  // Registrar login no log de atividade (só para usuários de clínica)
  if (user.clinicId) {
    void logActivity(user.clinicId, user.id, "login", { email: user.email });
  }

  res.json({ token, clinicId: user.clinicId, name: user.name, role: user.role });
});

export default router;

