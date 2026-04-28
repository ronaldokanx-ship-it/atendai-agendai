import * as React from "react"
import { useHandoffs } from "@/contexts/handoffs"
import { useAuth } from "@/contexts/auth"
import { ChatPanel } from "@/components/ChatPanel"

const PANEL_WIDTH = 320
const PANEL_GAP = 12

export function ChatWindowManager() {
  const { user } = useAuth()
  const CLINIC_ID = user?.clinicId ?? 0
  const { openHandoffs, closeHandoff } = useHandoffs()

  if (openHandoffs.length === 0) return null

  return (
    <>
      {openHandoffs.map((h, i) => (
        <ChatPanel
          key={h.phone}
          phone={h.phone}
          patientName={h.patientName}
          clinicId={CLINIC_ID}
          onClose={() => closeHandoff(h.phone)}
          style={{
            right: i * (PANEL_WIDTH + PANEL_GAP) + PANEL_GAP,
            width: PANEL_WIDTH,
          }}
        />
      ))}
    </>
  )
}
