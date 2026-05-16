import * as React from "react"
import {
  useListHandoffs,
  useCreateHandoff,
  useDeleteHandoff,
  getListHandoffsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth"

export interface OpenHandoff {
  phone: string
  patientName?: string
}

interface HandoffsContextValue {
  /** Janelas de chat abertas (máx 3) */
  openHandoffs: OpenHandoff[]
  /** Telefones que já têm handoff ativo no servidor */
  activePhones: string[]
  /** Abre um chat (cria handoff no servidor + adiciona janela) */
  openHandoff: (phone: string, patientName?: string) => void
  /** Fecha um chat (encerra handoff no servidor + remove janela) */
  closeHandoff: (phone: string) => void
}

const HandoffsContext = React.createContext<HandoffsContextValue | null>(null)

export function HandoffsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const CLINIC_ID = user?.clinicId ?? 0

  const queryClient = useQueryClient()
  const createHandoff = useCreateHandoff()
  const deleteHandoff = useDeleteHandoff()

  const { data: serverHandoffs = [] } = useListHandoffs(CLINIC_ID, {
    query: { queryKey: getListHandoffsQueryKey(CLINIC_ID), refetchInterval: 5000, enabled: CLINIC_ID > 0 },
  })

  const activePhones = serverHandoffs.map((h) => h.patientPhone)

  const [openHandoffs, setOpenHandoffs] = React.useState<OpenHandoff[]>([])

  const openHandoff = React.useCallback(
    (phone: string, patientName?: string) => {
      // Sem slot livre → ignora
      if (openHandoffs.length >= 3) return
      // Já aberta → apenas traz para frente (não duplica)
      if (openHandoffs.some((h) => h.phone === phone)) return

      createHandoff.mutate(
        { clinicId: CLINIC_ID, data: { patientPhone: phone } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(CLINIC_ID) })
          },
          // 409 = já existe no servidor; ainda assim abrimos a janela
          onError: () => {},
        }
      )

      setOpenHandoffs((prev) => [...prev, { phone, patientName }])
    },
    [openHandoffs, CLINIC_ID, createHandoff, queryClient]
  )

  const closeHandoff = React.useCallback(
    (phone: string) => {
      deleteHandoff.mutate(
        { clinicId: CLINIC_ID, phone },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListHandoffsQueryKey(CLINIC_ID) })
          },
          onError: () => {},
        }
      )
      setOpenHandoffs((prev) => prev.filter((h) => h.phone !== phone))
    },
    [CLINIC_ID, deleteHandoff, queryClient]
  )

  return (
    <HandoffsContext.Provider value={{ openHandoffs, activePhones, openHandoff, closeHandoff }}>
      {children}
    </HandoffsContext.Provider>
  )
}

export function useHandoffs(): HandoffsContextValue {
  const ctx = React.useContext(HandoffsContext)
  if (!ctx) throw new Error("useHandoffs deve ser usado dentro de <HandoffsProvider>")
  return ctx
}
