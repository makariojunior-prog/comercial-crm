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
  const clean = v.replace(/[^\d,.]/g, '').replace(',', '.')
  return parseFloat(clean) || 0
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

  // Load crm_clients once per request for name → id matching
  const { data: clientsData } = await supabase.from('crm_clients').select('id, nome')
  const clientByExact = new Map<string, string>()
  const clientPrefixList: Array<{ nkNome: string; id: string }> = []
  for (const c of (clientsData ?? []) as Array<{ id: string; nome: string }>) {
    if (!c.nome?.trim()) continue
    const k = nk(c.nome)
    clientByExact.set(k, c.id)
    if (k.length >= 8) clientPrefixList.push({ nkNome: k, id: c.id })
  }
  // longest prefix wins — sort descending by length
  clientPrefixList.sort((a, b) => b.nkNome.length - a.nkNome.length)

  function findClientId(nome: string | null | undefined): string | null {
    if (!nome?.trim()) return null
    const k = nk(nome)
    if (clientByExact.has(k)) return clientByExact.get(k)!
    for (const c of clientPrefixList) {
      if (k.startsWith(c.nkNome)) return c.id
    }
    return null
  }

  let body: { type?: string } = {}
  try { body = await req.json() } catch { /* no body */ }
  const type = body.type ?? 'pedidos'

  const json200 = (data: unknown) => new Response(
    JSON.stringify(data),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )

  // ── Sync pedidos ─────────────────────────────────────────
  if (type === 'pedidos') {
    const { data: cfg } = await supabase
      .from('atacado_config').select('value').eq('key', 'ids_ignorados').maybeSingle()
    const idsIgnorados: number[] = ((cfg?.value ?? []) as unknown[]).map(Number)

    const url = sheetCsvByGid(RECEPTION_SHEET_ID, RECEPTION_GID)
    const res = await fetch(url)
    if (!res.ok) return json200({
      ok: false, error: 'Planilha de recepção inacessível', http_status: res.status,
      hint: 'Verifique se a planilha está pública',
    })

    const rows = parseCSV(await res.text())
    const sheetHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
    const now = new Date().toISOString()

    let batch: Record<string, unknown>[] = []
    let upserted = 0, skipped = 0
    const upsertErrors: string[] = []

    async function flushBatch() {
      if (!batch.length) return
      const { error } = await supabase
        .from('atacado_pedidos')
        .upsert(batch, { onConflict: 'id_venda' })
      if (error) {
        upsertErrors.push(`${error.message} (code: ${error.code}) — primeiro id_venda: ${batch[0]?.id_venda}`)
      } else {
        upserted += batch.length
      }
      batch = []
    }

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

      batch.push({
        id_venda:      idVenda,
        numero_pedido: parseInt(row.numeropedido ?? row.numero ?? row.numpedido ?? '', 10) || null,
        cliente_nome:  clienteNome,
        // crm_client_id only included when matched — avoids overwriting manually-set links on existing records
        ...(clientId ? { crm_client_id: clientId } : {}),
        valor:         parseValor(row.valor ?? row.total ?? row.valorliquido ?? row.valortotal ?? ''),
        // turno e entregador NÃO são preenchidos pelo sync ERP — são gerenciados manualmente
        // pela atendente (via UI ou sync reg_lumar). Incluí-los aqui apagaria os valores manuais.
        tipo:          row.tipo          ? row.tipo.toUpperCase()       : 'PEDIDO',
        ocorrencia:    row.ocorrencia    ?? null,
        data_emissao:  dataEmissao,
        // atualizacao NOT NULL — fallback garante que nunca será null
        atualizacao:   atualizacao ?? dataEmissao ?? now,
        updated_at:    now,
      })

      if (batch.length >= 50) await flushBatch()
    }
    await flushBatch()

    return json200({
      ok: upsertErrors.length === 0,
      type,
      total: rows.length,
      upserted,
      skipped,
      sheetHeaders,
      error: upsertErrors.length ? upsertErrors[0] : undefined,
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

    const rows = parseCSV(text)
    const sheetHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
    let updated = 0, skipped = 0, datesSet = 0

    for (const row of rows) {
      const idVenda = parseInt(row.idvenda ?? row.venda ?? row.id ?? '', 10)
      if (!idVenda || isNaN(idVenda)) { skipped++; continue }

      const patch: Record<string, string | null> = { updated_at: new Date().toISOString() }

      // Coluna A: data de entrega definida pela atendente
      // Tenta os nomes mais comuns para o header da coluna A
      const rawDataEntrega = row.dataentrega ?? row.entrega ?? row.data ??
        row.dtentrega ?? row.dataentregaprevista ?? row.entregaprevista ??
        row.previsao ?? row.dataprevista ?? row.previsaoentrega ?? null
      if (rawDataEntrega && rawDataEntrega.trim()) {
        const parsedDate = parseDate(rawDataEntrega)
        if (parsedDate) {
          patch.data_entrega = parsedDate.substring(0, 10) // YYYY-MM-DD
          datesSet++
        }
      }

      if (row.turno)      patch.turno      = row.turno.toUpperCase()
      if (row.entregador) patch.entregador = row.entregador.toUpperCase()
      if (row.tipo)       patch.tipo       = row.tipo.toUpperCase()
      if (row.ocorrencia) patch.ocorrencia = row.ocorrencia

      // Apenas updated_at = sem dados úteis
      if (Object.keys(patch).length === 1) { skipped++; continue }

      const { error } = await supabase
        .from('atacado_pedidos').update(patch).eq('id_venda', idVenda)
      if (error) skipped++; else updated++
    }

    return json200({ ok: true, type, total: rows.length, updated, skipped, datesSet, sheetHeaders })
  }

  return json200({ ok: false, error: 'type must be "pedidos" or "reg_lumar"' })
})
