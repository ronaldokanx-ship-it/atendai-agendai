# AtendAI SaaS — Guia de Deploy em Produção (Infraestrutura Gratuita)

## Instâncias de Produção

| Instância | Plataforma | URL | Status |
|---|---|---|---|
| `clinic-dashboard` | Vercel | https://atendai-kanx.vercel.app | ✅ Online |
| `clinicai-api` (VM1) | Oracle Cloud x86 | https://api.kanxitsolutions.com.br | ✅ Online |
| `clinicai-evolution` (VM2) | Oracle Cloud x86 | https://wa.kanxitsolutions.com.br | ✅ Online |
| `neondb` | Neon PostgreSQL | `ep-nameless-bread-acjpjdap.sa-east-1.aws.neon.tech` | ✅ Online |

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
     │ atendai-kanx   │ │  clinicai-api    │ │  clinicai-   │
     │ .vercel.app    │ │  147.15.86.5     │ │  evolution   │
     │   GRATUITO ∞   │ │  GRATUITO ∞      │ │163.176.167.226│
     └────────────────┘ └────────┬─────────┘ └──────────────┘
                                 │
                         ┌───────▼────────┐
                         │  Neon Postgres │
                         │  sa-east-1     │
                         │  GRATUITO ∞    │
                         └────────────────┘
```

| Plataforma | Serviço | Limites Gratuitos |
|---|---|---|
| **Vercel** | Frontend React | 100 GB banda/mês |
| **Oracle Cloud** | VM1 `clinicai-api` | 1 OCPU, 1 GB RAM, 50 GB disco |
| **Oracle Cloud** | VM2 `clinicai-evolution` | 1 OCPU, 1 GB RAM, 50 GB disco |
| **Neon** | PostgreSQL 16 | 0.5 GB storage, 1 branch |

## Estrutura de Deploy

```
deploy/
├── vm1-clinicai-api/          # VM1 — Backend API (Oracle 147.15.86.5)
│   ├── README.md              # Documentação específica da VM1
│   ├── instance-info.txt      # OCID da instância Oracle
│   ├── nginx.conf             # Config Nginx desta VM
│   └── scripts/
│       ├── deploy.sh          # Atualiza código e reinicia container
│       ├── vm-setup.sh        # Setup inicial da VM
│       └── backup.sh          # Backup do banco
├── vm2-clinicai-evolution/    # VM2 — Evolution API (Oracle 163.176.167.226)
│   ├── README.md
│   ├── instance-info.txt
│   ├── nginx.conf
│   └── scripts/
│       ├── deploy.sh
│       └── vm-setup.sh
├── vercel-clinic-dashboard/   # Frontend — Vercel (atendai-kanx.vercel.app)
│   └── README.md
└── DEPLOY-GUIDE.md            # Este arquivo
```

---

## Pré-requisitos

- Conta Oracle Cloud Free Tier: https://cloud.oracle.com
- Conta Neon: https://neon.tech
- Conta Vercel: https://vercel.com
- Domínio próprio (Cloudflare recomendado — gratuito)
- Chave SSH em `~/.ssh/clinicai_oracle`

---

## Passo 1 — Configurar Neon (Banco de Dados)

1. Acesse https://neon.tech → **New Project**
2. Nome: `clinic-sas`, Region: `AWS São Paulo (sa-east-1)`
3. Em **Connection Details**, copie a connection string
4. Anote a connection string com `?sslmode=require`

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

Para cada VM, copie e execute o script de setup:

```powershell
# VM1 — clinicai-api
scp -i "$env:USERPROFILE\.ssh\clinicai_oracle" `
    deploy\vm1-clinicai-api\scripts\vm-setup.sh ubuntu@<IP_VM1>:/tmp/
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM1> "bash /tmp/vm-setup.sh"

# VM2 — clinicai-evolution
scp -i "$env:USERPROFILE\.ssh\clinicai_oracle" `
    deploy\vm2-clinicai-evolution\scripts\vm-setup.sh ubuntu@<IP_VM2>:/tmp/
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM2> "bash /tmp/vm-setup.sh"
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

## Passo 7 — Deploy VM1 (Backend API `clinicai-api`)

```powershell
# Emitir certificado SSL (primeira vez)
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM1> "
  sudo docker run --rm -p 80:80 -v certbot_certs:/etc/letsencrypt certbot/certbot \
    certonly --standalone -d api.seudominio.com \
    --email seu@email.com --agree-tos --non-interactive
"

# Build e subir serviços
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM1> "
  cd /opt/clinicai && sudo docker compose -f docker-compose.vm1.yml up -d --build
"
```

Verifique: `https://api.seudominio.com/api/healthz` deve retornar `{"status":"ok"}`

---

## Passo 8 — Deploy VM2 (Evolution API `clinicai-evolution`)

```powershell
# Emitir certificado SSL (primeira vez)
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM2> "
  sudo docker run --rm -p 80:80 -v certbot_certs:/etc/letsencrypt certbot/certbot \
    certonly --standalone -d wa.seudominio.com \
    --email seu@email.com --agree-tos --non-interactive
"

# Subir serviços
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@<IP_VM2> "
  cd /opt/clinicai && sudo docker compose -f docker-compose.vm2.yml up -d
"
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
6. Após o primeiro deploy, copie a URL (ex: `https://atendai-kanx.vercel.app`)

> **Importante:** O Vercel monitora o repo `atendai_agendai` (underscore). Faça push para os dois remotes:
> ```powershell
> git push origin main ; git push vercel-origin main
> ```

---

## Passo 10 — Configurar CORS e URLs

No `.env.prod` das VMs, certifique-se de ter:
```env
ALLOWED_ORIGINS=https://atendai-kanx.vercel.app,https://seudominio.com
EVOLUTION_WEBHOOK_URL=https://api.seudominio.com
EVOLUTION_API_URL=https://wa.seudominio.com
EVOLUTION_PUBLIC_URL=https://wa.seudominio.com
```

---

## Atualizações Futuras

```powershell
# 1. Commit e push (ambos os repos para acionar Vercel)
git add . && git commit -m "fix: ..."
git push origin main ; git push vercel-origin main

# 2. Atualizar VM1 (clinicai-api)
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@147.15.86.5 "
  cd /opt/clinicai && sudo git pull origin main
  sudo docker compose -f docker-compose.vm1.yml up -d --build api
"

# 3. Atualizar VM2 (clinicai-evolution) — apenas se docker-compose.vm2.yml mudou
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@163.176.167.226 "
  cd /opt/clinicai && sudo git pull origin main
  sudo docker compose -f docker-compose.vm2.yml up -d
"
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
