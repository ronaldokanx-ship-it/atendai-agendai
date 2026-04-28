# ClinicAI — Instruções para o Agente

## Visão Geral

MVP SaaS multi-tenant para gestão de clínicas (médica, vet, odonto, estética etc.) com atendimento via WhatsApp por IA. O frontend é um portal do dono da clínica; o backend expõe a API REST e o webhook do WhatsApp.

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
- **Clínica demo**: ID=1, `apiKey="demo-api-key-clinic-001"`, `evolutionInstanceName="clinica-1"`
- **Clínica de teste**: ID=3, `evolutionInstanceName="clinica1"`

Tabelas relevantes: `clinics`, `services`, `professionals`, `professional_services`, `professional_schedules`, `patients`, `appointments`, `ai_logs`, `users`, `user_activity_logs`, `handoffs`, `handoff_messages`.  
Schema completo em [`lib/db/src/schema/`](../lib/db/src/schema/).

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

### Webhook WhatsApp (`artifacts/api-server/src/routes/whatsapp.ts`)

- **Guard de handoff** (executado ANTES de qualquer lógica de IA): se houver handoff ativo para o telefone (`handoffsTable` com `endedAt IS NULL`) **ou** `clinic.aiEnabled = false` → mensagem é salva em `handoff_messages(direction:"in")` e o webhook retorna sem chamar a IA
- Decodifica `listResponseMessage` e `buttonsResponseMessage` antes de chamar a IA
- `selectedRowId` com prefixo `S|profId|svcId|isoSlot` → injeta `[SELEÇÃO]...` como mensagem para a IA acionar `book_appointment`
- `selectedRowId` com prefixo `M|date|svc|prof|offset` → paginação de slots sem chamar IA
- `selectedRowId` com prefixo `DATE|YYYY-MM-DD` → ativa `buildAvailabilityList` para a data (sem IA) ou delega ao `handleSchedulingSelection` se sessão de agendamento ativa
- `selectedRowId = "OD"` → injeta mensagem "Quero ver horários em outro dia..."
- Comando especial `reiniciarx`: apaga `ai_logs` da conversa e responde "Conversa reiniciada! 😊"
- Mensagem de áudio → transcrita via `transcribeAudio()` antes de enviar à IA

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
