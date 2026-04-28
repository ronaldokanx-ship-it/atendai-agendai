import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Roles: owner=dono (acesso total), supervisor=acesso gerencial, attendant=atendente, staff=alias de attendant (retrocompat), superadmin=administrador da plataforma
  role: text("role", { enum: ["owner", "supervisor", "attendant", "staff", "superadmin"] }).notNull().default("attendant"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
}).extend({
  password: z.string().min(6),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
