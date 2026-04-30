# Vercel — clinic-dashboard (Frontend)

> **Plataforma:** Vercel (Hobby Plan — gratuito)  
> **URL de produção:** https://atendai-kanx.vercel.app  
> **Projeto Vercel:** `atendai_agendai` (team: `kanxs-projects`)

## Configuração do Projeto Vercel

| Campo | Valor |
|---|---|
| **Root Directory** | `artifacts/clinic-dashboard` |
| **Framework** | Vite |
| **Build Command** | `cd ../.. && pnpm --filter @workspace/clinic-dashboard run build` |
| **Output Directory** | `dist/public` |
| **Install Command** | `pnpm install --frozen-lockfile` |
| **Node Version** | 24.x |

## Repositório GitHub

O Vercel monitora o repositório `atendai_agendai` (com underscore):
- `https://github.com/ronaldokanx-ship-it/atendai_agendai`

> **Atenção:** O código está em dois repos:
> - `origin` → `atendai-agendai` (hyphen) — repo principal de desenvolvimento
> - `vercel-origin` → `atendai_agendai` (underscore) — repo que o Vercel monitora
>
> **Sempre faça push para ambos:**
> ```powershell
> git push origin main ; git push vercel-origin main
> ```

## Deploy Manual (sem push)

```powershell
# Via Vercel CLI
vercel --token <TOKEN> --scope kanxs-projects --prod
```

## Variáveis de Ambiente no Vercel

Nenhuma variável de ambiente necessária — o `vercel.json` redireciona `/api/*` para a API via rewrite.

## Aliases de Produção

- `atendai-kanx.vercel.app` (principal)
- `atendaiagendai.vercel.app`
- `atendaiagendai-kanxs-projects.vercel.app`
- `atendaiagendai-git-main-kanxs-projects.vercel.app`
