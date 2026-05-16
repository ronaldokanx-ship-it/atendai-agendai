import * as React from "react"
import { useAuth } from "@/contexts/auth"
import { motion } from "framer-motion"
import {
  Bot,
  CreditCard,
  MessageCircle,
  Save,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Zap,
  QrCode,
  ExternalLink,
  Loader2,
  WifiOff,
  Wifi,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Link,
  Phone,
} from "lucide-react"
import { useGetClinic, useUpdateClinic, getGetClinicQueryKey } from "@workspace/api-client-react"
import { useQueryClient, useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

/** Lê se um valor é uma chave mascarada (vinda da API) ou nulo */
function isMasked(value?: string | null): boolean {
  return !!value && value.startsWith("****")
}

/**
 * Campo de chave secreta com toggle de visibilidade.
 * Quando já existe uma chave configurada, mostra o valor mascarado retornado pela API
 * e acima um badge "Configurado". O usuário pode digitar uma nova chave para substituir.
 */
function SecretKeyField({
  id,
  label,
  description,
  placeholder,
  currentMasked,
  value,
  onChange,
}: {
  id: string
  label: string
  description?: string
  placeholder?: string
  currentMasked?: string | null
  value: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = React.useState(false)
  const isConfigured = isMasked(currentMasked)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {isConfigured ? (
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-xs gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Configurado
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-xs gap-1">
            <AlertCircle className="w-3 h-3" />
            Não configurado
          </Badge>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {isConfigured && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-sm font-mono text-muted-foreground">
          <span className="flex-1 tracking-widest">{currentMasked}</span>
          <span className="text-xs text-muted-foreground/60">atual</span>
        </div>
      )}
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isConfigured ? "Nova chave (deixe em branco para manter a atual)" : placeholder}
          className="pr-10 font-mono"
          autoComplete="off"
          data-1p-ignore
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={visible ? "Ocultar chave" : "Mostrar chave"}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ClinicSettings() {
  const { user, token } = useAuth()
  const CLINIC_ID = user!.clinicId!
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: clinic, isLoading } = useGetClinic(CLINIC_ID)
  const updateClinic = useUpdateClinic()

  // Campos Pagamento
  const [asaasApiKey, setAsaasApiKey] = React.useState("")
  const [mercadoPagoAccessToken, setMercadoPagoAccessToken] = React.useState("")

  // Campos WhatsApp
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = React.useState("")
  const [whatsappAccessToken, setWhatsappAccessToken] = React.useState("")
  const [evolutionInstanceName, setEvolutionInstanceName] = React.useState("")
  const [whatsappProvider, setWhatsappProvider] = React.useState<"evolution" | "meta">("evolution")
  const [qrDialogOpen, setQrDialogOpen] = React.useState(false)
  const [metaInstructionsOpen, setMetaInstructionsOpen] = React.useState(false)

  // Estado para o fluxo "Conectar com Meta" via Facebook Login SDK
  const [metaAppId, setMetaAppId] = React.useState<string | null>(null)
  const [fbSdkReady, setFbSdkReady] = React.useState(false)
  const [metaConnecting, setMetaConnecting] = React.useState(false)
  const [metaPhoneDialog, setMetaPhoneDialog] = React.useState(false)
  const [metaPhones, setMetaPhones] = React.useState<Array<{ id: string; displayPhone: string; name: string }>>([])

  // Busca o App ID Meta do backend para inicializar o Facebook JS SDK
  React.useEffect(() => {
    fetch("/api/meta-config")
      .then((r) => r.json())
      .then((d: { appId: string | null }) => setMetaAppId(d.appId ?? null))
      .catch(() => {})
  }, [])

  // Carrega o Facebook JS SDK quando o App ID estiver disponível
  React.useEffect(() => {
    if (!metaAppId || fbSdkReady) return
    type FBWindow = {
      fbAsyncInit?: () => void
      FB?: { init: (opts: object) => void }
    }
    const win = window as unknown as FBWindow
    win.fbAsyncInit = () => {
      win.FB?.init({ appId: metaAppId, cookie: true, xfbml: false, version: "v17.0" })
      setFbSdkReady(true)
    }
    if (document.getElementById("fb-sdk")) { setFbSdkReady(true); return }
    const script = document.createElement("script")
    script.id = "fb-sdk"
    script.src = "https://connect.facebook.net/pt_BR/sdk.js"
    script.async = true
    script.defer = true
    document.body.appendChild(script)
  }, [metaAppId, fbSdkReady])

  // Não sobrescreve os campos quando clinic recarrega — apenas na montagem inicial
  React.useEffect(() => {
    if (clinic) {
      // campos de texto simples (não sensíveis) inicializam com o valor real
      setWhatsappPhoneNumberId(clinic.whatsappPhoneNumberId ?? "")
      setEvolutionInstanceName(clinic.evolutionInstanceName ?? "")
      setWhatsappProvider((clinic.whatsappProvider as "evolution" | "meta") ?? "evolution")
      // campos sensíveis ficam em branco (o usuário só preenche quando quer trocar)
      setAsaasApiKey("")
      setMercadoPagoAccessToken("")
      setWhatsappAccessToken("")
    }
  }, [clinic?.id])

  function buildPayload(fields: Record<string, string | null>) {
    // Apenas inclui o campo no PATCH se o usuário digitou algo novo;
    // campo vazio = manter valor existente (undefined no payload = não atualiza)
    return Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")
    )
  }

  // ── Query: uso de tokens IA ─────────────────────────────────────────────
  const { data: aiUsage, isLoading: aiUsageLoading } = useQuery({
    queryKey: ["ai-usage", CLINIC_ID],
    queryFn: async () => {
      const res = await fetch(`/api/clinics/${CLINIC_ID}/ai-usage`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Erro ao buscar uso de IA")
      return res.json() as Promise<{
        totalTokensAllTime: number
        totalTokensThisMonth: number
        clinicCreatedAt: string | null
      }>
    },
  })

  // Custo equivalente se usasse ChatGPT-4o API (GPT-4o: $2.50/M input + $10/M output)
  // Blended 65% input / 35% output → $ 5.125/M tokens → × R$ 5.85 = R$ 29.98/M tokens
  const GPT4O_COST_PER_MILLION_BRL = 29.98
  const tokensThisMonth = aiUsage?.totalTokensThisMonth ?? 0
  const tokensAllTime = aiUsage?.totalTokensAllTime ?? 0
  const costThisMonth = (tokensThisMonth / 1_000_000) * GPT4O_COST_PER_MILLION_BRL
  const savingsTotal = (tokensAllTime / 1_000_000) * GPT4O_COST_PER_MILLION_BRL

  function fmtBrl(value: number) {
    if (value < 0.01) return "R$ 0,00"
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  }

  function fmtTokens(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
    return String(n)
  }

  // ── Queries Evolution API ─────────────────────────────────────────────────

  const { data: waStatus, refetch: refetchWaStatus } = useQuery({
    queryKey: ["whatsapp-status", CLINIC_ID],
    queryFn: async () => {
      const res = await fetch(`/api/clinics/${CLINIC_ID}/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return { state: "not_configured" as const }
      return res.json() as Promise<{ state: "open" | "close" | "connecting" | "not_configured" }>
    },
    refetchInterval: qrDialogOpen ? 3000 : 15000,
    enabled: !!clinic?.evolutionInstanceName,
  })

  const { data: qrData, isLoading: qrLoading, error: qrError } = useQuery({
    queryKey: ["whatsapp-qr", CLINIC_ID],
    queryFn: async () => {
      const res = await fetch(`/api/clinics/${CLINIC_ID}/whatsapp/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("QR code não disponível")
      return res.json() as Promise<{ qrCode: string }>
    },
    enabled: qrDialogOpen && !!clinic?.evolutionInstanceName && waStatus?.state !== "open",
    refetchInterval: qrDialogOpen && waStatus?.state !== "open" ? 20000 : false,
    staleTime: 15000,
  })

  // Fecha o dialog quando conectou com sucesso
  React.useEffect(() => {
    if (waStatus?.state === "open" && qrDialogOpen) {
      setTimeout(() => setQrDialogOpen(false), 1500)
    }
  }, [waStatus?.state, qrDialogOpen])

  function handleSavePayment() {
    const data: Record<string, string | null | undefined> = {}
    if (asaasApiKey) data.asaasApiKey = asaasApiKey
    if (mercadoPagoAccessToken) data.mercadoPagoAccessToken = mercadoPagoAccessToken

    if (Object.keys(data).length === 0) {
      toast({ title: "Nenhuma alteração", description: "Preencha pelo menos uma chave para atualizar." })
      return
    }
    updateClinic.mutate(
      { id: CLINIC_ID, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(CLINIC_ID) })
          setAsaasApiKey("")
          setMercadoPagoAccessToken("")
          toast({ title: "Chaves de pagamento salvas", description: "As integrações de pagamento foram configuradas." })
        },
        onError: () => toast({ variant: "destructive", title: "Erro", description: "Falha ao salvar. Tente novamente." }),
      }
    )
  }

  function handleSaveWhatsapp() {
    const data: Record<string, string | null> = {}
    if (whatsappPhoneNumberId !== (clinic?.whatsappPhoneNumberId ?? "")) {
      data.whatsappPhoneNumberId = whatsappPhoneNumberId || null
    }
    if (whatsappAccessToken) {
      data.whatsappAccessToken = whatsappAccessToken
    }
    if (evolutionInstanceName !== (clinic?.evolutionInstanceName ?? "")) {
      data.evolutionInstanceName = evolutionInstanceName || null
    }
    if (whatsappProvider !== ((clinic?.whatsappProvider as "evolution" | "meta") ?? "evolution")) {
      data.whatsappProvider = whatsappProvider
    }
    if (Object.keys(data).length === 0) {
      toast({ title: "Nenhuma alteração", description: "Altere algum campo para salvar." })
      return
    }
    updateClinic.mutate(
      { id: CLINIC_ID, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(CLINIC_ID) })
          queryClient.invalidateQueries({ queryKey: ["whatsapp-status", CLINIC_ID] })
          setWhatsappAccessToken("")
          toast({ title: "WhatsApp configurado", description: "As credenciais foram salvas." })
        },
        onError: () => toast({ variant: "destructive", title: "Erro", description: "Falha ao salvar. Tente novamente." }),
      }
    )
  }

  async function handleMetaConnect() {
    type FBInstance = {
      login: (
        cb: (r: { authResponse?: { accessToken: string } | null }) => void,
        opts: { scope: string; return_scopes?: boolean }
      ) => void
    }
    const FB = (window as unknown as { FB?: FBInstance }).FB
    if (!FB) {
      toast({ variant: "destructive", title: "SDK não carregado", description: "Aguarde e tente novamente." })
      return
    }
    setMetaConnecting(true)
    try {
      const accessToken = await new Promise<string>((resolve, reject) => {
        try {
          FB.login(
            (response) => {
              if (!response.authResponse?.accessToken) {
                reject(new Error("Login cancelado ou permissão negada."))
              } else {
                resolve(response.authResponse.accessToken)
              }
            },
            { scope: "whatsapp_business_management,whatsapp_business_messaging", return_scopes: true }
          )
        } catch (e) {
          reject(e)
        }
      })

      const res = await fetch(`/api/clinics/${CLINIC_ID}/meta-discover-phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userAccessToken: accessToken }),
      })
      const data = (await res.json()) as {
        phoneNumbers?: Array<{ id: string; displayPhone: string; name: string }>
        error?: string
      }
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Falha ao buscar números WhatsApp Business.")
      }
      if (!data.phoneNumbers?.length) {
        throw new Error("Nenhum número WhatsApp Business encontrado na sua conta Meta.")
      }
      setMetaPhones(data.phoneNumbers)
      setMetaPhoneDialog(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast({ variant: "destructive", title: "Erro ao conectar", description: msg })
    } finally {
      setMetaConnecting(false)
    }
  }

  async function handleDisconnect() {
    await fetch(`/api/clinics/${CLINIC_ID}/whatsapp/disconnect`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    queryClient.invalidateQueries({ queryKey: ["whatsapp-status", CLINIC_ID] })
    refetchWaStatus()
    toast({ title: "WhatsApp desconectado", description: "A instância foi desconectada." })
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-8 max-w-3xl">
        <div className="h-10 w-64 bg-muted rounded-lg" />
        <div className="h-96 bg-muted rounded-2xl" />
      </div>
    )
  }

  const connectionState = waStatus?.state ?? (clinic?.evolutionInstanceName ? "close" : "not_configured")
  const isConnected = connectionState === "open"
  const isConnecting = connectionState === "connecting"
  const isMetaConfigured = !!clinic?.whatsappPhoneNumberId && isMasked(clinic?.whatsappAccessToken)

  // Provedor ativo salvo no banco — determina qual seção está habilitada
  const activeProvider = (clinic?.whatsappProvider as "evolution" | "meta") ?? "evolution"
  const evolutionIsActive = activeProvider === "evolution"
  const metaIsActive = activeProvider === "meta"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-3xl"
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Configurações da Clínica</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie as integrações com IA, pagamentos e WhatsApp. Todas as chaves são armazenadas com
          segurança e exibidas de forma mascarada.
        </p>
      </div>

      <Tabs defaultValue="ai" className="space-y-6">
        {/* ── Tabs customizadas com hover e descri\u00e7\u00e3o ── */}
        <TabsList className="h-auto p-1.5 grid w-full grid-cols-2 gap-1.5 bg-muted/60 rounded-2xl border border-border/40">
          <TabsTrigger
            value="ai"
            className="group relative flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl text-left h-auto
              data-[state=inactive]:hover:bg-background/80 data-[state=inactive]:hover:shadow-sm
              data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-border/60
              transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 group-data-[state=active]:bg-purple-500/20 flex items-center justify-center transition-colors">
              <Bot className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-xs font-semibold leading-tight group-data-[state=active]:text-foreground text-muted-foreground group-data-[state=inactive]:group-hover:text-foreground transition-colors">Inteligência Artificial</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight hidden sm:block">Modelos e tokens</p>
            </div>
          </TabsTrigger>

          <TabsTrigger
            value="whatsapp"
            className="group relative flex flex-col items-center gap-1.5 px-3 py-3.5 rounded-xl text-left h-auto
              data-[state=inactive]:hover:bg-background/80 data-[state=inactive]:hover:shadow-sm
              data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-border/60
              transition-all duration-200"
          >
            <div className="w-9 h-9 rounded-xl bg-green-500/10 group-data-[state=active]:bg-green-500/20 flex items-center justify-center transition-colors">
              <MessageCircle className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-xs font-semibold leading-tight group-data-[state=active]:text-foreground text-muted-foreground group-data-[state=inactive]:group-hover:text-foreground transition-colors">WhatsApp</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight hidden sm:block">
                {isConnected ? "Conectado" : (isMetaConfigured ? "Meta configurado" : "Evolution · Meta")}
              </p>
            </div>
            {/* Dot de status ao vivo */}
            {(isConnected || isMetaConfigured) && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ ABA: IA ═══════════════ */}
        <TabsContent value="ai">
          <div className="space-y-4">
            {/* Card principal: economia */}
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-background">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      IA Inclusa na Plataforma
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-300 text-xs gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Sem custo adicional
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Veja quanto você economiza comparado ao uso da API ChatGPT (GPT-4o).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {aiUsageLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="animate-pulse h-24 bg-muted rounded-xl" />
                    <div className="animate-pulse h-24 bg-muted rounded-xl" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Custo este mês */}
                    <div className="rounded-xl border border-emerald-200 bg-white dark:bg-background p-4 space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Custo equivalente este mês</p>
                      <p className="text-3xl font-bold text-emerald-600">{fmtBrl(costThisMonth)}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTokens(tokensThisMonth)} tokens · que seria cobrado pelo ChatGPT
                      </p>
                    </div>
                    {/* Economia total */}
                    <div className="rounded-xl border border-violet-200 bg-white dark:bg-background p-4 space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Economia total acumulada</p>
                      <p className="text-3xl font-bold text-violet-600">{fmtBrl(savingsTotal)}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTokens(tokensAllTime)} tokens desde a criação da conta
                      </p>
                    </div>
                  </div>
                )}

                <p className="mt-4 text-xs text-muted-foreground">
                  * Estimativa baseada no preço atual da API GPT-4o (OpenAI): R$ 29,98/milhão de tokens (blend 65% input / 35% output).
                  Seu uso real na AtendAI é <strong className="text-emerald-600">gratuito</strong>.
                </p>
              </CardContent>
            </Card>

            {/* Card: detalhes de uso */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhes de Uso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{aiUsageLoading ? "…" : fmtTokens(tokensThisMonth)}</p>
                    <p className="text-xs text-muted-foreground">tokens este mês</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{aiUsageLoading ? "…" : fmtTokens(tokensAllTime)}</p>
                    <p className="text-xs text-muted-foreground">tokens total</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-center">
                    <p className="text-lg font-bold text-emerald-600">R$ 0,00</p>
                    <p className="text-xs text-muted-foreground">custo real cobrado</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════ ABA: PAGAMENTOS ═══════════════ */}
        <TabsContent value="payment">
          <div className="space-y-4">
            {/* ── Card: Asaas ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Asaas
                      {isMasked(clinic?.asaasApiKey) && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-300 text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Configurado
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      PIX, boleto e cartão — cobranças automatizadas diretamente pelo WhatsApp.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <SecretKeyField
                  id="asaasApiKey"
                  label="Chave de API Asaas"
                  description="Encontre sua chave em: Asaas → Configurações → Conta → Integrações via API."
                  placeholder="$aact_..."
                  currentMasked={clinic?.asaasApiKey}
                  value={asaasApiKey}
                  onChange={setAsaasApiKey}
                />
                <div className="rounded-xl border border-border/50 bg-muted/30 p-4 space-y-1">
                  <p className="text-sm font-medium">Como obter a chave Asaas</p>
                  <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                    <li>Acesse <span className="font-mono text-xs bg-muted px-1 rounded">asaas.com</span></li>
                    <li>Vá em <strong>Configurações → Conta → Integrações via API</strong></li>
                    <li>Copie a chave e cole acima</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* ── Card: Mercado Pago ── */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Mercado Pago
                      {isMasked(clinic?.mercadoPagoAccessToken) && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-300 text-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Configurado
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Cobrança via PIX com QR Code enviado automaticamente pelo WhatsApp após o agendamento.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <SecretKeyField
                  id="mercadoPagoAccessToken"
                  label="Access Token"
                  description="Encontre em: mercadopago.com.br → Suas integrações → Credenciais de produção."
                  placeholder="APP_USR-..."
                  currentMasked={clinic?.mercadoPagoAccessToken}
                  value={mercadoPagoAccessToken}
                  onChange={setMercadoPagoAccessToken}
                />
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                  <p className="text-sm font-medium">Como funciona</p>
                  <p className="text-sm text-muted-foreground">
                    Quando configurado, após o paciente confirmar o agendamento pelo WhatsApp, o sistema gera
                    automaticamente um <strong>QR Code PIX</strong> com o valor do serviço e envia na conversa.
                    O horário fica reservado por <strong>30 minutos</strong> aguardando o pagamento.
                    Após confirmação do pagamento, o agendamento é confirmado automaticamente.
                  </p>
                  <p className="text-sm font-medium mt-2">Como obter o Access Token</p>
                  <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                    <li>Acesse <a href="https://www.mercadopago.com.br/developers/pt/docs/getting-started/create-app" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">mercadopago.com.br <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Vá em <strong>Suas integrações → Credenciais de produção</strong></li>
                    <li>Copie o <strong>Access Token</strong> (começa com <code className="bg-muted px-1 rounded text-xs">APP_USR-</code>)</li>
                  </ol>
                  <div className="rounded-lg bg-muted/60 border border-border/50 p-3 mt-2 space-y-1">
                    <p className="text-xs font-medium">Webhook URL (configurar no painel do Mercado Pago):</p>
                    <code className="text-xs font-mono break-all block">
                      {window.location.origin.replace("5175", "3000")}/api/webhooks/mercadopago
                    </code>
                    <p className="text-xs text-muted-foreground">Evento: <strong>Pagamentos</strong></p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={handleSavePayment}
                disabled={updateClinic.isPending || (!asaasApiKey && !mercadoPagoAccessToken)}
                className="gap-2"
              >
                {updateClinic.isPending ? (
                  <Sparkles className="w-4 h-4 animate-pulse" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar Chaves de Pagamento
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════ ABA: WHATSAPP ═══════════════ */}
        <TabsContent value="whatsapp">
          <div className="space-y-4">

            {/* ── Card: Provedor Ativo ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  Provedor WhatsApp Ativo
                </CardTitle>
                <CardDescription>
                  Escolha qual integração o sistema usará para enviar e receber mensagens.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={whatsappProvider}
                  onValueChange={(v) => setWhatsappProvider(v as "evolution" | "meta")}
                  className="grid grid-cols-2 gap-3"
                >
                  <Label
                    htmlFor="provider-evolution"
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                      whatsappProvider === "evolution"
                        ? "border-green-500 bg-green-50/50 dark:bg-green-950/20"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <RadioGroupItem value="evolution" id="provider-evolution" />
                    <div>
                      <p className="font-medium text-sm">Evolution API</p>
                      <p className="text-xs text-muted-foreground">Auto-hospedada · QR Code</p>
                    </div>
                  </Label>
                  <Label
                    htmlFor="provider-meta"
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
                      whatsappProvider === "meta"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <RadioGroupItem value="meta" id="provider-meta" />
                    <div>
                      <p className="font-medium text-sm">Meta API Oficial</p>
                      <p className="text-xs text-muted-foreground">WhatsApp Business Cloud</p>
                    </div>
                  </Label>
                </RadioGroup>
                {whatsappProvider !== ((clinic?.whatsappProvider as "evolution" | "meta") ?? "evolution") && (
                  <div className="flex justify-end mt-4">
                    <Button
                      size="sm"
                      onClick={() => {
                        updateClinic.mutate(
                          { id: CLINIC_ID, data: { whatsappProvider } },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(CLINIC_ID) })
                              toast({ title: "Provedor atualizado", description: `Usando ${whatsappProvider === "evolution" ? "Evolution API" : "Meta API Oficial"}.` })
                            },
                            onError: () => toast({ variant: "destructive", title: "Erro", description: "Falha ao salvar provedor." }),
                          }
                        )
                      }}
                      disabled={updateClinic.isPending}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Definir como Ativo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Card: Evolution API (Gratuito) ── */}
            <Card className={!evolutionIsActive ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Evolution API
                        <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Gratuito</Badge>
                      </CardTitle>
                      <CardDescription>
                        Conecte via QR code — sem conta Meta Business.
                      </CardDescription>
                    </div>
                  </div>
                  {/* Status badge */}
                  {!evolutionIsActive ? (
                    <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50 text-xs gap-1 shrink-0">
                      <WifiOff className="w-3 h-3" />
                      Inativo
                    </Badge>
                  ) : connectionState === "not_configured" ? (
                    <Badge variant="outline" className="text-muted-foreground border-muted text-xs gap-1 shrink-0">
                      <AlertCircle className="w-3 h-3" />
                      Não configurado
                    </Badge>
                  ) : isConnected ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-300 text-xs gap-1 shrink-0">
                      <Wifi className="w-3 h-3" />
                      Conectado
                    </Badge>
                  ) : isConnecting ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border border-amber-300 text-xs gap-1 shrink-0">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Conectando...
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-xs gap-1 shrink-0">
                      <WifiOff className="w-3 h-3" />
                      Desconectado
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4 relative">
                {/* Overlay quando inativo */}
                {!evolutionIsActive && (
                  <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-b-xl">
                    <p className="text-sm text-muted-foreground text-center px-6">
                      Provedor inativo — selecione <strong>Evolution API</strong> acima para ativar.
                    </p>
                  </div>
                )}
                {/* Nome da instância */}
                <div className="space-y-2">
                  <Label htmlFor="evolutionInstanceName">Nome da Instância</Label>
                  <div className="flex gap-2">
                    <Input
                      id="evolutionInstanceName"
                      value={evolutionInstanceName}
                      onChange={(e) => setEvolutionInstanceName(e.target.value)}
                      placeholder="ex: clinica-1"
                      className="font-mono"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const data: Record<string, string | null> = {}
                        if (evolutionInstanceName !== (clinic?.evolutionInstanceName ?? "")) {
                          data.evolutionInstanceName = evolutionInstanceName || null
                        }
                        if (Object.keys(data).length === 0) return
                        updateClinic.mutate(
                          { id: CLINIC_ID, data },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(CLINIC_ID) })
                              queryClient.invalidateQueries({ queryKey: ["whatsapp-status", CLINIC_ID] })
                              toast({ title: "Instância salva", description: "Nome da instância atualizado." })
                            },
                            onError: () => toast({ variant: "destructive", title: "Erro", description: "Falha ao salvar." }),
                          }
                        )
                      }}
                      disabled={updateClinic.isPending || evolutionInstanceName === (clinic?.evolutionInstanceName ?? "")}
                      className="gap-2 shrink-0"
                    >
                      <Save className="w-4 h-4" />
                      Salvar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Nome exato da instância criada no Manager UI da Evolution API.
                  </p>
                </div>

                {/* Botões de ação */}
                {clinic?.evolutionInstanceName && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      className="gap-2 flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setQrDialogOpen(true)}
                      disabled={isConnected}
                    >
                      <QrCode className="w-4 h-4" />
                      {isConnected ? "WhatsApp Conectado" : "Escanear QR Code"}
                    </Button>
                    {isConnected && (
                      <Button variant="outline" className="gap-2 text-red-600 border-red-300 hover:bg-red-50" onClick={handleDisconnect}>
                        <WifiOff className="w-4 h-4" />
                        Desconectar
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => refetchWaStatus()} title="Atualizar status">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Webhook info */}
                {clinic?.evolutionInstanceName && (
                  <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">URL do Webhook (configurar na instância):</p>
                    <code className="text-xs font-mono break-all block">
                      http://host.docker.internal:3000/api/whatsapp/evolution
                    </code>
                    <p className="text-xs text-muted-foreground">Eventos: <strong>MESSAGES_UPSERT</strong>, <strong>MESSAGES_UPDATE</strong></p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Card: Meta Cloud API (alternativa) ── */}
            <Card className={!metaIsActive ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Meta Cloud API
                        {metaIsActive && isMetaConfigured && (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-300 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Configurado
                          </Badge>
                        )}
                        {!metaIsActive && (
                          <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50 text-xs gap-1">
                            <WifiOff className="w-3 h-3" />
                            Inativo
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Integração oficial Meta — requer conta Business verificada.
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground shrink-0"
                    onClick={() => setMetaInstructionsOpen((o) => !o)}
                  >
                    {metaInstructionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {metaInstructionsOpen ? "Ocultar guia" : "Ver guia"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 relative">
                {/* Overlay quando inativo */}
                {!metaIsActive && (
                  <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-b-xl">
                    <p className="text-sm text-muted-foreground text-center px-6">
                      Provedor inativo — selecione <strong>Meta API Oficial</strong> acima para ativar.
                    </p>
                  </div>
                )}
                {/* Guia de configuração (colapsível) */}
                {metaInstructionsOpen && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
                    <p className="text-sm font-medium">Como configurar a Meta Cloud API</p>
                    <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-2">
                      <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="w-3 h-3" /></a> e crie um aplicativo do tipo <strong>Business</strong>.</li>
                      <li>Ative o produto <strong>WhatsApp</strong> no aplicativo e adicione um número de teste ou verifique seu número de produção.</li>
                      <li>Copie o <strong>Phone Number ID</strong> na seção <strong>WhatsApp → Números de telefone</strong>.</li>
                      <li>Gere um <strong>Token de Acesso Permanente</strong> em <strong>Configurações do sistema → Usuários do sistema</strong>.</li>
                      <li>Configure o Webhook abaixo no painel Meta → <strong>WhatsApp → Configuração</strong>.</li>
                    </ol>
                    <div className="rounded-lg bg-muted/60 border border-border/50 p-3 space-y-1">
                      <p className="text-xs font-medium">Webhook URL:</p>
                      <code className="text-xs font-mono break-all block">
                        {window.location.origin.replace("5175", "3000")}/api/whatsapp/webhook
                      </code>
                    </div>
                  </div>
                )}

                {/* Campos */}
                {/* Botão "Conectar com Meta" — auto-descobre Phone Number ID via Facebook Login */}
                {metaAppId && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Link className="w-4 h-4 text-blue-500" />
                      Conectar conta automaticamente
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Clique abaixo para fazer login com a sua conta Meta e selecionar automaticamente o número de telefone WhatsApp Business.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={handleMetaConnect}
                      disabled={!fbSdkReady || metaConnecting}
                    >
                      {metaConnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Smartphone className="w-4 h-4" />
                      )}
                      {metaConnecting ? "Conectando..." : "Entrar com Meta"}
                    </Button>
                    {!fbSdkReady && <p className="text-xs text-muted-foreground">Carregando SDK...</p>}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="whatsappPhoneNumberId">Phone Number ID</Label>
                  <Input
                    id="whatsappPhoneNumberId"
                    value={whatsappPhoneNumberId}
                    onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                    placeholder="123456789012345"
                    className="font-mono"
                  />
                </div>

                <SecretKeyField
                  id="whatsappAccessToken"
                  label="Token de Acesso Permanente"
                  description="Gerado em Meta Business → Configurações do sistema → Usuários do sistema."
                  placeholder="EAABs..."
                  currentMasked={clinic?.whatsappAccessToken}
                  value={whatsappAccessToken}
                  onChange={setWhatsappAccessToken}
                />

                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveWhatsapp}
                    disabled={updateClinic.isPending || !metaIsActive || (!whatsappAccessToken && whatsappPhoneNumberId === (clinic?.whatsappPhoneNumberId ?? ""))}
                    className="gap-2"
                  >
                    {updateClinic.isPending ? (
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Salvar Meta API
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Dialog: seleção de número Meta ── */}
          <Dialog open={metaPhoneDialog} onOpenChange={setMetaPhoneDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-500" />
                  Selecionar número WhatsApp
                </DialogTitle>
                <DialogDescription>
                  Escolha qual número de telefone deseja vincular a esta clínica. O Phone Number ID será preenchido automaticamente.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                {metaPhones.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setWhatsappPhoneNumberId(p.id)
                      setMetaPhoneDialog(false)
                      toast({ title: "Número selecionado", description: `${p.displayPhone} (${p.name}) — salve para confirmar.` })
                    }}
                    className="w-full flex items-center gap-3 rounded-xl border border-border hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 p-4 text-left transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{p.displayPhone}</p>
                      <p className="text-xs text-muted-foreground">{p.name}</p>
                      <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">ID: {p.id}</p>
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Dialog QR Code ── */}
          <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-green-600" />
                  Conectar WhatsApp
                </DialogTitle>
                <DialogDescription>
                  Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong> e escaneie o código abaixo.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col items-center gap-4 py-2">
                {waStatus?.state === "open" ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-emerald-600">WhatsApp conectado com sucesso!</p>
                  </div>
                ) : qrLoading ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Gerando QR code...</p>
                  </div>
                ) : qrError || !qrData?.qrCode ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                    <p className="text-sm text-muted-foreground text-center">
                      QR code não disponível. Verifique se a instância <strong>{clinic?.evolutionInstanceName}</strong> existe na Evolution API.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-qr", CLINIC_ID] })}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Tentar novamente
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border-2 border-green-200 p-2 bg-white">
                      <img src={qrData.qrCode} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Aguardando conexão... (atualiza automaticamente)
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
