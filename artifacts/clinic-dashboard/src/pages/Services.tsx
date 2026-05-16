import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Search, Plus, Edit2, Trash2, Clock, DollarSign, Activity,
  Briefcase, ToggleLeft, ToggleRight, CalendarDays, X, Save,
  CheckCircle2, XCircle, TrendingUp, Users,
} from "lucide-react"
import {
  useListServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  useListAppointments,
  useListProfessionals,
  getListServicesQueryKey,
  getListAppointmentsQueryKey,
  type Service,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { cn, formatCurrency } from "@/lib/utils"
import { AppointmentSheet } from "@/components/AppointmentSheet"

// ─── constantes ───────────────────────────────────────────────────────────────

const STATUS_PT: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pendente",   variant: "secondary"   },
  confirmed: { label: "Confirmado", variant: "default"     },
  canceled:  { label: "Cancelado",  variant: "destructive" },
}

// Paleta determinística baseada no id para cards
const CARD_COLORS = [
  "from-blue-500/10 to-indigo-500/10 border-blue-200/60",
  "from-emerald-500/10 to-teal-500/10 border-emerald-200/60",
  "from-violet-500/10 to-purple-500/10 border-violet-200/60",
  "from-amber-500/10 to-orange-500/10 border-amber-200/60",
  "from-rose-500/10 to-pink-500/10 border-rose-200/60",
  "from-cyan-500/10 to-sky-500/10 border-cyan-200/60",
]
const cardColor = (id: number) => CARD_COLORS[id % CARD_COLORS.length]

// ─── MiniStat ────────────────────────────────────────────────────────────────

function MiniStat({ icon: Icon, label, value, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string | number; color?: string
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border/50 rounded-xl px-4 py-3 min-w-0">
      <div className={cn("w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
        <p className="text-lg font-bold font-display leading-tight">{value}</p>
      </div>
    </div>
  )
}

// ─── ServiceSheet ─────────────────────────────────────────────────────────────

interface ServiceSheetProps {
  clinicId: number
  serviceId: number | null
  isNew: boolean
  onClose: () => void
  onDeleted: () => void
}

function ServiceSheet({ clinicId, serviceId, isNew, onClose, onDeleted }: ServiceSheetProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = React.useState(isNew)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [openApptId, setOpenApptId] = React.useState<number | null>(null)

  const enabled = !!serviceId && !isNew
  const { data: services = [] } = useListServices(clinicId, {
    query: { queryKey: getListServicesQueryKey(clinicId), enabled: true },
  })
  const service = services.find(s => s.id === serviceId) ?? null

  const { data: appointments, isLoading: isLoadingAppts } = useListAppointments(
    clinicId,
    { serviceId: serviceId ?? undefined },
    { query: { queryKey: getListAppointmentsQueryKey(clinicId, { serviceId: serviceId ?? undefined }), enabled } },
  )

  // Profissionais habilitados para este serviço (filtro via query param)
  const { data: linkedProfessionals = [] } = useListProfessionals(
    clinicId,
    { serviceId: serviceId ?? undefined },
    { query: { queryKey: [`/api/clinics/${clinicId}/professionals`, { serviceId: serviceId ?? undefined }], enabled } },
  )

  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const [form, setForm] = React.useState({
    name: "", description: "", price: "", durationMinutes: "30", active: true,
  })

  React.useEffect(() => {
    if (isNew) {
      setForm({ name: "", description: "", price: "", durationMinutes: "30", active: true })
      setIsEditing(true)
    } else if (service) {
      setForm({
        name: service.name,
        description: service.description ?? "",
        price: String(service.price),
        durationMinutes: String(service.durationMinutes),
        active: service.active,
      })
      setIsEditing(false)
    }
  }, [serviceId, isNew, service?.name, service?.active])

  const handleSave = async () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      price: parseFloat(form.price),
      durationMinutes: parseInt(form.durationMinutes, 10),
      active: form.active,
    }
    if (!payload.name || isNaN(payload.price) || isNaN(payload.durationMinutes)) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" })
      return
    }
    if (isNew) {
      createService.mutate({ clinicId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(clinicId) })
          toast({ title: "Serviço criado" }); onClose()
        },
        onError: () => toast({ title: "Erro ao criar serviço", variant: "destructive" }),
      })
    } else if (service) {
      updateService.mutate({ clinicId, id: service.id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(clinicId) })
          toast({ title: "Serviço atualizado" }); setIsEditing(false)
        },
        onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
      })
    }
  }

  const handleDelete = () => {
    if (!service) return
    deleteService.mutate({ clinicId, id: service.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(clinicId) })
        toast({ title: "Serviço excluído" }); onDeleted()
      },
    })
  }

  const handleToggleActive = () => {
    if (!service) return
    updateService.mutate({ clinicId, id: service.id, data: { active: !service.active } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(clinicId) }),
    })
  }

  const isOpen = isNew || !!serviceId

  return (
    <>
      <Sheet open={isOpen} onOpenChange={o => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
          {(isNew || service) && (
            <>
              {/* ── Header ── */}
              <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg font-bold truncate">
                      {isNew ? "Novo Serviço" : (service?.name ?? "")}
                    </SheetTitle>
                    <SheetDescription className="text-sm">
                      {isNew ? "Preencha os dados do serviço" : (service?.description || "Sem descrição")}
                    </SheetDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isNew && service && (
                      <button
                        onClick={handleToggleActive}
                        title={service.active ? "Desativar" : "Ativar"}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                          service.active
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                            : "bg-muted text-muted-foreground border-border hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200",
                        )}
                      >
                        {service.active
                          ? <><CheckCircle2 className="w-3.5 h-3.5" /> Ativo</>
                          : <><XCircle className="w-3.5 h-3.5" /> Inativo</>}
                      </button>
                    )}
                    {!isNew && !isEditing && (
                      <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="gap-1.5 h-8">
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick stats inline */}
                {!isNew && service && (
                  <div className="flex gap-3 mt-3 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      {service.durationMinutes} min
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      {formatCurrency(service.price)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
                      <Users className="w-3.5 h-3.5 text-violet-500" />
                      {linkedProfessionals.length} profissional{linkedProfessionals.length !== 1 ? "is" : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg">
                      <CalendarDays className="w-3.5 h-3.5 text-amber-500" />
                      {appointments?.length ?? 0} agendamento{(appointments?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </SheetHeader>

              {/* ── Tabs ── */}
              <Tabs defaultValue="dados" className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-6 mt-4 shrink-0 grid grid-cols-2">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  {!isNew && <TabsTrigger value="historico">Histórico</TabsTrigger>}
                </TabsList>

                {/* ── Tab: Dados ── */}
                <TabsContent value="dados" className="flex-1 overflow-y-auto px-6 pt-5 pb-6 space-y-5">
                  {isEditing ? (
                    <>
                      <div className="space-y-2">
                        <Label>Nome do serviço <span className="text-destructive">*</span></Label>
                        <Input
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Ex: Consulta, Corte, Sessão de Fisioterapia…"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Descrição <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                        <Textarea
                          value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Detalhe o que está incluído, indicações, diferenciais…"
                          className="resize-none min-h-[80px]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Preço (R$) <span className="text-destructive">*</span></Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={form.price}
                            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Duração (min) <span className="text-destructive">*</span></Label>
                          <Input
                            type="number" min="1"
                            value={form.durationMinutes}
                            onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">Serviço ativo</p>
                          <p className="text-xs text-muted-foreground">A IA pode oferecer e agendar este serviço</p>
                        </div>
                        <Switch
                          checked={form.active}
                          onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        {!isNew && (
                          <Button variant="ghost" className="flex-1" onClick={() => setIsEditing(false)}>
                            <X className="w-4 h-4 mr-1.5" /> Cancelar
                          </Button>
                        )}
                        <Button
                          className="flex-1 gap-1.5"
                          onClick={handleSave}
                          disabled={createService.isPending || updateService.isPending}
                        >
                          {(createService.isPending || updateService.isPending) ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : <Save className="w-4 h-4" />}
                          {isNew ? "Criar serviço" : "Salvar"}
                        </Button>
                      </div>
                    </>
                  ) : service ? (
                    <div className="space-y-5">
                      {service.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed italic bg-muted/30 rounded-lg px-4 py-3">
                          "{service.description}"
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1">
                          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Preço</p>
                          <p className="text-xl font-bold font-display text-emerald-600">{formatCurrency(service.price)}</p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-1">
                          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Duração</p>
                          <p className="text-xl font-bold font-display">{service.durationMinutes} <span className="text-sm font-normal">min</span></p>
                        </div>
                      </div>

                      {linkedProfessionals.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profissionais habilitados</p>
                          <div className="flex flex-wrap gap-2">
                            {linkedProfessionals.map(p => (
                              <span key={p.id} className="inline-flex items-center gap-1.5 text-xs bg-muted/60 border border-border/40 px-3 py-1.5 rounded-full">
                                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
                                  {p.name.charAt(0)}
                                </span>
                                {p.name} — {p.specialty}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-border/40">
                        <Button
                          variant="destructive" size="sm"
                          onClick={() => setDeleteOpen(true)}
                          className="gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" /> Excluir serviço
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>

                {/* ── Tab: Histórico ── */}
                {!isNew && (
                  <TabsContent value="historico" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                    {isLoadingAppts ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : !appointments?.length ? (
                      <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
                        <CalendarDays className="w-10 h-10 opacity-30" />
                        <p className="text-sm">Nenhum uso deste serviço registrado</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {[...appointments]
                            .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
                            .map(appt => (
                              <div
                                key={appt.id}
                                onClick={() => setOpenApptId(appt.id)}
                                className="p-3 rounded-lg border border-border/50 bg-muted/20 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{appt.patientName}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {format(new Date(appt.scheduledAt), "d MMM yyyy, HH:mm", { locale: ptBR })}
                                    </p>
                                  </div>
                                  <Badge variant={STATUS_PT[appt.status]?.variant ?? "outline"} className="text-xs shrink-0">
                                    {STATUS_PT[appt.status]?.label ?? appt.status}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                        </div>

                        <AppointmentSheet
                          clinicId={clinicId}
                          appointment={appointments?.find(a => a.id === openApptId) ?? null}
                          onClose={() => setOpenApptId(null)}
                        />
                      </>
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm delete */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço <strong>{service?.name}</strong> será removido. Agendamentos existentes não são afetados, mas a IA deixará de oferecer este serviço.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Services() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const { data: services = [], isLoading } = useListServices(CLINIC_ID)

  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<"all" | "active" | "inactive">("all")
  const [openSvcId, setOpenSvcId] = React.useState<number | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)

  // Stats
  const total    = services.length
  const ativos   = services.filter(s => s.active).length
  const inativos = total - ativos
  const totalRevenuePotential = services.filter(s => s.active).reduce((acc, s) => acc + Number(s.price), 0)

  const filtered = React.useMemo(() => {
    return services.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.description ?? "").toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus === "all" ? true : filterStatus === "active" ? s.active : !s.active
      return matchSearch && matchStatus
    })
  }, [services, search, filterStatus])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Serviços</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os produtos que a IA pode oferecer e agendar automaticamente.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Novo Serviço
        </Button>
      </div>

      {/* ── Stats ── */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat icon={Briefcase}    label="Total"   value={total}    color="text-primary" />
          <MiniStat icon={CheckCircle2} label="Ativos"  value={ativos}   color="text-emerald-600" />
          <MiniStat icon={XCircle}      label="Inativos" value={inativos} color="text-muted-foreground" />
          <MiniStat icon={TrendingUp}   label="Receita potencial" value={formatCurrency(totalRevenuePotential)} color="text-amber-500" />
        </div>
      )}

      {/* ── Filtros ── */}
      {!isLoading && total > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar serviço…"
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-sm gap-0.5">
            {(["all", "active", "inactive"] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterStatus(v)}
                className={cn(
                  "px-3 py-1.5 rounded-md font-medium transition-colors",
                  filterStatus === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "all" ? "Todos" : v === "active" ? "Ativos" : "Inativos"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(i => <div key={i} className="h-44 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : total === 0 ? (
        <Card className="p-14 text-center border-dashed border-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold">Nenhum serviço cadastrado</h3>
          <p className="text-muted-foreground mt-2 mb-6 max-w-xs mx-auto">
            Cadastre os serviços que sua empresa oferece para que a IA possa agendar automaticamente.
          </p>
          <Button onClick={() => setIsCreating(true)}>Criar primeiro serviço</Button>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhum serviço encontrado com esses filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {filtered.map((service, i) => (
              <ServiceCard
                key={service.id}
                service={service}
                index={i}
                onClick={() => setOpenSvcId(service.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Sheet */}
      <ServiceSheet
        clinicId={CLINIC_ID}
        serviceId={isCreating ? null : openSvcId}
        isNew={isCreating}
        onClose={() => { setIsCreating(false); setOpenSvcId(null) }}
        onDeleted={() => { setIsCreating(false); setOpenSvcId(null) }}
      />
    </motion.div>
  )
}

// ─── ServiceCard ──────────────────────────────────────────────────────────────

function ServiceCard({ service, index, onClick }: { service: Service; index: number; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card
        onClick={onClick}
        className={cn(
          "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md border bg-gradient-to-br",
          cardColor(service.id),
          !service.active && "opacity-60 grayscale-[30%]",
        )}
      >
        <div className="p-5 flex flex-col h-full gap-3">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <Badge
              variant={service.active ? "default" : "secondary"}
              className="text-xs shrink-0"
            >
              {service.active ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          {/* Name + description */}
          <div>
            <h3 className="font-bold font-display text-base leading-tight">{service.name}</h3>
            {service.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/30">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 text-primary" />
              {service.durationMinutes} min
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(service.price)}
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}


