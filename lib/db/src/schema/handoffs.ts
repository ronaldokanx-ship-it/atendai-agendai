import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";
import { usersTable } from "./users";

/**
 * Handoff: representa uma sessão onde um atendente humano assumiu uma conversa do WhatsApp,
 * pausando o atendimento automático da IA. endedAt IS NULL = handoff ativo.
 */
export const handoffsTable = pgTable("handoffs", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientPhone: text("patient_phone").notNull(),
  attendantId: integer("attendant_id").references(() => usersTable.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/**
 * Mensagens trocadas durante um handoff. Inclui tanto mensagens recebidas do paciente (in)
 * quanto mensagens enviadas pelo atendente (out).
 */
export const handoffMessagesTable = pgTable("handoff_messages", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id")
    .notNull()
    .references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientPhone: text("patient_phone").notNull(),
  /** "in" = mensagem do paciente; "out" = mensagem do atendente */
  direction: text("direction", { enum: ["in", "out"] }).notNull(),
  content: text("content").notNull(),
  attendantId: integer("attendant_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHandoffSchema = createInsertSchema(handoffsTable).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});
export const insertHandoffMessageSchema = createInsertSchema(handoffMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type Handoff = typeof handoffsTable.$inferSelect;
export type InsertHandoff = z.infer<typeof insertHandoffSchema>;
export type HandoffMessage = typeof handoffMessagesTable.$inferSelect;
export type InsertHandoffMessage = z.infer<typeof insertHandoffMessageSchema>;
