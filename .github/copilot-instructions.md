# ClinicAI — Instruções para o Agente

## Visão Geral

MVP SaaS multi-tenant para gestão de clínicas (médica, vet, odonto, estética etc.) com atendimento via WhatsApp por IA. O frontend é um portal do dono da clínica; o backend expõe a API REST e o webhook do WhatsApp.

## Ambientes de Produção

| Sistema | URL | Instancia Docker | Infra |
|---|---|---|---|
| **Frontend** | https://atendai-kanx.vercel.app | — | Vercel (`atendai_agendai`, kanxs-projects) |
| **Backend API** | https://api.kanxitsolutions.com.br | `clinicai-api` | Oracle VM1 `147.15.86.5` |
| **Evolution API** | https://wa.kanxitsolutions.com.br | `clinicai-evolution` | Oracle VM2 `163.176.167.226` |
| **Banco de Dados** | `ep-nameless-bread-acjpjdap.sa-east-1.aws.neon.tech` | — | Neon PostgreSQL |

> **Dois repos GitHub:** `origin` → `atendai-agendai` (hyphen, desenvolvimento); `vercel-origin` → `atendai_agendai` (underscore, monitorado pelo Vercel). Sempre: `git push origin main ; git push vercel-origin main`

## Stack Atual

- **Monorepo**: pnpm workspaces (`pnpm-workspace.yaml`)
- **Node.js**: v22 · **pnpm**: v10 · **TypeScript**: 5.9
- **Backend**: Express 5 + Drizzle ORM + PostgreSQL 16
- **Validação**: Zod (`zod/v4`) + `drizzle-zod`
- **Build backend**: esbuild (`artifacts/api-server/build.mjs`)
- **Frontend**: React 19 + Vite 7 + Tailwind v4 + shadcn/ui + Wouter + TanStack Query
- **AI primária**: OpenRouter — rotação de 4 modelos gratuitos; **fallback**: Groq (`llama-3.3-70b-versatile` → `llama-3.1-8b-instant`)
- **API codegen**: Orval (a partir de `lib/api-spec/openapi.yaml`)

## Comandos Essenciais

```powershell
# Iniciar servidor API (porta 3000) — sempre usar caminho absoluto para o .env
node --env-file="c:\Desenvolvimento\Sistema-Sas\.env" --enable-source-maps "c:\Desenvolvimento\Sistema-Sas\artifacts\api-server\dist\index.mjs"

# Build do servidor (obrigatório após qualquer mudança em src/)
cd artifacts/api-server && pnpm run build

# Iniciar frontend (porta 5175 — obrigatório especificar --port, sem ele sobe na 3000 e conflita)
cd artifacts/clinic-dashboard && pnpm run dev -- --port 5175

# Push para produção (dois repos: desenvolvimento + Vercel)
git push origin main ; git push vercel-origin main

# Push de schema para o banco
pnpm --filter @workspace/db run push

# Regenerar client/types da API
pnpm --filter @workspace/api-spec run codegen

# Subir Evolution API (WhatsApp) — porta 8080
docker compose -f docker-compose.evolution.yml up -d

# Liberar porta ocupada (PowerShell)
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

## Banco de Dados

> **IMPORTANTE**: PostgreSQL roda como serviço Windows nativo (`postgresql-x64-16`), **NÃO via Docker**. Host: `localhost:5433`. Se o banco não responder: `Get-Service postgresql-x64-16`. Para iniciar (requer admin): `Start-Service postgresql-x64-16`.

- **Host**: `localhost:5433` · **User/Pass**: `postgres` · **DB**: `clinic_sas`
- **Clínica demo**: ID=1, `apiKey="8a0b608c-9aaa-4c79-bf42-336fa5823ac6"`, `evolutionInstanceName="clinica-1"`
- Profissional ID=2 "Dr. João Silva", serviços [1,2,3], seg-sex 08:00-18:00
- Superadmin: `admin@kanxitsolutions.com.br` / *(ver .env.prod no servidor)*
- Owner: `owner@clinicai.com.br` / *(ver .env.prod no servidor)*

Tabelas relevantes: `clinics`, `services`, `professionals`, `professional_services`, `professional_schedules`, `patients`, `appointments`, `ai_logs`, `users`, `user_activity_logs`, `handoffs`, `handoff_messages`.  
Schema completo em [`lib/db/src/schema/`](../lib/db/src/schema/).

Campos relevantes adicionados recentemente:
- `clinics.whatsappProvider` — `"evolution"` (padrão) ou `"meta"` (API Oficial Meta Cloud)
- `clinics.whatsappPhoneNumberId` — Phone Number ID do número de negócios (Meta Cloud API)
- `clinics.whatsappAccessToken` — Token de acesso permanente (Meta Cloud API)
- `patients.realPhone` — número de telefone real quando resolvido a partir de um @lid (privacidade WhatsApp)

## Arquitetura e Convenções

### Backend (`artifacts/api-server/src/`)

- Rotas em `routes/` → montadas em `/api` via `app.ts`
- Lógica de IA centralizada em `lib/ai-orchestrator.ts`
- Use `req.log` dentro de route handlers; `logger` (singleton pino) apenas em startup/background
- Express 5: handlers async → `Promise<void>`; early exits: `res.status(X).json(...); return;`
- Colunas `numeric` do PostgreSQL retornam como `string` — sempre `Number()` ao retornar

### Frontend (`artifacts/clinic-dashboard/src/`)

- `CLINIC_ID = 1` hardcoded (demo single-tenant)
- Proxy Vite: `/api` → `http://localhost:3000` (configurado em `vite.config.ts`)
- Rotas autenticadas via JWT (`/login`, `/register`); rota `/admin/clinics` protegida por `AdminProtectedRoute` (role `superadmin`)
- Páginas: `Dashboard`, `Appointments`, `Services`, `Professionals`, `Patients`, `AiLogs`, `AiSettings`, `AiChat`, `ClinicSettings`, `Team`, `AdminClinics`, `Login`, `Register`
- Contextos: `contexts/auth.tsx`, `contexts/handoffs.tsx` (estado global de handoffs; envolve App inteiro)
- Auth context: `isOwner`, `isOwnerOrSupervisor`, `isSuperAdmin` (computed); roles válidos: `owner | supervisor | attendant | staff | superadmin`
- Nav condicional em `AppLayout.tsx`: `/team` e `/logs`/`/chat` visíveis para owner+supervisor; `/settings/ai` e `/settings/clinic` apenas owner
- Componentes globais: `ChatWindowManager` (renderizado em `App.tsx`, fora do router, painéis flutuantes de chat no canto inferior direito)
- Componentes de chat: `ChatPanel` (painel flutuante individual, máx 3 simultâneos), `ConversationViewSheet` (histórico read-only em Sheet lateral)
- Todo texto em **pt-BR**

### AI Orchestrator (`artifacts/api-server/src/lib/ai-orchestrator.ts`)

- **AI primária**: OpenRouter com rotação de modelos (todos gratuitos, suportam tool use) — lista hardcoded em `AI_MODEL_ROTATION` no código
- **AI fallback**: Groq (ativado quando todos os modelos OpenRouter retornam 429):
  1. `llama-3.3-70b-versatile` — 280 TPS, melhor qualidade
  2. `llama-3.1-8b-instant` — 560 TPS, mais rápido (histórico truncado + max_tokens reduzido)
- Variáveis: `AI_INTEGRATIONS_OPENAI_API_KEY` (OpenRouter) + `GROQ_API_KEY` (fallback)
- `max_tokens = 2048`
- Carrega últimos **20 turnos** do histórico de `ai_logs` (por clínica + telefone) antes de cada chamada
- Detecta paciente existente pelo telefone via tabela `patients`; cria registro novo no primeiro agendamento
- Ferramentas disponíveis:
  - `check_availability(date, serviceId?, professionalId?)` — verifica slots REAIS para uma data YYYY-MM-DD CONFIRMADA; delega a `buildAvailabilityList()`; retorna lista paginada (máx 8 slots)
  - `find_available_dates(fromDate, serviceId?, professionalId?)` — busca próximas datas reais com disponibilidade; usar quando paciente NÃO especificou data exata ou mencionou apenas dia da semana
  - `book_appointment(...)` — valida conflito de horário por profissional antes de inserir
  - `faq_lookup(query)` — busca na base de conhecimento da clínica
  - `list_options(header, body, footerText, options[])` — botões/lista para SERVIÇOS, PROFISSIONAIS ou confirmações. **NUNCA para horários ou períodos (Manhã/Tarde)**
  - `save_patient_info(name?, notes?)` — salva/atualiza dados do paciente
- **`buildAvailabilityList(clinicId, date, serviceId?, professionalId?, offset?)`** — exportada; gera `InteractiveList` paginada
- **`transcribeAudio(buffer)`** — transcreve via Whisper (`gpt-4o-mini-transcribe`); hardcoda `language: "pt"`

### Guards Anti-Alucinação em `executeToolCall()` (`ai-orchestrator.ts`)
- **`list_options` com horários/períodos** — IDs com ISO datetime (`2026-04-22T...`), padrões `slot_N`/`time_N`/`opt_N`, labels `HH:MM` ou labels Manhã/Tarde/Noite em contexto de agendamento → bloqueia e retorna erro instruindo a IA a usar `check_availability`
- **Dois widgets simultâneos** — `capturedInteractiveList` e `capturedInteractiveChoice` só aceitam o primeiro widget capturado; chamadas subsequentes no mesmo turno são ignoradas
- **Guard pós-loop** — se finalReply tem ≥2 horários em texto sem widget interativo real → resposta substituída por pergunta de confirmação de serviço/data

### Contexto Preservado no `ai_log`
- Quando a IA apresenta `list_options` ou `find_available_dates`, o campo `aiResponse` no banco recebe sufixo `[Opções apresentadas ao paciente: ...]` — garante que o próximo turno da IA saiba o que foi mostrado (evita "Como posso ajudar?" após seleção)

### Sistema de Handoff (`artifacts/api-server/src/routes/handoffs.ts`)

- 5 endpoints sob `/api/clinics/:clinicId/handoffs`:
  - `GET /` — lista handoffs ativos (`endedAt IS NULL`)
  - `POST /` — atendente assume conversa; 409 se já existe handoff ativo para o telefone
  - `DELETE /:phone` — encerra handoff (`endedAt = now`); IA volta a responder automaticamente
  - `GET /:phone/messages` — histórico mesclado `ai_logs` + `handoff_messages` ordenado por `createdAt` (cada `ai_logs` vira 2 items: `source:"patient"` + `source:"ai"`)
  - `POST /:phone/messages` — envia via Evolution API + salva em `handoff_messages(direction:"out")`
- **`clinics.aiEnabled`** (boolean, default `true`): quando `false`, toda mensagem WhatsApp cai no guard sem chamar IA; configurável em `AiSettings`
- Polling 5 s via `refetchInterval: 5000` no hook `useListHandoffMessages`

### Sistema de Usuários/Equipe (`artifacts/api-server/src/routes/users.ts`)

- 5 endpoints sob `/api/clinics/:clinicId/users`:
  - `GET /` — lista membros da clínica
  - `POST /` — cria membro (requer role `owner`); cria com senha temporária
  - `PATCH /:id` — atualiza nome/role/senha
  - `DELETE /:id` — remove membro
  - `GET /activity-logs` → `/api/clinics/:clinicId/activity-logs` — histórico de atividades (auditoria)
- Roles válidos: `owner | supervisor | attendant | staff | superadmin`
- Senha inicial definida pelo owner; membro pode trocar via `PATCH`
- Página frontend: `Team.tsx` — gestão completa com dialog de criação/edição e sheet de logs

### Admin (`artifacts/api-server/src/routes/admin.ts`)

- `POST /api/admin/bootstrap` — cria o primeiro superadmin; protegido por `ADMIN_BOOTSTRAP_SECRET` no header
- `PATCH /api/admin/clinics/:clinicId/reset-owner-password` — reseta senha do owner da clínica (superadmin only)
- Página frontend: `AdminClinics.tsx` — lista todas as clínicas com botão de reset de senha (role `superadmin`)

### Evolution API / WhatsApp (`artifacts/api-server/src/lib/evolution-api.ts`)

- Funções principais: `sendTextMessage`, `sendListMessage`, `sendButtonMessage`, `sendTypingPresence`
- `sendTextMessage()` aplica delay aleatório **5-15 s** para simular comportamento humano
- `ensureInstanceExists(name)` — cria instância se não existir e auto-configura webhook via `ensureWebhookConfigured()`
- Webhook configurado em: `EVOLUTION_WEBHOOK_URL/api/whatsapp/evolution` com eventos `MESSAGES_UPSERT, MESSAGES_UPDATE`
- **O nome da instância no Evolution Manager deve ser IDÊNTICO** ao `clinics.evolutionInstanceName` no banco
- Docker: `docker-compose.evolution.yml` sobe `evolution-api` (porta 8080) + `evolution-redis` (porta 6380)
- **`Dockerfile.evolution`** — imagem customizada: instala Baileys `latest` e aplica `patch-evolution-lid.js` em tempo de build

#### Suporte a @lid (WhatsApp Privacy Mode)
Usuários com privacidade ativada no WhatsApp enviam JIDs no formato `xxxxx@lid` ao invés de `5584...@s.whatsapp.net`. Sem tratamento, a Evolution API lança `BadRequestException: exists:false` ao tentar enviar.

- **`patch-evolution-lid.js`** — patcha `main.js` do Evolution API em tempo de build/runtime para bypassar a verificação `exists:false` em JIDs `@lid` (adiciona `&&!n.jid.includes("@lid")` à condição de throw). Marcador único: `@broadcast")&&!n.jid.includes("@lid")`; 3 padrões patchados.
- **`toJid()`** em `evolution-api.ts` — preserva JIDs `@lid` inalterados; remove `:deviceId` (@device); adiciona `@s.whatsapp.net` para números puros.
- **Resolução do número real**: duas fontes em ordem de prioridade:
  1. `key.remoteJidAlt` do payload Baileys 7.0.0-rc.9 — JID `@s.whatsapp.net` alternativo enviado pelo WhatsApp quando usuário tem privacidade parcial (não total)
  2. `resolveLidPhone(instance, lidJid)` em `evolution-api.ts` — tenta `onWhatsApp()` da Evolution API (raramente funciona com @lid)
- Número resolvido é salvo em `patients.realPhone` e usado como `rawPhone` para toda a lógica subsequente (IA, handoff, scheduling)

### Meta Cloud API (`artifacts/api-server/src/lib/meta-api.ts`)

- **Webhook**: `POST /api/whatsapp/meta` (`routes/meta-webhook.ts`) + `GET` para verificação de token Meta
- **Funções de envio**: `sendMetaTextMessage`, `sendMetaListMessage`, `sendMetaButtonMessage`, `sendMetaTypingPresence`
- **`isMetaConfigured(config)`** — verifica `phoneNumberId + accessToken`; retorna type guard
- **`metaPost()`** — POST para `https://graph.facebook.com/v17.0/{phone_number_id}/messages`
- Validação HMAC-SHA256 via `X-Hub-Signature-256` (`META_FACEBOOK_APP_SECRET`)
- Verificação de webhook via `hub.verify_token` (`META_WHATSAPP_VERIFY_TOKEN`)
- Busca clínica por `clinics.whatsappPhoneNumberId` (campo no banco)
- Trata tipos `text`, `interactive/list_reply`, `interactive/button_reply`
- Responde `200` imediatamente (antes de processar) — obrigatório pois Meta retenta se não receber em 20s

### WhatsApp Multi-Provedor (`artifacts/api-server/src/lib/whatsapp-provider.ts`)

Camada de abstração unificada que permite ao sistema operar com Evolution API ou Meta Cloud API de forma transparente. Usado pelo `scheduling-flow.ts` para enviar mensagens independente do provedor configurado.

```typescript
export interface WhatsAppChannelContext {
  provider: "evolution" | "meta";
  evolutionInstance?: string;   // nome da instância Evolution
  metaPhoneNumberId?: string;   // Phone Number ID Meta
  metaAccessToken?: string;     // Access Token Meta
}
export function clinicToChannel(clinic): WhatsAppChannelContext
```

- **`clinicToChannel(clinic)`** — cria channel a partir da clínica; usa `clinic.whatsappProvider` para decidir o provedor; fallback para `"evolution"`
- **`waText(channel, phone, text)`** — envia texto via provedor configurado
- **`waList(channel, phone, opts)`** — envia lista interativa; converte formato automaticamente entre Evolution e Meta
- **`waButtons(channel, phone, opts)`** — envia botões; se >3 e Meta → converte para lista interativa
- **`waTyping(channel, phone)`** — typing presence (Evolution: nativa; Meta: delay embutido em `sendMetaTextMessage`)
- **Padrão de uso**: `whatsapp.ts` e `meta-webhook.ts` usam `clinicToChannel(clinic)` e passam `channel` para todas as funções do `scheduling-flow`
- **Nota**: a seção de envio de resposta IA em `whatsapp.ts` ainda usa Evolution API diretamente (`sendTextMessage`, `sendListMessage`, etc.) para obter o `messageId` e rastrear `ai_logs.whatsappMessageId`. A paginação de slots sem IA usa `waTyping`/`waList` (channel-aware).

### Webhook WhatsApp (`artifacts/api-server/src/routes/whatsapp.ts`)

- Rota **Evolution API**: `POST /api/whatsapp/evolution`
- **Guard de handoff** (executado ANTES de qualquer lógica de IA): se houver handoff ativo para o telefone (`handoffsTable` com `endedAt IS NULL`) **ou** `clinic.aiEnabled = false` → mensagem é salva em `handoff_messages(direction:"in")` e o webhook retorna sem chamar a IA
- Decodifica `listResponseMessage` e `buttonsResponseMessage` antes de chamar a IA
- `selectedRowId` com prefixo `S|profId|svcId|isoSlot` → injeta `[SELEÇÃO]...` como mensagem para a IA acionar `book_appointment`
- `selectedRowId` com prefixo `M|date|svc|prof|offset` → paginação de slots sem chamar IA (usa `waTyping + waList` via channel)
- `selectedRowId` com prefixo `DATE|YYYY-MM-DD` → ativa `buildAvailabilityList` para a data (sem IA) ou delega ao `handleSchedulingSelection` se sessão de agendamento ativa
- `selectedRowId = "OD"` → injeta mensagem "Quero ver horários em outro dia..."
- Comando especial `reiniciarx`: apaga `ai_logs` da conversa e responde "Conversa reiniciada! 😊"
- Mensagem de áudio → transcrita via `transcribeAudio()` antes de enviar à IA
- **Resolução @lid**: tenta `key.remoteJidAlt` do payload Baileys → fallback `resolveLidPhone()` → número resolvido salvo em `patients.realPhone`
- `channel = clinicToChannel(clinic)` — criado logo após busca da clínica; passado para todas as chamadas do `scheduling-flow`

### Webhook Meta Cloud API (`artifacts/api-server/src/routes/meta-webhook.ts`)

- Rota: `GET /api/whatsapp/meta` (verificação) + `POST /api/whatsapp/meta` (mensagens)
- Responde 200 imediatamente antes de processar (obrigatório — Meta retenta se não receber em 20s)
- Valida assinatura HMAC-SHA256 via `X-Hub-Signature-256`
- Busca clínica por `clinics.whatsappPhoneNumberId` — permite múltiplas clínicas Meta no mesmo backend
- Trata `text`, `interactive/list_reply` (prefixos S|, M|, DATE|, OD), `interactive/button_reply`
- Mesmo comportamento que Evolution: guard handoff, scheduling flow, IA, paginação
- Usa `channel = clinicToChannel(clinic)` e funções `waText/waList/waButtons` do provider

### Fluxo de Agendamento Determinístico (`artifacts/api-server/src/lib/scheduling-flow.ts`)

- Intercept ANTES da IA: detecta intenção via `isSchedulingIntent()` → inicia state machine
- Estados: `svc_select → prof_select → date_select → slot_select → confirming → done`
- IDs de seleção do fluxo: `SVC|N`, `PRF|N`, `PRF|0` (sem preferência), `CNF|yes`, `CNF|no`
- `getAvailableDates()` verifica slots REAIS via `buildAvailabilityList()` — não inclui datas lotadas
- `showSlotSelection()` com try-catch — se slots sumirem entre data_select e slot_select, mostra mensagem e volta para date_select com datas alternativas reais

## Variáveis de Ambiente (`.env` na raiz)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/clinic_sas
AI_INTEGRATIONS_OPENAI_API_KEY=<chave OpenRouter sk-or-v1-...>
GROQ_API_KEY=<chave Groq gsk_...>
PORT=3000
API_PORT=3000
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<chave Evolution>
EVOLUTION_WEBHOOK_URL=http://host.docker.internal:3000
JWT_SECRET=<segredo JWT>
ADMIN_BOOTSTRAP_SECRET=<segredo bootstrap admin>
META_WHATSAPP_VERIFY_TOKEN=<token de verificação do webhook Meta>
META_FACEBOOK_APP_SECRET=<app secret do Facebook App para validação HMAC>
```

## Armadilhas Comuns

- **Build obrigatório**: mudanças em `artifacts/api-server/src/` exigem `pnpm run build` antes de reiniciar — o Node serve `dist/index.mjs`
- **Porta do frontend**: sempre `-- --port 5175`; sem isso o Vite usa a 3000 e conflita com a API
- **PostgreSQL é serviço Windows nativo**: não está em Docker; reinicializa o Windows → o serviço pode estar parado (`StartupType` padrão não é Automatic)
- **Modelos IA**: hardcoded em `AI_MODEL_ROTATION` no código; fallback Groq ativado automaticamente via `GROQ_API_KEY` quando OpenRouter retorna 429 em todos os modelos; cooldown de 60s para 429 e 5min para 402
- **Transcrição de áudio**: hardcoda `language: "pt"` — áudio em outro idioma não transcreve corretamente
- **`numeric` → `string`**: colunas `numeric` do PostgreSQL chegam como string; sempre `Number()` ao serializar JSON
- **`deliveryStatus` assíncrono**: `ai_logs.deliveryStatus` é atualizado pelo webhook Evolution post-facto (eventual)
- **`zod/v4` não resolve em routes do backend**: o esbuild não consegue resolver `import { z } from "zod/v4"` diretamente nas routes. Use os schemas de `@workspace/api-zod` ou validação manual simples (`req.body?.field`). `zod/v4` funciona apenas em libs do workspace que são pré-compiladas pelo TypeScript.
- **`list_options` com horários é bloqueado**: o guard em `executeToolCall()` rejeita qualquer chamada de `list_options` com IDs ISO datetime, `slot_N`, `time_N`, `opt_N`, labels `HH:MM` ou labels Manhã/Tarde em contexto de agendamento — a IA recebe erro e deve usar `check_availability`
- **`check_availability` exige data confirmada**: a tool só deve ser chamada com data YYYY-MM-DD explícita do paciente; para "quarta-feira", "amanhã" ou sem data → usar `find_available_dates`
- **Raciocínio em inglês bloqueado**: `sanitizeReply()` remove frases com "We need to call...", "I will call...", etc. que alguns modelos incluem no output
- **@lid usuarios**: usuários com privacidade WhatsApp enviam JID `xxxxx@lid` → Evolution API retornaria 400 `exists:false` sem o patch; `patch-evolution-lid.js` bypassa isso; `key.remoteJidAlt` no payload Baileys contém o número real quando disponível (privacidade parcial); com privacidade total `remoteJidAlt` é `undefined` e `resolveLidPhone()` raramente resolve
- **whatsapp-provider vs evolution direto**: `scheduling-flow.ts` usa `channel` (abstração dual); a seção de envio de resposta IA em `whatsapp.ts` usa Evolution direto para obter `messageId` e rastrear `ai_logs.whatsappMessageId` — as funções `waText`/`waList`/`waButtons` retornam `void` (sem messageId)
