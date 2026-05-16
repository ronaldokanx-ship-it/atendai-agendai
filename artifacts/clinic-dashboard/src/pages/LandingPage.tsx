import * as React from "react"
import { Link } from "wouter"
import { motion, useInView, AnimatePresence } from "framer-motion"
import {
  Bot, Calendar, Package2, Users, MessageSquare, Zap, CheckCircle2,
  ArrowRight, ChevronDown, Headphones, BarChart3, Brain,
  Phone, Building2, Scissors, Dumbbell, ShoppingBag, UtensilsCrossed,
  Home, Scale, BadgeCheck, Clock, TrendingUp, Shield, Menu, X,
  MessageCircle, Send, Stethoscope, Heart, Globe, Layers, Bell,
  ChevronRight, Rocket,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"

// ─── Animated Counter ─────────────────────────────────────────────────────────

function AnimatedCounter({ to, suffix = "", prefix = "" }: { to: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = React.useState(0)
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  React.useEffect(() => {
    if (!inView) return
    let start = 0
    const step = Math.ceil(to / 60)
    const interval = setInterval(() => {
      start += step
      if (start >= to) { setCount(to); clearInterval(interval) }
      else setCount(start)
    }, 20)
    return () => clearInterval(interval)
  }, [inView, to])

  return <span ref={ref}>{prefix}{count.toLocaleString("pt-BR")}{suffix}</span>
}

// ─── 3D Tilt Card ─────────────────────────────────────────────────────────────

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 })
  const ref = React.useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current!.getBoundingClientRect()
    const x = ((e.clientY - rect.top) / rect.height - 0.5) * 14
    const y = -((e.clientX - rect.left) / rect.width - 0.5) * 14
    setTilt({ x, y })
  }

  return (
    <div
      ref={ref}
      className={cn("transition-shadow duration-300", className)}
      style={{ transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: "transform 0.15s ease" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
    >
      {children}
    </div>
  )
}

// ─── Chat Mockup ──────────────────────────────────────────────────────────────

const CHAT_MESSAGES = [
  { from: "user", text: "Olá! Quero agendar uma consulta" },
  { from: "ai", text: "Olá! 😊 Que tipo de serviço você precisa?" },
  { from: "user", text: "Consulta de clareamento dental" },
  { from: "ai", text: "Tenho horários hoje às 14h e 16h. Qual prefere?" },
  { from: "user", text: "14h por favor!" },
  { from: "ai", text: "✅ Agendado! Consulta às 14h com Dr. Ana. Até lá! 🦷" },
]

function ChatMockup() {
  const [visibleCount, setVisibleCount] = React.useState(0)
  const [isTyping, setIsTyping] = React.useState(false)

  React.useEffect(() => {
    if (visibleCount >= CHAT_MESSAGES.length) {
      setTimeout(() => setVisibleCount(0), 3000)
      return
    }
    const next = CHAT_MESSAGES[visibleCount]
    if (next.from === "ai") {
      setIsTyping(true)
      const t = setTimeout(() => {
        setIsTyping(false)
        setVisibleCount(v => v + 1)
      }, 1500)
      return () => clearTimeout(t)
    } else {
      const t = setTimeout(() => setVisibleCount(v => v + 1), 800)
      return () => clearTimeout(t)
    }
  }, [visibleCount])

  return (
    <div className="relative w-[280px] rounded-[2.5rem] overflow-hidden shadow-2xl select-none"
      style={{ background: "#111b21", border: "8px solid #1a1a2e" }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1" style={{ background: "#202c33" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#25d366" }}>
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-xs font-semibold leading-none">AtendAI</p>
            <p className="text-xs mt-0.5" style={{ color: "#25d366" }}>● online agora</p>
          </div>
        </div>
        <Phone className="w-4 h-4" style={{ color: "#aebac1" }} />
      </div>

      {/* Messages area */}
      <div className="px-3 py-3 min-h-[320px] flex flex-col gap-2" style={{ background: "#0b141a" }}>
        <AnimatePresence>
          {CHAT_MESSAGES.slice(0, visibleCount).map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className={cn("max-w-[80%] px-3 py-1.5 rounded-lg text-xs leading-relaxed",
                msg.from === "user"
                  ? "self-end text-white"
                  : "self-start text-white"
              )}
              style={{
                background: msg.from === "user" ? "#005c4b" : "#202c33",
                borderRadius: msg.from === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px"
              }}
            >
              {msg.text}
            </motion.div>
          ))}
          {isTyping && (
            <motion.div
              key="typing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="self-start flex items-center gap-1 px-3 py-2 rounded-xl"
              style={{ background: "#202c33" }}
            >
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "#aebac1" }}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#202c33" }}>
        <div className="flex-1 rounded-full px-3 py-1.5 text-xs" style={{ background: "#2a3942", color: "#aebac1" }}>
          Digite uma mensagem...
        </div>
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#25d366" }}>
          <Send className="w-3 h-3 text-white" />
        </div>
      </div>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handler)
    return () => window.removeEventListener("scroll", handler)
  }, [])

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{ background: scrolled ? "rgba(10,10,20,0.92)" : "transparent", backdropFilter: scrolled ? "blur(12px)" : "none", borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="#hero" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
            <MessageCircle className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Atend<span style={{ color: "#25d366" }}>AI</span></span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          {[["#funcionalidades", "Funcionalidades"], ["#como-funciona", "Como funciona"], ["#casos", "Para quem é"], ["#precos", "Preços"]].map(([href, label]) => (
            <a key={href} href={href} className="transition-colors" style={{ color: "rgba(255,255,255,0.7)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>{label}</a>
          ))}
        </div>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn ? (
            <Link href="/dashboard">
              <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
                Acessar painel <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <button className="px-4 py-2 rounded-lg text-sm font-medium transition-colors" style={{ color: "rgba(255,255,255,0.8)" }}>Entrar</button>
              </Link>
              <Link href="/register">
                <button className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
                  Começar grátis
                </button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button className="md:hidden text-white p-2" onClick={() => setMobileOpen(v => !v)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="md:hidden px-4 pb-4" style={{ background: "rgba(10,10,20,0.98)" }}>
            <div className="flex flex-col gap-3 pt-2">
              {[["#funcionalidades", "Funcionalidades"], ["#como-funciona", "Como funciona"], ["#casos", "Para quem é"], ["#precos", "Preços"]].map(([href, label]) => (
                <a key={href} href={href} onClick={() => setMobileOpen(false)}
                  className="text-sm py-2 border-b" style={{ color: "rgba(255,255,255,0.8)", borderColor: "rgba(255,255,255,0.1)" }}>{label}</a>
              ))}
              {isLoggedIn ? (
                <Link href="/dashboard"><button className="mt-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>Acessar painel</button></Link>
              ) : (
                <>
                  <Link href="/login"><button className="w-full py-2 text-sm text-white">Entrar</button></Link>
                  <Link href="/register"><button className="w-full py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>Começar grátis</button></Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

// ─── Features data ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Bot,
    color: "#6366f1",
    title: "IA que não dorme",
    desc: "Sua empresa atende clientes às 3h da madrugada, no feriado, no final de semana. A IA responde, agenda e vende enquanto você descansa.",
  },
  {
    icon: Calendar,
    color: "#25d366",
    title: "Agenda automatizada",
    desc: "Chega de WhatsApp cheio de 'que horários têm?' A IA consulta disponibilidade real e agenda diretamente, sem intervenção humana.",
  },
  {
    icon: Package2,
    color: "#f59e0b",
    title: "Catálogo inteligente",
    desc: "Cadastre produtos e serviços. A IA apresenta, descreve preços e envia links de pagamento — tudo dentro da conversa no WhatsApp.",
  },
  {
    icon: Headphones,
    color: "#ec4899",
    title: "Handoff humano",
    desc: "Quando o cliente precisa de atenção especial, a IA transfere para um atendente em segundos. Histórico completo, sem repetir nada.",
  },
  {
    icon: BarChart3,
    color: "#3b82f6",
    title: "Analytics em tempo real",
    desc: "Veja quantos atendimentos, taxa de conversão, horários de pico. Dados que transformam decisões em resultados.",
  },
  {
    icon: Shield,
    color: "#8b5cf6",
    title: "Multi-provedor WhatsApp",
    desc: "Funciona com Evolution API e Meta Cloud API oficial. Escolha o que melhor se adapta ao seu negócio, sem lock-in.",
  },
]

// ─── Pricing data ─────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    price: 197,
    annual: 164,
    desc: "Para começar com o pé direito",
    color: "#3b82f6",
    features: [
      "1 número WhatsApp",
      "Até 1.000 atendimentos/mês",
      "Agendamento automático",
      "Catálogo básico (até 20 itens)",
      "2 usuários",
      "Suporte por e-mail",
    ],
    cta: "Testar grátis 14 dias",
    popular: false,
  },
  {
    name: "Profissional",
    price: 397,
    annual: 330,
    desc: "O favorito dos negócios em crescimento",
    color: "#25d366",
    features: [
      "1 número WhatsApp",
      "Atendimentos ilimitados",
      "Agendamento + Catálogo completo",
      "Handoff para humano",
      "Até 5 usuários",
      "Logs de IA + relatórios",
      "Suporte prioritário",
    ],
    cta: "Testar grátis 14 dias",
    popular: true,
  },
  {
    name: "Empresarial",
    price: 797,
    annual: 664,
    desc: "Para múltiplas unidades e escala",
    color: "#8b5cf6",
    features: [
      "Até 3 números WhatsApp",
      "Atendimentos ilimitados",
      "Tudo do Profissional",
      "Usuários ilimitados",
      "API de integração",
      "Gerente de conta dedicado",
      "SLA garantido (99,9%)",
    ],
    cta: "Falar com consultor",
    popular: false,
  },
]

// ─── FAQ data ─────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "Funciona para qualquer tipo de negócio?",
    a: "Sim! O AtendAI foi construído para se adaptar a qualquer segmento: clínicas, salões de beleza, academias, restaurantes, lojas, imobiliárias, escritórios de advocacia e muito mais. Você configura a IA com as informações do seu negócio.",
  },
  {
    q: "Preciso ter conhecimento técnico para usar?",
    a: "Não. A configuração é feita pelo painel visual — sem código. Você cadastra serviços, horários, produtos e personaliza a personalidade da IA em minutos.",
  },
  {
    q: "A IA pode errar e dar informações erradas ao cliente?",
    a: "A IA responde com base apenas no que você cadastrou. Ela não inventa informações. Se não souber responder algo, transfere para um atendente humano automaticamente.",
  },
  {
    q: "Funciona com meu número de WhatsApp atual?",
    a: "Sim. Utilizamos a Evolution API (código aberto) ou a Meta Cloud API oficial. Em ambos os casos, você mantém seu número atual.",
  },
  {
    q: "Como é cobrado? Tem fidelidade?",
    a: "Cobrança mensal, sem fidelidade. Você pode cancelar a qualquer momento. No plano anual, você economiza o equivalente a 2 meses.",
  },
  {
    q: "Existe período de teste gratuito?",
    a: "Sim! Você tem 14 dias grátis, sem precisar inserir cartão de crédito. Tempo suficiente para configurar, testar e sentir a diferença.",
  },
]

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="border-b cursor-pointer" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
      <button className="w-full flex items-center justify-between py-5 text-left gap-4" onClick={() => setOpen(v => !v)}>
        <span className="text-white font-medium text-sm sm:text-base">{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-5 h-5 shrink-0" style={{ color: "#25d366" }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }} className="overflow-hidden">
            <p className="pb-5 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Comparison Bar ───────────────────────────────────────────────────────────

function ComparisonBar({ label, humanLabel, aiLabel, humanPct, aiPct, humanColor = "#ef4444", aiColor = "#25d366" }: {
  label: string; humanLabel: string; aiLabel: string; humanPct: number; aiPct: number; humanColor?: string; aiColor?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  return (
    <div ref={ref} className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs w-20 shrink-0 text-right" style={{ color: "rgba(255,255,255,0.7)" }}>Sem IA</span>
        <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div className="h-full rounded-full"
            style={{ background: humanColor }}
            initial={{ width: 0 }} animate={{ width: inView ? `${humanPct}%` : 0 }}
            transition={{ duration: 1, delay: 0.2 }} />
        </div>
        <span className="text-xs font-bold shrink-0 min-w-[56px]" style={{ color: "#fff" }}>{humanLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs w-20 shrink-0 text-right font-semibold" style={{ color: "#25d366" }}>Com AtendAI</span>
        <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <motion.div className="h-full rounded-full"
            style={{ background: aiColor }}
            initial={{ width: 0 }} animate={{ width: inView ? `${aiPct}%` : 0 }}
            transition={{ duration: 1, delay: 0.5 }} />
        </div>
        <span className="text-xs font-bold shrink-0 min-w-[56px]" style={{ color: "#25d366" }}>{aiLabel}</span>
      </div>
    </div>
  )
}

// ─── Use Cases data ───────────────────────────────────────────────────────────

const USE_CASES = [
  { icon: Stethoscope, label: "Clínicas Médicas" },
  { icon: Heart, label: "Clínicas Estéticas" },
  { icon: Scissors, label: "Salões de Beleza" },
  { icon: Dumbbell, label: "Academias" },
  { icon: UtensilsCrossed, label: "Restaurantes" },
  { icon: ShoppingBag, label: "Lojas & E-commerce" },
  { icon: Home, label: "Imobiliárias" },
  { icon: Scale, label: "Escritórios Jurídicos" },
  { icon: Building2, label: "Clínicas Veterinárias" },
  { icon: Globe, label: "Qualquer negócio" },
]

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children, id, className, style }: { children: React.ReactNode; id?: string; className?: string; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLElement>(null)
  return (
    <motion.section id={id} ref={ref as React.RefObject<HTMLElement>}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
      className={cn("py-20 px-4 sm:px-6", className)}
      style={style}>
      {children}
    </motion.section>
  )
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user } = useAuth()
  const [annual, setAnnual] = React.useState(false)

  return (
    <div className="min-h-screen" style={{ background: "#080d14", color: "#fff" }}>
      <Nav isLoggedIn={!!user} />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section id="hero" className="relative min-h-screen flex items-center overflow-hidden px-4 sm:px-6"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(37,211,102,0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 60%, rgba(99,102,241,0.12) 0%, transparent 60%), #080d14"
        }}>

        {/* Floating orbs */}
        {[
          { w: 400, h: 400, top: "5%", left: "-10%", color: "rgba(37,211,102,0.07)" },
          { w: 300, h: 300, top: "40%", right: "-5%", color: "rgba(99,102,241,0.08)" },
          { w: 200, h: 200, bottom: "10%", left: "30%", color: "rgba(37,211,102,0.05)" },
        ].map((orb, i) => (
          <motion.div key={i} className="absolute rounded-full pointer-events-none"
            style={{ width: orb.w, height: orb.h, top: orb.top, left: orb.left, right: (orb as any).right, bottom: (orb as any).bottom, background: orb.color, filter: "blur(60px)" }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 6 + i * 2, repeat: Infinity, ease: "easeInOut" }} />
        ))}

        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center pt-20 pb-12">
          {/* Left */}
          <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }} className="flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.3)", color: "#25d366" }}>
              <Zap className="w-3.5 h-3.5" />
              IA generativa + WhatsApp = negócio 24/7
            </motion.div>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-[1.1] tracking-tight">
              Seu negócio atendendo{" "}
              <span style={{ background: "linear-gradient(90deg,#25d366,#128c7e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                clientes pelo WhatsApp
              </span>
              <br />
              sem você precisar estar presente
            </h1>

            <p className="text-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.65)", maxWidth: 520 }}>
              O AtendAI atende, agenda, vende e responde dúvidas <strong style={{ color: "#fff" }}>automaticamente pelo WhatsApp</strong> — 24 horas por dia, 7 dias por semana. Para qualquer tipo de empresa.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link href="/register">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-bold text-white text-sm shadow-lg"
                  style={{ background: "linear-gradient(135deg,#25d366,#128c7e)", boxShadow: "0 0 30px rgba(37,211,102,0.3)" }}>
                  <Rocket className="w-4 h-4" />
                  Testar grátis por 14 dias
                </motion.button>
              </Link>
              <a href="#como-funciona">
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>
                  Ver demonstração <ChevronRight className="w-4 h-4" />
                </motion.button>
              </a>
            </div>

            <div className="flex flex-wrap gap-4 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
              {["Sem cartão de crédito", "Cancele quando quiser", "Setup em menos de 30 min"].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "#25d366" }} /> {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right — phone mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center lg:justify-end"
          >
            <motion.div
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              {/* Glow behind phone */}
              <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgba(37,211,102,0.25) 0%, transparent 70%)", transform: "scale(1.4)", zIndex: 0 }} />
              <div className="relative z-10">
                <ChatMockup />
              </div>
              {/* Floating badges */}
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                className="absolute -left-16 top-16 px-3 py-2 rounded-xl text-xs font-semibold hidden sm:flex items-center gap-2"
                style={{ background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.3)", color: "#25d366", backdropFilter: "blur(8px)" }}>
                <CheckCircle2 className="w-4 h-4" /> Agendado com sucesso!
              </motion.div>
              <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity, delay: 1 }}
                className="absolute -right-12 bottom-24 px-3 py-2 rounded-xl text-xs font-semibold hidden sm:flex items-center gap-2"
                style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", backdropFilter: "blur(8px)" }}>
                <Bot className="w-4 h-4" /> IA respondeu em 0,3s
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" style={{ color: "rgba(255,255,255,0.3)" }}>
          <span className="text-xs">scroll</span>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </section>

      {/* ── STATS BAR ────────────────────────────────────────────────────────── */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { to: 500, suffix: "+", label: "Empresas atendidas" },
            { to: 98, suffix: "%", label: "Taxa de satisfação" },
            { to: 24, suffix: "h/dia", label: "Disponibilidade" },
            { to: 70, suffix: "% menos", label: "Custo por atendimento" },
          ].map(({ to, suffix, label }) => (
            <div key={label}>
              <p className="text-3xl sm:text-4xl font-extrabold" style={{ color: "#25d366" }}>
                <AnimatedCounter to={to} suffix={suffix} />
              </p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FEATURES ──────────────────────────────────────────────────────────── */}
      <Section id="funcionalidades" className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>Funcionalidades</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold">Tudo que seu negócio precisa, no WhatsApp</h2>
          <p className="mt-4 max-w-2xl mx-auto text-base" style={{ color: "rgba(255,255,255,0.6)" }}>
            Do atendimento à venda, do agendamento ao pós-venda. O AtendAI cobre toda a jornada do seu cliente.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <TiltCard key={title}>
              <div className="h-full p-6 rounded-2xl flex flex-col gap-4 group cursor-default"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", transition: "border-color 0.3s, background 0.3s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = color + "60"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)" }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)" }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ background: color + "20", color }}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base mb-1.5 text-white">{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{desc}</p>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </Section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <Section id="como-funciona"
        style={{ background: "radial-gradient(ellipse 100% 60% at 50% 50%, rgba(37,211,102,0.04) 0%, transparent 70%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>Como funciona</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Em 3 passos simples</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-16 left-1/3 right-1/3 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(37,211,102,0.4), transparent)" }} />
            {[
              { step: 1, icon: MessageCircle, title: "Conecte o WhatsApp", desc: "Vincule seu número em menos de 5 minutos. Suportamos Evolution API e Meta Cloud API oficial." },
              { step: 2, icon: Brain, title: "Configure sua IA", desc: "Cadastre serviços, horários, produtos e a personalidade da IA. Sem código. Interface visual." },
              { step: 3, icon: Zap, title: "Deixe a IA trabalhar", desc: "Pronto! Sua IA começa a atender, agendar e vender automaticamente. Você só acompanha os resultados." },
            ].map(({ step, icon: Icon, title, desc }) => (
              <motion.div key={step} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: step * 0.15 }}
                className="flex flex-col items-center text-center gap-4 p-6">
                <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.3)" }}>
                  <Icon className="w-7 h-7" style={{ color: "#25d366" }} />
                  <div className="absolute -top-3 -right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "#25d366", color: "#000" }}>{step}</div>
                </div>
                <div>
                  <h3 className="font-bold text-lg mb-2">{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── COMPARISON ────────────────────────────────────────────────────────── */}
      <Section style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>Por que IA?</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Números que convencem</h2>
            <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.6)" }}>
              Compare um atendimento humano tradicional com o AtendAI
            </p>
          </div>
          <div className="rounded-2xl p-6 sm:p-10 space-y-8"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ComparisonBar label="Tempo médio de primeira resposta" humanLabel="8 horas" aiLabel="menos de 1 minuto" humanPct={95} aiPct={30} />
            <ComparisonBar label="Custo por atendimento" humanLabel="R$ 38" aiLabel="R$ 0,80" humanPct={90} aiPct={8} humanColor="#f59e0b" aiColor="#25d366" />
            <ComparisonBar label="Disponibilidade diária" humanLabel="8h/dia" aiLabel="24h/dia" humanPct={33} aiPct={100} humanColor="#6366f1" aiColor="#25d366" />
            <ComparisonBar label="Capacidade simultânea" humanLabel="1 cliente" aiLabel="Ilimitado" humanPct={10} aiPct={100} humanColor="#ec4899" aiColor="#25d366" />
          </div>
        </div>
      </Section>

      {/* ── USE CASES ─────────────────────────────────────────────────────────── */}
      <Section id="casos">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>Para quem é</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Se você usa WhatsApp para atender, o AtendAI é para você</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {USE_CASES.map(({ icon: Icon, label }) => (
              <motion.div key={label} whileHover={{ scale: 1.05, y: -4 }}
                className="flex flex-col items-center gap-3 p-4 rounded-xl text-center cursor-default"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(37,211,102,0.12)" }}>
                  <Icon className="w-5 h-5" style={{ color: "#25d366" }} />
                </div>
                <span className="text-xs font-medium leading-tight">{label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── PRICING ───────────────────────────────────────────────────────────── */}
      <Section id="precos">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>Planos e Preços</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Investimento que se paga sozinho</h2>
            <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.6)" }}>
              Um atendente humano custa de R$2.000 a R$5.000/mês. O AtendAI começa em R$197.
            </p>
            {/* Toggle */}
            <div className="mt-6 inline-flex items-center gap-3 p-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <button onClick={() => setAnnual(false)} className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                style={{ background: !annual ? "#25d366" : "transparent", color: !annual ? "#000" : "rgba(255,255,255,0.6)" }}>
                Mensal
              </button>
              <button onClick={() => setAnnual(true)} className="px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2"
                style={{ background: annual ? "#25d366" : "transparent", color: annual ? "#000" : "rgba(255,255,255,0.6)" }}>
                Anual <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: annual ? "rgba(0,0,0,0.2)" : "rgba(37,211,102,0.2)", color: annual ? "#000" : "#25d366" }}>-17%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map(({ name, price, annual: annualPrice, desc, color, features, cta, popular }) => (
              <motion.div key={name} whileHover={{ y: -6, scale: 1.02 }}
                className="relative p-6 rounded-2xl flex flex-col gap-5"
                style={{
                  background: popular ? `rgba(37,211,102,0.07)` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${popular ? "rgba(37,211,102,0.4)" : "rgba(255,255,255,0.08)"}`,
                  boxShadow: popular ? "0 0 40px rgba(37,211,102,0.1)" : "none"
                }}>
                {popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold"
                    style={{ background: "#25d366", color: "#000" }}>
                    ⭐ MAIS POPULAR
                  </div>
                )}
                <div>
                  <p className="font-bold text-lg" style={{ color }}>{name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{desc}</p>
                </div>
                <div>
                  <span className="text-4xl font-extrabold">
                    R${(annual ? annualPrice : price).toLocaleString("pt-BR")}
                  </span>
                  <span className="text-sm ml-1" style={{ color: "rgba(255,255,255,0.5)" }}>/mês</span>
                  {annual && (
                    <p className="text-xs mt-1" style={{ color: "#25d366" }}>
                      Cobrado anualmente · Economize R${((price - annualPrice) * 12).toLocaleString("pt-BR")}/ano
                    </p>
                  )}
                </div>
                <ul className="space-y-2.5 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
                      <span style={{ color: "rgba(255,255,255,0.8)" }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="w-full py-3 rounded-xl font-bold text-sm transition-all"
                    style={{
                      background: popular ? "linear-gradient(135deg,#25d366,#128c7e)" : "rgba(255,255,255,0.07)",
                      color: popular ? "#000" : "rgba(255,255,255,0.9)",
                      border: popular ? "none" : "1px solid rgba(255,255,255,0.15)"
                    }}>
                    {cta}
                  </motion.button>
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="text-center mt-6 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            14 dias grátis em todos os planos · Sem cartão de crédito · Cancele quando quiser
          </p>
        </div>
      </Section>

      {/* ── FAQ ────────────────────────────────────────────────────────────────── */}
      <Section style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#25d366" }}>FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold">Perguntas frequentes</h2>
          </div>
          {FAQS.map(({ q, a }) => <FAQItem key={q} q={q} a={a} />)}
        </div>
      </Section>

      {/* ── FINAL CTA ──────────────────────────────────────────────────────────── */}
      <Section style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(37,211,102,0.1) 0%, transparent 70%)" }}>
        <div className="max-w-3xl mx-auto text-center flex flex-col items-center gap-6">
          <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }} transition={{ duration: 3, repeat: Infinity }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
            <MessageCircle className="w-8 h-8 text-white" />
          </motion.div>
          <h2 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Comece a atender mais.<br />
            <span style={{ background: "linear-gradient(90deg,#25d366,#128c7e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Trabalhe menos.
            </span>
          </h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.6)", maxWidth: 480 }}>
            Cada hora que passa sem o AtendAI é uma hora em que seus concorrentes estão atendendo clientes enquanto você dorme.
          </p>
          <Link href="/register">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-black text-base shadow-2xl"
              style={{ background: "linear-gradient(135deg,#25d366,#128c7e)", boxShadow: "0 0 50px rgba(37,211,102,0.35)" }}>
              <Rocket className="w-5 h-5" />
              Ativar meu AtendAI grátis agora
            </motion.button>
          </Link>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            14 dias grátis · Sem cartão · Cancele a qualquer momento
          </p>
        </div>
      </Section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#050810", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#25d366,#128c7e)" }}>
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-bold text-lg">Atend<span style={{ color: "#25d366" }}>AI</span></span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                Automatização inteligente de atendimento via WhatsApp para qualquer tipo de negócio.
              </p>
            </div>
            {/* Product */}
            <div>
              <p className="font-semibold text-sm mb-4">Produto</p>
              <ul className="space-y-2.5">
                {[["#funcionalidades", "Funcionalidades"], ["#como-funciona", "Como funciona"], ["#precos", "Preços"], ["#casos", "Casos de uso"]].map(([href, label]) => (
                  <li key={href}><a href={href} className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.45)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#25d366")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>{label}</a></li>
                ))}
              </ul>
            </div>
            {/* Legal */}
            <div>
              <p className="font-semibold text-sm mb-4">Conta</p>
              <ul className="space-y-2.5">
                {[["/login", "Entrar"], ["/register", "Criar conta"]].map(([href, label]) => (
                  <li key={href}><Link href={href}><a className="text-xs transition-colors" style={{ color: "rgba(255,255,255,0.45)" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#25d366")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>{label}</a></Link></li>
                ))}
              </ul>
            </div>
            {/* Developed by */}
            <div>
              <p className="font-semibold text-sm mb-4">Desenvolvido por</p>
              <a href="https://kanxitsolutions.com.br" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs transition-colors"
                style={{ color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#25d366")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}>
                <Globe className="w-3.5 h-3.5" />
                Kanx IT Solutions
              </a>
              <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.3)" }}>
                Soluções de tecnologia e automação para pequenas e médias empresas.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>© 2026 AtendAI. Todos os direitos reservados.</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              Feito com 🧡 no Brasil por{" "}
              <a href="https://kanxitsolutions.com.br" target="_blank" rel="noopener noreferrer" style={{ color: "#25d366" }}>Kanx IT Solutions</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
