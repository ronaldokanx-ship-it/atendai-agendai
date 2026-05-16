import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion, AnimatePresence } from "framer-motion"
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek,
  isSameDay, isSameMonth, isToday,
  addMonths, subMonths,
  parseISO,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ChevronLeft, ChevronRight,
  CalendarDays, LayoutList, Filter, X,
  Phone, CheckCircle, XCircle, Clock, Calendar,
  Search, Edit2,
} from "lucide-react"
import {
  useListAppointments,
  useListProfessionals,
  useListServices,
  useUpdateAppointment,
  getListAppointmentsQueryKey,
  type ListAppointmentsStatus,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { AppointmentSheet } from "@/components/AppointmentSheet"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const STATUS_CONFIG = {
  pending:   { label: "Pendente",   dot: "bg-amber-500"   },
  confirmed: { label: "Confirmado", dot: "bg-emerald-500" },
  canceled:  { label: "Cancelado",  dot: "bg-red-400"     },
} as const

export default function Appointments() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // View
  const [viewMode, setViewMode] = React.useState<"calendar" | "list">("calendar")

  // Appointment sheet
  const [openApptId, setOpenApptId] = React.useState<number | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = React.useState("")

  // Calendar navigation
  const [currentMonth, setCurrentMonth] = React.useState(new Date())
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(new Date())

  // Filters
  const [statusFilter, setStatusFilter] = React.useState<ListAppointmentsStatus | "all">("all")
  const [professionalFilter, setProfessionalFilter] = React.useState("all")
  const [serviceFilter, setServiceFilter] = React.useState("all")

  // Data — load everything, filter client-side so calendar dots stay accurate
  const { data: allAppointments = [], isLoading } = useListAppointments(CLINIC_ID)
  const { data: professionals = [] } = useListProfessionals(CLINIC_ID)
  const { data: services = [] } = useListServices(CLINIC_ID)
  const updateAppointment = useUpdateAppointment()

  // Filtered list
  const filtered = React.useMemo(() =>
    allAppointments.filter(apt => {
      if (statusFilter !== "all" && apt.status !== statusFilter) return false
      if (professionalFilter !== "all" && String(apt.professionalId) !== professionalFilter) return false
      if (serviceFilter !== "all" && String(apt.serviceId) !== serviceFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (!apt.patientName?.toLowerCase().includes(q) && !apt.patientPhone?.toLowerCase().includes(q)) return false
      }
      return true
    }),
    [allAppointments, statusFilter, professionalFilter, serviceFilter, searchQuery]
  )

  // Calendar grid: full weeks surrounding the month
  const calendarDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 })
    const end   = endOfWeek(endOfMonth(currentMonth),   { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const getAptsForDay = React.useCallback((day: Date) =>
    filtered.filter(apt => isSameDay(parseISO(apt.scheduledAt), day)),
    [filtered]
  )

  const selectedDayApts = React.useMemo(() =>
    selectedDay ? getAptsForDay(selectedDay) : [],
    [selectedDay, getAptsForDay]
  )

  // Month stats
  const monthApts = filtered.filter(apt => isSameMonth(parseISO(apt.scheduledAt), currentMonth))

  const handleStatusChange = (id: number, newStatus: ListAppointmentsStatus) => {
    updateAppointment.mutate(
      { clinicId: CLINIC_ID, id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey(CLINIC_ID) })
          toast({ title: "Status atualizado com sucesso" })
        },
      }
    )
  }

  const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case "confirmed": return <Badge variant="success"  className="gap-1"><CheckCircle className="w-3 h-3" /> Confirmado</Badge>
      case "pending":   return <Badge variant="warning"  className="gap-1"><Clock       className="w-3 h-3" /> Pendente</Badge>
      case "canceled":  return <Badge variant="destructive" className="gap-1"><XCircle  className="w-3 h-3" /> Cancelado</Badge>
      default:          return <Badge variant="outline">{status}</Badge>
    }
  }

  const hasFilters = statusFilter !== "all" || professionalFilter !== "all" || serviceFilter !== "all" || searchQuery !== ""

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Agendamentos</h1>
          <p className="text-muted-foreground mt-1">
            Visualize e gerencie os agendamentos criados pelo assistente de IA.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl border border-border/50 self-start sm:self-auto">
          <button
            onClick={() => setViewMode("calendar")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              viewMode === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="w-4 h-4" /> Calendário
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              viewMode === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutList className="w-4 h-4" /> Lista
          </button>
        </div>
      </div>

      <Card className="p-4 border-border/50 bg-background/50">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
            <Filter className="w-4 h-4" /> Filtros:
          </span>

          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar paciente..."
              className="h-8 pl-8 w-full text-sm bg-background"
            />
          </div>

          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as ListAppointmentsStatus | "all")}>
            <SelectTrigger className="h-8 text-sm bg-background w-[145px] sm:w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="confirmed">Confirmado</SelectItem>
              <SelectItem value="canceled">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="h-8 text-sm bg-background w-[155px] sm:w-[200px]">
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="h-8 text-sm bg-background w-[145px] sm:w-[200px]">
              <SelectValue placeholder="Serviço" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os serviços</SelectItem>
              {services.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => { setStatusFilter("all"); setProfessionalFilter("all"); setServiceFilter("all"); setSearchQuery("") }}
            >
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Month stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Neste mês",    value: monthApts.length,                                          colorValue: "text-blue-500",    bg: "bg-blue-500/10"    },
          { label: "Pendentes",    value: monthApts.filter(a => a.status === "pending").length,       colorValue: "text-amber-500",   bg: "bg-amber-500/10"   },
          { label: "Confirmados",  value: monthApts.filter(a => a.status === "confirmed").length,     colorValue: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Cancelados",   value: monthApts.filter(a => a.status === "canceled").length,      colorValue: "text-red-500",     bg: "bg-red-500/10"     },
        ].map(stat => (
          <Card key={stat.label} className="p-4 flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", stat.bg)}>
              <CalendarDays className={cn("w-5 h-5", stat.colorValue)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn("text-2xl font-bold font-display leading-none mt-0.5", stat.colorValue)}>{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Main content — calendar or list */}
      <AnimatePresence mode="wait">
        {viewMode === "calendar" ? (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start"
          >
            {/* Calendar grid */}
            <Card className="lg:col-span-2 overflow-hidden">
              {/* Month nav */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <button
                  onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-display font-semibold capitalize">
                    {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                  </h2>
                  <button
                    onClick={() => { setCurrentMonth(new Date()); setSelectedDay(new Date()) }}
                    className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    Hoje
                  </button>
                </div>
                <button
                  onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 bg-muted/30 border-b border-border/50">
                {WEEKDAYS.map(d => (
                  <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const dayApts     = getAptsForDay(day)
                  const inMonth     = isSameMonth(day, currentMonth)
                  const todayDay    = isToday(day)
                  const isSelected  = selectedDay ? isSameDay(day, selectedDay) : false
                  const pending     = dayApts.filter(a => a.status === "pending").length
                  const confirmed   = dayApts.filter(a => a.status === "confirmed").length
                  const canceled    = dayApts.filter(a => a.status === "canceled").length

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "min-h-[76px] p-2 text-left border-r border-b border-border/20 transition-colors",
                        !inMonth && "opacity-30",
                        isSelected && "bg-primary/10 border-primary/30 ring-inset ring-1 ring-primary/30",
                        todayDay && !isSelected && "bg-blue-50 dark:bg-blue-950/20",
                        inMonth && !isSelected && !todayDay && "hover:bg-muted/50",
                      )}
                    >
                      <span className={cn(
                        "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-semibold mb-1",
                        isSelected && "bg-primary text-primary-foreground",
                        todayDay && !isSelected && "bg-blue-500 text-white",
                      )}>
                        {format(day, "d")}
                      </span>

                      {dayApts.length > 0 && (
                        <div className="flex flex-wrap gap-0.5">
                          {pending   > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                          {confirmed > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                          {canceled  > 0 && <span className="w-2 h-2 rounded-full bg-red-400" />}
                          {dayApts.length > 4 && (
                            <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
                              +{dayApts.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 px-5 py-3 border-t border-border/50 bg-muted/20">
                <span className="text-xs text-muted-foreground">Legenda:</span>
                {Object.entries(STATUS_CONFIG).map(([, cfg]) => (
                  <span key={cfg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                ))}
              </div>
            </Card>

            {/* Day detail */}
            <Card className="flex flex-col overflow-hidden lg:sticky lg:top-8">
              <div className="px-5 py-4 border-b border-border/50 bg-muted/20 shrink-0">
                {selectedDay ? (
                  <>
                    <h3 className="font-display font-semibold text-base capitalize">
                      {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selectedDayApts.length === 0
                        ? "Nenhum agendamento"
                        : `${selectedDayApts.length} agendamento${selectedDayApts.length > 1 ? "s" : ""}`}
                    </p>
                  </>
                ) : (
                  <h3 className="font-display font-semibold text-base text-muted-foreground">
                    Selecione um dia
                  </h3>
                )}
              </div>

              <div className="overflow-y-auto max-h-[520px] p-3 space-y-3">
                {!selectedDay ? (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                    <Calendar className="w-10 h-10 mb-3 opacity-20" />
                    Clique em um dia no calendário
                  </div>
                ) : selectedDayApts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                    <Calendar className="w-10 h-10 mb-3 opacity-20" />
                    Nenhum agendamento neste dia
                  </div>
                ) : (
                  [...selectedDayApts]
                    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                    .map(apt => {
                      const svc  = services.find(s => s.id === apt.serviceId)
                      const prof = professionals.find(p => p.id === apt.professionalId)
                      return (
                        <div
                          key={apt.id}
                          onClick={() => setOpenApptId(apt.id)}
                          className={cn(
                            "rounded-xl border p-3 space-y-2 text-sm cursor-pointer group transition-shadow hover:shadow-md",
                            apt.status === "confirmed" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
                            apt.status === "pending"   && "border-amber-200  bg-amber-50/60  dark:border-amber-900  dark:bg-amber-950/20",
                            apt.status === "canceled"  && "border-red-200    bg-red-50/40    dark:border-red-900    dark:bg-red-950/10   opacity-70",
                          )}
                        >
                          {/* Time + patient */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">{apt.patientName}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" /> {apt.patientPhone}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-sm font-bold font-mono text-muted-foreground">
                                {format(parseISO(apt.scheduledAt), "HH:mm")}
                              </span>
                              <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>

                          {/* Service / professional badges */}
                          {(svc || prof) && (
                            <div className="flex flex-wrap gap-1.5">
                              {svc  && <Badge variant="secondary" className="text-xs py-0 h-5">{svc.name}</Badge>}
                              {prof && <Badge variant="outline"   className="text-xs py-0 h-5">{prof.name}</Badge>}
                            </div>
                          )}

                          {/* Notes */}
                          {apt.notes && (
                            <p className="text-xs text-muted-foreground bg-background/60 rounded-lg p-2 border border-border/50 italic">
                              "{apt.notes}"
                            </p>
                          )}

                          {/* Status + actions */}
                          <div className="flex items-center justify-between pt-0.5">
                            <StatusBadge status={apt.status} />
                            <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                              {apt.status !== "confirmed" && (
                                <Button
                                  size="sm" variant="outline"
                                  className="h-6 text-xs px-2 text-success hover:bg-success/10 border-success/20"
                                  onClick={() => handleStatusChange(apt.id, "confirmed")}
                                >
                                  Confirmar
                                </Button>
                              )}
                              {apt.status !== "canceled" && (
                                <Button
                                  size="sm" variant="outline"
                                  className="h-6 text-xs px-2 text-destructive hover:bg-destructive/10 border-destructive/20"
                                  onClick={() => handleStatusChange(apt.id, "canceled")}
                                >
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                )}
              </div>
            </Card>
          </motion.div>
        ) : (
          /* LIST VIEW */
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground uppercase">
                    <tr>
                      <th className="px-6 py-4 font-medium">Paciente</th>
                      <th className="px-6 py-4 font-medium">Data e Hora</th>
                      <th className="px-6 py-4 font-medium">Serviço / Profissional</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-t border-border/50">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                          <div className="animate-pulse flex flex-col items-center">
                            <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                            <div className="h-4 bg-muted rounded w-1/3" />
                          </div>
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-20" />
                          Nenhum agendamento encontrado.
                        </td>
                      </tr>
                    ) : (
                      [...filtered]
                        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
                        .map(apt => {
                          const svc  = services.find(s => s.id === apt.serviceId)
                          const prof = professionals.find(p => p.id === apt.professionalId)
                          return (
                            <tr
                              key={apt.id}
                              className="hover:bg-muted/30 transition-colors cursor-pointer group"
                              onClick={() => setOpenApptId(apt.id)}
                            >
                              <td className="px-6 py-4">
                                <div className="font-medium text-foreground group-hover:text-primary transition-colors">{apt.patientName}</div>
                                <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                                  <Phone className="w-3 h-3" /> {apt.patientPhone}
                                </div>
                              </td>
                              <td className="px-6 py-4 font-medium whitespace-nowrap">
                                {format(parseISO(apt.scheduledAt), "dd/MM/yyyy HH:mm")}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-0.5">
                                  {svc  && <span className="text-xs text-muted-foreground">{svc.name}</span>}
                                  {prof && <span className="text-xs font-medium">{prof.name}</span>}
                                  {!svc && !prof && <span className="text-xs text-muted-foreground italic">—</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4"><StatusBadge status={apt.status} /></td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                  {apt.status !== "confirmed" && (
                                    <Button
                                      size="sm" variant="outline"
                                      className="text-success hover:text-success hover:bg-success/10 border-success/20"
                                      onClick={() => handleStatusChange(apt.id, "confirmed")}
                                    >
                                      Confirmar
                                    </Button>
                                  )}
                                  {apt.status !== "canceled" && (
                                    <Button
                                      size="sm" variant="outline"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                      onClick={() => handleStatusChange(apt.id, "canceled")}
                                    >
                                      Cancelar
                                    </Button>
                                  )}
                                  <Button
                                    size="sm" variant="ghost"
                                    className="w-8 h-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => setOpenApptId(apt.id)}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Appointment sheet — opened on card/row click */}
      <AppointmentSheet
        appointment={allAppointments.find(a => a.id === openApptId) ?? null}
        clinicId={CLINIC_ID}
        onClose={() => setOpenApptId(null)}
      />
    </motion.div>
  )
}
