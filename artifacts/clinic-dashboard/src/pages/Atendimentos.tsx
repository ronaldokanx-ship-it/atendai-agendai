import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Headphones, Clock, Phone, UserCheck, Inbox, RefreshCw } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useAuth } from "@/contexts/auth"
import { useHandoffs } from "@/contexts/handoffs"
import { useListHandoffs, useListPatients, getListHandoffsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export default function Atendimentos() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const queryClient = useQueryClient()

  const { openHandoffs, openHandoff, closeHandoff } = useHandoffs()

  const { data: handoffs = [], isLoading } = useListHandoffs(CLINIC_ID, {
    query: {
      queryKey: getListHandoffsQueryKey(CLINIC_ID),
      refetchInterval: 4000,
      enabled: CLINIC_ID > 0,
    },
  })

  const { data: patients = [] } = useListPatients(CLINIC_ID)

  // Mapa phone → nome do paciente
  const patientMap = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of patients) {
      m[p.phone] = p.name
    }
    return m
  }, [patients])

  function displayName(phone: string) {
    return patientMap[phone] && patientMap[phone] !== phone ? patientMap[phone] : phone
  }

  // Divide em "você está atendendo" vs "aguardando atendente"
  const myPhones = new Set(openHandoffs.map((h) => h.phone))
  const myHandoffs = handoffs.filter((h) => myPhones.has(h.patientPhone))
  const waitingHandoffs = handoffs.filter((h) => !myPhones.has(h.patientPhone))

  const canOpenMore = openHandoffs.length < 3

  function handleAssume(phone: string) {
    openHandoff(phone, patientMap[phone])
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-3xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Atendimentos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Conversas aguardando atendimento humano. A IA permanece pausada enquanto o handoff está ativo.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(CLINIC_ID) })}
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{waitingHandoffs.length}</p>
              <p className="text-xs text-muted-foreground">Aguardando atendente</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{myHandoffs.length}</p>
              <p className="text-xs text-muted-foreground">Você está atendendo</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && handoffs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Inbox className="w-8 h-8 opacity-40" />
          </div>
          <p className="text-base font-medium">Nenhum atendimento em aberto</p>
          <p className="text-sm text-center max-w-xs">
            Quando um cliente solicitar atendimento humano (via IA ou manualmente), a conversa aparecerá aqui.
          </p>
        </div>
      )}

      {/* Aguardando atendente */}
      {waitingHandoffs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Aguardando atendente</h2>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">
              {waitingHandoffs.length}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {waitingHandoffs
              .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
              .map((h) => (
                <motion.div
                  key={h.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <HandoffCard
                    phone={h.patientPhone}
                    name={displayName(h.patientPhone)}
                    startedAt={h.startedAt}
                    variant="waiting"
                    canAssume={canOpenMore}
                    onAssume={() => handleAssume(h.patientPhone)}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
          {!canOpenMore && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
              Limite de 3 chats simultâneos atingido. Encerre um atendimento para assumir outro.
            </p>
          )}
        </section>
      )}

      {/* Você está atendendo */}
      {myHandoffs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Você está atendendo</h2>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold">
              {myHandoffs.length}
            </span>
          </div>
          <AnimatePresence initial={false}>
            {myHandoffs.map((h) => (
              <motion.div
                key={h.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <HandoffCard
                  phone={h.patientPhone}
                  name={displayName(h.patientPhone)}
                  startedAt={h.startedAt}
                  variant="active"
                  onEncerrar={() => closeHandoff(h.patientPhone)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      )}
    </motion.div>
  )
}

// ─── Card de handoff individual ─────────────────────────────────────────────

interface HandoffCardProps {
  phone: string
  name: string
  startedAt: Date
  variant: "waiting" | "active"
  canAssume?: boolean
  onAssume?: () => void
  onEncerrar?: () => void
}

function HandoffCard({ phone, name, startedAt, variant, canAssume = true, onAssume, onEncerrar }: HandoffCardProps) {
  const isNameDifferent = name !== phone

  return (
    <Card className={cn(
      "transition-all",
      variant === "waiting"
        ? "border-orange-500/30 hover:border-orange-500/50 hover:shadow-sm hover:shadow-orange-500/10"
        : "border-blue-500/30 bg-blue-500/5"
    )}>
      <CardContent className="p-4 flex items-center gap-4">
        {/* Avatar */}
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
          variant === "waiting" ? "bg-orange-500/10" : "bg-blue-500/10"
        )}>
          {variant === "waiting"
            ? <Phone className="w-5 h-5 text-orange-500" />
            : <Headphones className="w-5 h-5 text-blue-500" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{name}</span>
            {isNameDifferent && (
              <span className="text-xs text-muted-foreground truncate">{phone}</span>
            )}
            {variant === "waiting" ? (
              <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-600 bg-orange-500/5 shrink-0">
                Aguardando
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-600 bg-blue-500/5 shrink-0">
                <span className="relative flex h-1.5 w-1.5 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                </span>
                Em atendimento
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aguardando{" "}
            <span className="font-medium text-foreground/70">
              {formatDistanceToNow(new Date(startedAt), { locale: ptBR, addSuffix: false })}
            </span>
            {" "}· iniciado às {format(new Date(startedAt), "HH:mm", { locale: ptBR })}
          </p>
        </div>

        {/* Ação */}
        <div className="shrink-0">
          {variant === "waiting" ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!canAssume}
              onClick={onAssume}
              title={!canAssume ? "Limite de 3 chats simultâneos atingido" : undefined}
            >
              <UserCheck className="w-4 h-4" />
              Assumir
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
              onClick={onEncerrar}
            >
              <Headphones className="w-4 h-4" />
              Encerrar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
