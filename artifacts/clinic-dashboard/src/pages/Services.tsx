import * as React from "react"
import { motion } from "framer-motion"
import { Plus, Edit2, Trash2, Clock, DollarSign } from "lucide-react"
import { 
  useListServices, 
  useCreateService, 
  useUpdateService, 
  useDeleteService,
  getListServicesQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/ui/modal"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import type { Service } from "@workspace/api-client-react"

const CLINIC_ID = 1

export default function Services() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: services, isLoading } = useListServices(CLINIC_ID)
  
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [editingService, setEditingService] = React.useState<Service | null>(null)
  
  const [formData, setFormData] = React.useState({
    name: "",
    price: "",
    durationMinutes: "30"
  })

  const openModal = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setFormData({
        name: service.name,
        price: service.price.toString(),
        durationMinutes: service.durationMinutes.toString()
      })
    } else {
      setEditingService(null)
      setFormData({ name: "", price: "", durationMinutes: "30" })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const payload = {
      name: formData.name,
      price: parseFloat(formData.price),
      durationMinutes: parseInt(formData.durationMinutes, 10)
    }

    if (editingService) {
      updateService.mutate(
        { clinicId: CLINIC_ID, id: editingService.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(CLINIC_ID) })
            setIsModalOpen(false)
            toast({ title: "Service updated" })
          }
        }
      )
    } else {
      createService.mutate(
        { clinicId: CLINIC_ID, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(CLINIC_ID) })
            setIsModalOpen(false)
            toast({ title: "Service created" })
          }
        }
      )
    }
  }

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this service?")) {
      deleteService.mutate(
        { clinicId: CLINIC_ID, id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListServicesQueryKey(CLINIC_ID) })
            toast({ title: "Service deleted" })
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Clinic Services</h1>
          <p className="text-muted-foreground mt-2">
            Manage the services the AI can offer and book for patients.
          </p>
        </div>
        <Button onClick={() => openModal()} className="gap-2">
          <Plus className="w-5 h-5" />
          Add Service
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : services?.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-bold">No services yet</h3>
          <p className="text-muted-foreground mt-2 mb-6">Add your first service so the AI can start booking.</p>
          <Button onClick={() => openModal()}>Add Service</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services?.map((service, index) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="flex flex-col h-full hover:border-primary/50 group relative overflow-hidden">
                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openModal(service)} className="p-2 bg-background/80 backdrop-blur rounded-lg border hover:bg-accent hover:text-accent-foreground shadow-sm">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(service.id)} className="p-2 bg-background/80 backdrop-blur rounded-lg border text-destructive hover:bg-destructive hover:text-destructive-foreground shadow-sm">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="text-xl font-bold font-display pr-16">{service.name}</h3>
                  <div className="mt-auto pt-6 flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-1.5 rounded-lg">
                      <Clock className="w-4 h-4 text-primary" />
                      <span>{service.durationMinutes} min</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <DollarSign className="w-4 h-4 text-success" />
                      <span>{formatCurrency(service.price)}</span>
                    </div>
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
        title={editingService ? "Edit Service" : "Add Service"}
        description={editingService ? "Update details for this service" : "Create a new service offering"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Service Name</label>
            <Input 
              required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. Initial Consultation"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Price (BRL)</label>
              <Input 
                required
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Duration (mins)</label>
              <Input 
                required
                type="number"
                min="1"
                value={formData.durationMinutes}
                onChange={e => setFormData({...formData, durationMinutes: e.target.value})}
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createService.isPending || updateService.isPending}>
              {editingService ? "Save Changes" : "Create Service"}
            </Button>
          </div>
        </form>
      </Modal>
    </motion.div>
  )
}
