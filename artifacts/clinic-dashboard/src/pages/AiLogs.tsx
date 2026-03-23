import * as React from "react"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { MessageSquare, Mic, User, Bot, Zap } from "lucide-react"
import { useListAiLogs } from "@workspace/api-client-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const CLINIC_ID = 1

export default function AiLogs() {
  const { data: logs, isLoading } = useListAiLogs(CLINIC_ID, { limit: 100 })

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">AI Interaction Logs</h1>
        <p className="text-muted-foreground mt-2">
          Monitor conversations between your AI assistant and patients.
        </p>
      </div>

      <Card className="overflow-hidden bg-background border-border/50">
        {isLoading ? (
          <div className="p-12 text-center animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded max-w-md mx-auto"></div>
            <div className="h-8 bg-muted rounded max-w-sm mx-auto"></div>
            <div className="h-8 bg-muted rounded max-w-lg mx-auto"></div>
          </div>
        ) : logs?.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No AI interactions recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y border-t border-border/50">
            {logs?.map((log) => (
              <div key={log.id} className="p-6 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{log.patientPhone}</Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      {log.messageType === 'audio' ? <Mic className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {log.messageType}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-500" />
                      {log.tokensUsed} tokens
                    </span>
                    <span>{format(new Date(log.createdAt), "PP HH:mm")}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* User Message */}
                  <div className="bg-secondary/50 rounded-xl p-4 border border-secondary">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                      <User className="w-4 h-4 text-foreground/70" />
                      Patient Message
                    </div>
                    <p className="text-foreground/90 text-sm whitespace-pre-wrap">{log.userMessage}</p>
                  </div>

                  {/* AI Response */}
                  <div className="bg-primary/5 rounded-xl p-4 border border-primary/20">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2 text-primary">
                      <Bot className="w-4 h-4" />
                      AI Response
                    </div>
                    <p className="text-foreground/90 text-sm whitespace-pre-wrap">{log.aiResponse}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  )
}
