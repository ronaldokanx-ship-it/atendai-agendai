import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Bot, User, Trash2, MessageSquare, Phone, RefreshCw, Info } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth"
import { useGetClinic } from "@workspace/api-client-react"

const DEFAULT_PHONE = "+5511999999999"

type Role = "user" | "bot" | "system"

interface InteractiveSlotRow {
  id: string
  title: string
  description?: string
}

interface InteractiveListData {
  type: "list"
  header: string
  body: string
  button: string
  sections: Array<{
    title: string
    rows: InteractiveSlotRow[]
  }>
}

interface InteractiveChoiceData {
  header: string
  body: string
  footerText?: string
  options: Array<{ id: string; label: string; description?: string }>
}

interface Message {
  id: string
  role: Role
  text: string
  timestamp: Date
  appointmentId?: number | null
  interactiveList?: InteractiveListData | null
  interactiveChoice?: InteractiveChoiceData | null
}

function uid() {
  return Math.random().toString(36).slice(2)
}

/**
 * Constrói a mensagem a enviar ao backend quando o usuário clica num item interativo.
 * Simula o mesmo comportamento do handler do webhook Evolution API:
 *  - S|profId|svcId|isoSlot → injeta [SELEÇÃO] para acionar book_appointment na IA
 *  - OD          → dispara "Quero ver horários em outro dia..."
 *  - M|...       → passa o título (IA lida com paginação por contexto)
 *  - SVC|, PRF|, DATE|, CNF|, APPT|, CNC|, RMK| → passa o ID diretamente (fluxo de agendamento)
 *  - outros IDs  → passa o título como texto normal
 */
function buildWebhookMessage(rowId: string, rowTitle: string): string {
  if (rowId === "OD") return "Quero ver horários em outro dia..."
  // IDs do fluxo determinístico — passados diretamente ao backend.
  // S| inclui slots de agendamento; o servidor decide se usa scheduling flow ou AI.
  if (
    rowId.startsWith("S|") ||
    rowId.startsWith("SVC|") || rowId.startsWith("PRF|") || rowId.startsWith("DATE|") ||
    rowId.startsWith("CNF|") || rowId.startsWith("APPT|") || rowId.startsWith("CNC|") ||
    rowId.startsWith("RMK|")
  ) {
    return rowId
  }
  return rowTitle
}

/** Texto amigável exibido na bolha do usuário ao clicar num item */
function buildDisplayText(rowId: string, rowTitle: string): string {
  if (rowId.startsWith("S|")) return `✓ ${rowTitle}`
  return rowTitle
}

/** True para botões de navegação (paginação / outro dia) — exibe estilo diferente */
function isNavRow(rowId: string): boolean {
  return rowId === "OD" || rowId.startsWith("M|")
}

export default function AiChat() {
  const { user, token } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const { data: clinic, isLoading: clinicLoading } = useGetClinic(CLINIC_ID)
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: uid(),
      role: "system",
      text: "Simulação de conversa WhatsApp — envie mensagens como se fosse um paciente e veja a IA responder em tempo real.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = React.useState("")
  const [phone, setPhone] = React.useState(DEFAULT_PHONE)
  const [loading, setLoading] = React.useState(false)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Auto-scroll para a última mensagem
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  /** Chama o endpoint de teste autenticado e adiciona a resposta ao chat */
  const callTestEndpoint = React.useCallback(async (webhookMessage: string) => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`/api/clinics/${CLINIC_ID}/whatsapp/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ from: phone, message: webhookMessage, messageType: "text" }),
      })

      if (!res.ok) {
        const err = await res.text()
        setMessages(prev => [...prev, {
          id: uid(), role: "system",
          text: `Erro ${res.status}: ${err}`,
          timestamp: new Date(),
        }])
        return
      }

      const data = await res.json() as {
        reply: string
        appointmentId: number | null
        interactiveList?: InteractiveListData | null
        interactiveChoice?: InteractiveChoiceData | null
      }

      setMessages(prev => [...prev, {
        id: uid(),
        role: "bot",
        text: data.reply,
        timestamp: new Date(),
        appointmentId: data.appointmentId,
        interactiveList: data.interactiveList ?? null,
        interactiveChoice: data.interactiveChoice ?? null,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: uid(), role: "system",
        text: `Falha ao conectar com o servidor: ${String(err)}. Certifique-se de que o servidor está rodando.`,
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [token, CLINIC_ID, phone])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setMessages(prev => [...prev, { id: uid(), role: "user", text, timestamp: new Date() }])
    setInput("")
    await callTestEndpoint(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  /** Clique num item de lista interativa */
  const sendInteractiveRow = React.useCallback(async (row: InteractiveSlotRow) => {
    if (loading) return
    const displayText = buildDisplayText(row.id, row.title)
    const webhookMsg = buildWebhookMessage(row.id, row.title)
    setMessages(prev => [...prev, { id: uid(), role: "user", text: displayText, timestamp: new Date() }])
    await callTestEndpoint(webhookMsg)
  }, [loading, callTestEndpoint])

  /** Clique num botão de interactiveChoice */
  const sendChoiceOption = React.useCallback(async (optionId: string, label: string) => {
    if (loading) return
    setMessages(prev => [...prev, { id: uid(), role: "user", text: label, timestamp: new Date() }])
    // Passa o ID diretamente para botões do fluxo de agendamento (CNF|yes, CNF|no, etc.)
    const webhookMsg = buildWebhookMessage(optionId, label)
    await callTestEndpoint(webhookMsg)
  }, [loading, callTestEndpoint])

  const clearChat = async () => {
    // Reseta o histórico no backend para a IA não lembrar da conversa anterior
    if (token) {
      try {
        await fetch(`/api/clinics/${CLINIC_ID}/whatsapp/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ from: phone, message: "reiniciarx", messageType: "text" }),
        })
      } catch { /* silencioso */ }
    }
    setMessages([{
      id: uid(),
      role: "system",
      text: "Conversa reiniciada. Envie uma mensagem para começar.",
      timestamp: new Date(),
    }])
  }

  const aiDisplayName = clinic?.aiName || "Assistente IA"
  const clinicDisplayName = clinic?.name || "Clínica"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Testar IA</h1>
          <p className="text-muted-foreground mt-1">
            Simule uma conversa de WhatsApp e teste o fluxo de agendamento da IA.
          </p>
        </div>
        <Button variant="outline" className="gap-2 self-start sm:self-auto" onClick={clearChat}>
          <RefreshCw className="w-4 h-4" /> Nova conversa
        </Button>
      </div>

      {/* Info banner */}
      <Card className="p-4 bg-blue-90/40 border-blue-100 dark:bg-green-300/10 dark:border-green-900">
        <div className="flex items-start gap-3 text-sm">
          <Info className="w-4 h-4 text-blue-950 mt-0.5 shrink-0" />
          <div className="text-blue-700 dark:text-blue-500 space-y-1">
            <p className="font-semibold">Como funciona</p>
            <p>
              As mensagens são processadas pela IA real da sua clínica, usando as configurações de
              Personalidade e Base de Conhecimento. Agendamentos criados aqui aparecem na página de Agendamentos.
              Clique em <strong>Nova conversa</strong> para reiniciar o contexto da IA.
            </p>
          </div>
        </div>
      </Card>

      {/* Phone config + chat container */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left: config */}
        <Card className="p-4 space-y-4 lg:sticky lg:top-8">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Número simulado</p>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+5511999999999"
                className="text-sm h-8"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Identifica o "paciente" na conversa
            </p>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sugestões</p>
            {[
              "Olá, quero marcar uma consulta",
              "Quais serviços vocês têm?",
              "Quero ver horários para amanhã",
              "Tem vaga para sexta-feira?",
              "Qual o endereço da clínica?",
              "Cancelar meu agendamento",
            ].map(suggestion => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 hover:bg-muted hover:border-primary/30 transition-colors text-muted-foreground first-letter:capitalize"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-muted-foreground hover:text-destructive"
              onClick={clearChat}
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpar conversa
            </Button>
          </div>
        </Card>

        {/* Right: chat window */}
        <Card className="lg:col-span-3 flex flex-col overflow-hidden" style={{ height: "75vh" }}>
          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/50 bg-muted/20 shrink-0">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">
                {clinicLoading ? "Carregando..." : `${aiDisplayName} — ${clinicDisplayName}`}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Online
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className={cn(
                    "flex gap-2.5",
                    msg.role === "user" && "flex-row-reverse",
                    msg.role === "system" && "justify-center",
                  )}
                >
                  {/* Avatar */}
                  {msg.role !== "system" && (
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      msg.role === "bot"  ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600",
                    )}>
                      {msg.role === "bot" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={cn(
                    "max-w-[75%]",
                    msg.role === "system" && "max-w-full",
                  )}>
                    {msg.role === "system" ? (
                      <p className="text-xs text-center text-muted-foreground bg-muted/40 px-4 py-2 rounded-full border border-border/40">
                        {msg.text}
                      </p>
                    ) : (
                      <>
                        <div className={cn(
                          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                          msg.role === "bot"
                            ? "bg-card border border-border/60 rounded-tl-sm text-foreground"
                            : "bg-emerald-500 text-white rounded-tr-sm",
                        )}>
                          {msg.text}
                        </div>

                        {/* Lista interativa de horários (só para bot) */}
                        {msg.role === "bot" && msg.interactiveList && (
                          <div className="mt-2 bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden max-w-[75%]">
                            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
                              <p className="text-xs font-semibold text-foreground">{msg.interactiveList.header}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{msg.interactiveList.body}</p>
                            </div>
                            <div className="divide-y divide-border/30">
                              {msg.interactiveList.sections.map(section => (
                                <div key={section.title}>
                                  <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">{section.title}</p>
                                  <div className="flex flex-wrap gap-1.5 p-3">
                                    {section.rows.map(row => (
                                      <button
                                        key={row.id}
                                        disabled={loading}
                                        onClick={() => sendInteractiveRow(row)}
                                        className={cn(
                                          "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                                          isNavRow(row.id)
                                            ? "border-primary/50 text-primary hover:bg-primary/10 bg-transparent"
                                            : "border-transparent bg-primary/10 text-primary hover:bg-primary/20",
                                          loading && "opacity-50 cursor-not-allowed",
                                        )}
                                      >
                                        {row.title}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Botões interativos da ferramenta list_options */}
                        {msg.role === "bot" && msg.interactiveChoice && (
                          <div className="mt-2 bg-card border border-border/60 rounded-xl shadow-sm overflow-hidden max-w-[75%]">
                            <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
                              <p className="text-xs font-semibold text-foreground">{msg.interactiveChoice.header}</p>
                              {msg.interactiveChoice.body && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{msg.interactiveChoice.body}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 p-3">
                              {msg.interactiveChoice.options.map(opt => (
                                <button
                                  key={opt.id}
                                  disabled={loading}
                                  onClick={() => sendChoiceOption(opt.id, opt.label)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-primary/50 text-primary hover:bg-primary/10 bg-transparent",
                                    loading && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {msg.interactiveChoice.footerText && (
                              <p className="px-4 pb-2.5 text-[10px] text-muted-foreground">
                                {msg.interactiveChoice.footerText}
                              </p>
                            )}
                          </div>
                        )}

                        <div className={cn(
                          "flex items-center gap-2 mt-1 px-1",
                          msg.role === "user" && "flex-row-reverse",
                        )}>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {format(msg.timestamp, "HH:mm", { locale: ptBR })}
                          </span>
                          {msg.appointmentId && (
                            <Badge variant="success" className="text-[10px] h-4 px-1.5 gap-1">
                              <MessageSquare className="w-2.5 h-2.5" />
                              Agendamento #{msg.appointmentId} criado
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 shadow-sm">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border/50 bg-background/50 shrink-0">
            <div className="flex gap-2 items-center">
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma mensagem..."
                disabled={loading}
                className="flex-1 bg-background"
                autoFocus
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Enter para enviar · As respostas refletem a configuração real da IA em "Config. de IA"
            </p>
          </div>
        </Card>
      </div>
    </motion.div>
  )
}
