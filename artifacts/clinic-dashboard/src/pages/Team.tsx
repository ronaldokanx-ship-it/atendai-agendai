import * as React from "react"
import { motion } from "framer-motion"
import {
  UsersRound, UserPlus, Pencil, Trash2, ShieldCheck, Activity, X, Eye, EyeOff,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { useAuth } from "@/contexts/auth"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Role = "owner" | "supervisor" | "attendant"

interface TeamUser {
  id: number
  name: string
  email: string
  role: Role
  active: boolean
  createdAt: string
}

interface ActivityLog {
  id: number
  action: string
  details: string | null
  createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Dono",
  supervisor: "Supervisor",
  attendant: "Atendente",
  staff: "Staff",
}
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-violet-100 text-violet-700 border-violet-200",
  supervisor: "bg-blue-100 text-blue-700 border-blue-200",
  attendant: "bg-emerald-100 text-emerald-700 border-emerald-200",
  staff: "bg-muted text-muted-foreground border-border",
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function authHeader() {
  const token = localStorage.getItem("clinic_token")
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity Sheet
// ─────────────────────────────────────────────────────────────────────────────
function ActivitySheet({
  userId, clinicId, name, open, onClose,
}: { userId: number | null; clinicId: number; name: string; open: boolean; onClose: () => void }) {
  const [logs, setLogs] = React.useState<ActivityLog[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !userId) return
    setLoading(true)
    fetch(`/api/clinics/${clinicId}/users/${userId}/activity`, { headers: authHeader() })
      .then(r => r.json())
      .then(setLogs)
      .finally(() => setLoading(false))
  }, [open, userId, clinicId])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Atividade — {name}
          </DialogTitle>
          <DialogDescription>Histórico de ações do usuário</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading && <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>}
          {!loading && logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atividade registrada.</p>
          )}
          {!loading && logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{log.action}</p>
                {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {format(new Date(log.createdAt), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UserForm Dialog (create / edit)
// ─────────────────────────────────────────────────────────────────────────────
interface UserFormProps {
  open: boolean
  onClose: () => void
  clinicId: number
  editing: TeamUser | null
  onSaved: () => void
}

function UserFormDialog({ open, onClose, clinicId, editing, onSaved }: UserFormProps) {
  const { toast } = useToast()
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "attendant" as "supervisor" | "attendant", active: true })
  const [showPwd, setShowPwd] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, email: editing.email, password: "", role: editing.role === "supervisor" ? "supervisor" : "attendant", active: editing.active })
    } else {
      setForm({ name: "", email: "", password: "", role: "attendant", active: true })
    }
  }, [editing, open])

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return
    if (!editing && form.password.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { name: form.name, email: form.email, role: form.role, active: form.active }
      if (form.password) body.password = form.password

      const url = editing
        ? `/api/clinics/${clinicId}/users/${editing.id}`
        : `/api/clinics/${clinicId}/users`
      const method = editing ? "PATCH" : "POST"
      if (!editing) body.password = form.password

      const res = await fetch(url, { method, headers: authHeader(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar")
      toast({ title: editing ? "Usuário atualizado" : "Usuário criado", description: `${form.name} foi ${editing ? "atualizado" : "adicionado"} à equipe.` })
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar usuário" : "Adicionar membro"}</DialogTitle>
          <DialogDescription>
            {editing ? "Altere os dados do membro da equipe." : "Crie um novo acesso para sua equipe."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="tf-name">Nome completo</Label>
            <Input id="tf-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="João Silva" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tf-email">E-mail</Label>
            <Input id="tf-email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="joao@empresa.com.br" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tf-pwd">{editing ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
            <div className="relative">
              <Input
                id="tf-pwd"
                type={showPwd ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder={editing ? "••••••" : "Mínimo 6 caracteres"}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPwd(v => !v)}
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tf-role">Função</Label>
            <Select value={form.role} onValueChange={(v) => setForm(p => ({ ...p, role: v as "supervisor" | "attendant" }))}>
              <SelectTrigger id="tf-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supervisor">Supervisor — pode ver logs e equipe</SelectItem>
                <SelectItem value="attendant">Atendente — acesso básico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editing && (
            <div className="flex items-center gap-3">
              <Switch id="tf-active" checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
              <Label htmlFor="tf-active">Conta ativa</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editing ? "Atualizar" : "Criar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Team() {
  const { user, isOwner } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const { toast } = useToast()

  const [users, setUsers] = React.useState<TeamUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<TeamUser | null>(null)
  const [deleteId, setDeleteId] = React.useState<number | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [activityUser, setActivityUser] = React.useState<{ id: number; name: string } | null>(null)

  function loadUsers() {
    setLoading(true)
    fetch(`/api/clinics/${CLINIC_ID}/users`, { headers: authHeader() })
      .then(r => r.json())
      .then(setUsers)
      .catch(() => toast({ title: "Erro", description: "Falha ao carregar equipe.", variant: "destructive" }))
      .finally(() => setLoading(false))
  }

  React.useEffect(() => { loadUsers() }, [CLINIC_ID]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clinics/${CLINIC_ID}/users/${deleteId}`, { method: "DELETE", headers: authHeader() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Falha ao excluir")
      toast({ title: "Usuário excluído" })
      setUsers(prev => prev.filter(u => u.id !== deleteId))
    } catch (e: unknown) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" })
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-4xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Equipe</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie os membros que têm acesso ao painel.
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => { setEditingUser(null); setFormOpen(true) }} className="gap-2">
            <UserPlus className="w-5 h-5" />
            Adicionar membro
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <UsersRound className="w-4 h-4 text-muted-foreground" />
            Membros da equipe
          </CardTitle>
          <CardDescription>
            Supervisores podem ver logs e equipe. Atendentes têm acesso básico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
            </div>
          )}
          {!loading && users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum membro cadastrado ainda.</p>
          )}
          {!loading && users.length > 0 && (
            <div className="divide-y divide-border/50">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{u.name}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role] ?? ROLE_COLORS.staff}`}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                      {!u.active && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                      title="Ver atividade"
                      onClick={() => setActivityUser({ id: u.id, name: u.name })}
                    >
                      <Activity className="w-4 h-4" />
                    </Button>
                    {isOwner && u.role !== "owner" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                          title="Editar"
                          onClick={() => { setEditingUser(u); setFormOpen(true) }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Excluir"
                          onClick={() => setDeleteId(u.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UserFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        clinicId={CLINIC_ID}
        editing={editingUser}
        onSaved={loadUsers}
      />

      <ActivitySheet
        open={activityUser !== null}
        userId={activityUser?.id ?? null}
        clinicId={CLINIC_ID}
        name={activityUser?.name ?? ""}
        onClose={() => setActivityUser(null)}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso deste membro será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
