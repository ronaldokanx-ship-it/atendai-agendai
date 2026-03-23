import * as React from "react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { Calendar, Phone, CheckCircle, XCircle, Clock } from "lucide-react"
import { 
  useListAppointments, 
  useUpdateAppointment,
  getListAppointmentsQueryKey,
  type ListAppointmentsStatus
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

const CLINIC_ID = 1

export default function Appointments() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = React.useState<ListAppointmentsStatus | "all">("all")
  
  // Use "undefined" for all to match optional param
  const queryParam = statusFilter === "all" ? undefined : statusFilter
  const { data: appointments, isLoading } = useListAppointments(CLINIC_ID, { status: queryParam })
  const updateAppointment = useUpdateAppointment()

  const handleStatusChange = (id: number, newStatus: ListAppointmentsStatus) => {
    updateAppointment.mutate(
      { clinicId: CLINIC_ID, id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey(CLINIC_ID) })
          toast({ title: "Status updated successfully" })
        }
      }
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="success" className="gap-1"><CheckCircle className="w-3 h-3"/> Confirmed</Badge>
      case 'pending': return <Badge variant="warning" className="gap-1"><Clock className="w-3 h-3"/> Pending</Badge>
      case 'canceled': return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3"/> Canceled</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Appointments</h1>
        <p className="text-muted-foreground mt-2">
          View and manage bookings created by the AI assistant.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "confirmed", "canceled"] as const).map((filter) => (
          <Button
            key={filter}
            variant={statusFilter === filter ? "default" : "outline"}
            className="capitalize"
            onClick={() => setStatusFilter(filter)}
          >
            {filter}
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">Patient</th>
                <th className="px-6 py-4 font-medium">Date & Time</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-t border-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                    <div className="animate-pulse flex flex-col items-center">
                      <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                      <div className="h-4 bg-muted rounded w-1/3"></div>
                    </div>
                  </td>
                </tr>
              ) : appointments?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    <Calendar className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    No appointments found.
                  </td>
                </tr>
              ) : (
                appointments?.map((apt) => (
                  <tr key={apt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{apt.patientName}</div>
                      <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                        <Phone className="w-3 h-3" /> {apt.patientPhone}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {format(new Date(apt.scheduledAt), "PPp")}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(apt.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {apt.status !== 'confirmed' && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-success hover:text-success hover:bg-success/10 border-success/20"
                            onClick={() => handleStatusChange(apt.id, 'confirmed')}
                          >
                            Confirm
                          </Button>
                        )}
                        {apt.status !== 'canceled' && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                            onClick={() => handleStatusChange(apt.id, 'canceled')}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  )
}
