import * as React from "react"
import { motion } from "framer-motion"
import { 
  Users, 
  CalendarCheck, 
  MessageCircle, 
  Sparkles,
  Bot
} from "lucide-react"
import { useListAppointments, useListAiLogs, useGetClinic } from "@workspace/api-client-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const CLINIC_ID = 1

export default function Dashboard() {
  const { data: clinic } = useGetClinic(CLINIC_ID)
  const { data: appointments } = useListAppointments(CLINIC_ID)
  const { data: aiLogs } = useListAiLogs(CLINIC_ID)

  const pendingAppointments = appointments?.filter(a => a.status === 'pending').length || 0
  const confirmedAppointments = appointments?.filter(a => a.status === 'confirmed').length || 0
  
  const totalTokens = aiLogs?.reduce((acc, log) => acc + log.tokensUsed, 0) || 0
  const recentLogs = aiLogs?.slice(0, 5) || []

  const stats = [
    {
      title: "Total Appointments",
      value: appointments?.length || 0,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Confirmed",
      value: confirmedAppointments,
      icon: CalendarCheck,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "AI Interactions",
      value: aiLogs?.length || 0,
      icon: MessageCircle,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Tokens Used",
      value: totalTokens.toLocaleString(),
      icon: Sparkles,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    }
  ]

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Welcome back, {clinic?.name || 'Clinic'}
        </h1>
        <p className="text-muted-foreground mt-2">
          Here's what's happening with your AI assistant today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <h3 className="text-2xl font-bold font-display">{stat.value}</h3>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Recent AI Interactions</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {recentLogs.length > 0 ? (
              <div className="space-y-6">
                {recentLogs.map((log) => (
                  <div key={log.id} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{log.patientPhone}</p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        "{log.userMessage}"
                      </p>
                      <div className="bg-muted/50 rounded-lg p-3 mt-2 text-sm text-foreground/80 border border-border/50">
                        {log.aiResponse}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <Bot className="w-12 h-12 mb-4 opacity-20" />
                <p>No interactions yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {appointments?.filter(a => a.status === 'pending').slice(0, 5).map(apt => (
                <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-primary/50 transition-colors">
                  <div>
                    <p className="font-medium">{apt.patientName}</p>
                    <p className="text-sm text-muted-foreground">{new Date(apt.scheduledAt).toLocaleString()}</p>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>
              ))}
              
              {pendingAppointments === 0 && (
                <div className="text-center p-8 text-muted-foreground">
                  <CalendarCheck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>All caught up! No pending appointments.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
