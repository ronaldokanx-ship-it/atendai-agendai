import * as React from "react"
import { Link, useLocation } from "wouter"
import { useQuery } from "@tanstack/react-query"
import { 
  LayoutDashboard, 
  Bot, 
  Stethoscope, 
  CalendarDays, 
  MessageSquareText,
  Users,
  UserCheck,
  FlaskConical,
  Settings2,
  LogOut,
  UsersRound,
  Menu,
  AlertTriangle,
  Package,
  Clock,
  Rocket,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"
import { AppLogo } from "@/components/AppLogo"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

interface AppLayoutProps {
  children: React.ReactNode
}

// items com visibleTo: undefined = todos os roles
// visibleTo: lista de roles que podem ver o item
const NAV_ITEMS = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/appointments", label: "Agendamentos", icon: CalendarDays },
  { href: "/services", label: "Serviços", icon: Stethoscope },
  { href: "/professionals", label: "Profissionais", icon: UserCheck },
  { href: "/patients", label: "Clientes", icon: Users },
  { href: "/products", label: "Produtos", icon: Package },
  { href: "/team", label: "Equipe", icon: UsersRound, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/logs", label: "Logs de IA", icon: MessageSquareText, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/chat", label: "Testar IA", icon: FlaskConical, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/settings/ai", label: "Config. de IA", icon: Bot, visibleTo: ["owner"] as string[] },
  { href: "/settings/clinic", label: "Integrações", icon: Settings2, visibleTo: ["owner"] as string[] },
]

function NavLinks({
  items,
  location,
  onNavigate,
}: {
  items: typeof NAV_ITEMS
  location: string
  onNavigate?: () => void
}) {
  return (
    <>
      {items.map((item) => {
        const isActive = location === item.href || (location === "/" && item.href === "/dashboard")
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 translate-x-1"
                : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
            )}
          >
            <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

function SidebarFooter({ logout, trialDaysLeft, subscriptionStatus }: {
  logout: () => void
  trialDaysLeft: number | null
  subscriptionStatus?: string | null
}) {
  const showTrial = subscriptionStatus === "trial" && trialDaysLeft !== null && trialDaysLeft > 0
  const isExpired = subscriptionStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 0
  return (
    <div className="p-4 border-t border-border/50 space-y-2">
      {showTrial && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
          trialDaysLeft! <= 3
            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
            : "bg-primary/10 text-primary border border-primary/20"
        )}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {trialDaysLeft === 1 ? "Último dia de teste!" : `${trialDaysLeft} dias de teste restantes`}
        </div>
      )}
      {isExpired && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          Teste expirado
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background/50 border border-border/50 shadow-sm">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </div>
        <span className="text-sm font-medium text-muted-foreground">Agente IA Ativo</span>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>
      <p className="text-[10px] text-center text-muted-foreground/40 pt-1">
        Desenvolvido por{" "}
        <a href="https://kanxitsolutions.com.br/" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground/70 transition-colors">
          Kanx It Solutions
        </a>
      </p>
    </div>
  )
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const token = localStorage.getItem("clinic_token")
  const clinicId = user?.clinicId
  const { data: clinic } = useQuery<{
    isBlocked?: boolean
    blockedReason?: string | null
    trialEndsAt?: string | null
    subscriptionStatus?: string | null
  }>({
    queryKey: ["clinic-status", clinicId],
    queryFn: () =>
      fetch(`/api/clinics/${clinicId}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    enabled: !!clinicId,
    refetchInterval: 60_000,
  })

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.visibleTo || (user?.role && item.visibleTo.includes(user.role))
  )

  const trialDaysLeft = clinic?.trialEndsAt
    ? Math.ceil((new Date(clinic.trialEndsAt).getTime() - Date.now()) / 864e5)
    : null
  const isTrialExpired = clinic?.subscriptionStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 0
  const isTrialWarning = clinic?.subscriptionStatus === "trial" && trialDaysLeft !== null && trialDaysLeft > 0 && trialDaysLeft <= 3

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Desktop Sidebar ── */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-border/50 sidebar-bg z-10 hidden md:flex flex-col">
        <div className="p-6 flex flex-col gap-2 border-b border-border/50">
          <AppLogo size="md" />
          <p className="text-xs text-muted-foreground font-medium pl-0.5">
            {user?.name ?? "Clínica Demo"}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavLinks items={visibleItems} location={location} />
        </nav>

        <SidebarFooter logout={logout} trialDaysLeft={trialDaysLeft} subscriptionStatus={clinic?.subscriptionStatus} />
      </aside>

      {/* ── Mobile Top Bar ── */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-border/50 sidebar-bg z-20 flex items-center justify-between px-4 shadow-sm">
        <AppLogo size="sm" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* ── Mobile Drawer ── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-6 border-b border-border/50">
            <SheetTitle asChild>
              <AppLogo size="md" />
            </SheetTitle>
            <p className="text-xs text-muted-foreground font-medium pl-0.5 mt-1">
              {user?.name ?? "Clínica Demo"}
            </p>
          </SheetHeader>

          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            <NavLinks
              items={visibleItems}
              location={location}
              onNavigate={() => setMobileOpen(false)}
            />
          </nav>

          <SidebarFooter logout={logout} trialDaysLeft={trialDaysLeft} subscriptionStatus={clinic?.subscriptionStatus} />
        </SheetContent>
      </Sheet>

      {/* ── Main Content ── */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen main-bg">
        {/* Banner de conta bloqueada */}
        {clinic?.isBlocked && (
          <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center gap-3 text-sm font-medium sticky top-16 md:top-0 z-30">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Esta conta está temporariamente <strong>bloqueada</strong>.
              {clinic.blockedReason ? ` Motivo: ${clinic.blockedReason}.` : ""}
              {" "}Entre em contato com o suporte:{" "}
              <a href="https://kanxitsolutions.com.br/" target="_blank" rel="noopener noreferrer" className="underline">
                kanxitsolutions.com.br
              </a>
            </span>
          </div>
        )}
        {/* Banner de trial expirando em breve */}
        {isTrialWarning && !clinic?.isBlocked && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-3 text-sm font-medium sticky top-16 md:top-0 z-30 text-amber-600 dark:text-amber-400">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              Seu período de teste termina em <strong>{trialDaysLeft} {trialDaysLeft === 1 ? "dia" : "dias"}</strong>.{" "}
              <a href="/#precos" className="underline font-semibold hover:opacity-80 transition-opacity">
                Assine agora para não perder acesso →
              </a>
            </span>
          </div>
        )}
        {/* Paywall: trial expirado */}
        {isTrialExpired && !clinic?.isBlocked ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Período de teste encerrado</h2>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  Seus 14 dias gratuitos chegaram ao fim. Escolha um plano para continuar usando o AtendAI sem interrupções.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <a href="/#precos">
                  <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                    <Rocket className="w-4 h-4" />
                    Ver planos e assinar
                  </button>
                </a>
                <a
                  href="https://kanxitsolutions.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Falar com suporte
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 md:p-8 mt-16 md:mt-0 max-w-7xl mx-auto w-full">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}
