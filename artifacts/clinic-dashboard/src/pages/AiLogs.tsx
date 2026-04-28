import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion } from "framer-motion"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  MessageSquare, Mic, User, Bot, Zap, CheckCheck, Check, Clock,
  AlertCircle, Volume2, Search, RefreshCw, ChevronDown, ChevronUp,
  Users, Hash, Activity, XCircle,
} from "lucide-react"
import { useListAiLogs } from "@workspace/api-client-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 50

/** Mapeamento de status Evolution API → label pt-BR + ícone + cor */
const DELIVERY_STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  PENDING:      { label: "Pendente",          icon: <Clock className="w-3.5 h-3.5" />,       className: "text-muted-foreground" },
  SERVER_ACK:   { label: "Enviado",           icon: <Check className="w-3.5 h-3.5" />,       className: "text-blue-500" },
  DELIVERY_ACK: { label: "Entregue",          icon: <CheckCheck className="w-3.5 h-3.5" />,  className: "text-blue-500" },
  READ:         { label: "Lido",              icon: <CheckCheck className="w-3.5 h-3.5" />,  className: "text-emerald-500" },
  PLAYED:       { label: "Áudio reproduzido", icon: <Volume2 className="w-3.5 h-3.5" />,     className: "text-emerald-500" },
  ERROR:        { label: "Falha no envio",    icon: <AlertCircle className="w-3.5 h-3.5" />, className: "text-destructive" },
}

function DeliveryStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null
  const config = DELIVERY_STATUS_CONFIG[status]
  if (!config) return (
    <span className="text-xs text-muted-foreground font-mono">{status}</span>
  )
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("flex items-center gap-1 text-xs font-medium", config.className)}>
            {config.icon}
            {config.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Status de entrega via WhatsApp</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function CollapsibleText({ text, maxLen = 280 }: { text: string; maxLen?: number }) {
  const [expanded, setExpanded] = React.useState(false)
  const isLong = text.length > maxLen
  return (
    <div>
      <p className="text-foreground/90 text-sm whitespace-pre-wrap leading-relaxed">
        {isLong && !expanded ? text.slice(0, maxLen) + "…" : text}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> Recolher</>
            : <><ChevronDown className="w-3 h-3" /> Ver completo ({text.length} caracteres)</>
          }
        </button>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, className }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; className?: string
}) {
  return (
    <div className={cn("flex items-center gap-3 p-4", className)}>
      <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  )
}

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function AiLogs() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!

  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<"all" | "text" | "audio">("all")
  const [statusFilter, setStatusFilter] = React.useState("all")

  const { data: logs, isLoading, isFetching, refetch } = useListAiLogs(
    CLINIC_ID,
    { limit },
    { query: { refetchInterval: 30_000 } },
  )

  // Filtro client-side
  const filtered = React.useMemo(() => {
    if (!logs) return []
    const q = search.toLowerCase()
    return logs.filter(log => {
      if (q && !log.patientPhone.includes(q) &&
          !log.userMessage.toLowerCase().includes(q) &&
          !log.aiResponse.toLowerCase().includes(q)) return false
      if (typeFilter !== "all" && log.messageType !== typeFilter) return false
      if (statusFilter !== "all" && (log.deliveryStatus ?? "PENDING") !== statusFilter) return false
      return true
    })
  }, [logs, search, typeFilter, statusFilter])

  // Estatísticas calculadas sobre todos os logs carregados (não só os filtrados)
  const stats = React.useMemo(() => {
    if (!logs || logs.length === 0) return null
    const uniquePhones = new Set(logs.map(l => l.patientPhone)).size
    const totalTokens = logs.reduce((acc, l) => acc + l.tokensUsed, 0)
    const errorCount = logs.filter(l => l.deliveryStatus === "ERROR").length
    const audioCount = logs.filter(l => l.messageType === "audio").length
    return { total: logs.length, uniquePhones, totalTokens, errorCount, audioCount }
  }, [logs])

  const hasMore = (logs?.length ?? 0) >= limit

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Logs de IA</h1>
          <p className="text-muted-foreground mt-1">
            Conversas entre o assistente e os pacientes. Status de entrega atualizado automaticamente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <Card className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/50 overflow-hidden p-0">
          <StatCard
            icon={<Hash className="w-4 h-4 text-primary" />}
            label="Interações"
            value={stats.total.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Users className="w-4 h-4 text-indigo-500" />}
            label="Pacientes únicos"
            value={stats.uniquePhones.toLocaleString("pt-BR")}
          />
          <StatCard
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            label="Tokens consumidos"
            value={fmtTokens(stats.totalTokens)}
          />
          <StatCard
            icon={stats.errorCount > 0
              ? <XCircle className="w-4 h-4 text-destructive" />
              : <Activity className="w-4 h-4 text-emerald-500" />}
            label={stats.errorCount > 0 ? "Erros de entrega" : "Entregas"}
            value={stats.errorCount > 0
              ? <span className="text-destructive">{stats.errorCount}</span>
              : <span className="text-emerald-600">OK</span>}
          />
        </Card>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por telefone ou mensagem…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as "all" | "text" | "audio")}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="audio">Voz</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="SERVER_ACK">Enviado</SelectItem>
            <SelectItem value="DELIVERY_ACK">Entregue</SelectItem>
            <SelectItem value="READ">Lido</SelectItem>
            <SelectItem value="PLAYED">Áudio reproduzido</SelectItem>
            <SelectItem value="ERROR">Falha no envio</SelectItem>
          </SelectContent>
        </Select>
        {(search || typeFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => { setSearch(""); setTypeFilter("all"); setStatusFilter("all") }}
          >
            <XCircle className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Lista */}
      <Card className="overflow-hidden bg-background border-border/50">
        {isLoading ? (
          <div className="p-12 space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-5 bg-muted rounded w-1/3" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-20 bg-muted rounded-xl" />
                  <div className="h-20 bg-muted rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
            {logs?.length === 0
              ? <p>Nenhuma interação com IA registrada ainda.</p>
              : <p>Nenhum log encontrado para os filtros selecionados.</p>
            }
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {filtered.map((log) => {
                const createdAt = new Date(log.createdAt)
                const isRecent = Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000
                return (
                  <div key={log.id} className="p-5 hover:bg-muted/20 transition-colors">
                    {/* Meta row */}
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.patientPhone}
                        </Badge>
                        {log.messageType === "audio" ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            <Mic className="w-3 h-3" /> Mensagem de voz
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            <MessageSquare className="w-3 h-3" /> Texto
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <DeliveryStatusBadge status={log.deliveryStatus} />
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-500" />
                          {log.tokensUsed.toLocaleString("pt-BR")} tokens
                        </span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs tabular-nums cursor-default">
                                {isRecent
                                  ? formatDistanceToNow(createdAt, { addSuffix: true, locale: ptBR })
                                  : format(createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR })
                                }
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p>{format(createdAt, "PPP 'às' HH:mm:ss", { locale: ptBR })}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    {/* Mensagem + Resposta */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-secondary/40 rounded-xl p-4 border border-secondary/80">
                        <div className="flex items-center gap-2 text-sm font-semibold mb-2 text-foreground/70">
                          <User className="w-4 h-4" />
                          Paciente
                        </div>
                        <CollapsibleText text={log.userMessage} />
                      </div>

                      <div className="bg-primary/5 rounded-xl p-4 border border-primary/15">
                        <div className="flex items-center justify-between gap-2 text-sm font-semibold mb-2 text-primary">
                          <span className="flex items-center gap-2">
                            <Bot className="w-4 h-4" />
                            Assistente IA
                          </span>
                          {log.whatsappMessageId && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-mono text-[10px] text-muted-foreground/50 font-normal cursor-default">
                                    #{log.whatsappMessageId.slice(-8)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="font-mono text-xs">ID: {log.whatsappMessageId}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <CollapsibleText text={log.aiResponse} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer: resultado da busca + carregar mais */}
            <div className="px-5 py-3 border-t border-border/40 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {search || typeFilter !== "all" || statusFilter !== "all"
                  ? `${filtered.length} de ${logs?.length ?? 0} interações`
                  : `${filtered.length} interações carregadas`
                }
              </p>
              {hasMore && !search && typeFilter === "all" && statusFilter === "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit(l => l + PAGE_SIZE)}
                  disabled={isFetching}
                >
                  {isFetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Carregar mais {PAGE_SIZE}
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </motion.div>
  )
}
