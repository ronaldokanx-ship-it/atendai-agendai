import { pgTable, serial, integer, smallint, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { professionalsTable } from "./professionals";

/**
 * Agenda semanal de um profissional.
 * Cada linha representa uma faixa de horário num dia da semana.
 *
 * dayOfWeek: 0=Domingo, 1=Segunda … 6=Sábado
 * startMinute / endMinute: minutos desde meia-noite (ex: 8*60=480 = 08:00)
 * isBlock: false = janela de trabalho; true = bloqueio (ex: almoço)
 */
export const professionalSchedulesTable = pgTable("professional_schedules", {
  id: serial("id").primaryKey(),
  professionalId: integer("professional_id").notNull().references(() => professionalsTable.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),       // 0-6
  startMinute: smallint("start_minute").notNull(),    // 0-1439
  endMinute: smallint("end_minute").notNull(),        // 1-1440
  isBlock: boolean("is_block").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProfessionalScheduleSchema = createInsertSchema(professionalSchedulesTable).omit({ id: true, createdAt: true });
export type InsertProfessionalSchedule = z.infer<typeof insertProfessionalScheduleSchema>;
export type ProfessionalSchedule = typeof professionalSchedulesTable.$inferSelect;
