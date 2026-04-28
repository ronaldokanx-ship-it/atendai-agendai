import * as React from "react"
import { Link, useLocation } from "wouter"
import { 
  LayoutDashboard, 
  Bot, 
  Stethoscope, 
  CalendarDays, 
  MessageSquareText,
  Building2,
  Users,
  UserCheck,
  FlaskConical,
  Settings2,
  LogOut,
  UsersRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"

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
  { href: "/team", label: "Equipe", icon: UsersRound, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/logs", label: "Logs de IA", icon: MessageSquareText, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/chat", label: "Testar IA", icon: FlaskConical, visibleTo: ["owner", "supervisor"] as string[] },
  { href: "/settings/ai", label: "Config. de IA", icon: Bot, visibleTo: ["owner"] as string[] },
  { href: "/settings/clinic", label: "Integrações", icon: Settings2, visibleTo: ["owner"] as string[] },
]

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation()
  const { user, logout } = useAuth()

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.visibleTo || (user?.role && item.visibleTo.includes(user.role))
  )

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-border/50 bg-card z-10 hidden md:flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight tracking-tight">ClinicAI</h1>
            <p className="text-xs text-muted-foreground font-medium">
              {user?.name ?? "Clínica Demo"}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = location === item.href || (location === "/" && item.href === "/dashboard")
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 translate-x-1" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-0.5"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2">
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
        </div>
      </aside>

      {/* Mobile nav placeholder - full app would have a mobile hamburger menu */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-border/50 bg-card z-20 flex items-center px-4 shadow-sm">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mr-3">
          <Building2 className="w-4 h-4" />
        </div>
        <h1 className="font-display font-bold text-lg">ClinicAI</h1>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-screen bg-muted/20">
        <div className="flex-1 p-4 md:p-8 mt-16 md:mt-0 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
