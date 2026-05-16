# Scripts de Setup e Operações

Scripts Python/Shell utilizados durante o processo inicial de deploy e operações de manutenção nas instâncias de produção.

> **Atenção:** Estes arquivos contêm operações específicas de configuração. Muitos foram usados apenas uma vez durante o bootstrap da infraestrutura. Não executar sem revisar o conteúdo antes.

## Categorias

### Vercel
- `vercel_deps.py` — Lista deployments do projeto Vercel
- `vercel_redeploy.py` — Aciona novo deployment via API
- `vercel_wait.py` / `vercel_poll.py` / `vercel_poll2.py` — Monitora estado do build
- `vercel_logs.py` / `vercel_logs2.py` — Lê logs de build
- `vercel_fix_output.py` — Corrigiu outputDirectory (usado uma vez)

### Seed / Banco de Dados
- `seed_clinic.py` — Seed inicial da clínica demo
- `seed_complete.py` / `seed_prod.py` — Seeds completos de produção
- `cleanup_seed.py` — Limpou profissional órfão (usado uma vez)
- `verify_seed.py` — Verifica dados do seed

### Evolution API / WhatsApp
- `fix_evolution_name.py` — Corrigiu evolutionInstanceName (usado uma vez)
- `gen_qr_html.py` / `show_qr.py` — Exibe QR Code para conexão WhatsApp
- `check-wa-version.js` — Verifica versão Baileys

### CORS / Configurações
- `update_cors.py` / `update_cors2.py` — Atualizou ALLOWED_ORIGINS na VM1
- `fix_clinic_settings.py` — Corrigiu settings da clínica

### Oracle Cloud
- `create_instance.py` — Script de criação de instâncias Oracle
- `create-instance.json` / `create-instance2.json` — Payloads das instâncias

### Diagnóstico
- `check_api.py` — Testa endpoints da API
- `check_db.js` — Testa conexão com banco
- `test_availability.py` — Testa disponibilidade de horários
