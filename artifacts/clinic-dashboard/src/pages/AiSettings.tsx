import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion } from "framer-motion"
import { Bot, Save, Sparkles, Power, CalendarDays } from "lucide-react"
import { useGetClinic, useUpdateClinic, getGetClinicQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

export default function AiSettings() {
  const { user } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: clinic, isLoading } = useGetClinic(CLINIC_ID)
  const updateClinic = useUpdateClinic()

  const [formData, setFormData] = React.useState({
    aiName: "",
    aiPersonalityPrompt: "",
    knowledgeBase: "",
    aiEnabled: true,
    schedulingEnabled: true,
  })

  React.useEffect(() => {
    if (clinic) {
      setFormData({
        aiName: clinic.aiName || "",
        aiPersonalityPrompt: clinic.aiPersonalityPrompt || "",
        knowledgeBase: clinic.knowledgeBase || "",
        aiEnabled: clinic.aiEnabled ?? true,
        schedulingEnabled: (clinic as Record<string, unknown>).schedulingEnabled !== false,
      })
    }
  }, [clinic])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = () => {
    updateClinic.mutate(
      { id: CLINIC_ID, data: formData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(CLINIC_ID) })
          toast({
            title: "Configurações salvas",
            description: "Seu assistente de IA foi atualizado com sucesso.",
          })
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Falha ao salvar as configurações. Tente novamente.",
          })
        }
      }
    )
  }

  if (isLoading) {
    return <div className="animate-pulse space-y-8">
      <div className="h-10 w-64 bg-muted rounded-lg"></div>
      <div className="h-96 bg-muted rounded-2xl"></div>
    </div>
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-4xl"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Configuração de IA</h1>
          <p className="text-muted-foreground mt-2">
            Personalize como seu assistente de IA conversa com os pacientes pelo WhatsApp.
          </p>
        </div>
        <Button 
          onClick={handleSave} 
          disabled={updateClinic.isPending}
          size="lg"
          className="gap-2"
        >
          {updateClinic.isPending ? (
            <Sparkles className="w-5 h-5 animate-pulse" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          Salvar Alterações
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.aiEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
              <Power className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <CardTitle>Atendimento Automático por IA</CardTitle>
              <CardDescription>
                {formData.aiEnabled
                  ? "A IA está respondendo automaticamente às mensagens do WhatsApp."
                  : "A IA está pausada. As mensagens serão salvas para atendimento manual."}
              </CardDescription>
            </div>
            <Switch
              checked={formData.aiEnabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, aiEnabled: checked }))}
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${formData.schedulingEnabled ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground"}`}>
              <CalendarDays className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <CardTitle>Agendamento pelo WhatsApp</CardTitle>
              <CardDescription>
                {formData.schedulingEnabled
                  ? "A IA pode consultar disponibilidade e agendar horários."
                  : "Agendamento desativado. A IA responde apenas perguntas gerais (FAQ)."
                }
              </CardDescription>
            </div>
            <Switch
              checked={formData.schedulingEnabled}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, schedulingEnabled: checked }))}
            />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Identidade do Assistente</CardTitle>
              <CardDescription>Defina um nome e personalidade para sua IA</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome do Assistente</label>
            <Input 
              name="aiName"
              value={formData.aiName}
              onChange={handleChange}
              placeholder="Ex: Assistente da Clínica" 
            />
            <p className="text-xs text-muted-foreground">É assim que a IA se apresenta aos pacientes.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Prompt de Sistema / Personalidade</label>
            <Textarea 
              name="aiPersonalityPrompt"
              value={formData.aiPersonalityPrompt}
              onChange={handleChange}
              placeholder="Você é uma recepcionista simpática e prestativa de uma clínica odontológica..."
              className="min-h-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              Defina o tom, as restrições e o comportamento geral da IA.
              (ex: "Seja muito educada, use emojis com parcimônia, nunca ofereça diagnósticos médicos.")
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Base de Conhecimento</CardTitle>
          <CardDescription>Informações que a IA usa para responder perguntas frequentes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea 
              name="knowledgeBase"
              value={formData.knowledgeBase}
              onChange={handleChange}
              placeholder="Horário de funcionamento: Seg-Sex 9h às 18h. Endereço: Rua Principal, 123. Estacionamento no fundo..."
              className="min-h-[240px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Forneça todos os detalhes sobre horários, localização, convênios aceitos, políticas de cancelamento e dúvidas comuns.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
