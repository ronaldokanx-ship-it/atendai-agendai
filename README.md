# ClinicAI — SaaS Multi-tenant Clinic Management

## Overview

An MVP SaaS platform for clinic management (Medical, Vet, Dental) with automated WhatsApp AI attendance. Each clinic can manage its own AI flow, personality, services, professionals, and patient records.

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
- **Frontend**: React + Vite (Tailwind v4, shadcn/ui, date-fns)

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
│   │           ├── professionals.ts    # Professionals + specialty filtering
│   │           ├── patients.ts         # Patient CRUD + history
│   │           ├── appointments.ts
│   │           ├── ai-logs.ts
│   │           └── whatsapp.ts         # WhatsApp webhook handler
│   └── clinic-dashboard/   # React frontend (clinic owner portal)
│       └── src/
│           └── pages/
│               ├── Dashboard.tsx       # Stats overview
│               ├── AiSettings.tsx      # Configure AI name, personality, knowledge base
│               ├── Services.tsx        # Manage clinic services
│               ├── Professionals.tsx   # Manage professionals & specialties
│               ├── Patients.tsx        # Patient CRUD, history & notes
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
│           ├── professionals.ts    # professionals + professional_services tables
│           ├── patients.ts         # patients table
│           ├── appointments.ts     # now includes professional_id & patient_id
│           └── ai_logs.ts
```

## Database Schema

- **clinics**: `id`, `name`, `phone`, `api_key`, `ai_name`, `ai_personality_prompt`, `knowledge_base`, `clinic_type`
- **services**: `id`, `clinic_id`, `name`, `price`, `duration_minutes`
- **professionals**: `id`, `clinic_id`, `name`, `specialty`, `bio`, `active`
- **professional_services**: `id`, `professional_id`, `service_id` (many-to-many junction)
- **patients**: `id`, `clinic_id`, `name`, `phone`, `email`, `date_of_birth`, `notes`
- **appointments**: `id`, `clinic_id`, `service_id`, `professional_id`, `patient_id`, `patient_name`, `patient_phone`, `scheduled_at`, `status` (pending/confirmed/canceled), `notes`
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

- `check_availability(date, serviceId?)` — Returns available hourly slots AND professionals qualified for the service
- `book_appointment(patientName, patientPhone, scheduledAt, serviceId?, professionalId?, notes?)` — Creates appointment with optional professional
- `faq_lookup(query)` — Searches clinic knowledge base

The AI now presents qualified professionals to the patient when checking availability and includes the chosen professional in the booking.

## Demo Clinic

- **Clinic ID**: 1
- **API Key**: `demo-api-key-clinic-001`
- **Name**: Clínica Saúde Total
- **AI Assistant**: Sofia

## Key Implementation Notes

- `numeric` columns from PostgreSQL come back as strings — always wrap with `Number()` before returning
- Use `req.log` inside route handlers (pino-http), `logger` singleton only for startup/background code
- Express 5: async handlers need `Promise<void>`, use `res.status().json(); return;` pattern for early exits
- Frontend `CLINIC_ID = 1` is hardcoded (single-tenant demo)
- All AI responses are in Brazilian Portuguese (pt-BR)
- OpenAI via env vars `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`

## Scripts

- `pnpm --filter @workspace/api-server run dev` — Start API server
- `pnpm --filter @workspace/clinic-dashboard run dev` — Start frontend
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API client/types
- `pnpm --filter @workspace/db run push` — Push DB schema changes
