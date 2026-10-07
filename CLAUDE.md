# CLAUDE.md

CRM comercial (atacado/varejo/revenda/comodato/logística) da **Cantina em Casa / Lumar Alimentos**.
O app mais maduro da família (`rh-app`, `cantina-compras`, `cantina-portal` seguem o mesmo padrão).
Interface em português (BR).

## Stack e comandos

Vite + React 18 + TypeScript + Tailwind + Supabase. `HashRouter`; `ThemeProvider` →
`AuthProvider` → `PreferencesProvider`; `PrivateRoute` + `Layout` (sidebar); páginas lazy em
`src/pages`, componentes em `src/components`, estado compartilhado em `src/contexts`.

- `npm run dev` · `npm run build` (`tsc -b && vite build`). Não há script de lint nem testes.
- Rotas: todas declaradas em `src/App.tsx` (dashboard, negocios, visitas, clientes, rotas, agenda,
  logistica, varejo, atacado, revenda, comodato, cobranca, comissao, conversas, loja, …).
- Deploy: Vercel (`base: '/'`) ou GitHub Pages (`base: '/comercial-crm/'`, `npm run deploy`);
  ver `vite.config.ts`.
- Há `vite.config.js`/`.ts` e `tailwind.config.js`/`.ts` com conteúdos **diferentes**; confira qual
  o build usa antes de editar um deles.

## Supabase compartilhado

Projeto `taicaxtjtikdajmhtsxc`, o mesmo do RH (`rh-app`), do Compras (`compras_*`) e do Portal
(schema `portal`). Tabelas deste app: `crm_*`, `varejo_*`, `atacado_*`, `deals`, `visits`,
`lojas_delivery_status`… **Não altere tabelas/políticas do RH, do Compras nem do Portal.**

- Migrations em `supabase/migrations/` (~33), nome `AAAAMMDDHHMMSS_assunto.sql`; mantenha-as
  idempotentes. Com o MCP do Supabase na sessão, aplique direto e deixe o arquivo no repo.
- Edge Functions em `supabase/functions/` (webhooks iFood/99Food/Digisac/Instagram/varejo,
  `sync-*`, `process-conversations`, `geocode`, `velotrack-positions`…). A análise de conversas
  usa a API da Anthropic (chave em secret do Supabase, nunca no código).
- Delivery: o app só **monitora** o status das lojas (aberto/fechado/pausado); os pedidos entram
  pelo Cardápio Web — ver `docs/DELIVERY_MONITORING.md`.

## Onde está o resto

- `docs/superpowers/specs/` — desenho dos módulos recentes (agenda, negócios, logística, comitê…).
- `docs/MODULO_COMODATO.md`, `docs/BENCHMARK_COMODATO.md`, `docs/REVENDA_VINCULO_ERP.md`,
  `docs/FLUXO_POSITIVACOES_RH.md`, `docs/ifood-homologacao-roteiro.md`.
- `docs/archive/` — planos já executados e instruções da migração Gemini→Claude (históricos; não
  leia, a menos que o assunto seja exatamente esse).
- `scripts/avulsos/` — scripts pontuais de importação e testes manuais com navegador.
- `backup/` — rotina de backup do Supabase (Docker + scheduler).
