import * as React from "react"
import { motion } from "framer-motion"
import { Bot, Save, Sparkles } from "lucide-react"
import { useGetClinic, useUpdateClinic, getGetClinicQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"

const CLINIC_ID = 1

export default function AiSettings() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: clinic, isLoading } = useGetClinic(CLINIC_ID)
  const updateClinic = useUpdateClinic()

  const [formData, setFormData] = React.useState({
    aiName: "",
    aiPersonalityPrompt: "",
    knowledgeBase: ""
  })

  React.useEffect(() => {
    if (clinic) {
      setFormData({
        aiName: clinic.aiName || "",
        aiPersonalityPrompt: clinic.aiPersonalityPrompt || "",
        knowledgeBase: clinic.knowledgeBase || ""
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
            title: "Settings saved",
            description: "Your AI assistant has been updated successfully.",
          })
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save settings. Please try again.",
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
          <h1 className="text-3xl font-display font-bold text-foreground">AI Configuration</h1>
          <p className="text-muted-foreground mt-2">
            Customize how your AI assistant talks to patients on WhatsApp.
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
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <CardTitle>Assistant Identity</CardTitle>
              <CardDescription>Give your AI a name and personality</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Assistant Name</label>
            <Input 
              name="aiName"
              value={formData.aiName}
              onChange={handleChange}
              placeholder="e.g. Dr. Sarah's Assistant" 
            />
            <p className="text-xs text-muted-foreground">This is how the AI introduces itself to patients.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">System Prompt / Personality</label>
            <Textarea 
              name="aiPersonalityPrompt"
              value={formData.aiPersonalityPrompt}
              onChange={handleChange}
              placeholder="You are a helpful and empathetic receptionist for a dental clinic..."
              className="min-h-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              Define the tone, restrictions, and general behavior of the AI. 
              (e.g., "Be very polite, use emojis sparingly, never offer medical diagnoses.")
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
          <CardDescription>Information the AI uses to answer FAQs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea 
              name="knowledgeBase"
              value={formData.knowledgeBase}
              onChange={handleChange}
              placeholder="Clinic hours: Mon-Fri 9am to 6pm. Address: 123 Main St. Parking available in the back..."
              className="min-h-[240px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Provide all details about hours, location, accepted insurances, cancellation policies, and common questions.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
