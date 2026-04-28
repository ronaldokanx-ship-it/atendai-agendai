import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";

export interface AuthPayload {
  userId: number;
  clinicId: number | null;
  role: "owner" | "supervisor" | "attendant" | "staff" | "superadmin";
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação ausente" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== "owner") {
    res.status(403).json({ error: "Acesso restrito ao proprietário da empresa" });
    return;
  }
  next();
}

/** Permite owner e supervisor (acesso gerencial) */
export function requireOwnerOrSupervisor(req: Request, res: Response, next: NextFunction): void {
  const role = req.auth?.role;
  if (role !== "owner" && role !== "supervisor") {
    res.status(403).json({ error: "Acesso restrito ao proprietário ou supervisor" });
    return;
  }
  next();
}

/** Bloqueia apenas superadmin; permite qualquer usuário da clínica */
export function requireClinicUser(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role === "superadmin") {
    res.status(403).json({ error: "Superadmin não pode operar como usuário de clínica" });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== "superadmin") {
    res.status(403).json({ error: "Acesso restrito ao superadmin" });
    return;
  }
  next();
}

export function requireSameClinic(req: Request, res: Response, next: NextFunction): void {
  const paramClinicId = Number(req.params.clinicId);
  if (!paramClinicId || paramClinicId !== req.auth?.clinicId) {
    res.status(403).json({ error: "Acesso negado a esta clínica" });
    return;
  }
  next();
}