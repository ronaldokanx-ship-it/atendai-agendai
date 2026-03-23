import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";

export const aiLogsTable = pgTable("ai_logs", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  patientPhone: text("patient_phone").notNull(),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  tokensUsed: integer("tokens_used").notNull().default(0),
  messageType: text("message_type").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAiLogSchema = createInsertSchema(aiLogsTable).omit({ id: true, createdAt: true });
export type InsertAiLog = z.infer<typeof insertAiLogSchema>;
export type AiLog = typeof aiLogsTable.$inferSelect;
