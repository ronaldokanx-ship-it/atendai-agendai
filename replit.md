# ClinicAI — SaaS Multi-tenant Clinic Management

## Overview

An MVP SaaS platform for clinic management (Medical, Vet, Dental) with automated WhatsApp AI attendance. Each clinic can manage its own AI flow, personality, and services.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild
- **AI**: OpenAI (GPT-5.2 for chat/function calling, gpt-4o-mini-transcribe for Whisper audio)
- **Frontend**: React + Vite (Tailwind v4, shadcn/ui)

## Architecture

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   │   └── src/
│   │       ├── lib/
│   │       │   └── ai-orchestrator.ts  # OpenAI Function Calling engine
│   │       └── routes/
│   │           ├── clinics.ts
│   │           ├── services.ts
│   │           ├── appointments.ts
│   │           ├── ai-logs.ts
│   │           └── whatsapp.ts         # WhatsApp webhook handler
│   └── clinic-dashboard/   # React frontend (clinic owner portal)
│       └── src/
│           └── pages/
│               ├── Dashboard.tsx       # Stats overview
│               ├── AiSettings.tsx      # Configure AI name, personality, knowledge base
│               ├── Services.tsx        # Manage clinic services
│               ├── Appointments.tsx    # View/update appointments
│               └── AiLogs.tsx          # AI interaction history
├── lib/
│   ├── api-spec/           # OpenAPI spec (source of truth)
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   └── db/
│       └── src/schema/
│           ├── clinics.ts
│           ├── services.ts
│           ├── appointments.ts
│           └── ai_logs.ts
```

## Database Schema

- **clinics**: `id`, `name`, `phone`, `api_key`, `ai_name`, `ai_personality_prompt`, `knowledge_base`, `clinic_type`
- **services**: `id`, `clinic_id`, `name`, `price`, `duration_minutes`
- **appointments**: `id`, `clinic_id`, `service_id`, `patient_name`, `patient_phone`, `scheduled_at`, `status` (pending/confirmed/canceled), `payment_intent_id`, `notes`
- **ai_logs**: `id`, `clinic_id`, `patient_phone`, `user_message`, `ai_response`, `tokens_used`, `message_type`

## WhatsApp Webhook

`POST /api/whatsapp/webhook` — accepts JSON payload:
```json
{
  "apiKey": "demo-api-key-clinic-001",
  "from": "+5511999001234",
  "message": "Quero agendar uma consulta",
  "messageType": "text"
}
```

For audio: include `audioUrl` (downloadable .ogg) and set `messageType: "audio"` — it auto-transcribes with Whisper.

## AI Function Calling Tools

- `check_availability(date, serviceId?)` — Returns available hourly slots
- `book_appointment(patientName, patientPhone, scheduledAt, serviceId?, notes?)` — Creates appointment
- `faq_lookup(query)` — Searches clinic knowledge base

## Demo Clinic

- **Clinic ID**: 1
- **API Key**: `demo-api-key-clinic-001`
- **Name**: Clínica Saúde Total
- **AI Assistant**: Sofia

## Scripts

- `pnpm --filter @workspace/api-server run dev` — Start API server
- `pnpm --filter @workspace/clinic-dashboard run dev` — Start frontend
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API client/types
- `pnpm --filter @workspace/db run push` — Push DB schema changes
