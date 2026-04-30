# ClinicAI SaaS — Guia de Deploy em Produção (Grátis para Sempre)

## Arquitetura

```
                    ┌──────────────────────────────────────┐
                    │          USUÁRIO FINAL                │
                    └────────────┬─────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌────────────────┐ ┌──────────────────┐ ┌──────────────┐
     │   Vercel       │ │  Oracle VM1 (x86)│ │  Oracle VM2  │
     │ React Frontend │ │  Backend API     │ │ Evolution API│
     │   GRATUITO ∞   │ │  GRATUITO ∞      │ │  GRATUITO ∞  │
     └────────────────┘ └────────┬─────────┘ └──────────────┘
                                 │
                         ┌───────▼────────┐
                         │  Neon Postgres │
                         │  GRATUITO ∞    │
                         └────────────────┘
```

| Plataforma | Serviço | Limites Gratuitos |
|---|---|---|
| **Vercel** | Frontend React | Sem limite de projetos, 100 GB banda/mês |
| **Oracle Cloud** | VM1 - API | 1 OCPU, 1 GB RAM, 50 GB disco - sempre grátis |
| **Oracle Cloud** | VM2 - Evolution | 1 OCPU, 1 GB RAM, 50 GB disco - sempre grátis |
| **Neon** | PostgreSQL 16 | 0.5 GB storage, 1 branch - sempre grátis |

---

## Pré-requisitos

- Conta Oracle Cloud Free Tier: https://cloud.oracle.com
- Conta Neon: https://neon.tech
- Conta Vercel: https://vercel.com
- Domínio próprio (ex: Cloudflare gratuito)
- OCI CLI configurado localmente
- Chave SSH gerada em `~/.ssh/clinicai_oracle`

---

## Passo 1 — Configurar Neon (Banco de Dados)

1. Acesse https://neon.tech → **New Project**
2. Nome: `clinic-sas`, Region: `AWS São Paulo (sa-east-1)`
3. Em **Connection Details**, copie a connection string
4. Crie um segundo database para o Evolution API:
   - Dashboard → **Databases** → **New Database** → nome: `evolution_api`
5. Anote as duas connection strings com `?sslmode=require`

---

## Passo 2 — Provisionar VMs Oracle Cloud (x86 AMD)

Execute o script PowerShell (Windows) para criar as 2 VMs automaticamente:

```powershell
# VM1 — Backend API
.\deploy\scripts\oracle-retry.ps1
# Aguarde: OCID e IP são salvos em deploy\scripts\oracle-instance.txt

# VM2 — Evolution API (execute em um novo terminal após VM1 criada)
# Edite oracle-retry.ps1: mude $INSTANCE_NAME = "clinicai-evolution"
.\deploy\scripts\oracle-retry.ps1
```

> As VMs x86 AMD (`VM.Standard.E2.1.Micro`) estão prontamente disponíveis
> no Always Free tier — sem problemas de capacidade como as ARM.

**Após criar cada VM**, no Oracle Console:
1. Networking → Virtual Cloud Networks → Security Lists
2. Adicione **Ingress Rules**: TCP porta 80 e porta 443 (source: `0.0.0.0/0`)

---

## Passo 3 — Configurar DNS

No seu provedor DNS (Cloudflare recomendado — gratuito):
```
api.seudominio.com  → A → IP da VM1
wa.seudominio.com   → A → IP da VM2
```

Aguarde propagação (5-10 minutos no Cloudflare, até 24h em outros).

---

## Passo 4 — Setup das VMs

Para cada VM (VM1 e VM2), execute o script de setup inicial:

```bash
# VM1
ssh -i ~/.ssh/clinicai_oracle ubuntu@<IP_VM1> \
    "curl -fsSL https://raw.githubusercontent.com/ronaldokanx-ship-it/atendai-agendai/main/deploy/scripts/vm-setup.sh | bash"

# VM2
ssh -i ~/.ssh/clinicai_oracle ubuntu@<IP_VM2> \
    "curl -fsSL https://raw.githubusercontent.com/ronaldokanx-ship-it/atendai-agendai/main/deploy/scripts/vm-setup.sh | bash"
```

---

## Passo 5 — Configurar .env.prod

Copie o exemplo e preencha todos os campos:
```bash
cp .env.prod.example .env.prod
# Edite .env.prod com suas chaves
```

Copie para cada VM:
```bash
scp -i ~/.ssh/clinicai_oracle .env.prod ubuntu@<IP_VM1>:/opt/clinicai/.env.prod
scp -i ~/.ssh/clinicai_oracle .env.prod ubuntu@<IP_VM2>:/opt/clinicai/.env.prod
```

---

## Passo 6 — Migrar Banco de Dados para Neon

Na sua máquina local (com .env.prod preenchido):
```bash
# Aponta para o Neon e faz push do schema
DATABASE_URL="postgresql://...@neon.tech/clinic_sas?sslmode=require" \
    pnpm --filter @workspace/db run push
```

---

## Passo 7 — Deploy VM1 (Backend API)

```bash
ssh -i ~/.ssh/clinicai_oracle ubuntu@<IP_VM1>
cd /opt/clinicai

# 1. Emite certificado SSL (apenas na primeira vez)
bash deploy/scripts/deploy-vm1.sh --ssl

# 2. Faz build e inicia os serviços
bash deploy/scripts/deploy-vm1.sh --build
```

Verifique: `https://api.seudominio.com/api/health` deve retornar `{ "status": "ok" }`

---

## Passo 8 — Deploy VM2 (Evolution API / WhatsApp)

```bash
ssh -i ~/.ssh/clinicai_oracle ubuntu@<IP_VM2>
cd /opt/clinicai

bash deploy/scripts/deploy-vm2.sh --ssl
bash deploy/scripts/deploy-vm2.sh
```

Acesse `https://wa.seudominio.com` — deve aparecer a Evolution Manager UI.

---

## Passo 9 — Deploy Frontend no Vercel

1. Acesse https://vercel.com → **New Project** → Import from GitHub
2. Selecione o repo `atendai-agendai`
3. **Root Directory**: `artifacts/clinic-dashboard`
4. **Framework**: Vite
5. **Environment Variables**:
   ```
   VITE_API_URL = (deixe VAZIO — Vercel usa rewrites de vercel.json)
   ```
6. Após o primeiro deploy, copie a URL (ex: `https://atendai.vercel.app`)

**Atualizar vercel.json** com a URL da VM1:
```bash
# Edite artifacts/clinic-dashboard/vercel.json
# Substitua ORACLE_VM_IP_OR_DOMAIN por api.seudominio.com
```

Faça commit e push — Vercel redeploya automaticamente.

---

## Passo 10 — Configurar CORS e URLs

No `.env.prod` das VMs, certifique-se de ter:
```env
ALLOWED_ORIGINS=https://atendai.vercel.app,https://seudominio.com
EVOLUTION_WEBHOOK_URL=https://api.seudominio.com
EVOLUTION_API_URL=https://wa.seudominio.com
EVOLUTION_PUBLIC_URL=https://wa.seudominio.com
```

---

## Atualizações Futuras

Para atualizar o código em produção:
```bash
# Local: commite e faça push
git add . && git commit -m "fix: ..." && git push origin main

# Vercel: redeploya automaticamente via GitHub Integration

# VMs: execute o script de deploy em cada VM
ssh ubuntu@<IP_VM1> "cd /opt/clinicai && bash deploy/scripts/deploy-vm1.sh"
ssh ubuntu@<IP_VM2> "cd /opt/clinicai && bash deploy/scripts/deploy-vm2.sh"
```

---

## Troubleshooting

### API não responde
```bash
# VM1
docker compose -f docker-compose.vm1.yml logs api --tail=50
docker compose -f docker-compose.vm1.yml ps
```

### Evolution API não conecta ao WhatsApp
```bash
# VM2
docker compose -f docker-compose.vm2.yml logs evolution --tail=50
# Verifique se a porta 443 está liberada na Security List da VCN
```

### Banco de dados não conecta
```bash
# Verifique se a DATABASE_URL tem ?sslmode=require
# Neon exige SSL obrigatório
psql "$DATABASE_URL" -c "SELECT 1"
```

### Certificado SSL não emitido
- Certifique-se que o DNS propagou antes de rodar --ssl
- Verifique: `dig api.seudominio.com` deve retornar o IP da VM
- Porta 80 deve estar liberada na Security List da VCN Oracle
