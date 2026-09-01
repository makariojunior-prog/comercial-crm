import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RECEPTION_SHEET_ID   = '1Z4vrdU_1zSzs9Bl6SrPVOiCnlWFdK5b0oP7aYnuMRNY'
const RECEPTION_GID        = Deno.env.get('RECEPTION_GID') ?? '0'
const REG_LUMAR_SHEET_ID   = '15ygrVoRh7cd8iVWn0eBXpEz-jBVsOa4jxemmmva2rnA'
const REG_LUMAR_SHEET_NAME = Deno.env.get('REG_LUMAR_SHEET_NAME') ?? 'REG-LUMAR'

function sheetCsvByGid(id: string, gid = '0') {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
}
function sheetCsvByName(id: string, sheetName: string) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
}

function nk(s: string) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let cur = '', inQ = false
  let row: string[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += c
    } else {
      if (c === '"') { inQ = true }
      else if (c === ',') { row.push(cur); cur = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(cur); cur = ''
        rows.push(row); row = []
      } else cur += c
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  if (rows.length < 2) return []
  const headers = rows[0].map(nk)
  return rows.slice(1)
    .filter(r => r.some(c => c.trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]?.trim() ?? ''])))
}

function parseValor(v: string): number {
  if (!v) return 0
  const stripped = v.replace(/[^\d,.]/g, '')
  if (!stripped) return 0
  // BR format "1.410,50": dot=thousands separator, comma=decimal separator
  if (stripped.includes(',') && stripped.includes('.')) {
    return parseFloat(stripped.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Only comma "267,50": comma is decimal
  if (stripped.includes(',')) return parseFloat(stripped.replace(',', '.')) || 0
  // Only dot "1410.50" or no separator "1410": already numeric
  return parseFloat(stripped) || 0
}

/* ---------- Controle de reprocessamento ----------
 * Um gatilho do Apps Script chama esta função ~1x por minuto (1.444 chamadas
 * em 24h), mas a planilha muda poucas vezes ao dia. O hash do CSV é guardado
 * em atacado_config: se nada mudou, o sync retorna sem ler crm_clients, sem
 * montar lote e sem tocar em atacado_pedidos. */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function lerHash(
  // deno-lint-ignore no-explicit-any
  supabase: any, key: string,
): Promise<string | null> {
  const { data } = await supabase.from('atacado_config').select('value').eq('key', key).maybeSingle()
  const v = data?.value
  return typeof v === 'string' ? v : null
}

async function gravarHash(
  // deno-lint-ignore no-explicit-any
  supabase: any, key: string, hash: string,
): Promise<void> {
  const { error } = await supabase
    .from('atacado_config').upsert({ key, value: hash }, { onConflict: 'key' })
  if (error) console.error(`não foi possível gravar ${key}:`, error.message)
}

function parseDate(v: string): string | null {
  if (!v || !v.trim()) return null
  // Tenta formato BR dd/mm/yyyy primeiro (evita que JS interprete como mm/dd/yyyy)
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  // Formato ISO ou outro reconhecido pelo JS
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // crm_clients é carregado só quando há matching de nome a fazer (type=pedidos)
  const clientByExact = new Map<string, string>()
  const clientPrefixList: Array<{ nkNome: string; id: string }> = []

  async function loadClients() {
    const { data: clientsData } = await supabase.from('crm_clients').select('id, nome')
    for (const c of (clientsData ?? []) as Array<{ id: string; nome: string }>) {
      if (!c.nome?.trim()) continue
      const k = nk(c.nome)
      clientByExact.set(k, c.id)
      if (k.length >= 8) clientPrefixList.push({ nkNome: k, id: c.id })
    }
    // longest prefix wins — sort descending by length
    clientPrefixList.sort((a, b) => b.nkNome.length - a.nkNome.length)
  }

  function findClientId(nome: string | null | undefined): string | null {
    if (!nome?.trim()) return null
    const k = nk(nome)
    if (clientByExact.has(k)) return clientByExact.get(k)!
    for (const c of clientPrefixList) {
      if (k.startsWith(c.nkNome)) return c.id
    }
    return null
  }

  let body: { type?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* no body */ }
  const type = body.type ?? 'pedidos'

  const json200 = (data: unknown) => new Response(
    JSON.stringify(data),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )

  // ── Sync pedidos ─────────────────────────────────────────
  if (type === 'pedidos') {
    const url = sheetCsvByGid(RECEPTION_SHEET_ID, RECEPTION_GID)
    const res = await fetch(url)
    if (!res.ok) return json200({
      ok: false, error: 'Planilha de recepção inacessível', http_status: res.status,
      hint: 'Verifique se a planilha está pública',
    })

    const csv = await res.text()

    // Planilha idêntica à do último sync → nada a fazer. `force: true` no body
    // pula o atalho (útil depois de mexer no banco por fora).
    const hashAtual = await sha256(csv)
    if (!body.force && hashAtual === await lerHash(supabase, 'sync_pedidos_hash')) {
      return json200({ ok: true, type, planilha_inalterada: true, upserted: 0, unchanged: 0 })
    }

    await loadClients()

    const { data: cfg } = await supabase
      .from('atacado_config').select('value').eq('key', 'ids_ignorados').maybeSingle()
    const idsIgnorados: number[] = ((cfg?.value ?? []) as unknown[]).map(Number)

    const rows = parseCSV(csv)
    const sheetHeaders = rows.length > 0 ? Object.keys(rows[0]) : []

    // O lote inteiro vai numa única chamada RPC; o diff (e a supressão das
    // linhas iguais) acontece dentro do banco — ver a migration
    // 20260901213000_sync_atacado_diff_rpc.sql
    const payload: Record<string, unknown>[] = []
    let skipped = 0

    for (const row of rows) {
      const idVenda = parseInt(row.idvenda ?? row.venda ?? row.id ?? row.idpedido ?? '', 10)
      if (!idVenda || isNaN(idVenda)) { skipped++; continue }

      const clienteId = parseInt(row.idcliente ?? row.clienteid ?? '', 10)
      if (!isNaN(clienteId) && clienteId && idsIgnorados.includes(clienteId)) { skipped++; continue }

      const atualizacao = parseDate(
        row.atualizacao ?? row.dataatualizacao ?? row.atualizacoes ??
        row.updated ?? row.timestamp ?? '',
      )
      const dataEmissao = parseDate(
        row.dataemissao ?? row.emissao ?? row.datacompetencia ??
        row.datapedido ?? row.datavenda ?? row.data ?? '',
      )

      const clienteNome = row.cliente ?? row.nomecliente ?? row.nome ?? null
      const clientId = findClientId(clienteNome)

      payload.push({
        id_venda:      idVenda,
        numero_pedido: parseInt(row.numeropedido ?? row.numero ?? row.numpedido ?? '', 10) || null,
        cliente_nome:  clienteNome,
        // crm_client_id só vai preenchido quando houve match; o RPC preserva o
        // vínculo já gravado quando vem null
        crm_client_id: clientId,
        valor:         parseValor(row.valor ?? row.total ?? row.valorliquido ?? row.valortotal ?? ''),
        // turno e entregador NÃO são preenchidos pelo sync ERP — são gerenciados manualmente
        // pela atendente (via UI ou sync reg_lumar). Incluí-los aqui apagaria os valores manuais.
        tipo:          row.tipo ? row.tipo.toUpperCase() : 'PEDIDO',
        ocorrencia:    row.ocorrencia ?? null,
        data_emissao:  dataEmissao,
        atualizacao:   atualizacao,
      })
    }

    const { data: rpc, error: rpcErr } = await supabase
      .rpc('sync_atacado_pedidos', { p_rows: payload })

    if (rpcErr) {
      return json200({
        ok: false, type, total: rows.length, skipped, sheetHeaders,
        error: `${rpcErr.message}${rpcErr.code ? ` (code: ${rpcErr.code})` : ''}`,
      })
    }

    // Só grava o hash depois de um sync bem-sucedido — se falhar, a próxima
    // execução tenta de novo em vez de considerar a planilha já aplicada.
    await gravarHash(supabase, 'sync_pedidos_hash', hashAtual)

    return json200({
      ok: true,
      type,
      total: rows.length,
      upserted: (rpc?.inseridos ?? 0) + (rpc?.atualizados ?? 0),
      inseridos: rpc?.inseridos ?? 0,
      atualizados: rpc?.atualizados ?? 0,
      unchanged: rpc?.sem_mudanca ?? 0,
      skipped,
      sheetHeaders,
    })
  }

  // ── Sync REG-LUMAR ───────────────────────────────────────
  if (type === 'reg_lumar') {
    const url = sheetCsvByName(REG_LUMAR_SHEET_ID, REG_LUMAR_SHEET_NAME)
    const res = await fetch(url)
    if (!res.ok) return json200({
      ok: false,
      error: `Aba "${REG_LUMAR_SHEET_NAME}" inacessível`,
      http_status: res.status,
      hint: `Verifique se a planilha está pública e se a aba se chama exatamente "${REG_LUMAR_SHEET_NAME}"`,
    })

    const text = await res.text()
    if (text.trim().startsWith('<') || text.includes('google.visualization')) {
      return json200({
        ok: false,
        error: `Aba "${REG_LUMAR_SHEET_NAME}" não encontrada`,
        hint: `Nome configurado: "${REG_LUMAR_SHEET_NAME}". Use o secret REG_LUMAR_SHEET_NAME para ajustar.`,
        preview: text.substring(0, 300),
      })
    }

    // Aba idêntica à do último sync → nada a fazer
    const hashAtual = await sha256(text)
    if (!body.force && hashAtual === await lerHash(supabase, 'sync_reg_lumar_hash')) {
      return json200({ ok: true, type, planilha_inalterada: true, updated: 0, unchanged: 0 })
    }

    const rows = parseCSV(text)
    const sheetHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
    let skipped = 0

    const payload: Record<string, unknown>[] = []

    for (const row of rows) {
      const idVenda = parseInt(row.idvenda ?? row.venda ?? row.id ?? '', 10)
      if (!idVenda || isNaN(idVenda)) { skipped++; continue }

      // Coluna A: data de entrega definida pela atendente
      // Tenta os nomes mais comuns para o header da coluna A
      const rawDataEntrega = row.dataentrega ?? row.entrega ?? row.data ??
        row.dtentrega ?? row.dataentregaprevista ?? row.entregaprevista ??
        row.previsao ?? row.dataprevista ?? row.previsaoentrega ?? null

      let dataEntrega: string | null = null
      if (rawDataEntrega && rawDataEntrega.trim()) {
        const parsedDate = parseDate(rawDataEntrega)
        if (parsedDate) dataEntrega = parsedDate.substring(0, 10) // YYYY-MM-DD
      }

      const turno      = row.turno      ? row.turno.toUpperCase()      : null
      const entregador = row.entregador ? row.entregador.toUpperCase() : null
      const tipo       = row.tipo       ? row.tipo.toUpperCase()       : null
      const ocorrencia = row.ocorrencia ?? null

      // Nenhum campo útil na linha
      if (!dataEntrega && !turno && !entregador && !tipo && !ocorrencia) { skipped++; continue }

      // null = "planilha não informa"; o RPC preserva o valor já gravado
      payload.push({ id_venda: idVenda, data_entrega: dataEntrega, turno, entregador, tipo, ocorrencia })
    }

    const { data: rpc, error: rpcErr } = await supabase
      .rpc('sync_atacado_reg_lumar', { p_rows: payload })

    if (rpcErr) {
      return json200({
        ok: false, type, total: rows.length, skipped, sheetHeaders,
        error: `${rpcErr.message}${rpcErr.code ? ` (code: ${rpcErr.code})` : ''}`,
      })
    }

    await gravarHash(supabase, 'sync_reg_lumar_hash', hashAtual)

    return json200({
      ok: true,
      type,
      total: rows.length,
      updated: rpc?.atualizados ?? 0,
      unchanged: rpc?.sem_mudanca ?? 0,
      datesSet: rpc?.datas_definidas ?? 0,
      skipped,
      sheetHeaders,
    })
  }

  return json200({ ok: false, error: 'type must be "pedidos" or "reg_lumar"' })
})
