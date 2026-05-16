import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";
import { servicesTable } from "./services";

export const professionalsTable = pgTable("professionals", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  specialty: text("specialty").notNull(),
  bio: text("bio"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const professionalServicesTable = pgTable("professional_services", {
  id: serial("id").primaryKey(),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => servicesTable.id, { onDelete: "cascade" }),
});

export const insertProfessionalSchema = createInsertSchema(professionalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;
export type Professional = typeof professionalsTable.$inferSelect;

export const insertProfessionalServiceSchema = createInsertSchema(professionalServicesTable).omit({ id: true });
export type InsertProfessionalService = z.infer<typeof insertProfessionalServiceSchema>;
export type ProfessionalService = typeof professionalServicesTable.$inferSelect;
