import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
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
  // Chave de API de IA externa (ex: OpenAI/Gemini própria da clínica) — armazenada cifrada em produção
  aiExternalApiKey: text("ai_external_api_key"),
  // Chave de integração com gateway de pagamento Asaas
  asaasApiKey: text("asaas_api_key"),
  // Chave de integração com Mercado Pago (Access Token)
  mercadoPagoAccessToken: text("mercado_pago_access_token"),
  // WhatsApp Business API (Meta Cloud) — ID do número de telefone cadastrado
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  // WhatsApp Business API (Meta Cloud) — token de acesso permanente
  whatsappAccessToken: text("whatsapp_access_token"),
  // Evolution API — nome da instância criada no Evolution API (ex: "clinica-1")
  evolutionInstanceName: text("evolution_instance_name"),
  // Controla se a IA responde automaticamente às mensagens do WhatsApp
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  // Controla se o módulo de agendamento está ativo para esta empresa
  schedulingEnabled: boolean("scheduling_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClinicSchema = createInsertSchema(clinicsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinicsTable.$inferSelect;
