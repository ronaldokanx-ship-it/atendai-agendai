# AtendAI — SaaS Multi-tenant de Gestão de Clínicas

MVP SaaS com atendimento via WhatsApp por IA. Cada clínica gerencia seu próprio fluxo de IA, serviços, profissionais e pacientes.

---

## Ambientes em Produção

| Sistema | Plataforma | URL | Instância |
|---|---|---|---|
| **Frontend** | Vercel | https://atendai-kanx.vercel.app | `atendai_agendai` (kanxs-projects) |
| **Backend API** | Oracle Cloud VM1 (x86) | https://api.kanxitsolutions.com.br | `clinicai-api` (147.15.86.5) |
| **Evolution API** | Oracle Cloud VM2 (x86) | https://wa.kanxitsolutions.com.br | `clinicai-evolution` (163.176.167.226) |
| **Banco de Dados** | Neon PostgreSQL | `ep-nameless-bread-acjpjdap.sa-east-1.aws.neon.tech` | `neondb` |

### Credenciais de Acesso (Demo)

| Papel | Email | Senha |
|---|---|---|
| Superadmin | `admin@kanxitsolutions.com.br` | *(ver .env.prod no servidor)* |
| Owner (Clínica 1) | `owner@clinicai.com.br` | *(ver .env.prod no servidor)* |

---

## Stack

- **Monorepo**: pnpm workspaces · **Node.js**: v22 · **TypeScript**: 5.9
- **Backend**: Express 5 + Drizzle ORM + PostgreSQL 16 (Neon)
- **Validação**: Zod (`zod/v4`) + `drizzle-zod`
- **Build backend**: esbuild
- **Frontend**: React 19 + Vite 7 + Tailwind v4 + shadcn/ui + Wouter + TanStack Query
- **IA primária**: OpenRouter (rotação de modelos gratuitos)
- **IA fallback**: Groq (`llama-3.3-70b-versatile` → `llama-3.1-8b-instant`)
- **WhatsApp**: Evolution API v2.2.3 (Baileys)

---

## Estrutura do Monorepo

```
Sistema-Sas/
├── artifacts/
│   ├── api-server/              # Backend Express — hospedado na VM1 (Oracle)
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── ai-orchestrator.ts   # Orquestrador de IA (OpenRouter + Groq)
│   │       │   ├── scheduling-flow.ts   # Fluxo determinístico de agendamento
│   │       │   └── evolution-api.ts     # Integração WhatsApp (Evolution API)
│   │       └── routes/
│   │           ├── clinics.ts
│   │           ├── services.ts
│   │           ├── professionals.ts
│   │           ├── patients.ts
│   │           ├── appointments.ts
│   │           ├── handoffs.ts          # Handoff IA → atendente humano
│   │           ├── users.ts             # Gestão de equipe
│   │           ├── ai-logs.ts
│   │           └── whatsapp.ts          # Webhook Evolution API
│   └── clinic-dashboard/        # Frontend React — hospedado na Vercel
│       └── src/
│           └── pages/
│               ├── Dashboard.tsx
│               ├── AiSettings.tsx
│               ├── AiChat.tsx           # Chat com handoff em tempo real
│               ├── Services.tsx
│               ├── Professionals.tsx
│               ├── Patients.tsx
│               ├── Appointments.tsx
│               ├── AiLogs.tsx
│               ├── Team.tsx             # Gestão de membros da equipe
│               ├── ClinicSettings.tsx
│               └── AdminClinics.tsx     # Painel superadmin
├── lib/
│   ├── api-spec/                # OpenAPI spec (fonte de verdade)
│   ├── api-client-react/        # Hooks React Query gerados pelo Orval
│   ├── api-zod/                 # Schemas Zod gerados
│   └── db/
│       └── src/schema/          # Tabelas Drizzle ORM
├── deploy/                      # Scripts e configs de infraestrutura
│   ├── vm1-clinicai-api/        # Tudo relacionado à VM1 (Backend)
│   ├── vm2-clinicai-evolution/  # Tudo relacionado à VM2 (Evolution)
│   └── vercel-clinic-dashboard/ # Configurações Vercel (Frontend)
└── .github/
    └── copilot-instructions.md  # Contexto do projeto para o Copilot
```

---

## Comandos Essenciais (Desenvolvimento Local)

```powershell
# Iniciar servidor API (porta 3000)
node --env-file="c:\Desenvolvimento\Sistema-Sas\.env" --enable-source-maps "c:\Desenvolvimento\Sistema-Sas\artifacts\api-server\dist\index.mjs"

# Build do servidor (obrigatório após qualquer mudança em src/)
cd artifacts/api-server && pnpm run build

# Iniciar frontend (porta 5175)
cd artifacts/clinic-dashboard && pnpm run dev -- --port 5175

# Push de schema para o banco
pnpm --filter @workspace/db run push

# Regenerar client/types da API
pnpm --filter @workspace/api-spec run codegen
```

## Deploy em Produção

Para atualizar o código em produção após cada commit:

```powershell
# 1. Push para ambos os repos GitHub (o Vercel monitora atendai_agendai com underscore)
git push origin main
git push vercel-origin main   # aciona rebuild automático no Vercel

# 2. Atualizar VMs Oracle
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@147.15.86.5 `
  "cd /opt/clinicai && sudo git pull && sudo docker compose -f docker-compose.vm1.yml up -d --build api"

ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@163.176.167.226 `
  "cd /opt/clinicai && sudo git pull && sudo docker compose -f docker-compose.vm2.yml up -d"
```

## Clínica Demo

- **ID**: 1 · **Nome**: ClinicAI Demo
- **API Key**: `8a0b608c-9aaa-4c79-bf42-336fa5823ac6`
- **WhatsApp**: instância `clinica-1` (`state: open`)
- **Profissional**: Dr. João Silva (ID=2) — serviços 1, 2, 3 · seg-sex 08:00-18:00
