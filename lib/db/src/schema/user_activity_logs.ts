import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

export const userActivityLogsTable = pgTable("user_activity_logs", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),   // Ex: "login", "appointment_created", "handoff_started"
  details: text("details"),           // JSON string com contexto opcional (ex: paciente, horário)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserActivityLog = typeof userActivityLogsTable.$inferSelect;
