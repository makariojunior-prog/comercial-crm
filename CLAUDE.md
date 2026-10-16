# CLAUDE.md

CRM comercial (atacado/varejo/revenda/comodato/logística) da **Cantina em Casa / Lumar Alimentos**.
O app mais maduro da família (`rh-app`, `cantina-compras`, `cantina-portal` seguem o mesmo padrão).
Interface em português (BR).

## Stack e comandos

Vite + React 18 + TypeScript + Tailwind + Supabase. `HashRouter`; `ThemeProvider` →
`AuthProvider` → `PreferencesProvider`; `PrivateRoute` + `Layout` (sidebar); páginas lazy em
`src/pages`, componentes em `src/components`, estado compartilhado em `src/contexts`.

- `npm run dev` · `npm run build` (`tsc -b && vite build`). Não há script de lint nem testes.
- Rotas: todas declaradas em `src/App.tsx` (dashboard, negocios, visitas, tarefas, clientes, rotas,
  notas, promotoria, tabelas, usuarios, comite, configuracoes, logistica, varejo, conversas, social,
  atacado, clientes-varejo, cobranca, comissao, revenda, agenda, comodato, loja).
- Deploy: Vercel (`base: '/'`) ou GitHub Pages (`base: '/comercial-crm/'`, `npm run deploy`);
  ver `vite.config.ts`. `vercel.json` define cabeçalhos de segurança (sem iframe) e cache immutable
  em `/assets`.
- Bibliotecas pesadas (`xlsx`, `browser-image-compression`) entram por `await import()` só na hora
  do uso; não volte a importá-las no topo do arquivo.
- Configs oficiais: `vite.config.ts` e `tailwind.config.js` (este tem `darkMode: 'class'`, exigido pelo
  tema escuro; Tailwind 3 lê `.js` primeiro). Não recrie versões duplicadas.

## Supabase compartilhado

Projeto `taicaxtjtikdajmhtsxc`, o mesmo do RH (`rh-app`), do Compras (`compras_*`) e do Portal
(schema `portal`). Tabelas deste app: `crm_*`, `varejo_*`, `atacado_*`, `deals`, `visits`,
`lojas_delivery_status`… **Não altere tabelas/políticas do RH, do Compras nem do Portal.**

- Migrations em `supabase/migrations/` (~38), nome `AAAAMMDDHHMMSS_assunto.sql`; mantenha-as
  idempotentes. Com o MCP do Supabase na sessão, aplique direto e deixe o arquivo no repo.
- **Segurança:** a chave anon é pública (vai no bundle; repo público). Ela não tem nenhum acesso às
  tabelas do app (grants revogados em `20261016120000_auditoria_fecha_acesso_anonimo.sql`); a TV
  (`dashboard-tv`) só chama `tv_verify_pin` e `tv_dashboard_snapshot` (SECURITY DEFINER). Políticas
  usam `(select crm_is_member())`. Nunca crie política para `anon`/`public` nem escreva em RLS
  "service_role" no papel `public` (a service role já ignora RLS).
- Edge Functions em `supabase/functions/`: webhooks `ifood-webhook` (assinatura), `food99-webhook`,
  `varejo-webhook`, `instagram-webhook` (segredo), `digisac-webhook`; `sync-atacado`,
  `sync-ifood-status`, `sync-99food-status`, `ifood-merchant`, `automacao-lumar` (WhatsApp da Lumar:
  exige usuário do Comercial, exceto `executar` do cron 05h–07h59), `geocode`, `velotrack-positions`,
  `generate-recurring-costs`, `auto-process-pending`, `process-conversations`,
  `reprocess-conversations`; `test-get-logs` é stub desativado. Função com `verify_jwt=false` tem
  de checar segredo ou sessão no próprio código. No ar mas fora do repo: `crm-create-user`,
  `generate-briefing`, `diag-conversations`, `debug-ia`, `webhook-erp-atacado`, `vt-positions`.
- Monitoramento de conversas por IA está **desligado** desde 22/09/2026 (`digisac-webhook` e
  `reprocess-conversations` retornam cedo). Chaves em secrets do Supabase, nunca no código.
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

## Manutenção deste arquivo (lembrete ao usuário)

Se este arquivo passar de ~80 linhas, ou se a lista de rotas/edge functions aqui divergir de
`src/App.tsx` e `supabase/functions/`, **avise o usuário ao fim da tarefa** e ofereça atualizar.
Planos de implementação já executados vão para `docs/archive/`, não ficam em `docs/superpowers/plans/`.
