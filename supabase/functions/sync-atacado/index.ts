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

/* ---------- Detecção de mudança ----------
 * A planilha de recepção carrega o histórico inteiro (~6k pedidos), mas só
 * um punhado de linhas muda entre um sync e outro. Reescrever tudo fazia
 * cada UPDATE virar um evento realtime em atacado_pedidos, replicado para
 * toda tela do CRM aberta — ~7 MB de egress por clique em "Sincronizar",
 * por aba aberta. As funções abaixo permitem pular linhas idênticas. */
function sameStr(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined || a === '' ? '' : String(a)
  const nb = b === null || b === undefined || b === '' ? '' : String(b)
  return na === nb
}

function sameNum(a: unknown, b: unknown): boolean {
  // tolerância de meio centavo — evita churn por ruído de ponto flutuante
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005
}

function sameDate(a: unknown, b: unknown): boolean {
  const ta = a ? new Date(a as string).getTime() : null
  const tb = b ? new Date(b as string).getTime() : null
  if (ta === null || tb === null) return ta === tb
  if (isNaN(ta) || isNaN(tb)) return String(a) === String(b)
  return ta === tb
}

/* PostgREST limita o tamanho da resposta por request; pagina para garantir
 * que o snapshot cubra a tabela inteira (senão as linhas não lidas seriam
 * tratadas como novas e reescritas de novo). */
async function fetchAllRows<T>(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table).select(columns)
      .order('id_venda', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`snapshot ${table}: ${error.message}`)
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < pageSize) return out
  }
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

  let body: { type?: string } = {}
  try { body = await req.json() } catch { /* no body */ }
  const type = body.type ?? 'pedidos'

  const json200 = (data: unknown) => new Response(
    JSON.stringify(data),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )

  // ── Sync pedidos ─────────────────────────────────────────
  if (type === 'pedidos') {
    await loadClients()

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

    // Snapshot do estado atual para escrever só o que mudou de fato
    type Existing = {
      id_venda: number; numero_pedido: number | null; cliente_nome: string | null
      crm_client_id: string | null; valor: number | null; tipo: string | null
      ocorrencia: string | null; data_emissao: string | null; atualizacao: string | null
    }
    let existingByIdVenda = new Map<number, Existing>()
    try {
      const existing = await fetchAllRows<Existing>(
        supabase, 'atacado_pedidos',
        'id_venda, numero_pedido, cliente_nome, crm_client_id, valor, tipo, ocorrencia, data_emissao, atualizacao',
      )
      existingByIdVenda = new Map(existing.map(r => [Number(r.id_venda), r]))
    } catch (e) {
      // Sem snapshot não dá para detectar mudança; segue reescrevendo tudo
      // (comportamento antigo) em vez de falhar o sync.
      console.error('snapshot falhou, sync sem detecção de mudança:', e)
    }

    let batch: Record<string, unknown>[] = []
    let upserted = 0, skipped = 0, unchanged = 0
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

      const prev = existingByIdVenda.get(idVenda)

      const numeroPedido = parseInt(row.numeropedido ?? row.numero ?? row.numpedido ?? '', 10) || null
      const valor        = parseValor(row.valor ?? row.total ?? row.valorliquido ?? row.valortotal ?? '')
      const tipo         = row.tipo ? row.tipo.toUpperCase() : 'PEDIDO'
      const ocorrencia   = row.ocorrencia ?? null
      // atualizacao NOT NULL — fallback garante que nunca será null. Para linhas já
      // existentes preserva o valor atual em vez de carimbar `now`, senão toda linha
      // sem data na planilha apareceria como "mudou" em todo sync.
      const atualizacaoFinal = atualizacao ?? dataEmissao ?? prev?.atualizacao ?? now

      // Linha já existe e nenhum campo sincronizado mudou → não reescreve.
      // Evita disparar evento realtime (e refetch no CRM) à toa.
      if (
        prev &&
        sameStr(numeroPedido, prev.numero_pedido) &&
        sameStr(clienteNome, prev.cliente_nome) &&
        sameNum(valor, prev.valor) &&
        sameStr(tipo, prev.tipo) &&
        sameStr(ocorrencia, prev.ocorrencia) &&
        sameDate(dataEmissao, prev.data_emissao) &&
        sameDate(atualizacaoFinal, prev.atualizacao) &&
        // só considera o vínculo quando o sync tem um match a aplicar
        (!clientId || sameStr(clientId, prev.crm_client_id))
      ) {
        unchanged++
        continue
      }

      batch.push({
        id_venda:      idVenda,
        numero_pedido: numeroPedido,
        cliente_nome:  clienteNome,
        // crm_client_id only included when matched — avoids overwriting manually-set links on existing records
        ...(clientId ? { crm_client_id: clientId } : {}),
        valor,
        // turno e entregador NÃO são preenchidos pelo sync ERP — são gerenciados manualmente
        // pela atendente (via UI ou sync reg_lumar). Incluí-los aqui apagaria os valores manuais.
        tipo,
        ocorrencia,
        data_emissao:  dataEmissao,
        atualizacao:   atualizacaoFinal,
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
      unchanged,
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
    let updated = 0, skipped = 0, datesSet = 0, unchanged = 0

    // Mesmo motivo do sync de pedidos: a aba REG-LUMAR repete o histórico
    // inteiro, então sem comparação cada sync reescrevia todas as linhas.
    type ExistingReg = {
      id_venda: number; data_entrega: string | null; turno: string | null
      entregador: string | null; tipo: string | null; ocorrencia: string | null
    }
    let regByIdVenda = new Map<number, ExistingReg>()
    try {
      const existing = await fetchAllRows<ExistingReg>(
        supabase, 'atacado_pedidos',
        'id_venda, data_entrega, turno, entregador, tipo, ocorrencia',
      )
      regByIdVenda = new Map(existing.map(r => [Number(r.id_venda), r]))
    } catch (e) {
      console.error('snapshot reg_lumar falhou, sync sem detecção de mudança:', e)
    }

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

      // Nada mudou em relação ao que já está no banco → não escreve.
      const prev = regByIdVenda.get(idVenda)
      if (prev) {
        const iguais =
          (patch.data_entrega === undefined || sameStr(patch.data_entrega, prev.data_entrega)) &&
          (patch.turno        === undefined || sameStr(patch.turno,        prev.turno)) &&
          (patch.entregador   === undefined || sameStr(patch.entregador,   prev.entregador)) &&
          (patch.tipo         === undefined || sameStr(patch.tipo,         prev.tipo)) &&
          (patch.ocorrencia   === undefined || sameStr(patch.ocorrencia,   prev.ocorrencia))
        if (iguais) {
          // desconta a data que só seria "definida" de novo com o mesmo valor
          if (patch.data_entrega !== undefined) datesSet--
          unchanged++
          continue
        }
      }

      const { error } = await supabase
        .from('atacado_pedidos').update(patch).eq('id_venda', idVenda)
      if (error) skipped++; else updated++
    }

    return json200({ ok: true, type, total: rows.length, updated, skipped, unchanged, datesSet, sheetHeaders })
  }

  return json200({ ok: false, error: 'type must be "pedidos" or "reg_lumar"' })
})
