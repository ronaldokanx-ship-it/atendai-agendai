import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import {
  LogOut, Stethoscope, User, Calendar, Trash2, KeyRound, Building,
  Ban, ShieldCheck, MessageSquareText, Users, Clock, AlertTriangle,
  Search, ChevronDown, RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/contexts/auth"
import { useToast } from "@/hooks/use-toast"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AppLogo } from "@/components/AppLogo"

interface ClinicRow {
  id: number
  name: string
  clinicType: string
  phone: string
  createdAt: string
  isBlocked: boolean
  blockedReason: string | null
  blockedAt: string | null
  trialEndsAt: string | null
  subscriptionStatus: string
  owner: { name: string; email: string } | null
  totalMessages: number
  totalAppointments: number
  totalUsers: number
  lastActivity: string | null
}

function getTrialInfo(clinic: ClinicRow) {
  if (clinic.subscriptionStatus !== "trial") return null
  if (!clinic.trialEndsAt) return { daysLeft: null }
  const daysLeft = Math.ceil((new Date(clinic.trialEndsAt).getTime() - Date.now()) / 864e5)
  return { daysLeft }
}

const CLINIC_TYPE_LABELS: Record<string, string> = {
  medical: "Médica", dental: "Odontológica", veterinary: "Veterinária",
  beauty: "Estética", education: "Educação", retail: "Comércio",
  food: "Alimentos", technology: "Tecnologia", services: "Serviços", other: "Outro",
}

const CLINIC_TYPE_COLORS: Record<string, string> = {
  medical: "bg-blue-100 text-blue-700 border-blue-200",
  dental: "bg-violet-100 text-violet-700 border-violet-200",
  veterinary: "bg-emerald-100 text-emerald-700 border-emerald-200",
  beauty: "bg-pink-100 text-pink-700 border-pink-200",
  education: "bg-amber-100 text-amber-700 border-amber-200",
  retail: "bg-orange-100 text-orange-700 border-orange-200",
  food: "bg-red-100 text-red-700 border-red-200",
  technology: "bg-cyan-100 text-cyan-700 border-cyan-200",
  services: "bg-teal-100 text-teal-700 border-teal-200",
  other: "bg-muted text-muted-foreground border-border",
}

export default function AdminClinics() {
  const { user, logout } = useAuth()
  const [, navigate] = useLocation()
  const { toast } = useToast()
  const [clinics, setClinics] = useState<ClinicRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "trial" | "expired" | "blocked" | "active">("all")

  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [resetClinicId, setResetClinicId] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  const [blockTarget, setBlockTarget] = useState<ClinicRow | null>(null)
  const [blockReason, setBlockReason] = useState("")
  const [blocking, setBlocking] = useState(false)

  const [unblockTarget, setUnblockTarget] = useState<ClinicRow | null>(null)
  const [unblocking, setUnblocking] = useState(false)

  function getToken() {
    return localStorage.getItem("clinic_token")
  }

  function fetchClinics() {
    setLoading(true)
    fetch("/api/admin/clinics", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => { if (!r.ok) throw new Error("Falha ao carregar clínicas"); return r.json() })
      .then(setClinics)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchClinics() }, [])

  const blockedCount = clinics.filter((c) => c.isBlocked).length
  const trialCount = clinics.filter((c) => {
    if (c.isBlocked) return false
    const t = getTrialInfo(c)
    return t !== null && t.daysLeft !== null && t.daysLeft > 0
  }).length
  const expiredCount = clinics.filter((c) => {
    if (c.isBlocked) return false
    const t = getTrialInfo(c)
    return t !== null && t.daysLeft !== null && t.daysLeft <= 0
  }).length
  const activeCount = clinics.filter((c) => !c.isBlocked && c.subscriptionStatus === "active").length

  const filtered = clinics.filter((c) => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.owner?.email.toLowerCase().includes(q) ?? false) ||
      (c.owner?.name.toLowerCase().includes(q) ?? false)
    if (!matchesSearch) return false
    if (statusFilter === "trial") {
      const t = getTrialInfo(c)
      return !c.isBlocked && t !== null && t.daysLeft !== null && t.daysLeft > 0
    }
    if (statusFilter === "expired") {
      const t = getTrialInfo(c)
      return !c.isBlocked && t !== null && t.daysLeft !== null && t.daysLeft <= 0
    }
    if (statusFilter === "blocked") return c.isBlocked
    if (statusFilter === "active") return !c.isBlocked && c.subscriptionStatus === "active"
    return true
  })

  async function handleDelete() {
    if (!confirmId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/clinics/${confirmId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao excluir")
      toast({ title: "Empresa excluída", description: data.message })
      setClinics((prev) => prev.filter((c) => c.id !== confirmId))
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setDeleting(false)
      setConfirmId(null)
    }
  }

  async function handleResetPassword() {
    if (!resetClinicId || resetPassword.length < 8) return
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/clinics/${resetClinicId}/reset-owner-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ newPassword: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao redefinir senha")
      toast({ title: "Senha redefinida", description: "A senha do owner foi atualizada." })
      setResetClinicId(null)
      setResetPassword("")
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setResetting(false)
    }
  }

  async function handleBlock() {
    if (!blockTarget) return
    setBlocking(true)
    try {
      const res = await fetch(`/api/admin/clinics/${blockTarget.id}/block`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ reason: blockReason || "Inadimplência" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao bloquear")
      toast({ title: "Empresa bloqueada", description: `${blockTarget.name} foi bloqueada.` })
      setClinics((prev) => prev.map((c) => c.id === blockTarget!.id
        ? { ...c, isBlocked: true, blockedReason: blockReason || "Inadimplência", blockedAt: new Date().toISOString() }
        : c
      ))
      setBlockTarget(null)
      setBlockReason("")
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBlocking(false)
    }
  }

  async function handleUnblock() {
    if (!unblockTarget) return
    setUnblocking(true)
    try {
      const res = await fetch(`/api/admin/clinics/${unblockTarget.id}/unblock`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao desbloquear")
      toast({ title: "Empresa desbloqueada", description: `${unblockTarget.name} foi desbloqueada.` })
      setClinics((prev) => prev.map((c) => c.id === unblockTarget!.id
        ? { ...c, isBlocked: false, blockedReason: null, blockedAt: null }
        : c
      ))
      setUnblockTarget(null)
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setUnblocking(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border/50 bg-card shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <div>
              <p className="text-xs text-muted-foreground">Painel Administrativo</p>
              <p className="text-[10px] text-muted-foreground/50">Kanx It Solutions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-200">superadmin</Badge>
            <button
              onClick={() => { logout(); navigate("/login") }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Building, label: "Total de Empresas", value: loading ? "—" : clinics.length, color: "text-blue-600", bg: "bg-blue-100" },
            { icon: Clock, label: "Em Teste", value: loading ? "—" : trialCount, color: "text-amber-600", bg: "bg-amber-100" },
            { icon: AlertTriangle, label: "Testes Expirados", value: loading ? "—" : expiredCount, color: "text-orange-600", bg: "bg-orange-100" },
            { icon: Ban, label: "Bloqueadas", value: loading ? "—" : blockedCount, color: "text-red-600", bg: "bg-red-100" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
                    <p className="text-2xl font-bold leading-tight">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "all", label: "Todas", count: clinics.length, activeClass: "bg-blue-600 text-white" },
            { key: "trial", label: "Em Teste", count: trialCount, activeClass: "bg-amber-500 text-white" },
            { key: "expired", label: "Expirados", count: expiredCount, activeClass: "bg-orange-600 text-white" },
            { key: "blocked", label: "Bloqueadas", count: blockedCount, activeClass: "bg-red-600 text-white" },
            { key: "active", label: "Ativas", count: activeCount, activeClass: "bg-emerald-600 text-white" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${statusFilter === tab.key ? tab.activeClass : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {tab.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusFilter === tab.key ? "bg-white/25" : "bg-muted-foreground/15"}`}>
                {loading ? "—" : tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa, owner, telefone..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={fetchClinics} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-muted-foreground" />
              Empresas Cadastradas
              {!loading && <span className="ml-auto text-xs font-normal text-muted-foreground">{filtered.length} de {clinics.length}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading && <p className="text-sm text-muted-foreground text-center py-12">Carregando...</p>}
            {error && <p className="text-sm text-destructive text-center py-12">{error}</p>}
            {!loading && !error && filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">Nenhuma empresa encontrada.</p>}
            {!loading && !error && filtered.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Owner</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Métricas</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Último acesso</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((clinic) => (
                      <tr key={clinic.id} className={`border-b border-border/30 transition-colors ${clinic.isBlocked ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-muted/30"}`}>
                        <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{clinic.id}</td>
                        <td className="py-3 px-4">
                          <p className="font-medium">{clinic.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${CLINIC_TYPE_COLORS[clinic.clinicType] ?? "bg-muted text-muted-foreground border-border"}`}>
                              {CLINIC_TYPE_LABELS[clinic.clinicType] ?? clinic.clinicType}
                            </span>
                            <span className="text-xs text-muted-foreground">{clinic.phone}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Cadastro: {format(new Date(clinic.createdAt), "dd/MM/yyyy", { locale: ptBR })}</p>
                        </td>
                        <td className="py-3 px-4">
                          {clinic.owner ? (
                            <div>
                              <p className="font-medium flex items-center gap-1"><User className="w-3 h-3 text-muted-foreground" />{clinic.owner.name}</p>
                              <p className="text-xs text-muted-foreground">{clinic.owner.email}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Sem owner</span>
                          )}
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                            <Users className="w-3 h-3" />{clinic.totalUsers} usuário{clinic.totalUsers !== 1 ? "s" : ""}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs flex items-center gap-1.5">
                            <MessageSquareText className="w-3 h-3 text-violet-500" />
                            <span className="font-medium">{clinic.totalMessages.toLocaleString("pt-BR")}</span>
                            <span className="text-muted-foreground">msgs IA</span>
                          </p>
                          <p className="text-xs flex items-center gap-1.5 mt-0.5">
                            <Calendar className="w-3 h-3 text-emerald-500" />
                            <span className="font-medium">{clinic.totalAppointments.toLocaleString("pt-BR")}</span>
                            <span className="text-muted-foreground">agendamentos</span>
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">
                          {clinic.lastActivity ? (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span title={format(new Date(clinic.lastActivity), "dd/MM/yyyy HH:mm", { locale: ptBR })}>
                                {formatDistanceToNow(new Date(clinic.lastActivity), { locale: ptBR, addSuffix: true })}
                              </span>
                            </div>
                          ) : <span className="italic">Sem atividade</span>}
                        </td>
                        <td className="py-3 px-4">
                          {clinic.isBlocked ? (
                            <div>
                              <Badge variant="destructive" className="text-[10px] gap-1"><Ban className="w-3 h-3" />Bloqueada</Badge>
                              {clinic.blockedReason && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[120px] truncate" title={clinic.blockedReason}>{clinic.blockedReason}</p>}
                            </div>
                          ) : (() => {
                            const t = getTrialInfo(clinic)
                            if (t !== null) {
                              if (t.daysLeft === null) {
                                return <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-200 bg-amber-50"><Clock className="w-3 h-3" />Em Teste</Badge>
                              }
                              if (t.daysLeft > 3) {
                                return (
                                  <div>
                                    <Badge variant="outline" className="text-[10px] gap-1 text-blue-700 border-blue-200 bg-blue-50"><Clock className="w-3 h-3" />Em Teste</Badge>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.daysLeft} dias restantes</p>
                                  </div>
                                )
                              }
                              if (t.daysLeft > 0) {
                                return (
                                  <div>
                                    <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-300 bg-amber-50"><Clock className="w-3 h-3" />Expirando</Badge>
                                    <p className="text-[10px] text-amber-600 font-medium mt-0.5">{t.daysLeft} dia{t.daysLeft !== 1 ? "s" : ""} restante{t.daysLeft !== 1 ? "s" : ""}</p>
                                  </div>
                                )
                              }
                              return (
                                <div>
                                  <Badge variant="outline" className="text-[10px] gap-1 text-orange-700 border-orange-200 bg-orange-50"><AlertTriangle className="w-3 h-3" />Teste Expirado</Badge>
                                  {clinic.trialEndsAt && <p className="text-[10px] text-muted-foreground mt-0.5">Expirou {formatDistanceToNow(new Date(clinic.trialEndsAt), { locale: ptBR, addSuffix: true })}</p>}
                                </div>
                              )
                            }
                            return (
                              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-200 bg-emerald-50">
                                <ShieldCheck className="w-3 h-3" />Ativa
                              </Badge>
                            )
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground">
                                Ações <ChevronDown className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2" onClick={() => { setResetClinicId(clinic.id); setResetPassword("") }}>
                                <KeyRound className="w-4 h-4" />Redefinir senha
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {clinic.isBlocked ? (
                                <DropdownMenuItem className="gap-2 text-emerald-600 focus:text-emerald-600" onClick={() => setUnblockTarget(clinic)}>
                                  <ShieldCheck className="w-4 h-4" />Desbloquear conta
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="gap-2 text-orange-600 focus:text-orange-600" onClick={() => { setBlockTarget(clinic); setBlockReason("") }}>
                                  <Ban className="w-4 h-4" />Bloquear conta
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => setConfirmId(clinic.id)}>
                                <Trash2 className="w-4 h-4" />Excluir empresa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground/50">
          Kanx It Solutions —{" "}
          <a href="https://kanxitsolutions.com.br/" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">
            kanxitsolutions.com.br
          </a>
        </p>
      </footer>

      <AlertDialog open={confirmId !== null} onOpenChange={(open) => { if (!open) setConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível. Todos os dados serão permanentemente excluídos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetClinicId !== null} onOpenChange={(open) => { if (!open) { setResetClinicId(null); setResetPassword("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha do Owner</DialogTitle>
            <DialogDescription>Define uma nova senha para o owner desta empresa. Mínimo 8 caracteres.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" type="password" placeholder="Mínimo 8 caracteres" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={8} autoComplete="new-password" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetClinicId(null); setResetPassword("") }} disabled={resetting}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={resetting || resetPassword.length < 8}>{resetting ? "Salvando..." : "Redefinir Senha"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={blockTarget !== null} onOpenChange={(open) => { if (!open) { setBlockTarget(null); setBlockReason("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600"><Ban className="w-5 h-5" />Bloquear {blockTarget?.name}</DialogTitle>
            <DialogDescription>A empresa perderá acesso ao sistema e o WhatsApp deixará de ser processado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="block-reason">Motivo (opcional)</Label>
            <Textarea id="block-reason" placeholder="Ex: Inadimplência — fatura vencida em 01/05/2026" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBlockTarget(null); setBlockReason("") }} disabled={blocking}>Cancelar</Button>
            <Button onClick={handleBlock} disabled={blocking} className="bg-orange-600 hover:bg-orange-700 text-white">{blocking ? "Bloqueando..." : "Confirmar Bloqueio"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unblockTarget !== null} onOpenChange={(open) => { if (!open) setUnblockTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-600"><ShieldCheck className="w-5 h-5" />Desbloquear {unblockTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>A empresa terá acesso restaurado imediatamente ao sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblocking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnblock} disabled={unblocking} className="bg-emerald-600 text-white hover:bg-emerald-700">{unblocking ? "Desbloqueando..." : "Sim, desbloquear"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
