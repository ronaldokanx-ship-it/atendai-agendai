import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion } from "framer-motion"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Search, Plus, Edit2, Trash2, Activity, UserCheck, Stethoscope,
  CalendarDays, X, Save, Users, CheckCircle2, XCircle, Check,
  Briefcase, Clock, CalendarClock, Ban, PlusCircle,
} from "lucide-react"
import {
  useListProfessionals,
  useCreateProfessional,
  useUpdateProfessional,
  useDeleteProfessional,
  useGetProfessional,
  useSetProfessionalServices,
  useListServices,
  useListAppointments,
  useGetProfessionalSchedule,
  useSetProfessionalSchedule,
  getListProfessionalsQueryKey,
  getGetProfessionalQueryKey,
  getListAppointmentsQueryKey,
  getGetProfessionalScheduleQueryKey,
  type Professional,
  type Service,
  type ProfessionalScheduleEntry,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { AppointmentSheet } from "@/components/AppointmentSheet"

// ─── helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500",
]
const avatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length]
const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("")

const STATUS_PT: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pendente",    variant: "secondary" },
  confirmed: { label: "Confirmado",  variant: "default"   },
  canceled:  { label: "Cancelado",   variant: "destructive" },
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const DAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

function minutesToTime(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0")
  const m = (min % 60).toString().padStart(2, "0")
  return `${h}:${m}`
}
function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m ?? 0)
}

// ─── ScheduleTab ──────────────────────────────────────────────────────────────

interface ScheduleEntry {
  key: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
  isBlock: boolean
}

function ScheduleTab({ profId, clinicId }: { profId: number; clinicId: number }) {
  const { toast } = useToast()
  const queryKey = getGetProfessionalScheduleQueryKey(clinicId, profId)

  const { data: saved = [], isLoading } = useGetProfessionalSchedule(clinicId, profId, {
    query: { queryKey },
  })

  const setSchedule = useSetProfessionalSchedule()

  // Local state — list of entries
  const [entries, setEntries] = React.useState<ScheduleEntry[]>([])
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    if (!isLoading) {
      setEntries(
        saved.map((e, i) => ({
          key: `s-${i}-${e.dayOfWeek}-${e.startMinute}`,
          dayOfWeek: e.dayOfWeek,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          isBlock: e.isBlock,
        }))
      )
      setDirty(false)
    }
  }, [saved, isLoading])

  const addEntry = (dayOfWeek: number, isBlock = false) => {
    const key = `new-${Date.now()}`
    if (isBlock) {
      setEntries(prev => [
        ...prev,
        { key, dayOfWeek, startMinute: 12 * 60, endMinute: 13 * 60, isBlock: true },
      ])
    } else {
      setEntries(prev => [
        ...prev,
        { key, dayOfWeek, startMinute: 8 * 60, endMinute: 17 * 60, isBlock: false },
      ])
    }
    setDirty(true)
  }

  const updateEntry = (key: string, changes: Partial<Omit<ScheduleEntry, "key">>) => {
    setEntries(prev => prev.map(e => e.key === key ? { ...e, ...changes } : e))
    setDirty(true)
  }

  const removeEntry = (key: string) => {
    setEntries(prev => prev.filter(e => e.key !== key))
    setDirty(true)
  }

  const handleSave = async () => {
    // Validate: start < end
    const invalid = entries.find(e => e.startMinute >= e.endMinute)
    if (invalid) {
      toast({ title: "Horário inválido", description: `${DAYS_FULL[invalid.dayOfWeek]}: hora de início deve ser antes da hora de fim.`, variant: "destructive" })
      return
    }
    try {
      await setSchedule.mutateAsync({
        clinicId,
        id: profId,
        data: { entries: entries.map(({ key: _k, ...e }) => e) },
      })
      setDirty(false)
      toast({ title: "Agenda salva com sucesso" })
    } catch {
      toast({ title: "Erro ao salvar agenda", variant: "destructive" })
    }
  }

  // Group by day for display — must be before any early return (Rules of Hooks)
  const byDay = React.useMemo(() => {
    const map: Record<number, ScheduleEntry[]> = {}
    for (const e of entries) {
      if (!map[e.dayOfWeek]) map[e.dayOfWeek] = []
      map[e.dayOfWeek].push(e)
    }
    return map
  }, [entries])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const workDays = [1, 2, 3, 4, 5] // Mon-Fri shown first
  const allDays = [1, 2, 3, 4, 5, 6, 0] // Mon…Sat,Sun

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="text-sm text-muted-foreground">
        Configure os dias e horários de atendimento. Adicione <span className="font-medium text-foreground">janelas de trabalho</span> e marque <span className="font-medium text-amber-600">bloqueios</span> como hora do almoço ou intervalos.
      </div>

      {/* Quick add work week */}
      {entries.length === 0 && (
        <button
          type="button"
          onClick={() => {
            const newEntries: ScheduleEntry[] = workDays.map((d, i) => ({
              key: `quick-${i}`,
              dayOfWeek: d,
              startMinute: 8 * 60,
              endMinute: 18 * 60,
              isBlock: false,
            }))
            setEntries(newEntries)
            setDirty(true)
          }}
          className="w-full border border-dashed border-border rounded-lg py-4 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/30 transition-colors flex items-center justify-center gap-2"
        >
          <CalendarClock className="w-4 h-4" />
          Preencher semana padrão (Seg–Sex, 08:00–18:00)
        </button>
      )}

      {/* Day sections */}
      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        {allDays.map(day => {
          const dayEntries = byDay[day] ?? []
          const hasWork = dayEntries.some(e => !e.isBlock)
          return (
            <div key={day} className={cn(
              "rounded-xl border transition-colors",
              hasWork ? "border-border bg-card" : "border-border/40 bg-muted/10",
            )}>
              {/* Day header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center",
                    hasWork ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {DAYS[day]}
                  </span>
                  <span className="text-sm font-medium">{DAYS_FULL[day]}</span>
                  {!hasWork && <span className="text-xs text-muted-foreground">(folga)</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => addEntry(day, false)}
                      >
                        <PlusCircle className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Adicionar janela de trabalho</TooltipContent>
                  </Tooltip>
                  {hasWork && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                          onClick={() => addEntry(day, true)}
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Adicionar bloqueio (almoço, intervalo…)</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Entries */}
              {dayEntries.length > 0 && (
                <div className="px-3 py-2 space-y-2">
                  {[...dayEntries].sort((a, b) => a.startMinute - b.startMinute).map(entry => (
                    <div
                      key={entry.key}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 border",
                        entry.isBlock
                          ? "bg-amber-50/60 border-amber-200/70 dark:bg-amber-950/20 dark:border-amber-800/40"
                          : "bg-primary/5 border-primary/20",
                      )}
                    >
                      {entry.isBlock ? (
                        <Ban className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                      )}
                      <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
                        {entry.isBlock ? "Bloqueio" : "Trabalho"}
                      </span>
                      <input
                        type="time"
                        value={minutesToTime(entry.startMinute)}
                        onChange={e => updateEntry(entry.key, { startMinute: timeToMinutes(e.target.value) })}
                        className="text-sm font-mono bg-transparent border-0 outline-none w-20 cursor-pointer"
                      />
                      <span className="text-muted-foreground text-xs">até</span>
                      <input
                        type="time"
                        value={minutesToTime(entry.endMinute)}
                        onChange={e => updateEntry(entry.key, { endMinute: timeToMinutes(e.target.value) })}
                        className="text-sm font-mono bg-transparent border-0 outline-none w-20 cursor-pointer"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removeEntry(entry.key)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={!dirty || setSchedule.isPending}
        className={cn("w-full gap-1.5 transition-all", dirty ? "opacity-100" : "opacity-50")}
      >
        {setSchedule.isPending
          ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <Save className="w-4 h-4" />}
        {dirty ? "Salvar agenda" : "Agenda salva"}
      </Button>
    </div>
  )
}

// ─── InfoField ────────────────────────────────────────────────────────────────

function InfoField({
  label, value, children,
}: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      {children ?? <p className="text-sm">{value ?? "—"}</p>}
    </div>
  )
}

// ─── MiniStat ─────────────────────────────────────────────────────────────────

function MiniStat({ label, value, icon: Icon, colorClass = "text-primary bg-primary/10" }: {
  label: string; value: number | string;
  icon: React.ElementType; colorClass?: string
}) {
  return (
    <Card className="p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", colorClass)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </Card>
  )
}

// ─── ProfessionalSheet ────────────────────────────────────────────────────────

interface ProfessionalSheetProps {
  clinicId: number
  profId: number | null
  isNew: boolean
  allServices: Service[]
  onClose: () => void
  onDeleted: (id: number) => void
}

function ProfessionalSheet({ clinicId, profId, isNew, allServices, onClose, onDeleted }: ProfessionalSheetProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = React.useState(isNew)

  const enabled = !!profId && !isNew
  const { data: detail, isLoading } = useGetProfessional(clinicId, profId ?? 0, {
    query: { queryKey: getGetProfessionalQueryKey(clinicId, profId ?? 0), enabled },
  })
  const { data: appointments, isLoading: isLoadingAppts } = useListAppointments(
    clinicId,
    { professionalId: profId ?? undefined },
    { query: { queryKey: getListAppointmentsQueryKey(clinicId, { professionalId: profId ?? undefined }), enabled } },
  )

  const createProf = useCreateProfessional()
  const updateProf = useUpdateProfessional()
  const deleteProf = useDeleteProfessional()
  const setServices = useSetProfessionalServices()

  const [form, setForm] = React.useState({
    name: "", specialty: "", bio: "", active: true, serviceIds: [] as number[],
  })

  const [openApptId, setOpenApptId] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (isNew) {
      setForm({ name: "", specialty: "", bio: "", active: true, serviceIds: [] })
      setIsEditing(true)
    } else if (detail) {
      setForm({
        name: detail.name,
        specialty: detail.specialty,
        bio: detail.bio ?? "",
        active: detail.active,
        serviceIds: detail.serviceIds,
      })
    }
  }, [isNew, detail])

  const isSaving =
    createProf.isPending || updateProf.isPending || setServices.isPending

  const serviceMap = React.useMemo(() => {
    const m: Record<number, Service> = {}
    allServices.forEach(s => { m[s.id] = s })
    return m
  }, [allServices])

  const handleSaveProfile = async () => {
    if (!form.name.trim() || !form.specialty.trim()) {
      toast({ title: "Nome e especialidade são obrigatórios", variant: "destructive" })
      return
    }
    try {
      if (isNew) {
        await createProf.mutateAsync({
          clinicId,
          data: {
            name: form.name.trim(),
            specialty: form.specialty.trim(),
            bio: form.bio.trim() || undefined,
            active: form.active,
            serviceIds: form.serviceIds,
          },
        })
        toast({ title: "Profissional cadastrado com sucesso" })
        queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(clinicId) })
        onClose()
      } else if (profId) {
        await updateProf.mutateAsync({
          clinicId, id: profId,
          data: {
            name: form.name.trim(),
            specialty: form.specialty.trim(),
            bio: form.bio.trim() || undefined,
            active: form.active,
          },
        })
        queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(clinicId) })
        queryClient.invalidateQueries({ queryKey: getGetProfessionalQueryKey(clinicId, profId) })
        toast({ title: "Dados atualizados" })
        setIsEditing(false)
      }
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" })
    }
  }

  const handleSaveServices = async () => {
    if (!profId) return
    try {
      await setServices.mutateAsync({ clinicId, id: profId, data: { serviceIds: form.serviceIds } })
      queryClient.invalidateQueries({ queryKey: getGetProfessionalQueryKey(clinicId, profId) })
      toast({ title: "Serviços atualizados" })
    } catch {
      toast({ title: "Erro ao salvar serviços", variant: "destructive" })
    }
  }

  const handleDelete = () => {
    if (!profId) return
    deleteProf.mutate({ clinicId, id: profId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(clinicId) })
        toast({ title: "Profissional removido" })
        onDeleted(profId)
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    })
  }

  const open = isNew || !!profId

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {!isNew && detail && (
                <div className={cn(
                  "w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
                  avatarColor(detail.id)
                )}>
                  {initials(detail.name)}
                </div>
              )}
              <div className="min-w-0">
                <SheetTitle className="text-lg font-bold truncate">
                  {isNew ? "Novo Profissional" : (detail?.name ?? "Carregando…")}
                </SheetTitle>
                {!isNew && detail && (
                  <SheetDescription className="text-sm truncate">{detail.specialty}</SheetDescription>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isNew && !isEditing && (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="gap-1.5 h-8">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
              {!isNew && profId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover profissional?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação removerá <strong>{detail?.name}</strong> e todos os vínculos com serviços. Os agendamentos existentes não serão afetados.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        {isLoading && !isNew ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="perfil" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-6 mt-4 shrink-0">
              <TabsTrigger value="perfil" className="flex-1">Perfil</TabsTrigger>
              {!isNew && <TabsTrigger value="servicos" className="flex-1">Serviços</TabsTrigger>}
              {!isNew && <TabsTrigger value="horarios" className="flex-1"><CalendarClock className="w-3.5 h-3.5 mr-1" />Horários</TabsTrigger>}
              {!isNew && <TabsTrigger value="agenda" className="flex-1">Agenda</TabsTrigger>}
            </TabsList>

            {/* ── TAB: Perfil ── */}
            <TabsContent value="perfil" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-name">Nome completo *</Label>
                    <Input id="s-name" value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Ex: Dr. Carlos Silva" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-specialty">Especialidade / Cargo *</Label>
                    <Input id="s-specialty" value={form.specialty}
                      onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))}
                      placeholder="Ex: Cardiologista, Cabeleireiro, Advogado…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-bio">Apresentação <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                    <Textarea id="s-bio" value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder="Breve apresentação exibida como referência para o atendimento…"
                      className="resize-none h-24" />
                  </div>
                  {isNew && allServices.length > 0 && (
                    <div className="space-y-2 border-t border-border/50 pt-4">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <Stethoscope className="w-4 h-4 text-primary" /> Serviços realizados
                      </Label>
                      <div className="grid gap-2 max-h-40 overflow-y-auto pr-1">
                        {allServices.map(s => (
                          <div key={s.id}
                            className={cn("flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer",
                              form.serviceIds.includes(s.id)
                                ? "border-primary/50 bg-primary/5"
                                : "border-border/50 bg-muted/20 hover:bg-muted/40"
                            )}
                            onClick={() => setForm(f => ({
                              ...f,
                              serviceIds: f.serviceIds.includes(s.id)
                                ? f.serviceIds.filter(x => x !== s.id)
                                : [...f.serviceIds, s.id],
                            }))}
                          >
                            <Checkbox checked={form.serviceIds.includes(s.id)}
                              onCheckedChange={() => {}} className="pointer-events-none" />
                            <span className="flex-1 text-sm font-medium">{s.name}</span>
                            <span className="text-xs text-muted-foreground">{s.durationMinutes} min</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 border-t border-border/50 pt-4">
                    <Switch id="s-active" checked={form.active}
                      onCheckedChange={c => setForm(f => ({ ...f, active: c }))} />
                    <Label htmlFor="s-active" className="cursor-pointer">Ativo para agendamentos</Label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="ghost" className="flex-1"
                      onClick={() => { if (isNew) onClose(); else setIsEditing(false) }}>
                      <X className="w-4 h-4 mr-1.5" /> Cancelar
                    </Button>
                    <Button className="flex-1 gap-1.5" onClick={handleSaveProfile} disabled={isSaving}>
                      {isSaving
                        ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                      {isNew ? "Cadastrar" : "Salvar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <InfoField label="Nome" value={detail?.name} />
                  <InfoField label="Especialidade / Cargo" value={detail?.specialty} />
                  {detail?.bio && <InfoField label="Apresentação" value={detail.bio} />}
                  <InfoField label="Status">
                    <div className="flex items-center gap-2 mt-0.5">
                      {detail?.active ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={cn("text-sm font-medium", detail?.active ? "text-emerald-600" : "text-muted-foreground")}>
                        {detail?.active ? "Ativo e disponível para agendamentos" : "Inativo — fora da agenda"}
                      </span>
                    </div>
                  </InfoField>
                  <InfoField label="Cadastrado em"
                    value={detail ? format(new Date(detail.createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : undefined} />
                  <InfoField label="Última atualização"
                    value={detail ? formatDistanceToNow(new Date(detail.updatedAt), { addSuffix: true, locale: ptBR }) : undefined} />
                </div>
              )}
            </TabsContent>

            {/* ── TAB: Serviços ── */}
            {!isNew && (
              <TabsContent value="servicos" className="flex-1 overflow-y-auto px-6 pt-4 pb-6 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Selecione os serviços que este profissional realiza. A IA usará esses vínculos para sugerir agendamentos.
                </p>
                {allServices.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                    <Stethoscope className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Nenhum serviço cadastrado na clínica.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 flex-1">
                      {allServices.map(s => {
                        const checked = form.serviceIds.includes(s.id)
                        return (
                          <div key={s.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
                              checked ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20 hover:bg-muted/40",
                            )}
                            onClick={() => setForm(f => ({
                              ...f,
                              serviceIds: checked
                                ? f.serviceIds.filter(x => x !== s.id)
                                : [...f.serviceIds, s.id],
                            }))}
                          >
                            <Checkbox checked={checked}
                              onCheckedChange={() => {}} className="pointer-events-none" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{s.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.durationMinutes} min · R$ {Number(s.price).toFixed(2).replace(".", ",")}
                              </p>
                            </div>
                            {checked && <Check className="w-4 h-4 text-primary shrink-0" />}
                          </div>
                        )
                      })}
                    </div>
                    <Button onClick={handleSaveServices} disabled={setServices.isPending} className="w-full gap-1.5">
                      {setServices.isPending
                        ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <Save className="w-4 h-4" />}
                      Salvar serviços
                    </Button>
                  </>
                )}
              </TabsContent>
            )}

            {/* ── TAB: Horários ── */}
            {!isNew && (
              <TabsContent value="horarios" className="flex-1 overflow-hidden px-6 pt-4 pb-6 flex flex-col">
                <ScheduleTab profId={profId!} clinicId={clinicId} />
              </TabsContent>
            )}

            {/* ── TAB: Agendamentos ── */}
            {!isNew && (
              <TabsContent value="agenda" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                {isLoadingAppts ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : !appointments?.length ? (
                  <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
                    <CalendarDays className="w-10 h-10 opacity-30" />
                    <p className="text-sm">Nenhum agendamento registrado</p>
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
                              {appt.serviceId != null && serviceMap[appt.serviceId] && (
                                <p className="text-xs text-muted-foreground mt-0.5">{serviceMap[appt.serviceId].name}</p>
                              )}
                            </div>
                            <Badge
                              variant={STATUS_PT[appt.status]?.variant ?? "outline"}
                              className="text-xs shrink-0"
                            >
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
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Professionals() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const deleteProf = useDeleteProfessional()

  const { data: professionals, isLoading } = useListProfessionals(CLINIC_ID)
  const { data: services = [] } = useListServices(CLINIC_ID)

  const [search, setSearch] = React.useState("")
  const [filterStatus, setFilterStatus] = React.useState<"all" | "active" | "inactive">("all")
  const [sortBy, setSortBy] = React.useState<"name" | "recent">("name")

  const [openProfId, setOpenProfId] = React.useState<number | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [deleteProfId, setDeleteProfId] = React.useState<number | null>(null)

  const filtered = React.useMemo(() => {
    let list = professionals ?? []
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.specialty.toLowerCase().includes(q)
      )
    }
    if (filterStatus === "active")   list = list.filter(p => p.active)
    if (filterStatus === "inactive") list = list.filter(p => !p.active)
    if (sortBy === "name")   list = [...list].sort((a, b) => a.name.localeCompare(b.name, "pt"))
    if (sortBy === "recent") list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return list
  }, [professionals, search, filterStatus, sortBy])

  const stats = React.useMemo(() => ({
    total:    professionals?.length ?? 0,
    active:   professionals?.filter(p => p.active).length ?? 0,
    inactive: professionals?.filter(p => !p.active).length ?? 0,
  }), [professionals])

  const profToDelete = React.useMemo(
    () => professionals?.find(p => p.id === deleteProfId),
    [professionals, deleteProfId],
  )

  const handleDeleteConfirm = () => {
    if (!deleteProfId) return
    deleteProf.mutate({ clinicId: CLINIC_ID, id: deleteProfId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(CLINIC_ID) })
        toast({ title: "Profissional removido" })
        setDeleteProfId(null)
      },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    })
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Equipe</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os profissionais e os serviços que a IA pode oferecer e agendar.
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="gap-2 shadow-md hover:shadow-lg transition-shadow">
            <Plus className="w-5 h-5" /> Adicionar Profissional
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MiniStat label="Total de profissionais" value={stats.total} icon={Users} />
          <MiniStat label="Ativos" value={stats.active} icon={CheckCircle2}
            colorClass="text-emerald-600 bg-emerald-500/10" />
          <MiniStat label="Inativos" value={stats.inactive} icon={XCircle}
            colorClass="text-muted-foreground bg-muted" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou especialidade…"
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Somente ativos</SelectItem>
              <SelectItem value="inactive">Somente inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome A–Z</SelectItem>
              <SelectItem value="recent">Mais recentes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-2 bg-background/50">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <UserCheck className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold">
              {search || filterStatus !== "all"
                ? "Nenhum resultado encontrado"
                : "Nenhum profissional cadastrado"}
            </h3>
            <p className="text-muted-foreground mt-2 mb-6">
              {search || filterStatus !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Adicione sua equipe para que a IA possa agendar atendimentos."}
            </p>
            {!search && filterStatus === "all" && (
              <Button onClick={() => setIsCreating(true)} variant="outline">
                Adicionar Profissional
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((prof, index) => (
              <motion.div
                key={prof.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card
                  className="relative flex flex-col h-full hover:shadow-lg transition-all duration-300 group border-border/50 overflow-hidden cursor-pointer"
                  onClick={() => setOpenProfId(prof.id)}
                >
                  {/* Quick actions */}
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={e => { e.stopPropagation(); setOpenProfId(prof.id) }}
                          className="p-1.5 bg-background/90 backdrop-blur rounded-lg border hover:bg-accent shadow-sm transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Editar</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteProfId(prof.id) }}
                          className="p-1.5 bg-background/90 backdrop-blur rounded-lg border text-destructive hover:bg-destructive hover:text-destructive-foreground shadow-sm transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Remover</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="p-6 flex-1 flex flex-col gap-4">
                    {/* Avatar + name */}
                    <div className="flex items-start gap-4 pr-16">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0",
                        avatarColor(prof.id)
                      )}>
                        {initials(prof.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold font-display leading-tight truncate">{prof.name}</h3>
                        <Badge variant="secondary" className="mt-1.5 font-medium bg-secondary/50 max-w-full">
                          <span className="truncate">{prof.specialty}</span>
                        </Badge>
                      </div>
                    </div>

                    {/* Bio */}
                    {prof.bio && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {prof.bio}
                      </p>
                    )}

                    {/* Footer info */}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm">
                        {prof.active ? (
                          <Activity className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={cn("font-medium text-xs", prof.active ? "text-emerald-600" : "text-muted-foreground")}>
                          {prof.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Desde {format(new Date(prof.createdAt), "MMM yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Sheet lateral */}
        {(isCreating || openProfId !== null) && (
          <ProfessionalSheet
            clinicId={CLINIC_ID}
            profId={openProfId}
            isNew={isCreating}
            allServices={services}
            onClose={() => { setOpenProfId(null); setIsCreating(false) }}
            onDeleted={() => { setOpenProfId(null) }}
          />
        )}

        {/* AlertDialog de exclusão via card */}
        <AlertDialog open={!!deleteProfId} onOpenChange={(o) => !o && setDeleteProfId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover profissional?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação removerá <strong>{profToDelete?.name}</strong> e todos os vínculos com serviços.
                Os agendamentos existentes não serão afetados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </TooltipProvider>
  )
}

