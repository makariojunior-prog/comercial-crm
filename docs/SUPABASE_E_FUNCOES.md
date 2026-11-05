# Supabase, Edge Functions e integrações do comercial-crm

Detalhes que saíram do `CLAUDE.md` para ele ficar enxuto. As regras que valem sempre (RLS, GRANT,
`verify_jwt`, `fonte_pedidos`, frota) continuam resumidas lá.

Projeto Supabase `taicaxtjtikdajmhtsxc`, compartilhado com RH, Compras e Portal. Chaves ficam em
secrets do Supabase, nunca no código.

## Edge Functions (`supabase/functions/`)

- Webhooks: `ifood-webhook` (assinatura), `food99-webhook`, `varejo-webhook`, `instagram-webhook`
  (segredo), `digisac-webhook`.
- Sincronizações: `sync-atacado`, `sync-facil123`, `sync-ifood-status`, `sync-99food-status`,
  `ifood-merchant`.
- `automacao-lumar` (WhatsApp da Lumar): exige usuário do Comercial, exceto `executar` do cron
  05h–07h59.
- Outras: `geocode`, `velotrack-positions`, `generate-recurring-costs`, `auto-process-pending`,
  `process-conversations`, `reprocess-conversations`, `gerar-noticias-comercial`.
- Stubs desativados: `test-get-logs`, `diag-facil123` (podem ser apagados no painel).
- **Função com `verify_jwt=false` tem de checar segredo ou sessão no próprio código.**
- No ar mas fora do repo: `crm-create-user`, `generate-briefing`, `diag-conversations`, `debug-ia`,
  `webhook-erp-atacado`, `vt-positions`.

## Fácil 123 (API GraphQL) alimenta `atacado_pedidos`

Substituiu a planilha do webhook como fonte dos pedidos do atacado (05/11/2026).

- `sync-facil123` (pg_cron `facil123-sync-vendas`, a cada 5 min; `x-cron-secret` do vault
  `facil123_cron_secret`). Tokens nos secrets `FACIL123_TOKEN_LUMAR` e `FACIL123_TOKEN_CANTINA`: um por
  licenciado (Lumar 2702, Cantina 2704), pensados para reuso em Compras e Financeiro.
- Grava as vendas em `atacado_pedidos_api` (staging) e os produtos de cada venda em
  `atacado_pedido_itens` (chave `id_venda` + `linha`; `product_id` é o id do produto no Fácil 123).
- Com `atacado_config.fonte_pedidos = 'api'` chama o `sync-atacado`, que leva ao `atacado_pedidos` só o que
  difere (`atacado_api_pendentes()`, comparado no banco: se uma execução falhar, a seguinte recupera).
  Rollback: gravar `'planilha'` nessa chave. A REG-LUMAR (data de entrega, turno, entregador) segue manual.
- `id_venda` = `Invoice.id`; `numero_pedido` = `Invoice.sequential` (15xxx = Lumar, 30xxx = Cantina).
  `data_emissao` já gravada é preservada; venda nova usa o `created_at` do Fácil 123.
- **Venda cancelada** entra com `tipo='CANCELADO'`: fica registrada, mas fora do faturamento (Revenda,
  Dashboard, Romaneio, Resumo, Comitê, positivação e TV já excluem esse tipo).
- **Orçamentos** (raia "Orçamento" no Fácil 123) continuam contando como pedido (decisão de 05/11/2026).
- A API limita a página a 100 itens (para mais, incrementar `page` até vir vazia) e ignora `start_date` sem
  `end_date`. Introspecção em `ajuda.facil123.com.br` (api-introspeccao).
- **Filtro por data (confirmado pelo suporte do Fácil 123, 05/11/2026):** `filterfields` usa dialeto próprio,
  não o JsonLogic padrão. O campo vai em `{"attr":"invoice.updated_at"}`, o tempo em `{"as_time":["2026-11-01T00:00:00-03:00"]}`
  (sempre com fuso) e a variável GraphQL (`$f: JsonLogic`) é uma **string** com o JSON já serializado; intervalo = `{"and":[{">=":…},{"<":…}]}`.
  O `incremental` do `sync-facil123` usa isso: busca as vendas com `updated_at` nas últimas `horas` (padrão 24)
  e pagina até vir página incompleta (teto de 15 páginas por empresa, com aviso em `erros`). O `backfill` aceita
  `desde`/`ate` para reconciliar um período.
- Estoque NÃO vem do Fácil 123 (separado por licenciado, e a câmara fria é única): será do futuro app de
  Produção, que também será o catálogo de produtos de referência.
- Conferência: `atacado_conferencia_api()` compara a planilha antiga com a API pelo `id_venda`.

## Notícias e IA

`gerar-noticias-comercial` (Gemini, secret `COMERCIAL_GEMINI_API_KEY`; modelo em `COMERCIAL_GEMINI_MODEL`)
roda no pg_cron 8h/13h BRT, `verify_jwt=false` + header `x-cron-secret` (vault `noticias_cron_secret`).
Grava `crm_noticias` (publica só `relevancia >= limiar` de `crm_noticias_config`); curadoria e
`crm_ia_aprendizados` em `/ia`. A barra (`NoticiasTicker`) lê `crm_noticias_feed`; o Financeiro, Compras e RH
usam a mesma RPC e a TV `tv_noticias` (só títulos).

## Comitê

Só admin (UI, RPCs e RLS de `crm_comite_*`). `crm_comite_retrato` alimenta a síntese da ata e o snapshot de
`crm_comite_fechar_semana`.

## Monitoramento de conversas por IA

**Desligado** desde 22/09/2026 (`digisac-webhook` e `reprocess-conversations` retornam cedo).

## Custos de veículo (Logística › Custos)

A partir da data de corte (`fin_frota_config.corte`, 19/10/2026) o gasto de veículo é lançado só no app
Financeiro (categoria de veículo + veículo) e `CustosTab` apenas lê. Até o corte segue lendo `frota_custos`
(histórico, editável); do corte em diante usa a RPC `crm_frota_gastos(de, ate)` (SECURITY DEFINER, lê
`fin_lancamentos`/`fin_lancamento_itens`/`fin_caixa_movimentos` com `vehicle_id`) e `crm_frota_corte()`.
Linhas do Financeiro vêm com a etiqueta "Financeiro", sem editar/excluir; o botão de lançamento some e
"Registrar como feita" só atualiza a manutenção programada. As recorrências de `frota_custos` além do corte
ficam ocultas (o gasto real vem do banco, via Financeiro). **Não crie escrita nova em `frota_custos` para datas
pós-corte.** Detalhes e regras no `CLAUDE.md` do `cantina-financeiro`.

## Delivery

O app só **monitora** o status das lojas (aberto/fechado/pausado); os pedidos entram pelo Cardápio Web —
ver `DELIVERY_MONITORING.md`.

## Segurança do banco (detalhe)

A chave anon é pública (vai no bundle; repo público). Ela não tem acesso às tabelas do app (grants revogados em
`20261016120000_auditoria_fecha_acesso_anonimo.sql`); a TV (`dashboard-tv`) só chama `tv_verify_pin`,
`tv_dashboard_snapshot` e `tv_noticias` (SECURITY DEFINER).

## GRANT explícito em tabelas novas (desde 30/10/2026)

O Supabase deixou de conceder acesso à API de Dados (supabase-js, PostgREST, GraphQL) automaticamente a tabelas
novas em `public`; sem GRANT a API devolve "permission denied". Tabelas anteriores a essa data não mudam. Vale
também para migrations que recriam o schema (projeto novo, branch de preview, `supabase db reset`).

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minha_tabela TO authenticated, service_role;
-- view: GRANT SELECT ON public.minha_view TO authenticated, service_role;
-- só backend: REVOKE ALL ON public.minha_tabela FROM PUBLIC, anon, authenticated;
--             GRANT ALL ON public.minha_tabela TO service_role;
```

- Não conceder nada a `anon`, a menos que a leitura pública seja intencional (a RLS continua sendo a proteção
  de linha).
- Funções: `REVOKE ALL ... FROM PUBLIC` e `GRANT EXECUTE` só a quem precisa.
- Se uma migration antiga foi escrita sem GRANT e o schema for recriado, rode um GRANT em lote nas tabelas
  existentes.
