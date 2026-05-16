import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { useHandoffs } from "@/contexts/handoffs"
import { motion } from "framer-motion"
import {
  Users,
  CalendarCheck,
  MessageCircle,
  Bot,
  Clock,
  AlertCircle,
  CalendarDays,
  Phone,
  CheckCircle,
  Headphones,
  ExternalLink,
  ListOrdered,
} from "lucide-react"
import {
  format, parseISO, isToday, isSameMonth, isFuture,
  formatDistanceToNow,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  useListAppointments,
  useListAiLogs,
  useGetClinic,
  useListPatients,
  useListServices,
  useListProfessionals,
} from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { AppointmentSheet } from "@/components/AppointmentSheet"
import { ConversationViewSheet } from "@/components/ConversationViewSheet"
import { cn } from "@/lib/utils"

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

export default function Dashboard() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!

  const { data: clinic } = useGetClinic(CLINIC_ID)
  const { data: appointments = [], isLoading: loadingApts } = useListAppointments(CLINIC_ID)
  const { data: aiLogs = [], isLoading: loadingLogs } = useListAiLogs(CLINIC_ID)
  const { data: patients = [] } = useListPatients(CLINIC_ID)
  const { data: services = [] } = useListServices(CLINIC_ID)
  const { data: professionals = [] } = useListProfessionals(CLINIC_ID)
  const { openHandoff, activePhones, openHandoffs } = useHandoffs()

  const [openApptId, setOpenApptId] = React.useState<number | null>(null)
  const [viewConversation, setViewConversation] = React.useState<{ phone: string; patientName?: string } | null>(null)

  const now = new Date()

  // Derived stats
  const todayApts = appointments.filter(a => isToday(parseISO(a.scheduledAt)))
  const pendingApts = appointments.filter(a => a.status === "pending")
  const monthConfirmed = appointments.filter(
    a => a.status === "confirmed" && isSameMonth(parseISO(a.scheduledAt), now)
  )

  // Next 5 upcoming (future, not cancelled)
  const upcomingApts = React.useMemo(() =>
    appointments
      .filter(a => isFuture(parseISO(a.scheduledAt)) && a.status !== "canceled")
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
      .slice(0, 5),
    [appointments]
  )

  // Last 5 AI interactions grouped by client
  const groupedInteractions = React.useMemo(() => {
    // Group by phone
    const map = new Map<string, typeof aiLogs>()
    for (const log of aiLogs) {
      const group = map.get(log.patientPhone) ?? []
      group.push(log)
      map.set(log.patientPhone, group)
    }
    // Sort groups by most recent message (desc)
    const groups = Array.from(map.entries())
      .map(([phone, logs]) => {
        const sorted = [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        const patient = patients.find((p) => p.phone === phone)
        return { phone, displayName: patient?.name ?? phone, lastLog: sorted[0], count: sorted.length }
      })
      .sort((a, b) => new Date(b.lastLog.createdAt).getTime() - new Date(a.lastLog.createdAt).getTime())
      .slice(0, 5)
    return groups
  }, [aiLogs, patients])

  const stats = [
    {
      title: "Hoje",
      value: todayApts.length,
      sub: `${todayApts.filter(a => a.status === "confirmed").length} confirmados`,
      icon: CalendarDays,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Pendentes",
      value: pendingApts.length,
      sub: "aguardando confirmação",
      icon: AlertCircle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      title: "Confirmados",
      value: monthConfirmed.length,
      sub: format(now, "MMMM", { locale: ptBR }),
      icon: CalendarCheck,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Clientes",
      value: patients.length,
      sub: "cadastrados",
      icon: Users,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground font-medium capitalize">
          {format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground mt-0.5">
          {getGreeting()}, {clinic?.name ?? "Clínica"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Aqui está o resumo de hoje.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{stat.title}</p>
                  {loadingApts ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className={cn("text-3xl font-bold font-display mt-1 leading-none", stat.color)}>
                      {stat.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1 capitalize">{stat.sub}</p>
                </div>
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", stat.bg)}>
                  <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Acesso rápido — Sistema de Filas */}
      <motion.a
        href="https://filas.kanxitsolutions.com.br/"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="group flex items-center gap-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all duration-200 px-5 py-4 cursor-pointer"
      >
        <div className="w-11 h-11 rounded-xl bg-primary/15 group-hover:bg-primary/25 flex items-center justify-center shrink-0 transition-colors">
          <ListOrdered className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
            Sistema de Filas — Recepção
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gerencie a fila de espera presencial da clínica
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary/70 group-hover:text-primary transition-colors shrink-0">
          <span className="hidden sm:block">Abrir sistema</span>
          <ExternalLink className="w-4 h-4" />
        </div>
      </motion.a>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming appointments */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Próximos Agendamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loadingApts ? (
              <div className="px-5 py-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : upcomingApts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                <CalendarCheck className="w-10 h-10 mb-3 opacity-20" />
                Sem próximos agendamentos.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {upcomingApts.map(apt => {
                  const svc  = services.find(s => s.id === apt.serviceId)
                  const prof = professionals.find(p => p.id === apt.professionalId)
                  const aptToday = isToday(parseISO(apt.scheduledAt))
                  return (
                    <div
                      key={apt.id}
                      onClick={() => setOpenApptId(apt.id)}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                    >
                      {/* Date chip */}
                      <div className={cn(
                        "flex flex-col items-center justify-center w-11 h-11 rounded-xl shrink-0",
                        aptToday ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground"
                      )}>
                        <span className="text-[10px] font-medium uppercase leading-none">
                          {format(parseISO(apt.scheduledAt), "MMM", { locale: ptBR })}
                        </span>
                        <span className="text-lg font-bold font-display leading-snug">
                          {format(parseISO(apt.scheduledAt), "d")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-tight group-hover:text-primary transition-colors truncate">
                          {apt.patientName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {format(parseISO(apt.scheduledAt), "HH:mm")}
                          {svc  && ` · ${svc.name}`}
                          {prof && ` · ${prof.name}`}
                        </p>
                      </div>

                      <Badge
                        variant={apt.status === "confirmed" ? "success" : "warning"}
                        className="shrink-0 text-xs"
                      >
                        {apt.status === "confirmed" ? "Confirmado" : "Pendente"}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending — requires attention */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Requer Atenção
              {pendingApts.length > 0 && (
                <Badge variant="warning" className="ml-auto text-xs">{pendingApts.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loadingApts ? (
              <div className="px-5 py-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : pendingApts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                <CheckCircle className="w-10 h-10 mb-3 text-emerald-400 opacity-50" />
                Tudo em dia! Sem pendências.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {pendingApts.slice(0, 6).map(apt => (
                  <div
                    key={apt.id}
                    onClick={() => setOpenApptId(apt.id)}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">
                        {apt.patientName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        {format(parseISO(apt.scheduledAt), "dd/MM · HH:mm")}
                        {isToday(parseISO(apt.scheduledAt)) && (
                          <span className="text-primary font-medium ml-1">· Hoje</span>
                        )}
                      </p>
                    </div>
                    <Badge variant="warning" className="shrink-0 text-xs">Pendente</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent AI interactions */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-500" />
            Últimas Interações com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLogs ? (
            <div className="px-5 py-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : groupedInteractions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <MessageCircle className="w-10 h-10 mb-3 opacity-20" />
              Nenhuma interação ainda.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {groupedInteractions.map(({ phone, displayName, lastLog, count }) => {
                const isAlreadyOpen = openHandoffs.some((h) => h.phone === phone)
                const isActive = activePhones.includes(phone)
                const canAssume = !isAlreadyOpen && openHandoffs.length < 3

                return (
                  <div
                    key={phone}
                    className="flex gap-3 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer group"
                    onClick={() => setViewConversation({ phone, patientName: displayName !== phone ? displayName : undefined })}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{displayName}</p>
                          {displayName !== phone && (
                            <span className="text-xs text-muted-foreground truncate hidden sm:block">{phone}</span>
                          )}
                          {count > 1 && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{count}</Badge>
                          )}
                          {isActive && (
                            <Badge variant="default" className="text-[10px] h-4 px-1.5 shrink-0 gap-1">
                              <Headphones className="w-2.5 h-2.5" />
                              Em atendimento
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(lastLog.createdAt), { locale: ptBR, addSuffix: true })}
                          </span>
                          <Button
                            size="sm"
                            variant={isAlreadyOpen ? "secondary" : "outline"}
                            className="h-7 text-xs gap-1.5"
                            disabled={!canAssume && !isAlreadyOpen}
                            onClick={() => {
                              if (!isAlreadyOpen) openHandoff(phone, displayName !== phone ? displayName : undefined)
                            }}
                          >
                            <Headphones className="w-3 h-3" />
                            {isAlreadyOpen ? "Aberto" : "Assumir"}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic line-clamp-1">
                        "{lastLog.userMessage}"
                      </p>
                      <p className="text-xs text-foreground/70 line-clamp-2 bg-muted/40 rounded-lg px-2.5 py-2 border border-border/40">
                        {lastLog.aiResponse}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appointment sheet */}
      <AppointmentSheet
        appointment={appointments.find(a => a.id === openApptId) ?? null}
        clinicId={CLINIC_ID}
        onClose={() => setOpenApptId(null)}
      />

      {/* Conversation view sheet (read-only, AI keeps running) */}
      <ConversationViewSheet
        phone={viewConversation?.phone ?? null}
        patientName={viewConversation?.patientName}
        clinicId={CLINIC_ID}
        onClose={() => setViewConversation(null)}
      />
    </motion.div>
  )
}
