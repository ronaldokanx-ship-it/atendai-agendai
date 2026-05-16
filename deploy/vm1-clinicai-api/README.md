# VM1 — clinicai-api (Backend)

> **Oracle Cloud VM.Standard.E2.1.Micro** · IP: `147.15.86.5`  
> **Domínio:** `api.kanxitsolutions.com.br`  
> **Container Docker:** `clinicai-api`

## Conteúdo desta pasta

```
vm1-clinicai-api/
├── instance-info.txt   # OCID e detalhes da instância Oracle
├── nginx.conf          # Configuração Nginx (proxy HTTPS → API porta 3000)
└── scripts/
    ├── deploy.sh       # Atualiza código e reinicia container
    ├── vm-setup.sh     # Setup inicial da VM (Docker, dirs, swap)
    └── backup.sh       # Backup do banco de dados
```

## Deploy / Atualização

```powershell
# A partir da máquina local
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@147.15.86.5 "
  cd /opt/clinicai
  sudo git pull origin main
  sudo docker compose -f docker-compose.vm1.yml up -d --build api
"
```

## Verificar Saúde

```powershell
# Health check público
Invoke-RestMethod https://api.kanxitsolutions.com.br/api/healthz

# Logs ao vivo
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@147.15.86.5 "sudo docker logs clinicai-api -f --tail=50"
```

## Variáveis de Ambiente (`.env.prod` na VM)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL com `?sslmode=require` |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Chave OpenRouter |
| `GROQ_API_KEY` | Chave Groq (fallback IA) |
| `EVOLUTION_API_URL` | `https://wa.kanxitsolutions.com.br` |
| `EVOLUTION_WEBHOOK_URL` | `https://api.kanxitsolutions.com.br` |
| `ALLOWED_ORIGINS` | `https://atendai-kanx.vercel.app,https://kanxitsolutions.com.br` |
| `JWT_SECRET` | Segredo JWT (mínimo 64 chars) |
| `ADMIN_BOOTSTRAP_SECRET` | Segredo para criar primeiro superadmin |
