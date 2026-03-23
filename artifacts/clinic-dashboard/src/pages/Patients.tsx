import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { format } from "date-fns"
import { 
  Search, 
  Users, 
  Calendar as CalendarIcon, 
  Phone, 
  Mail, 
  Trash2, 
  FileText,
  MessageSquare,
  ChevronRight,
  Plus
} from "lucide-react"
import { 
  useListPatients, 
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
  useGetPatient,
  getListPatientsQueryKey,
  type Patient
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

const CLINIC_ID = 1

export default function Patients() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const [searchTerm, setSearchTerm] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  
  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: patients, isLoading: isLoadingPatients } = useListPatients(CLINIC_ID, { 
    search: debouncedSearch || undefined 
  })

  const createPatient = useCreatePatient()
  const updatePatient = useUpdatePatient()
  const deletePatient = useDeletePatient()

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [selectedPatientId, setSelectedPatientId] = React.useState<number | null>(null)
  
  // Form State for Create
  const [createData, setCreateData] = React.useState({
    name: "", phone: "", email: "", dateOfBirth: "", notes: ""
  })

  // Detail Query
  const { data: detailData, isLoading: isLoadingDetail } = useGetPatient(CLINIC_ID, selectedPatientId || 0, {
    query: { enabled: !!selectedPatientId }
  })

  // State for quick note editing in detail view
  const [editNotes, setEditNotes] = React.useState("")
  
  React.useEffect(() => {
    if (detailData) {
      setEditNotes(detailData.notes || "")
    }
  }, [detailData])

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createPatient.mutate(
      { clinicId: CLINIC_ID, data: createData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey(CLINIC_ID) })
          setIsCreateOpen(false)
          setCreateData({ name: "", phone: "", email: "", dateOfBirth: "", notes: "" })
          toast({ title: "Paciente cadastrado com sucesso" })
        }
      }
    )
  }

  const handleSaveNotes = () => {
    if (!selectedPatientId) return
    updatePatient.mutate(
      { clinicId: CLINIC_ID, id: selectedPatientId, data: { notes: editNotes } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/clinics/${CLINIC_ID}/patients/${selectedPatientId}`] })
          toast({ title: "Anotações atualizadas" })
        }
      }
    )
  }

  const handleDelete = (id: number) => {
    if (confirm("ATENÇÃO: Deseja realmente excluir este paciente? Esta ação não pode ser desfeita.")) {
      deletePatient.mutate(
        { clinicId: CLINIC_ID, id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey(CLINIC_ID) })
            setSelectedPatientId(null)
            toast({ title: "Paciente excluído" })
          }
        }
      )
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground mt-2">
            Base de clientes, histórico de agendamentos e interações com a IA.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow-md">
          <Plus className="w-5 h-5" />
          Novo Paciente
        </Button>
      </div>

      <Card className="p-4 border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome ou telefone..." 
            className="pl-9 bg-background border-border/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Card>

      <div className="grid gap-4">
        {isLoadingPatients ? (
          [1,2,3,4].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)
        ) : patients?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-2xl">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhum paciente encontrado</p>
            <p className="text-sm">Tente buscar por outro termo ou cadastre um novo paciente.</p>
          </div>
        ) : (
          patients?.map((patient, i) => (
            <motion.div
              key={patient.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card 
                className="group cursor-pointer hover:border-primary/50 hover:shadow-md transition-all duration-200 overflow-hidden"
                onClick={() => setSelectedPatientId(patient.id)}
              >
                <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {patient.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{patient.name}</h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{patient.phone}</span>
                        {patient.email && <span className="flex items-center gap-1.5 hidden sm:flex"><Mail className="w-3.5 h-3.5" />{patient.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors">
                    <span className="text-sm hidden sm:inline-block mr-4 opacity-0 group-hover:opacity-100 transition-opacity">Ver Detalhes</span>
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* CREATE MODAL */}
      <Modal 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)}
        title="Cadastrar Paciente"
        description="Adicione manualmente um paciente à base de dados."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome Completo</Label>
              <Input required value={createData.name} onChange={e => setCreateData({...createData, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp / Telefone</Label>
              <Input required value={createData.phone} onChange={e => setCreateData({...createData, phone: e.target.value})} placeholder="+5511999999999" />
            </div>
            <div className="space-y-2">
              <Label>Data de Nascimento</Label>
              <Input type="date" value={createData.dateOfBirth} onChange={e => setCreateData({...createData, dateOfBirth: e.target.value})} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email (Opcional)</Label>
              <Input type="email" value={createData.email} onChange={e => setCreateData({...createData, email: e.target.value})} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t mt-6">
            <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createPatient.isPending}>Cadastrar</Button>
          </div>
        </form>
      </Modal>

      {/* DETAIL MODAL */}
      <Modal
        isOpen={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
        title={detailData?.name || "Detalhes do Paciente"}
      >
        {isLoadingDetail ? (
          <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : detailData ? (
          <div className="space-y-6">
            {/* Header info bar */}
            <div className="flex flex-wrap gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{detailData.phone}</span>
              </div>
              {detailData.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{detailData.email}</span>
                </div>
              )}
              {detailData.dateOfBirth && (
                <div className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span>Nasc: {new Date(detailData.dateOfBirth).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>

            <Tabs defaultValue="notes" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="notes">Ficha & Notas</TabsTrigger>
                <TabsTrigger value="appointments">Consultas ({detailData.appointments.length})</TabsTrigger>
                <TabsTrigger value="logs">Conversas IA ({detailData.aiLogs.length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="notes" className="space-y-4 outline-none">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" /> Anotações Clínicas
                  </Label>
                  <Textarea 
                    className="min-h-[150px] resize-y bg-background"
                    placeholder="Adicione observações médicas, histórico, alergias, etc..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(detailData.id)} className="opacity-80 hover:opacity-100">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir Paciente
                  </Button>
                  <Button 
                    onClick={handleSaveNotes} 
                    disabled={updatePatient.isPending || editNotes === (detailData.notes || "")}
                  >
                    Salvar Anotações
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="appointments" className="outline-none">
                <div className="max-h-[350px] overflow-y-auto pr-2 space-y-3">
                  {detailData.appointments.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm italic">Nenhum agendamento registrado.</p>
                  ) : (
                    detailData.appointments.map(apt => (
                      <div key={apt.id} className="p-3 rounded-lg border border-border bg-background flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-sm">
                            {format(new Date(apt.scheduledAt), "dd 'de' MMMM 'às' HH:mm")}
                          </div>
                          <Badge variant={
                            apt.status === 'confirmed' ? 'success' : 
                            apt.status === 'canceled' ? 'destructive' : 'warning'
                          }>
                            {apt.status}
                          </Badge>
                        </div>
                        {apt.notes && <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{apt.notes}</p>}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="logs" className="outline-none">
                <div className="max-h-[350px] overflow-y-auto pr-2 space-y-4">
                  {detailData.aiLogs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm italic">Nenhuma interação com a IA.</p>
                  ) : (
                    detailData.aiLogs.map(log => (
                      <div key={log.id} className="text-sm space-y-2 pb-4 border-b border-border/30 last:border-0">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{format(new Date(log.createdAt), "dd/MM/yy HH:mm")}</span>
                          <span className="bg-primary/10 text-primary px-1.5 rounded">{log.tokensUsed} tokens</span>
                        </div>
                        <div className="bg-muted p-2.5 rounded-lg rounded-tl-none ml-4 relative">
                          <MessageSquare className="w-3 h-3 absolute -left-4 top-1 text-muted-foreground" />
                          <span className="font-medium">Paciente:</span> {log.userMessage}
                        </div>
                        <div className="bg-primary/5 p-2.5 rounded-lg rounded-tr-none mr-4 relative border border-primary/10">
                          <Bot className="w-3 h-3 absolute -right-4 top-1 text-primary" />
                          <span className="font-medium text-primary">IA:</span> {log.aiResponse}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </Modal>

    </motion.div>
  )
}
