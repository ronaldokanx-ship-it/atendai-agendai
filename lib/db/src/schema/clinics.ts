import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicsTable = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  apiKey: text("api_key").notNull().unique(),
  aiName: text("ai_name").notNull().default("Assistente"),
  aiPersonalityPrompt: text("ai_personality_prompt").notNull().default("Você é uma assistente virtual prestativa e simpática."),
  knowledgeBase: text("knowledge_base").notNull().default(""),
  clinicType: text("clinic_type").notNull().default("medical"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
