import * as React from "react"
import { X, Minus, Send, Bot, User, Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useListHandoffMessages,
  useSendHandoffMessage,
  getListHandoffMessagesQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ChatPanelProps {
  phone: string
  patientName?: string
  clinicId: number
  onClose: () => void
  style?: React.CSSProperties
}

export function ChatPanel({ phone, patientName, clinicId, onClose, style }: ChatPanelProps) {
  const [minimized, setMinimized] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const queryClient = useQueryClient()
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const { data: messages = [], isLoading } = useListHandoffMessages(clinicId, phone)
  const send = useSendHandoffMessage()

  // Scroll para o fim sempre que chegam novas mensagens
  React.useEffect(() => {
    if (!minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, minimized])

  const handleSend = () => {
    const content = message.trim()
    if (!content || send.isPending) return
    setMessage("")
    send.mutate(
      { clinicId, phone, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListHandoffMessagesQueryKey(clinicId, phone),
          })
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const displayName = patientName || phone

  return (
    <div
      className="fixed bottom-0 z-50 flex flex-col w-80 shadow-2xl rounded-t-xl border border-border/60 bg-background overflow-hidden"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-primary text-primary-foreground select-none">
        <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{displayName}</p>
          {patientName && (
            <p className="text-[10px] opacity-70 truncate">{phone}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-primary-foreground/20 text-primary-foreground"
            onClick={() => setMinimized((v) => !v)}
          >
            <Minus className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-primary-foreground/20 text-primary-foreground"
            onClick={onClose}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-muted/20 min-h-0 max-h-80">
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                Carregando histórico...
              </div>
            )}
            {!isLoading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                <Headphones className="w-8 h-8 opacity-20" />
                Nenhuma mensagem ainda.
              </div>
            )}
            {messages.map((msg) => {
              const isPatient = msg.source === "patient"
              const isAi = msg.source === "ai"
              const isAttendant = msg.source === "attendant"

              return (
                <div key={msg.id} className={cn("flex gap-1.5 max-w-[85%]", isPatient ? "self-start mr-auto" : "self-end ml-auto flex-row-reverse")}>
                  {/* Avatar */}
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    isPatient ? "bg-muted-foreground/20" : isAi ? "bg-purple-500/20" : "bg-blue-500/20"
                  )}>
                    {isPatient ? <User className="w-2.5 h-2.5 text-muted-foreground" /> :
                      isAi ? <Bot className="w-2.5 h-2.5 text-purple-500" /> :
                        <Headphones className="w-2.5 h-2.5 text-blue-500" />}
                  </div>

                  <div className={cn(
                    "rounded-xl px-2.5 py-1.5 text-xs leading-relaxed",
                    isPatient
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : isAi
                        ? "bg-purple-100 dark:bg-purple-950/50 text-purple-900 dark:text-purple-100 rounded-tr-sm"
                        : "bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 rounded-tr-sm"
                  )}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={cn(
                      "text-[9px] mt-0.5 opacity-60",
                      isPatient ? "text-left" : "text-right"
                    )}>
                      {format(new Date(msg.createdAt), "HH:mm", { locale: ptBR })}
                      {isAi && " · IA"}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-2.5 py-2 border-t border-border/50 bg-background">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={onClose}
              title="Encerrar atendimento e devolver à IA"
            >
              Encerrar
            </Button>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              className="h-8 text-xs"
              disabled={send.isPending}
              autoFocus
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSend}
              disabled={!message.trim() || send.isPending}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
