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
  UserCheck
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AppLayoutProps {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/services", label: "Services", icon: Stethoscope },
  { href: "/professionals", label: "Profissionais", icon: UserCheck },
  { href: "/patients", label: "Clientes", icon: Users },
  { href: "/logs", label: "AI Logs", icon: MessageSquareText },
  { href: "/settings/ai", label: "AI Settings", icon: Bot },
]

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation()

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
            <p className="text-xs text-muted-foreground font-medium">Demo Clinic</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
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

        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-background/50 border border-border/50 shadow-sm">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">AI Agent Active</span>
          </div>
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
