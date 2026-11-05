import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sincroniza o Fácil 123 (API GraphQL) com o CRM: vendas + itens do pedido (estoque fica para o app de Produção).
//
// Fase 1 (paralelo com a planilha): grava em atacado_pedidos_api / atacado_pedido_itens.
// A tabela atacado_pedidos segue vindo do sync-atacado (planilha).
//
// Corpo (JSON, tudo opcional):
//   modo:    'incremental' (padrão: vendas com updated_at nas últimas `horas`, 24 por padrão) |
//            'backfill' (páginas pagina_ini..pagina_ini+paginas-1; com `desde`/`ate` filtra por updated_at)
//   horas:   janela do incremental (1..8760)
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
const HORAS_INCREMENTAL = 24
const MAX_PAGINAS_INCREMENTAL = 15
const EMPRESAS = ['LUMAR', 'CANTINA'] as const
type Empresa = typeof EMPRESAS[number]

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function gql(token: string, query: string, variables?: Record<string, unknown>, tentativas = 4): Promise<any> {
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(variables ? { query, variables } : { query }),
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

const CAMPOS_VENDA = `id sequential status total emitted_at updated_at created_at recipient_id
    recipient { name }
    invoicelane { name }
    operationkind { name }
    invoice_products_attributes { product_id quantity unit_price total product { name } }`

// Filtro do dialeto próprio do Fácil 123 (suporte, 05/11/2026): o campo vai em {attr:"invoice.<campo>"},
// o tempo em {as_time:[ISO com fuso]} e a variável filterfields (tipo JsonLogic) é uma STRING com o JSON.
function filtroAtualizacao(desdeIso: string, ateIso?: string) {
  const cond: unknown[] = [{ '>=': [{ attr: 'invoice.updated_at' }, { as_time: [desdeIso] }] }]
  if (ateIso) cond.push({ '<': [{ attr: 'invoice.updated_at' }, { as_time: [ateIso] }] })
  return JSON.stringify(cond.length === 1 ? cond[0] : { and: cond })
}

const pad = (n: number) => String(n).padStart(2, '0')
// ISO com fuso -03:00 (Brasília não tem horário de verão desde 2019)
function isoBrasilia(d: Date) {
  const b = new Date(d.getTime() - 3 * 3600_000)
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}T${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}:${pad(b.getUTCSeconds())}-03:00`
}

// Sem `filtro`: todas as vendas, da mais nova para a mais antiga (backfill por página).
function consultaVendas(pagina: number, filtro?: string) {
  if (!filtro) {
    return { query: `query comercialCrm_vendas { getInvoices(page: ${pagina}, limit: ${LIMIT}) { ${CAMPOS_VENDA} } }`, variables: undefined }
  }
  return {
    query: `query comercialCrm_vendas($f: JsonLogic) { getInvoices(filterfields: $f, page: ${pagina}, limit: ${LIMIT}) { ${CAMPOS_VENDA} } }`,
    variables: { f: filtro },
  }
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

  // Incremental: vendas atualizadas nas últimas `horas` (padrão 24), buscadas com filtro por updated_at e
  // paginadas até a página vir incompleta. Backfill: sem filtro, por página; se vier `desde` (ISO), filtra por
  // updated_at >= desde (e `ate`, opcional, < ate) para reconciliar um período.
  const horas = Math.min(24 * 365, Math.max(1, Number(body.horas) || HORAS_INCREMENTAL))
  let filtro: string | undefined
  if (modo === 'incremental') {
    filtro = filtroAtualizacao(isoBrasilia(new Date(Date.now() - horas * 3600_000)))
  } else if (body.desde) {
    const d = new Date(String(body.desde))
    if (isNaN(d.getTime())) return json({ ok: false, error: 'desde inválido' }, 400)
    const a = body.ate ? new Date(String(body.ate)) : null
    if (a && isNaN(a.getTime())) return json({ ok: false, error: 'ate inválido' }, 400)
    filtro = filtroAtualizacao(isoBrasilia(d), a ? isoBrasilia(a) : undefined)
  }

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
      const nPag = modo === 'backfill' ? Math.min(25, Math.max(1, Number(body.paginas) || 10)) : MAX_PAGINAS_INCREMENTAL
      const acum = { recebidos: 0, inseridos: 0, atualizados: 0, itens: 0 }
      let ultimaPagina = iniPag - 1
      let fim = false
      for (let p = iniPag; p < iniPag + nPag; p++) {
        const { query, variables } = consultaVendas(p, filtro)
        const d = await gql(token, query, variables)
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
      // Incremental que bateu no teto de páginas sem esgotar: avisa (a próxima execução continua do começo,
      // então o excedente só é recuperado se a janela cobrir; por isso o teto é folgado).
      if (modo === 'incremental' && !fim) erros.push(`${empresa}: janela de ${horas}h tem mais de ${MAX_PAGINAS_INCREMENTAL * LIMIT} vendas; aumente MAX_PAGINAS_INCREMENTAL`)
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
