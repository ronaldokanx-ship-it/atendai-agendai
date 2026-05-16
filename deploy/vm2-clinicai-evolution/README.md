# VM2 — clinicai-evolution (Evolution API / WhatsApp)

> **Oracle Cloud VM.Standard.E2.1.Micro** · IP: `163.176.167.226`  
> **Domínio:** `wa.kanxitsolutions.com.br`  
> **Container Docker:** `clinicai-evolution`

## Conteúdo desta pasta

```
vm2-clinicai-evolution/
├── instance-info.txt   # OCID e detalhes da instância Oracle
├── nginx.conf          # Configuração Nginx (proxy HTTPS → Evolution porta 8080)
└── scripts/
    ├── deploy.sh       # Atualiza e reinicia containers Evolution + Redis
    └── vm-setup.sh     # Setup inicial da VM
```

## Instância WhatsApp Configurada

| Campo | Valor |
|---|---|
| Nome da instância | `clinica-1` |
| Clínica | ID=1 — ClinicAI Demo |
| Estado | `open` (conectado) |
| Webhook | `https://api.kanxitsolutions.com.br/api/whatsapp/evolution` |
| Baileys version | `2.3000.1035194821` |

## Deploy / Atualização

```powershell
# A partir da máquina local
ssh -i "$env:USERPROFILE\.ssh\clinicai_oracle" ubuntu@163.176.167.226 "
  cd /opt/clinicai
  sudo git pull origin main
  sudo docker compose -f docker-compose.vm2.yml up -d
"
```

## Verificar Estado WhatsApp

```powershell
# Verificar conexão da instância
Invoke-RestMethod https://wa.kanxitsolutions.com.br/instance/connectionState/clinica-1 `
  -Headers @{apikey = "<EVOLUTION_API_KEY>"}
```

## Reconectar WhatsApp (se desconectado)

```powershell
# Gerar novo QR Code
Invoke-RestMethod "https://wa.kanxitsolutions.com.br/instance/connect/clinica-1" `
  -Headers @{apikey = "<EVOLUTION_API_KEY>"}
# Abrir qr-connect.html no browser para escanear
```
