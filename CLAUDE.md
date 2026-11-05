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
  notas, promotoria, tabelas, usuarios, comite, ia, configuracoes, logistica, varejo, conversas, social,
  atacado, clientes-varejo, cobranca, comissao, revenda, agenda, comodato, loja). `/negocios` e
  `/visitas` abrem a mesma tela (`NegociosVisitas`). `comite` e `ia` só admin.
- Deploy: Vercel (`base: '/'`) ou GitHub Pages (`base: '/comercial-crm/'`, `npm run deploy`); ver
  `vite.config.ts`. `vercel.json` define cabeçalhos de segurança (sem iframe) e cache immutable em `/assets`.
- Bibliotecas pesadas (`xlsx`, `browser-image-compression`) entram por `await import()` só na hora do uso;
  não volte a importá-las no topo do arquivo.
- Configs oficiais: `vite.config.ts` e `tailwind.config.js` (este tem `darkMode: 'class'`, exigido pelo tema
  escuro; Tailwind 3 lê `.js` primeiro). Não recrie versões duplicadas.

## Supabase compartilhado

Projeto `taicaxtjtikdajmhtsxc`, o mesmo do RH (`rh-app`), do Compras (`compras_*`) e do Portal (schema
`portal`). Tabelas deste app: `crm_*`, `varejo_*`, `atacado_*`, `deals`, `visits`, `lojas_delivery_status`…
**Não altere tabelas/políticas do RH, do Compras nem do Portal.** Chaves em secrets, nunca no código.

- Migrations em `supabase/migrations/`, nome `AAAAMMDDHHMMSS_assunto.sql`, idempotentes. Com o MCP do
  Supabase na sessão, aplique direto e deixe o arquivo no repo.
- **Segurança:** a chave anon é pública (repo público) e não tem acesso às tabelas do app. Políticas usam
  `(select crm_is_member())`. Nunca crie política para `anon`/`public` nem escreva em RLS "service_role" no
  papel `public` (a service role já ignora RLS).
- **GRANT explícito (desde 30/10/2026):** o Supabase não concede mais acesso à API a tabelas novas. Toda
  migration que cria tabela/view em `public` traz os GRANTs: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO
  authenticated, service_role`; só backend: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ALL ... TO
  service_role`. Nada para `anon`. Funções: `REVOKE ALL ... FROM PUBLIC` e `GRANT EXECUTE` só a quem precisa.
- **Edge Functions** (`supabase/functions/`): lista e detalhes em `docs/SUPABASE_E_FUNCOES.md`. Função com
  `verify_jwt=false` tem de checar segredo ou sessão no próprio código.
- **Fácil 123:** a API (`sync-facil123` → `sync-atacado`) alimenta `atacado_pedidos` (chave
  `atacado_config.fonte_pedidos = 'api'`; para voltar à planilha, `'planilha'`) e os itens em
  `atacado_pedido_itens`. Venda cancelada entra como `tipo='CANCELADO'` (registro, fora do faturamento);
  orçamentos contam como pedido. Estoque não vem de lá: será do futuro app de Produção.
- **Comitê:** só admin (UI, RPCs e RLS de `crm_comite_*`).
- **Custos de veículo:** após `fin_frota_config.corte` (19/10/2026) o gasto vem do Financeiro via
  `crm_frota_gastos`; não crie escrita nova em `frota_custos` para datas pós-corte.
- Monitoramento de conversas por IA está **desligado** desde 22/09/2026.
- Delivery: o app só **monitora** o status das lojas; os pedidos entram pelo Cardápio Web.

## Onde está o resto

- `docs/SUPABASE_E_FUNCOES.md` — Edge Functions, Fácil 123, Notícias e IA, Comitê, custos de veículo, GRANT.
- `docs/superpowers/specs/` — desenho dos módulos recentes (agenda, negócios, logística, comitê…).
- `docs/MODULO_COMODATO.md`, `docs/BENCHMARK_COMODATO.md`, `docs/REVENDA_VINCULO_ERP.md`,
  `docs/FLUXO_POSITIVACOES_RH.md`, `docs/DELIVERY_MONITORING.md`, `docs/ifood-homologacao-roteiro.md`.
- `docs/archive/` — planos já executados e instruções da migração Gemini→Claude (históricos; não leia, a
  menos que o assunto seja exatamente esse).
- `scripts/avulsos/` — scripts pontuais de importação e testes manuais com navegador.
- `backup/` — rotina de backup do Supabase (Docker + scheduler).

## Manutenção deste arquivo (lembrete ao usuário)

Se este arquivo passar de ~80 linhas, ou se a lista de rotas aqui ou de edge functions em
`docs/SUPABASE_E_FUNCOES.md` divergir de `src/App.tsx` e `supabase/functions/`, **avise o usuário ao fim da
tarefa** e ofereça atualizar. Planos de implementação já executados vão para `docs/archive/`, não ficam em
`docs/superpowers/plans/`.
