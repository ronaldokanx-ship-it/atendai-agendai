import * as React from "react"
import { Bot, User, Headphones, Phone } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useListHandoffMessages, getListHandoffMessagesQueryKey } from "@workspace/api-client-react"
import { useHandoffs } from "@/contexts/handoffs"
import { cn } from "@/lib/utils"

interface ConversationViewSheetProps {
  phone: string | null
  patientName?: string
  clinicId: number
  onClose: () => void
}

export function ConversationViewSheet({
  phone,
  patientName,
  clinicId,
  onClose,
}: ConversationViewSheetProps) {
  const { openHandoff, activePhones, openHandoffs } = useHandoffs()
  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const { data: messages = [], isLoading } = useListHandoffMessages(
    clinicId,
    phone ?? "",
    undefined,
    { query: { queryKey: getListHandoffMessagesQueryKey(clinicId, phone ?? "", undefined), enabled: !!phone } }
  )

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const isAlreadyOpen = openHandoffs.some((h) => h.phone === phone)
  const isActive = phone ? activePhones.includes(phone) : false
  const canAssume = !isAlreadyOpen && openHandoffs.length < 3

  const handleAssume = () => {
    if (!phone || !canAssume) return
    openHandoff(phone, patientName ?? (phone !== patientName ? patientName : undefined))
    onClose()
  }

  const displayName = patientName && patientName !== phone ? patientName : phone

  return (
    <Sheet open={!!phone} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base leading-tight truncate">
                {displayName}
              </SheetTitle>
              {patientName && patientName !== phone && (
                <SheetDescription className="text-xs mt-0.5">{phone}</SheetDescription>
              )}
            </div>
            {isActive && (
              <Badge variant="default" className="text-xs gap-1 shrink-0">
                <Headphones className="w-3 h-3" />
                Em atendimento
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Visualização do histórico. A IA continua respondendo normalmente.
            Para assumir o atendimento manualmente, clique em{" "}
            <strong>Assumir Conversa</strong>.
          </p>
        </SheetHeader>

        {/* Messages — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 bg-muted/10">
          {isLoading && (
            <div className="space-y-3 pt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className={cn("h-14 rounded-xl", i % 2 === 0 ? "w-3/4" : "w-4/5 ml-auto")} />
              ))}
            </div>
          )}
          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-3">
              <Bot className="w-10 h-10 opacity-20" />
              Nenhuma mensagem encontrada.
            </div>
          )}
          {messages.map((msg) => {
            const isPatient = msg.source === "patient"
            const isAi = msg.source === "ai"

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2 max-w-[88%]",
                  isPatient ? "mr-auto" : "ml-auto flex-row-reverse"
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  isPatient
                    ? "bg-muted-foreground/15"
                    : isAi
                      ? "bg-purple-500/15"
                      : "bg-blue-500/15"
                )}>
                  {isPatient
                    ? <User className="w-3 h-3 text-muted-foreground" />
                    : isAi
                      ? <Bot className="w-3 h-3 text-purple-500" />
                      : <Headphones className="w-3 h-3 text-blue-500" />}
                </div>

                <div className={cn(
                  "rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  isPatient
                    ? "bg-muted text-foreground rounded-tl-sm"
                    : isAi
                      ? "bg-purple-100 dark:bg-purple-950/50 text-purple-900 dark:text-purple-100 rounded-tr-sm"
                      : "bg-blue-100 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 rounded-tr-sm"
                )}>
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={cn(
                    "text-[10px] mt-1 opacity-50",
                    isPatient ? "text-left" : "text-right"
                  )}>
                    {format(new Date(msg.createdAt), "dd/MM · HH:mm", { locale: ptBR })}
                    {isAi && " · IA"}
                    {msg.source === "attendant" && " · Atendente"}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Footer actions */}
        <div className="shrink-0 px-5 py-4 border-t border-border/50 bg-background flex items-center justify-between gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Fechar
          </Button>
          {isAlreadyOpen ? (
            <Button className="flex-1 gap-2" variant="secondary" onClick={onClose}>
              <Headphones className="w-4 h-4" />
              Chat já aberto
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              disabled={!canAssume}
              onClick={handleAssume}
              title={!canAssume && openHandoffs.length >= 3 ? "Limite de 3 chats simultâneos atingido" : undefined}
            >
              <Headphones className="w-4 h-4" />
              Assumir Conversa
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
