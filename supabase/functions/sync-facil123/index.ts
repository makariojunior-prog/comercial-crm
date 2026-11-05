import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sincroniza o Fácil 123 (API GraphQL) com o CRM: vendas + itens do pedido (estoque fica para o app de Produção).
//
// Fase 1 (paralelo com a planilha): grava em atacado_pedidos_api / atacado_pedido_itens.
// A tabela atacado_pedidos segue vindo do sync-atacado (planilha).
//
// Corpo (JSON, tudo opcional):
//   modo:    'incremental' (padrão: as 3 páginas mais novas de cada empresa) |
//            'backfill' (páginas pagina_ini..pagina_ini+paginas-1)
//   empresa: 'LUMAR' | 'CANTINA' (padrão: as duas)
//
// Acesso (verify_jwt=false por causa do pg_cron): header x-cron-secret igual ao segredo do
// vault (crm_facil123_cron_secret) OU sessão de usuário ativo do Comercial.
// Tokens: secrets FACIL123_TOKEN_LUMAR e FACIL123_TOKEN_CANTINA (somente no servidor).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
const API = 'https://app.facil123.com.br/graphql'
const LIMIT = 100
const PAGINAS_INCREMENTAL = 3
const EMPRESAS = ['LUMAR', 'CANTINA'] as const
type Empresa = typeof EMPRESAS[number]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function gql(token: string, query: string, tentativas = 4): Promise<any> {
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query }),
    })
    if (res.status === 429) {
      const espera = Number(res.headers.get('retry-after')) || 5
      await sleep(Math.min(espera, 20) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`Fácil 123 HTTP ${res.status}`)
    const j = await res.json()
    if (j.errors?.length) {
      const e = j.errors[0]
      throw new Error(`Fácil 123: ${e.message}${e.extensions?.code ? ` (${e.extensions.code})` : ''}`)
    }
    return j.data
  }
  throw new Error('Fácil 123: limite de requisições (429) persistente')
}

const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

function queryVendas(pagina: number) {
  return `query comercialCrm_vendas { getInvoices(page: ${pagina}, limit: ${LIMIT}) {
    id sequential status total emitted_at updated_at created_at recipient_id
    recipient { name }
    invoicelane { name }
    operationkind { name }
    invoice_products_attributes { product_id quantity unit_price total product { name } }
  } }`
}

// deno-lint-ignore no-explicit-any
function mapVendas(lista: any[]) {
  const pedidos: Record<string, unknown>[] = []
  const itens: Record<string, unknown>[] = []
  for (const v of lista) {
    pedidos.push({
      id_venda: v.id,
      numero_pedido: v.sequential ?? null,
      cliente_id: v.recipient_id ?? null,
      cliente_nome: v.recipient?.name ?? null,
      valor: num(v.total) ?? 0,
      status_erp: v.status ?? null,
      etapa: v.invoicelane?.name ?? null,
      operacao: v.operationkind?.name ?? null,
      emitido_em: v.emitted_at ?? null,
      atualizacao: v.updated_at ?? null,
      criado_em: v.created_at ?? null,
    })
    // deno-lint-ignore no-explicit-any
    ;(v.invoice_products_attributes ?? []).forEach((p: any, i: number) => {
      itens.push({
        id_venda: v.id,
        linha: i + 1,
        product_id: p.product_id ?? null,
        produto_nome: p.product?.name ?? null,
        quantidade: num(p.quantity) ?? 0,
        preco_unit: num(p.unit_price),
        total: num(p.total),
      })
    })
  }
  return { pedidos, itens }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Acesso ──
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  let autorizado = false
  if (cronHeader) {
    const { data: segredo } = await supabase.rpc('crm_facil123_cron_secret')
    autorizado = typeof segredo === 'string' && segredo.length > 0 && segredo === cronHeader
  } else {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } }
    if (user) {
      const { data: membro } = await supabase.from('crm_users').select('id').eq('id', user.id).eq('ativo', true).maybeSingle()
      autorizado = !!membro
    }
  }
  if (!autorizado) return json({ ok: false, error: 'não autorizado' }, 403)

  // deno-lint-ignore no-explicit-any
  let body: any = {}
  try { body = await req.json() } catch { /* sem corpo */ }
  const modo: string = body.modo ?? 'incremental'
  const alvo: Empresa[] = body.empresa && EMPRESAS.includes(String(body.empresa).toUpperCase() as Empresa)
    ? [String(body.empresa).toUpperCase() as Empresa] : [...EMPRESAS]
  if (!['incremental', 'backfill'].includes(modo)) return json({ ok: false, error: 'modo inválido' }, 400)

  const tokens: Record<Empresa, string | undefined> = {
    LUMAR: Deno.env.get('FACIL123_TOKEN_LUMAR')?.trim(),
    CANTINA: Deno.env.get('FACIL123_TOKEN_CANTINA')?.trim(),
  }

  const resultado: Record<string, unknown> = {}
  const erros: string[] = []

  for (const empresa of alvo) {
    const token = tokens[empresa]
    if (!token) { erros.push(`${empresa}: secret FACIL123_TOKEN_${empresa} ausente`); continue }
    try {
      const iniPag = modo === 'backfill' ? Math.max(1, Number(body.pagina_ini) || 1) : 1
      const nPag = modo === 'backfill' ? Math.min(25, Math.max(1, Number(body.paginas) || 10)) : PAGINAS_INCREMENTAL
      const acum = { recebidos: 0, inseridos: 0, atualizados: 0, itens: 0 }
      let ultimaPagina = iniPag - 1
      let fim = false
      for (let p = iniPag; p < iniPag + nPag; p++) {
        const d = await gql(token, queryVendas(p))
        const lista = d.getInvoices ?? []
        ultimaPagina = p
        if (lista.length) {
          const { pedidos, itens } = mapVendas(lista)
          const { data, error } = await supabase.rpc('sync_atacado_api', { p_empresa: empresa, p_pedidos: pedidos, p_itens: itens })
          if (error) throw new Error(`sync_atacado_api: ${error.message}`)
          acum.recebidos += Number(data?.recebidos ?? 0)
          acum.inseridos += Number(data?.inseridos ?? 0)
          acum.atualizados += Number(data?.atualizados ?? 0)
          acum.itens += Number(data?.itens ?? 0)
        }
        if (lista.length < LIMIT) { fim = true; break }
        await sleep(300)
      }
      resultado[empresa] = { ...acum, ultima_pagina: ultimaPagina, fim_do_historico: fim }
    } catch (e) {
      erros.push(`${empresa}: ${(e as Error).message}`)
    }
  }

  // Com atacado_config.fonte_pedidos = 'api', leva ao atacado_pedidos o que mudou. O sync-atacado
  // recalcula as pendências no banco, então uma execução que falhou é recuperada na seguinte.
  let atacado: unknown = undefined
  if (modo === 'incremental') {
    const { data: fonte } = await supabase.from('atacado_config').select('value').eq('key', 'fonte_pedidos').maybeSingle()
    if (fonte?.value === 'api') {
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-atacado`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ type: 'pedidos' }),
        })
        const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
        atacado = { ok: j.ok, fonte: j.fonte, sem_pendencias: j.sem_pendencias, upserted: j.upserted, unmatched: j.unmatched }
        if (!j.ok) erros.push(`sync-atacado: ${j.error ?? 'falha'}`)
      } catch (e) {
        erros.push(`sync-atacado: ${(e as Error).message}`)
      }
    }
  }

  return json({ ok: erros.length === 0, modo, resultado, atacado, erros: erros.length ? erros : undefined })
})
