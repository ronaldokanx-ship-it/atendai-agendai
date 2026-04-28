# Guia de Deploy — Oracle Cloud Free Tier (ARM Ampere A1)

> **Instância utilizada:** Always Free ARM Ampere A1 — **4 OCPUs + 24 GB RAM**  
> **SO:** Ubuntu 22.04 LTS (aarch64)  
> **Custo:** R$ 0,00 — permanentemente gratuito dentro dos limites Oracle Free Tier  

---

## Índice

1. [Criar conta Oracle Cloud](#1-criar-conta-oracle-cloud)
2. [Criar a instância ARM](#2-criar-a-instância-arm)
3. [Configurar regras de firewall (Security List)](#3-configurar-regras-de-firewall-security-list)
4. [Acessar a VM via SSH](#4-acessar-a-vm-via-ssh)
5. [Preparar o servidor](#5-preparar-o-servidor)
6. [Configurar DNS](#6-configurar-dns)
7. [Clonar o projeto](#7-clonar-o-projeto)
8. [Configurar variáveis de ambiente](#8-configurar-variáveis-de-ambiente)
9. [Obter certificado SSL](#9-obter-certificado-ssl)
10. [Primeiro deploy](#10-primeiro-deploy)
11. [Executar migrations do banco](#11-executar-migrations-do-banco)
12. [Criar o superadmin](#12-criar-o-superadmin)
13. [Conectar WhatsApp (Evolution)](#13-conectar-whatsapp-evolution)
14. [Configurar backups automáticos](#14-configurar-backups-automáticos)
15. [Manutenção e comandos úteis](#15-manutenção-e-comandos-úteis)

---

## 1. Criar conta Oracle Cloud

1. Acesse [cloud.oracle.com](https://cloud.oracle.com) e clique em **"Start for free"**
2. Preencha nome, e-mail e país
3. Escolha **região home** — recomendado: **Brazil East (São Paulo)** para menor latência
4. Insira dados do cartão de crédito (exigido para verificação, **não é cobrado** no Free Tier)
5. Confirme o e-mail e aguarde a ativação da conta (pode levar até 1h)

> ⚠️ **Dica:** Se "Brazil East" não tiver capacidade ARM disponível no momento da criação, tente **US East (Ashburn)** — tem mais capacidade ARM. Você pode mudar mais tarde criando uma nova instância.

---

## 2. Criar a instância ARM

### 2.1 — Acessar Compute

1. No menu principal (☰) → **Compute** → **Instances**
2. Clique em **"Create instance"**

### 2.2 — Configurar a instância

| Campo | Valor |
|---|---|
| **Name** | `clinicai-prod` |
| **Compartment** | `(root)` |
| **Placement** | Availability Domain padrão |

### 2.3 — Imagem e Shape (o passo mais importante)

1. Em **"Image and shape"**, clique em **"Change shape"**
2. Em **Instance type**: selecione **"Ampere"**
3. Em **Shape**: selecione **`VM.Standard.A1.Flex`**
4. Configure:
   - **OCPUs:** `4`
   - **Memory (GB):** `24`

> 🎯 **Esses são os limites do Free Tier:** 4 OCPUs e 24 GB de RAM compartilhados entre todas as instâncias A1. Use **tudo numa única VM** para maximizar a performance.

5. Em **"Image"**, clique em **"Change image"**:
   - Selecione **Ubuntu**
   - Versão: **22.04** (jammy)
   - Image build: escolha a mais recente

### 2.4 — Networking

1. Aceite a **VCN (Virtual Cloud Network)** criada automaticamente
2. Em **"Public IP address"**: marque **"Assign a public IPv4 address"**

### 2.5 — SSH Keys

1. Selecione **"Generate a key pair for me"**
2. Clique em **"Save private key"** — salve como `clinicai-oracle.key`
3. **Guarde este arquivo com segurança** — sem ele não há acesso à VM

### 2.6 — Boot Volume

1. Clique em **"Change boot volume"** (ou "Specify a custom boot volume size")
2. Altere para **`100 GB`** (máximo gratuito)
3. Mantenha o restante padrão

### 2.7 — Criar

1. Revise o resumo na lateral direita
2. Clique em **"Create"**
3. Aguarde o estado mudar de **"Provisioning"** para **"Running"** (2–5 minutos)
4. **Anote o IP público** exibido na página da instância

---

## 3. Configurar regras de firewall (Security List)

A Oracle bloqueia todas as portas por padrão. Precisamos abrir HTTP, HTTPS e o Manager do Evolution.

### 3.1 — Acessar Security List

1. No menu da instância → aba **"Subnet"** → clique no nome da subnet
2. Clique em **"Default Security List"** (ou o nome da sua security list)
3. Clique em **"Add Ingress Rules"**

### 3.2 — Regras a adicionar

Adicione cada linha como uma regra separada:

| Source CIDR | IP Protocol | Port Range | Descrição |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP (redirecionamento para HTTPS) |
| `0.0.0.0/0` | TCP | `443` | HTTPS |
| **Seu IP** | TCP | `22` | SSH — restrinja ao seu IP! |

> ⚠️ **Segurança:** Não exponha a porta 22 para `0.0.0.0/0`. Use seu IP residencial/corporativo.  
> Para descobrir seu IP: `curl -s ifconfig.me`

### 3.3 — Firewall do Ubuntu (iptables)

A Oracle também mantém `iptables` no próprio SO. Configure após o SSH:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## 4. Acessar a VM via SSH

```bash
# Linux/macOS — ajuste as permissões da chave
chmod 400 clinicai-oracle.key

# Conectar
ssh -i clinicai-oracle.key ubuntu@SEU_IP_PUBLICO
```

**No Windows (PowerShell):**
```powershell
# Ajustar permissões (PowerShell como administrador)
icacls "clinicai-oracle.key" /inheritance:r /grant:r "$($env:USERNAME):R"

# Conectar
ssh -i .\clinicai-oracle.key ubuntu@SEU_IP_PUBLICO
```

---

## 5. Preparar o servidor

Execute tudo como usuário `ubuntu` (use `sudo` onde necessário):

```bash
# Atualiza pacotes
sudo apt-get update && sudo apt-get upgrade -y

# Instala dependências
sudo apt-get install -y \
  git curl wget unzip \
  ca-certificates gnupg \
  netfilter-persistent iptables-persistent

# ── Instala Docker Engine ─────────────────────────────────────
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker   # aplica sem precisar fazer logout

# Verifica Docker
docker --version
docker compose version

# ── Configura swap (evita OOM em builds pesados) ──────────────
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# ── Configura firewall do SO ──────────────────────────────────
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# ── Cria diretório da aplicação ───────────────────────────────
sudo mkdir -p /opt/clinicai
sudo chown ubuntu:ubuntu /opt/clinicai
```

---

## 6. Configurar DNS

No painel do seu provedor de domínio (Cloudflare, Registro.br, GoDaddy etc.):

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `@` (raiz) | `SEU_IP_ORACLE` | 300 |
| `A` | `www` | `SEU_IP_ORACLE` | 300 |

> **Cloudflare recomendado** — oferece CDN, proteção DDoS e SSL automático gratuitos.  
> Se usar Cloudflare, **desative o proxy (nuvem laranja → cinza)** para o Let's Encrypt funcionar na primeira emissão. Reative após o certificado estar emitido.

Aguarde a propagação do DNS (5–30 minutos):
```bash
# Verifica se propagou
dig +short SEU_DOMINIO.COM
# Deve retornar o IP da Oracle
```

---

## 7. Clonar o projeto

```bash
cd /opt/clinicai

# Clona o repositório (substitua pela URL real)
git clone https://github.com/SEU_USUARIO/Sistema-Sas.git .

# Ou via SSH (recomendado para deploy com chave):
# git clone git@github.com:SEU_USUARIO/Sistema-Sas.git .
```

---

## 8. Configurar variáveis de ambiente

```bash
cd /opt/clinicai

# Copia o template
cp .env.prod.example .env.prod

# Edita com nano (ou vim)
nano .env.prod
```

Preencha **todos** os campos obrigatórios:

```bash
# Domínio
DOMAIN=seu-dominio.com
CERTBOT_EMAIL=seu@email.com

# PostgreSQL — gere uma senha forte
POSTGRES_USER=clinicai
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=clinic_sas
DATABASE_URL=postgresql://clinicai:SENHA_GERADA@postgres:5432/clinic_sas

# Redis — gere uma senha forte
REDIS_PASSWORD=$(openssl rand -hex 24)

# JWT — chave longa e aleatória
JWT_SECRET=$(openssl rand -hex 64)

# Admin bootstrap
ADMIN_BOOTSTRAP_SECRET=$(openssl rand -hex 32)

# Evolution API
EVOLUTION_API_KEY=$(openssl rand -hex 32)
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_WEBHOOK_URL=https://seu-dominio.com

# IAs (obtenha as chaves nos respectivos sites)
AI_INTEGRATIONS_OPENAI_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...
```

> 💡 **Gere todas as senhas de uma vez:**
> ```bash
> echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
> echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
> echo "JWT_SECRET=$(openssl rand -hex 64)"
> echo "ADMIN_BOOTSTRAP_SECRET=$(openssl rand -hex 32)"
> echo "EVOLUTION_API_KEY=$(openssl rand -hex 32)"
> ```

---

## 9. Obter certificado SSL

O Nginx precisa estar rodando em HTTP antes de emitir o certificado:

```bash
cd /opt/clinicai

# Sobe apenas o Nginx em modo HTTP (sem TLS ainda)
# Edite temporariamente o clinicai.conf para remover o bloco HTTPS
# ou use o modo de staging do Let's Encrypt:

chmod +x deploy/scripts/setup-ssl.sh
./deploy/scripts/setup-ssl.sh
```

**Ou manualmente:**
```bash
# 1. Sobe o Nginx com apenas o bloco HTTP
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d nginx

# 2. Emite o certificado
docker run --rm \
  -v clinicai_certbot_www:/var/www/certbot \
  -v clinicai_certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --email seu@email.com --agree-tos --no-eff-email \
    -d seu-dominio.com -d www.seu-dominio.com

# 3. Reinicia Nginx com TLS
docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
```

---

## 10. Primeiro deploy

```bash
cd /opt/clinicai

# Build e sobe todos os serviços
chmod +x deploy/scripts/deploy.sh
./deploy/scripts/deploy.sh --build

# Acompanha os logs em tempo real
docker compose -f docker-compose.prod.yml logs -f
```

Aguarde todos os containers ficarem **healthy**:
```bash
docker compose -f docker-compose.prod.yml ps
```

Saída esperada:
```
NAME                    STATUS
clinicai-postgres       healthy
clinicai-redis          healthy
clinicai-api            healthy
clinicai-dashboard      healthy
clinicai-evolution      healthy
clinicai-nginx          healthy
clinicai-certbot        running
```

---

## 11. Executar migrations do banco

```bash
cd /opt/clinicai

# Instala pnpm na VM (necessário apenas uma vez para migrations)
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# Instala Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instala dependências do monorepo
pnpm install --frozen-lockfile

# Executa migrations
chmod +x deploy/scripts/migrate.sh
./deploy/scripts/migrate.sh
```

---

## 12. Criar o superadmin

```bash
# Substitua pelos seus dados reais
curl -X POST https://seu-dominio.com/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: SEU_ADMIN_BOOTSTRAP_SECRET" \
  -d '{
    "email": "admin@seu-dominio.com",
    "password": "SenhaForteSuperAdmin123!",
    "name": "Administrador"
  }'
```

Resposta esperada:
```json
{"message": "Superadmin criado com sucesso", "userId": 1}
```

---

## 13. Conectar WhatsApp (Evolution)

### 13.1 — Acessar o Manager UI

Acesse: `https://seu-dominio.com/evolution/manager`  
Senha: o valor de `EVOLUTION_API_KEY` do seu `.env.prod`

### 13.2 — Criar instância para cada clínica

1. Clique em **"New Instance"**
2. Nome da instância: deve ser **idêntico** ao campo `evolutionInstanceName` no banco da clínica  
   - Clínica demo padrão: `clinica-1`
3. Clique em **"Create"**

### 13.3 — Escanear QR Code

1. Na instância criada, clique em **"Connect"** / **"QR Code"**
2. Abra o WhatsApp no celular → **Dispositivos Conectados** → **Conectar dispositivo**
3. Escaneie o QR Code
4. Aguarde o status mudar para **"Open"** / **"Connected"**

### 13.4 — Configurar webhook

O webhook já é configurado automaticamente via `ensureWebhookConfigured()` no primeiro contato.  
Para configurar manualmente via Manager:

- **URL:** `https://seu-dominio.com/api/whatsapp/evolution`
- **Eventos:** `MESSAGES_UPSERT`, `MESSAGES_UPDATE`

### 13.5 — Ativar no banco

No painel ClinicAI (`https://seu-dominio.com`):
1. Login como superadmin
2. Acesse a clínica → **Integrações** → **WhatsApp**
3. Preencha o nome da instância e a URL da Evolution

---

## 14. Configurar backups automáticos

```bash
# Torna o script executável
chmod +x /opt/clinicai/deploy/scripts/backup.sh

# Adiciona ao cron (roda às 02:00 todos os dias)
crontab -e
```

Adicione a linha:
```cron
0 2 * * * /opt/clinicai/deploy/scripts/backup.sh >> /opt/clinicai/backups/backup.log 2>&1
```

### (Opcional) Backup para Oracle Object Storage

```bash
# Instala rclone
curl https://rclone.org/install.sh | sudo bash

# Configura Oracle Object Storage
rclone config
# Escolha: Oracle Object Storage
# Siga as instruções com suas credenciais Oracle

# Adiciona ao backup.sh (descomente a linha rclone)
```

---

## 15. Manutenção e comandos úteis

### Ver status dos serviços
```bash
cd /opt/clinicai
docker compose -f docker-compose.prod.yml ps
```

### Ver logs em tempo real
```bash
# Todos os serviços
docker compose -f docker-compose.prod.yml logs -f

# Apenas a API
docker logs -f clinicai-api

# Apenas o Nginx
docker logs -f clinicai-nginx
```

### Atualizar o sistema
```bash
cd /opt/clinicai
git pull origin main
./deploy/scripts/deploy.sh --build
```

### Reiniciar um serviço específico
```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart evolution
```

### Acessar o banco de dados
```bash
docker exec -it clinicai-postgres psql -U clinicai -d clinic_sas
```

### Reiniciar conversa de um paciente (debug)
```bash
docker exec -it clinicai-postgres psql -U clinicai -d clinic_sas \
  -c "DELETE FROM ai_logs WHERE clinic_id=1 AND patient_phone='5511999999999';"
```

### Verificar uso de recursos
```bash
docker stats --no-stream
```

### Monitoramento rápido de saúde
```bash
# API health
curl -s https://seu-dominio.com/api/health | jq

# Evolution health
curl -s https://seu-dominio.com/evolution/ | head -5
```

---

## Arquitetura de Produção

```
Internet
    │
    ▼
[Oracle Cloud — ARM A1 — 4 OCPU / 24 GB RAM]
    │
    ▼
[Nginx :443 TLS] ──── certbot (renovação automática)
    │
    ├─► /api/*          → [Node.js API :3000]
    │                           │
    │                           ├── PostgreSQL :5432 (interno)
    │                           └── Redis :6379 (interno)
    │
    ├─► /evolution/*    → [Evolution API :8080]
    │                           │
    │                           ├── PostgreSQL :5432 (banco evolution_api)
    │                           └── Redis :6379 (sessões WA)
    │
    └─► /*              → [Dashboard Nginx :80]
                                (React SPA — estáticos)
```

---

## Limites do Free Tier Oracle (2026)

| Recurso | Limite |
|---|---|
| Instâncias ARM A1 | 4 OCPUs + 24 GB RAM total |
| Instâncias AMD (micro) | 2 × (1/8 OCPU + 1 GB RAM) |
| Boot Volume | 200 GB total |
| Object Storage | 20 GB |
| Load Balancer | 1 × 10 Mbps |
| Outbound transfer | 10 TB/mês |

> 📌 Os limites podem ser revisados pela Oracle. Consulte sempre a [página oficial de Free Tier](https://www.oracle.com/cloud/free/).
