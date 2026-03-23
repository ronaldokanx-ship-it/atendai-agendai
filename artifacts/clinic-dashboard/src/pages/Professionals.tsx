import * as React from "react"
import { motion } from "framer-motion"
import { Plus, Edit2, Trash2, UserCheck, Activity, Stethoscope } from "lucide-react"
import { 
  useListProfessionals, 
  useCreateProfessional, 
  useUpdateProfessional, 
  useDeleteProfessional,
  useGetProfessional,
  useSetProfessionalServices,
  useListServices,
  getListProfessionalsQueryKey,
  type Professional
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/components/ui/use-toast"

const CLINIC_ID = 1

export default function Professionals() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  const { data: professionals, isLoading: isLoadingProfs } = useListProfessionals(CLINIC_ID)
  const { data: services } = useListServices(CLINIC_ID)
  
  const createProf = useCreateProfessional()
  const updateProf = useUpdateProfessional()
  const deleteProf = useDeleteProfessional()
  const setServices = useSetProfessionalServices()

  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  
  const { data: profDetail, isLoading: isLoadingDetail } = useGetProfessional(CLINIC_ID, editingId || 0, {
    query: { enabled: !!editingId }
  })

  const [formData, setFormData] = React.useState({
    name: "",
    specialty: "",
    bio: "",
    active: true,
    serviceIds: [] as number[]
  })

  // Sync form data when editing a professional and details are loaded
  React.useEffect(() => {
    if (editingId && profDetail) {
      setFormData({
        name: profDetail.name,
        specialty: profDetail.specialty,
        bio: profDetail.bio || "",
        active: profDetail.active,
        serviceIds: profDetail.serviceIds || []
      })
    }
  }, [editingId, profDetail])

  const openModal = (id?: number) => {
    if (id) {
      setEditingId(id)
    } else {
      setEditingId(null)
      setFormData({ name: "", specialty: "", bio: "", active: true, serviceIds: [] })
    }
    setIsModalOpen(true)
  }

  const handleServiceToggle = (serviceId: number, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      serviceIds: checked 
        ? [...prev.serviceIds, serviceId]
        : prev.serviceIds.filter(id => id !== serviceId)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      if (editingId) {
        await updateProf.mutateAsync({
          clinicId: CLINIC_ID,
          id: editingId,
          data: {
            name: formData.name,
            specialty: formData.specialty,
            bio: formData.bio,
            active: formData.active
          }
        })
        
        await setServices.mutateAsync({
          clinicId: CLINIC_ID,
          id: editingId,
          data: { serviceIds: formData.serviceIds }
        })
        
        toast({ title: "Profissional atualizado com sucesso" })
      } else {
        await createProf.mutateAsync({
          clinicId: CLINIC_ID,
          data: {
            name: formData.name,
            specialty: formData.specialty,
            bio: formData.bio,
            active: formData.active,
            serviceIds: formData.serviceIds
          }
        })
        toast({ title: "Profissional cadastrado com sucesso" })
      }
      
      queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(CLINIC_ID) })
      setIsModalOpen(false)
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" })
    }
  }

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este profissional?")) {
      deleteProf.mutate(
        { clinicId: CLINIC_ID, id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProfessionalsQueryKey(CLINIC_ID) })
            toast({ title: "Profissional removido" })
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
          <h1 className="text-3xl font-display font-bold text-foreground tracking-tight">Equipe Clínica</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie os profissionais e as especialidades que a IA pode oferecer aos pacientes.
          </p>
        </div>
        <Button onClick={() => openModal()} className="gap-2 shadow-md hover:shadow-lg transition-shadow">
          <Plus className="w-5 h-5" />
          Adicionar Profissional
        </Button>
      </div>

      {isLoadingProfs ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : professionals?.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2 bg-background/50">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <UserCheck className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold">Nenhum profissional cadastrado</h3>
          <p className="text-muted-foreground mt-2 mb-6">Adicione médicos, dentistas ou veterinários para a IA agendar consultas.</p>
          <Button onClick={() => openModal()} variant="outline">Adicionar Profissional</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals?.map((prof, index) => (
            <motion.div
              key={prof.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="flex flex-col h-full hover:shadow-lg transition-all duration-300 group border-border/50 overflow-hidden">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={() => openModal(prof.id)} className="p-2 bg-background/90 backdrop-blur rounded-lg border hover:bg-accent hover:text-accent-foreground shadow-sm transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(prof.id)} className="p-2 bg-background/90 backdrop-blur rounded-lg border text-destructive hover:bg-destructive hover:text-destructive-foreground shadow-sm transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-6 flex-1 flex flex-col relative">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                      {prof.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 pr-12">
                      <h3 className="text-xl font-bold font-display leading-tight">{prof.name}</h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className="font-medium bg-secondary/50 text-secondary-foreground">
                          {prof.specialty}
                        </Badge>
                        {!prof.active && <Badge variant="outline" className="text-muted-foreground border-dashed">Inativo</Badge>}
                      </div>
                    </div>
                  </div>
                  
                  {prof.bio && (
                    <p className="mt-4 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {prof.bio}
                    </p>
                  )}
                  
                  <div className="mt-auto pt-6 flex items-center text-sm text-muted-foreground">
                     <Activity className="w-4 h-4 mr-2 opacity-50" />
                     Status: <span className={cn("ml-1 font-medium", prof.active ? "text-success" : "text-muted-foreground")}>
                       {prof.active ? "Atendendo" : "Indisponível"}
                     </span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Editar Profissional" : "Novo Profissional"}
        description="Preencha os dados e vincule os serviços que este profissional realiza."
      >
        {isLoadingDetail && editingId ? (
          <div className="py-8 flex justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input 
                  id="name"
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Dr. Carlos Silva"
                  className="bg-background"
                />
              </div>
              
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="specialty">Especialidade</Label>
                <Input 
                  id="specialty"
                  required
                  value={formData.specialty}
                  onChange={e => setFormData({...formData, specialty: e.target.value})}
                  placeholder="Ex: Cardiologista, Odontopediatra"
                  className="bg-background"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bio">Apresentação / Bio (Opcional)</Label>
                <Textarea 
                  id="bio"
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                  placeholder="Breve resumo sobre o profissional..."
                  className="resize-none h-20 bg-background"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/50">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary" /> 
                Serviços Realizados
              </Label>
              <p className="text-xs text-muted-foreground mb-3">Selecione quais serviços a IA pode agendar com este profissional.</p>
              
              <div className="grid sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-1">
                {services?.map(service => (
                  <div key={service.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/50 transition-colors">
                    <Checkbox 
                      id={`service-${service.id}`}
                      checked={formData.serviceIds.includes(service.id)}
                      onCheckedChange={(checked) => handleServiceToggle(service.id, checked as boolean)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label 
                        htmlFor={`service-${service.id}`} 
                        className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {service.name}
                      </label>
                      <p className="text-xs text-muted-foreground">{service.durationMinutes} min</p>
                    </div>
                  </div>
                ))}
                {(!services || services.length === 0) && (
                  <p className="text-sm text-muted-foreground italic sm:col-span-2">Nenhum serviço cadastrado na clínica ainda.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border/50">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="active" 
                  checked={formData.active}
                  onCheckedChange={c => setFormData({...formData, active: c})}
                />
                <Label htmlFor="active" className="cursor-pointer">Profissional Ativo</Label>
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createProf.isPending || updateProf.isPending || setServices.isPending} className="shadow-md">
                  {editingId ? "Salvar" : "Cadastrar"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </motion.div>
  )
}
