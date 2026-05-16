import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clinicsTable } from "./clinics";
import { servicesTable } from "./services";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinicsTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").references(() => servicesTable.id, { onDelete: "set null" }),
  professionalId: integer("professional_id"),
  patientId: integer("patient_id"),
  patientName: text("patient_name").notNull(),
  patientPhone: text("patient_phone").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  paymentIntentId: text("payment_intent_id"),
  // Mercado Pago: referência externa para vincular pagamento ao agendamento
  externalReference: text("external_reference"),
  // Status do pagamento: not_required | pending_payment | paid | expired | failed
  paymentStatus: text("payment_status").notNull().default("not_required"),
  // Valor cobrado (copiado do serviço no momento do agendamento)
  paymentAmount: numeric("payment_amount", { precision: 10, scale: 2 }),
  // Reserva expira em X minutos aguardando pagamento
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
