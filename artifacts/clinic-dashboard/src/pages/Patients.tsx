import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion, AnimatePresence } from "framer-motion"
import { format, formatDistanceToNow, differenceInYears } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Search, Users, Phone, Mail, Trash2, FileText, MessageSquare,
  Plus, Bot, Edit2, Save, X, ChevronDown, CalendarDays,
  ArrowUpDown, UserCheck, Cake, StickyNote, Activity, Mic,
} from "lucide-react"
import {
  useListPatients,
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
  useGetPatient,
  getListPatientsQueryKey,
  getGetPatientQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
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
import { cn, isLidJid, formatPhone } from "@/lib/utils"
import { AppointmentSheet } from "@/components/AppointmentSheet"

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_PT: Record<string, { label: string; variant: "success" | "destructive" | "outline" | "secondary" }> = {
  confirmed: { label: "Confirmado",  variant: "success" },
  canceled:  { label: "Cancelado",   variant: "destructive" },
  pending:   { label: "Pendente",    variant: "secondary" },
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  return differenceInYears(new Date(), new Date(dob))
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase()
}

// ─── Componente de avatar com cor determinística ───────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-indigo-500", "bg-teal-500", "bg-orange-500",
]
function avatarColor(id: number) { return AVATAR_COLORS[id % AVATAR_COLORS.length] }

// ─── Main Component ────────────────────────────────────────────────────────────
export default function Patients() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [searchTerm, setSearchTerm] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [sortBy, setSortBy] = React.useState<"name" | "recent">("name")
  const [selectedPatientId, setSelectedPatientId] = React.useState<number | null>(null)
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const { data: patients, isLoading } = useListPatients(CLINIC_ID, {
    search: debouncedSearch || undefined,
  })

  const sorted = React.useMemo(() => {
    if (!patients) return []
    const copy = [...patients]
    if (sortBy === "recent") copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return copy
  }, [patients, sortBy])

  const stats = React.useMemo(() => {
    if (!patients) return null
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonth = patients.filter(p => new Date(p.createdAt) >= monthStart).length
    const withNotes = patients.filter(p => !!p.notes).length
    return { total: patients.length, thisMonth, withNotes }
  }, [patients])

  const createPatient = useCreatePatient()
  const deletePatient = useDeletePatient()

  // ── Create form ──
  const [createData, setCreateData] = React.useState({ name: "", phone: "", email: "", dateOfBirth: "", notes: "" })

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createPatient.mutate(
      { clinicId: CLINIC_ID, data: createData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey(CLINIC_ID) })
          setIsCreateOpen(false)
          setCreateData({ name: "", phone: "", email: "", dateOfBirth: "", notes: "" })
          toast({ title: "Paciente cadastrado com sucesso!" })
        },
        onError: () => toast({ title: "Erro ao cadastrar paciente", variant: "destructive" }),
      },
    )
  }

  const handleDelete = (id: number) => {
    deletePatient.mutate(
      { clinicId: CLINIC_ID, id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey(CLINIC_ID) })
          setSelectedPatientId(null)
          toast({ title: "Paciente excluído." })
        },
        onError: () => toast({ title: "Erro ao excluir paciente", variant: "destructive" }),
      },
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground mt-1">Base de clientes, histórico e interações com a IA.</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow-sm self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Novo Paciente
        </Button>
      </div>

      {/* ── Stats bar ── */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Users className="w-4 h-4 text-primary" />, label: "Total", value: stats.total },
            { icon: <UserCheck className="w-4 h-4 text-emerald-500" />, label: "Novos este mês", value: stats.thisMonth },
            { icon: <StickyNote className="w-4 h-4 text-amber-500" />, label: "Com anotações", value: stats.withNotes },
          ].map(s => (
            <Card key={s.label} className="p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">{s.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nome ou telefone…"
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={sortBy} onValueChange={v => setSortBy(v as "name" | "recent")}>
          <SelectTrigger className="w-44 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Ordenar por Nome</SelectItem>
            <SelectItem value="recent">Mais recentes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── List ── */}
      <div className="space-y-2">
        {isLoading ? (
          [1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] bg-muted animate-pulse rounded-xl" />
          ))
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-2xl">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">Nenhum paciente encontrado</p>
            <p className="text-sm mt-1">Tente outro termo ou cadastre um novo paciente.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {sorted.map((patient, i) => {
              const age = calcAge(patient.dateOfBirth)
              return (
                <motion.div
                  key={patient.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                >
                  <Card
                    className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all duration-150 group"
                    onClick={() => setSelectedPatientId(patient.id)}
                  >
                    <div className="p-4 flex items-center gap-4">
                      {/* Avatar */}
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0",
                        avatarColor(patient.id),
                      )}>
                        {initials(patient.name)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground truncate">{patient.name}</span>
                          {age !== null && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                              {age} anos
                            </span>
                          )}
                          {patient.notes && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-amber-500"><StickyNote className="w-3.5 h-3.5" /></span>
                                </TooltipTrigger>
                                <TooltipContent><p>Possui anotações clínicas</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1" title={isLidJid(patient.phone) ? (patient.realPhone ? `Tel real: ${patient.realPhone}` : patient.phone) : undefined}>
                            <Phone className="w-3 h-3" />
                            {isLidJid(patient.phone)
                              ? patient.realPhone
                                ? <span className="text-green-600 dark:text-green-400">{formatPhone(patient.realPhone)}</span>
                                : <span className="text-yellow-600 dark:text-yellow-400">🔒 WhatsApp Privacy</span>
                              : formatPhone(patient.phone)}
                          </span>
                          {patient.email && <span className="hidden sm:flex items-center gap-1"><Mail className="w-3 h-3" />{patient.email}</span>}
                          <span className="text-muted-foreground/50">
                            cadastrado {formatDistanceToNow(new Date(patient.createdAt), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>

                      {/* Chevron */}
                      <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors rotate-[-90deg]" />
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ── Create Modal ── */}
      <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Cadastrar Paciente</SheetTitle>
            <SheetDescription>Adicione um novo paciente à base de clientes.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input required value={createData.name} onChange={e => setCreateData({ ...createData, name: e.target.value })} placeholder="João da Silva" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp / Telefone *</Label>
              <Input required value={createData.phone} onChange={e => setCreateData({ ...createData, phone: e.target.value })} placeholder="+5511999999999" />
            </div>
            <div className="space-y-2">
              <Label>Email (opcional)</Label>
              <Input type="email" value={createData.email} onChange={e => setCreateData({ ...createData, email: e.target.value })} placeholder="joao@email.com" />
            </div>
            <div className="space-y-2">
              <Label>Data de nascimento (opcional)</Label>
              <Input type="date" value={createData.dateOfBirth} onChange={e => setCreateData({ ...createData, dateOfBirth: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Anotações iniciais (opcional)</Label>
              <Textarea
                value={createData.notes}
                onChange={e => setCreateData({ ...createData, notes: e.target.value })}
                placeholder="Alergias, histórico relevante, observações…"
                className="min-h-[80px]"
              />
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={createPatient.isPending}>
                {createPatient.isPending ? "Cadastrando…" : "Cadastrar"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Detail Sheet (CRM) ── */}
      <PatientSheet
        clinicId={CLINIC_ID}
        patientId={selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
        onDelete={handleDelete}
        onUpdated={() => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey(CLINIC_ID) })}
      />
    </motion.div>
  )
}

// ─── PatientSheet ──────────────────────────────────────────────────────────────
function PatientSheet({
  clinicId, patientId, onClose, onDelete, onUpdated,
}: {
  clinicId: number
  patientId: number | null
  onClose: () => void
  onDelete: (id: number) => void
  onUpdated: () => void
}) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const updatePatient = useUpdatePatient()

  const { data: patient, isLoading } = useGetPatient(clinicId, patientId ?? 0, {
    query: { enabled: !!patientId },
  })

  // ── Appointment detail state ──
  const [openApptId, setOpenApptId] = React.useState<number | null>(null)

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = React.useState(false)
  const [editData, setEditData] = React.useState({
    name: "", phone: "", realPhone: "", email: "", dateOfBirth: "", notes: "",
  })

  React.useEffect(() => {
    if (patient) {
      setEditData({
        name: patient.name,
        phone: patient.phone,
        realPhone: patient.realPhone ?? "",
        email: patient.email ?? "",
        dateOfBirth: patient.dateOfBirth ?? "",
        notes: patient.notes ?? "",
      })
      setIsEditing(false)
    }
  }, [patient])

  // Reset edit mode when modal closes
  React.useEffect(() => {
    if (!patientId) setIsEditing(false)
  }, [patientId])

  const handleSave = () => {
    if (!patientId) return
    // Só envia campos alterados
    const payload: Record<string, string> = {}
    if (editData.name !== patient?.name) payload.name = editData.name
    if (editData.phone !== patient?.phone) payload.phone = editData.phone
    if (editData.realPhone !== (patient?.realPhone ?? "")) payload.realPhone = editData.realPhone
    if (editData.email !== (patient?.email ?? "")) payload.email = editData.email
    if (editData.dateOfBirth !== (patient?.dateOfBirth ?? "")) payload.dateOfBirth = editData.dateOfBirth
    if (editData.notes !== (patient?.notes ?? "")) payload.notes = editData.notes

    updatePatient.mutate(
      { clinicId, id: patientId, data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(clinicId, patientId) })
          onUpdated()
          setIsEditing(false)
          toast({ title: "Dados do paciente atualizados!" })
        },
        onError: () => toast({ title: "Erro ao salvar alterações", variant: "destructive" }),
      },
    )
  }

  const age = calcAge(patient?.dateOfBirth)

  return (
    <Sheet open={!!patientId} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden">
        {/* Título acessível para leitores de tela — sempre presente quando o sheet está aberto */}
        <SheetHeader className="sr-only">
          <SheetTitle>{patient?.name ?? "Detalhes do paciente"}</SheetTitle>
          <SheetDescription>Perfil completo e histórico de consultas do paciente.</SheetDescription>
        </SheetHeader>
        {isLoading || !patient ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Sheet Header / Profile ── */}
            <div className="px-6 pt-6 pb-4 border-b border-border/50 bg-muted/20 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0",
                    avatarColor(patient.id),
                  )}>
                    {initials(patient.name)}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-lg text-foreground leading-tight truncate">{patient.name}</h2>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5" title={isLidJid(patient.phone) ? (patient.realPhone ? `JID: ${patient.phone}` : patient.phone) : undefined}>
                      <Phone className="w-3.5 h-3.5" />
                      {isLidJid(patient.phone)
                        ? patient.realPhone
                          ? <span className="text-green-600 dark:text-green-400">{formatPhone(patient.realPhone)}</span>
                          : <span className="text-yellow-600 dark:text-yellow-400">🔒 WhatsApp Privacy (aguardando confirmação)</span>
                        : formatPhone(patient.phone)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditing ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="gap-1.5">
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={updatePatient.isPending} className="gap-1.5">
                        <Save className="w-3.5 h-3.5" />
                        {updatePatient.isPending ? "Salvando…" : "Salvar"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="gap-1.5">
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Meta chips ── */}
              <div className="flex flex-wrap gap-2 text-xs">
                {patient.email && (
                  <span className="flex items-center gap-1 bg-background border border-border/60 px-2.5 py-1 rounded-full text-muted-foreground">
                    <Mail className="w-3 h-3" />{patient.email}
                  </span>
                )}
                {age !== null && (
                  <span className="flex items-center gap-1 bg-background border border-border/60 px-2.5 py-1 rounded-full text-muted-foreground">
                    <Cake className="w-3 h-3" />{age} anos
                  </span>
                )}
                <span className="flex items-center gap-1 bg-background border border-border/60 px-2.5 py-1 rounded-full text-muted-foreground">
                  <CalendarDays className="w-3 h-3" />
                  Cliente desde {format(new Date(patient.createdAt), "MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="profile" className="h-full flex flex-col">
                <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-auto p-0 shrink-0">
                  <TabsTrigger value="profile" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Perfil
                  </TabsTrigger>
                  <TabsTrigger value="appointments" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" /> Consultas
                    <span className="ml-1 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                      {patient.appointments.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-sm gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Conversas IA
                    <span className="ml-1 bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                      {patient.aiLogs.length}
                    </span>
                  </TabsTrigger>
                </TabsList>

                {/* ─── Tab: Perfil / Edição ─── */}
                <TabsContent value="profile" className="flex-1 p-6 space-y-5 outline-none">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Nome completo</Label>
                        <Input value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Telefone / WhatsApp {isLidJid(editData.phone) && <span className="text-[10px] text-yellow-600 font-normal">(JID interno)</span>}</Label>
                          <Input value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} readOnly={isLidJid(editData.phone)} className={isLidJid(editData.phone) ? "bg-muted text-muted-foreground text-xs" : ""} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Telefone real {isLidJid(editData.phone) && <span className="text-[10px] text-muted-foreground font-normal">(número informado)</span>}</Label>
                          <Input value={editData.realPhone} onChange={e => setEditData({ ...editData, realPhone: e.target.value })} placeholder={isLidJid(editData.phone) ? "Ex: 5584912345678" : "Opcional"} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Data de nascimento</Label>
                          <Input type="date" value={editData.dateOfBirth} onChange={e => setEditData({ ...editData, dateOfBirth: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input type="email" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} placeholder="Opcional" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Anotações clínicas</Label>
                        <Textarea
                          value={editData.notes}
                          onChange={e => setEditData({ ...editData, notes: e.target.value })}
                          placeholder="Alergias, histórico, medicamentos em uso…"
                          className="min-h-[120px] resize-y"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* Dados básicos view-only */}
                      <div className="grid grid-cols-2 gap-4">
                        <InfoField
                          icon={<Phone className="w-3.5 h-3.5" />}
                          label="Telefone"
                          value={isLidJid(patient.phone)
                            ? patient.realPhone
                              ? formatPhone(patient.realPhone)
                              : "🔒 WhatsApp Privacy"
                            : formatPhone(patient.phone)}
                          title={isLidJid(patient.phone)
                            ? patient.realPhone
                              ? `JID: ${patient.phone}`
                              : `JID interno: ${patient.phone} — número real ainda não coletado`
                            : undefined}
                        />
                        <InfoField icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={patient.email ?? "—"} />
                        <InfoField
                          icon={<Cake className="w-3.5 h-3.5" />}
                          label="Nascimento"
                          value={patient.dateOfBirth
                            ? `${format(new Date(patient.dateOfBirth), "dd/MM/yyyy")} (${age} anos)`
                            : "—"
                          }
                        />
                        <InfoField
                          icon={<Activity className="w-3.5 h-3.5" />}
                          label="Última atualização"
                          value={format(new Date(patient.updatedAt), "dd/MM/yyyy", { locale: ptBR })}
                        />
                      </div>

                      {/* Anotações */}
                      <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <StickyNote className="w-4 h-4 text-amber-500" /> Anotações Clínicas
                        </p>
                        {patient.notes ? (
                          <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/30 rounded-xl p-4 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                            {patient.notes}
                          </div>
                        ) : (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="w-full border-2 border-dashed border-border/50 rounded-xl p-4 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary/70 transition-colors text-center"
                          >
                            Clique em <strong>Editar</strong> para adicionar anotações clínicas
                          </button>
                        )}
                      </div>

                      {/* Estatísticas rápidas */}
                      <div className="grid grid-cols-3 gap-3">
                        <MiniStat label="Consultas" value={patient.appointments.length} />
                        <MiniStat label="Conversas IA" value={patient.aiLogs.length} />
                        <MiniStat
                          label="Tokens IA"
                          value={patient.aiLogs.reduce((s, l) => s + l.tokensUsed, 0).toLocaleString("pt-BR")}
                        />
                      </div>
                    </div>
                  )}

                  {/* Excluir paciente */}
                  {!isEditing && (
                    <div className="pt-4 border-t border-border/40">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
                            <Trash2 className="w-3.5 h-3.5" /> Excluir paciente
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir {patient.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação é irreversível. Todo o histórico de agendamentos e interações com a IA vinculados a este paciente será removido.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDelete(patient.id)}
                            >
                              Excluir permanentemente
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </TabsContent>

                {/* ─── Tab: Consultas ─── */}
                <TabsContent value="appointments" className="p-6 outline-none">
                  {patient.appointments.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Nenhuma consulta registrada ainda.</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3">
                      {[...patient.appointments]
                        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
                        .map(apt => {
                          const st = STATUS_PT[apt.status] ?? { label: apt.status, variant: "secondary" as const }
                          const isPast = new Date(apt.scheduledAt) < new Date()
                          return (
                            <div
                              key={apt.id}
                              onClick={() => setOpenApptId(apt.id)}
                              className={cn(
                                "rounded-xl border p-4 space-y-2 transition-colors cursor-pointer hover:border-primary/40 hover:bg-muted/10",
                                isPast ? "bg-muted/20 border-border/40" : "bg-background border-border/60",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-semibold text-sm">
                                  {format(new Date(apt.scheduledAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                                </span>
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </div>
                              {apt.notes && (
                                <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                                  {apt.notes}
                                </p>
                              )}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>ID #{apt.id}</span>
                                <span>·</span>
                                <span>
                                  {isPast
                                    ? formatDistanceToNow(new Date(apt.scheduledAt), { addSuffix: true, locale: ptBR })
                                    : `em ${formatDistanceToNow(new Date(apt.scheduledAt), { locale: ptBR })}`
                                  }
                                </span>
                              </div>
                            </div>
                          )
                        })}
                    </div>

                    <AppointmentSheet
                      clinicId={clinicId}
                      appointment={patient.appointments.find(a => a.id === openApptId) ?? null}
                      onClose={() => setOpenApptId(null)}
                    />
                    </>
                  )}
                </TabsContent>

                {/* ─── Tab: Conversas IA ─── */}
                <TabsContent value="logs" className="p-6 outline-none">
                  {patient.aiLogs.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Nenhuma conversa com a IA registrada ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {[...patient.aiLogs]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(log => (
                          <div key={log.id} className="space-y-2 pb-5 border-b border-border/30 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-default">
                                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: ptBR })}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {format(new Date(log.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <div className="flex items-center gap-2">
                                {log.messageType === "audio" && (
                                  <span className="flex items-center gap-1 text-indigo-500">
                                    <Mic className="w-3 h-3" /> Voz
                                  </span>
                                )}
                                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  {log.tokensUsed} tokens
                                </span>
                              </div>
                            </div>
                            {/* Balão paciente */}
                            <div className="bg-muted/60 rounded-xl rounded-tl-none px-3.5 py-2.5 text-sm ml-4">
                              <span className="font-medium text-foreground/60 text-xs block mb-1">Paciente</span>
                              {log.userMessage}
                            </div>
                            {/* Balão IA */}
                            <div className="bg-primary/5 border border-primary/15 rounded-xl rounded-tr-none px-3.5 py-2.5 text-sm mr-4">
                              <span className="font-medium text-primary text-xs flex items-center gap-1 mb-1">
                                <Bot className="w-3 h-3" /> Assistente IA
                              </span>
                              {log.aiResponse}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────
function InfoField({ icon, label, value, title }: { icon: React.ReactNode; label: string; value: string; title?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-sm font-medium text-foreground truncate" title={title}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}


