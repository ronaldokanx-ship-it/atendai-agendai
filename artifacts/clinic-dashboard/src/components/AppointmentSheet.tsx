import * as React from "react"
import { format, isPast, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarDays, Clock, User, Briefcase, StickyNote,
  CheckCircle, XCircle, AlertCircle, Save, X, Edit2,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  useUpdateAppointment,
  useListProfessionals,
  useListServices,
  getListAppointmentsQueryKey,
  getGetPatientQueryKey,
  type Appointment,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

// ─── tipos ──────────────────────────────────────────────────────────────────────

interface AppointmentSheetProps {
  appointment: Appointment | null
  clinicId: number
  onClose: () => void
}

// ─── helpers ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: "Pendente",   icon: AlertCircle,   className: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"   },
  confirmed: { label: "Confirmado", icon: CheckCircle, className: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900" },
  canceled:  { label: "Cancelado",  icon: XCircle,     className: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900"         },
} as const

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── componente ─────────────────────────────────────────────────────────────────

export function AppointmentSheet({ appointment, clinicId, onClose }: AppointmentSheetProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const updateAppointment = useUpdateAppointment()

  const { data: professionals = [] } = useListProfessionals(clinicId)
  const { data: services = [] } = useListServices(clinicId)

  const [isEditing, setIsEditing] = React.useState(false)
  const [form, setForm] = React.useState({
    status: "" as string,
    professionalId: "" as string,
    notes: "" as string,
    date: "" as string,  // YYYY-MM-DD
    time: "" as string,  // HH:mm
  })

  const isFuture = React.useMemo(() => {
    if (!appointment) return false
    return appointment.status !== "canceled" && !isPast(parseISO(appointment.scheduledAt))
  }, [appointment])

  // Sincroniza o form ao abrir/trocar e também quando os dados retornam do servidor após invalidate
  React.useEffect(() => {
    if (appointment) {
      const dt = parseISO(appointment.scheduledAt)
      setForm(f => {
        // Não resetar se o usuário ainda está editando o mesmo agendamento
        if (isEditing) return f
        return {
          status: appointment.status,
          professionalId: appointment.professionalId != null ? String(appointment.professionalId) : "",
          notes: appointment.notes ?? "",
          date: format(dt, "yyyy-MM-dd"),
          time: format(dt, "HH:mm"),
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id, appointment?.scheduledAt, appointment?.status, appointment?.notes, appointment?.professionalId])

  const svc  = services.find(s => s.id === appointment?.serviceId)
  const prof = professionals.find(p => p.id === appointment?.professionalId)

  const statusCfg = STATUS_CONFIG[appointment?.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending

  const handleSave = async () => {
    if (!appointment) return
    const body: Record<string, unknown> = { notes: form.notes }

    if (isFuture) {
      body.status = form.status
      if (form.professionalId) body.professionalId = Number(form.professionalId)
      if (form.date && form.time) {
        // Monta ISO local sem conversão de fuso: YYYY-MM-DDTHH:mm:00
        body.scheduledAt = `${form.date}T${form.time}:00`
      }
    }

    try {
      await updateAppointment.mutateAsync({
        clinicId,
        id: appointment.id,
        data: body as Parameters<typeof updateAppointment.mutateAsync>[0]["data"],
      })
      // Invalida a lista de agendamentos (Professionals.tsx)
      queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey(clinicId) })
      // Invalida o detalhe do paciente se disponível (Patients.tsx)
      if (appointment.patientId != null) {
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(clinicId, appointment.patientId) })
      }
      toast({ title: "Agendamento atualizado" })
      setIsEditing(false)
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" })
    }
  }

  return (
    <Sheet open={!!appointment} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden">
        {appointment && (
          <>
            {/* ── Header ── */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg font-bold truncate">{appointment.patientName}</SheetTitle>
                  <SheetDescription className="text-sm">{appointment.patientPhone}</SheetDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isEditing && (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="gap-1.5 h-8">
                      <Edit2 className="w-3.5 h-3.5" />
                      {isFuture ? "Editar" : "Anotações"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <div className={cn(
                "mt-3 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium w-fit",
                statusCfg.className,
              )}>
                <statusCfg.icon className="w-4 h-4" />
                {statusCfg.label}
                {isFuture && <span className="text-xs opacity-70 ml-1">— agendamento futuro</span>}
              </div>
            </SheetHeader>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Info fixa */}
              <div className="space-y-4">
                <InfoRow
                  icon={CalendarDays}
                  label="Data e hora"
                  value={format(parseISO(appointment.scheduledAt), "EEEE, d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                />
                {svc && (
                  <InfoRow icon={Briefcase} label="Serviço"
                    value={`${svc.name} · ${svc.durationMinutes} min · R$ ${Number(svc.price).toFixed(2).replace(".", ",")}`}
                  />
                )}
                <InfoRow
                  icon={User}
                  label="Profissional"
                  value={prof?.name ?? <span className="italic text-muted-foreground">Não definido</span>}
                />
              </div>

              <div className="border-t border-border/50" />

              {/* Modo edição */}
              {isEditing ? (
                <div className="space-y-5">
                  {/* Editar status, data/hora e profissional — somente para futuros */}
                  {isFuture && (
                    <>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="confirmed">Confirmado</SelectItem>
                            <SelectItem value="canceled">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                            Data
                          </Label>
                          <Input
                            type="date"
                            value={form.date}
                            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            Horário
                          </Label>
                          <Input
                            type="time"
                            value={form.time}
                            onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                          />
                        </div>
                      </div>

                      {professionals.length > 0 && (
                        <div className="space-y-2">
                          <Label>Profissional responsável</Label>
                          <Select
                            value={form.professionalId}
                            onValueChange={v => setForm(f => ({ ...f, professionalId: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar profissional…" />
                            </SelectTrigger>
                            <SelectContent>
                              {professionals.map(p => (
                                <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.specialty}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Anotações — sempre editável */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <StickyNote className="w-4 h-4 text-amber-500" />
                      Anotações {!isFuture && <span className="text-muted-foreground text-xs">(consulta realizada)</span>}
                    </Label>
                    <Textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Observações, evolução, próximos passos…"
                      className="min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button variant="ghost" className="flex-1" onClick={() => setIsEditing(false)}>
                      <X className="w-4 h-4 mr-1.5" /> Cancelar
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={handleSave} disabled={updateAppointment.isPending}>
                      {updateAppointment.isPending
                        ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                appointment.notes ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <StickyNote className="w-3.5 h-3.5 text-amber-500" /> Anotações
                    </p>
                    <p className="text-sm leading-relaxed bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 italic">
                      "{appointment.notes}"
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Nenhuma anotação — clique em "{isFuture ? "Editar" : "Anotações"}" para adicionar.
                  </p>
                )
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
