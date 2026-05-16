import { useState } from "react"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Eye, EyeOff } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth"
import { AppLogo } from "@/components/AppLogo"

export default function Register() {
  const [form, setForm] = useState({
    companyName: "",
    clinicType: "medical" as string,
    ownerName: "",
    email: "",
    password: "",
  })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const [, navigate] = useLocation()
  const { toast } = useToast()

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: "Erro", description: data.error ?? "Falha ao criar conta", variant: "destructive" })
        return
      }
      login(data.token)
      navigate("/dashboard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center auth-bg px-4 py-10">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3 logo-animate-in">
          <div className="flex justify-center mb-1">
            <AppLogo size="lg" />
          </div>
          <p className="text-muted-foreground">Crie a conta da sua empresa</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            14 dias grátis · Sem cartão de crédito
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border/60 rounded-2xl p-5 sm:p-8 shadow-md space-y-5">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome da Empresa</Label>
            <Input
              id="companyName"
              placeholder="Clínica São Paulo"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clinicType">Tipo de negócio</Label>
            <Select value={form.clinicType} onValueChange={(v) => set("clinicType", v)}>
              <SelectTrigger id="clinicType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medical">Clínica Médica</SelectItem>
                <SelectItem value="dental">Clínica Odontológica</SelectItem>
                <SelectItem value="veterinary">Clínica Veterinária</SelectItem>
                <SelectItem value="beauty">Estética e Beleza</SelectItem>
                <SelectItem value="education">Educação / Cursos</SelectItem>
                <SelectItem value="retail">Loja / Comércio</SelectItem>
                <SelectItem value="food">Restaurante / Alimentos</SelectItem>
                <SelectItem value="technology">Tecnologia</SelectItem>
                <SelectItem value="services">Serviços Gerais</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ownerName">Seu nome</Label>
            <Input
              id="ownerName"
              placeholder="João Silva"
              value={form.ownerName}
              onChange={(e) => set("ownerName", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="joao@clinica.com.br"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando conta..." : "Começar teste grátis de 14 dias"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <a href="/login" className="text-primary hover:underline font-medium">
              Entrar
            </a>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            A conta criada aqui é para o <strong>dono</strong> da empresa.
            Colaboradores são adicionados em Configurações → Equipe.
          </p>
        </form>
      </div>
    </div>
  )
}
