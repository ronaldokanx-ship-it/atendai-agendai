import { useState } from "react"
import { useLocation } from "wouter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth"
import { AppLogo } from "@/components/AppLogo"
import { Eye, EyeOff } from "lucide-react"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()
  const [, navigate] = useLocation()
  const { toast } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        let errorMsg = "Falha ao entrar"
        try {
          const data = await res.json()
          errorMsg = data.error ?? errorMsg
        } catch { /* body não é JSON (ex: 500 sem body) */ }
        toast({ title: "Erro", description: errorMsg, variant: "destructive" })
        return
      }
      const data = await res.json()
      login(data.token)
      navigate(data.role === "superadmin" ? "/admin/clinics" : "/dashboard")
    } catch {
      toast({ title: "Erro", description: "Não foi possível conectar ao servidor.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center auth-bg px-4">
      <div className="w-full max-w-md space-y-8 flex-1 flex flex-col justify-center">
        <div className="text-center space-y-3 logo-animate-in">
          <div className="flex justify-center mb-1">
            <AppLogo size="lg" />
          </div>
          <p className="text-muted-foreground">Entre na sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border/60 rounded-2xl p-5 sm:p-8 shadow-md space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Não tem conta?{" "}
            <a href="/register" className="text-primary hover:underline font-medium">
              Criar conta
            </a>
          </p>
        </form>
      </div>

      {/* Rodapé com branding */}
      <footer className="w-full py-4 text-center">
        <p className="text-xs text-muted-foreground/60">
          Desenvolvido por{" "}
          <a
            href="https://kanxitsolutions.com.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors font-medium"
          >
            Kanx It Solutions
          </a>
        </p>
      </footer>
    </div>
  )
}
