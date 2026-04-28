import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { Building2, LogOut, Stethoscope, User, Calendar, Trash2, KeyRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useAuth } from "@/contexts/auth"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ClinicRow {
  id: number
  name: string
  clinicType: string
  phone: string
  createdAt: string
  owner: { name: string; email: string } | null
}

const CLINIC_TYPE_LABELS: Record<string, string> = {
  medical: "Médica",
  dental: "Odontológica",
  veterinary: "Veterinária",
  beauty: "Estética",
  education: "Educação",
  retail: "Comércio",
  food: "Alimentos",
  technology: "Tecnologia",
  services: "Serviços",
  other: "Outro",
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
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [resetClinicId, setResetClinicId] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  function fetchClinics() {
    const token = localStorage.getItem("clinic_token")
    setLoading(true)
    fetch("/api/admin/clinics", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Falha ao carregar clínicas")
        return r.json()
      })
      .then(setClinics)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchClinics() }, [])

  async function handleDelete() {
    if (!confirmId) return
    setDeleting(true)
    try {
      const token = localStorage.getItem("clinic_token")
      const res = await fetch(`/api/admin/clinics/${confirmId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao excluir")
      toast({ title: "Clínica excluída", description: data.message })
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
      const token = localStorage.getItem("clinic_token")
      const res = await fetch(`/api/admin/clinics/${resetClinicId}/reset-owner-password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao redefinir senha")
      toast({ title: "Senha redefinida", description: "A senha do owner foi atualizada com sucesso." })
      setResetClinicId(null)
      setResetPassword("")
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setResetting(false)
    }
  }

  function handleLogout() {
    logout()
    navigate("/login")
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="border-b border-border/50 bg-card shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base leading-tight">ClinicAI — Admin</h1>
              <p className="text-xs text-muted-foreground">Painel Superadmin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
            <Badge variant="secondary" className="text-xs">superadmin</Badge>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Clínicas</p>
                  <p className="text-2xl font-bold">{loading ? "—" : clinics.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Com Owner</p>
                  <p className="text-2xl font-bold">
                    {loading ? "—" : clinics.filter((c) => c.owner).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cadastradas hoje</p>
                  <p className="text-2xl font-bold">
                    {loading
                      ? "—"
                      : clinics.filter((c) => {
                          const d = new Date(c.createdAt)
                          const today = new Date()
                          return (
                            d.getDate() === today.getDate() &&
                            d.getMonth() === today.getMonth() &&
                            d.getFullYear() === today.getFullYear()
                          )
                        }).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-muted-foreground" />
              Clínicas Cadastradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            )}
            {error && (
              <p className="text-sm text-destructive text-center py-8">{error}</p>
            )}
            {!loading && !error && clinics.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma clínica cadastrada.</p>
            )}
            {!loading && !error && clinics.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nome</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Owner</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Cadastro</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinics.map((clinic) => (
                      <tr
                        key={clinic.id}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{clinic.id}</td>
                        <td className="py-3 px-4 font-medium">{clinic.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                              CLINIC_TYPE_COLORS[clinic.clinicType] ?? "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {CLINIC_TYPE_LABELS[clinic.clinicType] ?? clinic.clinicType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {clinic.owner ? (
                            <div>
                              <p className="font-medium">{clinic.owner.name}</p>
                              <p className="text-xs text-muted-foreground">{clinic.owner.email}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {format(new Date(clinic.createdAt), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-blue-600 hover:bg-blue-50 h-8 w-8"
                              title="Redefinir senha do owner"
                              onClick={() => { setResetClinicId(clinic.id); setResetPassword("") }}
                            >
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              onClick={() => setConfirmId(clinic.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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

      <AlertDialog open={confirmId !== null} onOpenChange={(open) => { if (!open) setConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir clínica?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os dados da clínica — serviços, profissionais,
              pacientes, agendamentos, logs e usuários — serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resetClinicId !== null} onOpenChange={(open) => { if (!open) { setResetClinicId(null); setResetPassword("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha do Owner</DialogTitle>
            <DialogDescription>
              Define uma nova senha para o usuário owner desta clínica. Mínimo 8 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetClinicId(null); setResetPassword("") }} disabled={resetting}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting || resetPassword.length < 8}>
              {resetting ? "Salvando..." : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
