import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search, Plus, Edit2, Trash2, Package, DollarSign, Link2,
  Image, Mic, Tag, ToggleLeft, ToggleRight, X, Save, ExternalLink,
} from "lucide-react"
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
  type Product,
  type CreateProductBody,
  type UpdateProductBody,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { cn, formatCurrency } from "@/lib/utils"

const CLINIC_ID = 1

const CARD_COLORS = [
  "from-blue-500/10 to-indigo-500/10 border-blue-200/60",
  "from-emerald-500/10 to-teal-500/10 border-emerald-200/60",
  "from-violet-500/10 to-purple-500/10 border-violet-200/60",
  "from-amber-500/10 to-orange-500/10 border-amber-200/60",
  "from-rose-500/10 to-pink-500/10 border-rose-200/60",
  "from-cyan-500/10 to-sky-500/10 border-cyan-200/60",
]
const cardColor = (id: number) => CARD_COLORS[id % CARD_COLORS.length]

// ─── MiniStat ────────────────────────────────────────────────────────────────

function MiniStat({ icon: Icon, label, value, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string | number; color?: string
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border/50 rounded-xl px-4 py-3 min-w-0">
      <div className={cn("w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0", color)}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
        <p className="text-lg font-bold font-display leading-tight">{value}</p>
      </div>
    </div>
  )
}

// ─── ImageUrlsEditor ─────────────────────────────────────────────────────────

function ImageUrlsEditor({ value, onChange }: {
  value: string[]; onChange: (v: string[]) => void
}) {
  const add = () => onChange([...value, ""])
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))
  const update = (i: number, v: string) => {
    const copy = [...value]
    copy[i] = v
    onChange(copy)
  }
  return (
    <div className="space-y-2">
      {value.map((url, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={url}
            onChange={e => update(i, e.target.value)}
            placeholder="https://..."
            className="text-sm"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Adicionar imagem
      </Button>
    </div>
  )
}

// ─── ProductSheet ─────────────────────────────────────────────────────────────

interface ProductSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  product?: Product
  onSaved: () => void
}

function ProductSheet({ open, onOpenChange, product, onSaved }: ProductSheetProps) {
  const { toast } = useToast()
  const isEdit = !!product

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [price, setPrice] = React.useState("")
  const [category, setCategory] = React.useState("")
  const [available, setAvailable] = React.useState(true)
  const [link, setLink] = React.useState("")
  const [imageUrls, setImageUrls] = React.useState<string[]>([])
  const [audioUrl, setAudioUrl] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setName(product?.name ?? "")
      setDescription(product?.description ?? "")
      setPrice(product?.price != null ? String(product.price) : "")
      setCategory(product?.category ?? "")
      setAvailable(product?.available ?? true)
      setLink(product?.link ?? "")
      setImageUrls(product?.imageUrls ?? [])
      setAudioUrl(product?.audioUrl ?? "")
    }
  }, [open, product])

  const createMut = useCreateProduct()
  const updateMut = useUpdateProduct()
  const saving = createMut.isPending || updateMut.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const payload: CreateProductBody = {
      name: name.trim(),
      ...(description.trim() && { description: description.trim() }),
      ...(price !== "" && !isNaN(Number(price)) && { price: Number(price) }),
      available,
      ...(category.trim() && { category: category.trim() }),
      ...(link.trim() && { link: link.trim() }),
      imageUrls: imageUrls.filter(u => u.trim()),
      ...(audioUrl.trim() && { audioUrl: audioUrl.trim() }),
    }

    try {
      if (isEdit) {
        await updateMut.mutateAsync({ clinicId: CLINIC_ID, id: product!.id, data: payload as UpdateProductBody })
        toast({ title: "Produto atualizado!" })
      } else {
        await createMut.mutateAsync({ clinicId: CLINIC_ID, data: payload })
        toast({ title: "Produto criado!" })
      }
      onSaved()
      onOpenChange(false)
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? "Editar produto" : "Novo produto"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Atualize os dados do produto." : "Preencha os dados do novo produto."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="pname">Nome *</Label>
            <Input id="pname" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do produto" required />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="pdesc">Descrição</Label>
            <Textarea id="pdesc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o produto..." rows={3} />
          </div>

          {/* Preço + Categoria */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pprice">Preço (R$)</Label>
              <Input id="pprice" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pcat">Categoria</Label>
              <Input id="pcat" value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Suplementos" />
            </div>
          </div>

          {/* Disponível */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Disponível</p>
              <p className="text-xs text-muted-foreground">Produto visível para a IA e clientes</p>
            </div>
            <Switch checked={available} onCheckedChange={setAvailable} />
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <Label htmlFor="plink">Link (produto digital)</Label>
            <Input id="plink" type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
          </div>

          {/* Imagens */}
          <div className="space-y-1.5">
            <Label>Imagens (URLs)</Label>
            <ImageUrlsEditor value={imageUrls} onChange={setImageUrls} />
          </div>

          {/* Áudio */}
          <div className="space-y-1.5">
            <Label htmlFor="paudio">Áudio (URL)</Label>
            <Input id="paudio" type="url" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 gap-1.5" disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

function ProductCard({ product, onEdit, onDelete }: {
  product: Product; onEdit: () => void; onDelete: () => void
}) {
  const color = cardColor(product.id)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
    >
      <Card className={cn(
        "relative overflow-hidden bg-gradient-to-br border p-5 flex flex-col gap-3 group",
        color
      )}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-base leading-snug truncate">{product.name}</p>
            {product.category && (
              <Badge variant="secondary" className="mt-1 text-xs gap-1">
                <Tag className="w-3 h-3" /> {product.category}
              </Badge>
            )}
          </div>
          <Badge variant={product.available ? "default" : "secondary"} className="shrink-0 text-xs">
            {product.available ? (
              <><ToggleRight className="w-3 h-3 mr-1" /> Ativo</>
            ) : (
              <><ToggleLeft className="w-3 h-3 mr-1" /> Inativo</>
            )}
          </Badge>
        </div>

        {/* Descrição */}
        {product.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
        )}

        {/* Preço */}
        {product.price != null && (
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            {formatCurrency(product.price)}
          </div>
        )}

        {/* Indicadores */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {product.imageUrls.length > 0 && (
            <span className="flex items-center gap-1">
              <Image className="w-3.5 h-3.5" /> {product.imageUrls.length} imagem{product.imageUrls.length > 1 ? "ns" : ""}
            </span>
          )}
          {product.audioUrl && (
            <span className="flex items-center gap-1">
              <Mic className="w-3.5 h-3.5" /> Áudio
            </span>
          )}
          {product.link && (
            <a
              href={product.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Link
            </a>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-2 mt-auto pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="secondary" className="flex-1 gap-1.5" onClick={onEdit}>
            <Edit2 className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 gap-1.5" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Products() {
  const { isOwnerOrSupervisor } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = React.useState("")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = React.useState<Product | undefined>(undefined)

  const { data: products = [], isLoading } = useListProducts(CLINIC_ID)
  const deleteMut = useDeleteProduct()

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(CLINIC_ID) })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    try {
      await deleteMut.mutateAsync({ clinicId: CLINIC_ID, id: deleteTarget.id })
      toast({ title: "Produto excluído." })
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(CLINIC_ID) })
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" })
    } finally {
      setDeleteTarget(undefined)
    }
  }

  const filtered = products.filter(p => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q)
    )
  })

  const total = products.length
  const active = products.filter(p => p.available).length
  const withPrice = products.filter(p => p.price != null).length

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Produtos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Catálogo de produtos integrado à IA
          </p>
        </div>
        {isOwnerOrSupervisor && (
          <Button
            className="gap-1.5 shrink-0"
            onClick={() => { setEditing(undefined); setSheetOpen(true) }}
          >
            <Plus className="w-4 h-4" /> Novo produto
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MiniStat icon={Package} label="Total" value={total} color="text-primary" />
        <MiniStat icon={ToggleRight} label="Ativos" value={active} color="text-emerald-600" />
        <MiniStat icon={DollarSign} label="Com preço" value={withPrice} color="text-amber-600" />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, categoria…"
          className="pl-9"
        />
        {search && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Package className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            {search ? "Nenhum produto encontrado para a busca." : "Nenhum produto cadastrado ainda."}
          </p>
          {!search && isOwnerOrSupervisor && (
            <Button
              variant="outline"
              className="gap-1.5 mt-2"
              onClick={() => { setEditing(undefined); setSheetOpen(true) }}
            >
              <Plus className="w-4 h-4" /> Criar primeiro produto
            </Button>
          )}
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => { setEditing(product); setSheetOpen(true) }}
                onDelete={() => setDeleteTarget(product)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Sheet de criação/edição */}
      <ProductSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={editing}
        onSaved={handleSaved}
      />

      {/* Confirm Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
