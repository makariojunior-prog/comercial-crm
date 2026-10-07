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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

// Um nome só vale como prefixo do outro a partir deste tamanho. Abaixo
// disso o risco de casar dois clientes diferentes é alto.
const MIN_PREFIX_LEN = 8
// Segmentos curtos ou genéricos ("ltda", "j.a") não identificam ninguém
const MIN_SEGMENT_LEN = 6

// Ruído que os dois cadastros anexam ao nome e que não identifica o cliente:
//   "(Rota Canedo)", "( Rota Hidrolândia )"     → anotação de roteirização
//   "45 860 507 Luziania Vieira dos Santos"     → CNPJ em grupos, na frente
//   "BRENO ALEXANDRE JORDAO 75116243168"        → CPF colado no fim
function stripAnnotations(raw: string): string {
  return raw
    .replace(/\(\s*rota[^)]*\)?/gi, ' ')
    .replace(/^[\d\s./-]{8,}/, ' ')
    .replace(/\d{11,14}/g, ' ')
    .trim()
}

// ERP e CRM guardam titular e nome fantasia no MESMO campo, em ordem
// diferente, com separadores diferentes e grafias diferentes:
//
//   ERP "GISLAINE LUCAS OLIVEIRA"                    ↔ CRM "MERCADINHO ZE PAULISTA - GISLAINE LUCAS"
//   ERP "MANOEL RIVALDO RIBEIRO VILANOVA"            ↔ CRM "MERCADO AVENIDA - MANOEL RIVALDO RIBEIRO VILANOVA"
//   ERP "45 860 507 Luziania Vieira dos Santos"      ↔ CRM "LUZIANIA VIEIRA DOS SANTOS-RONALDO CRISTO REI"
//
// Nenhum dos dois é prefixo do outro, então comparar os nomes inteiros (ou só
// o começo de um deles) não acha nada. Por isso os DOIS lados são quebrados
// nos separadores e cada pedaço vira candidato.
function nameCandidates(raw: string): string[] {
  const out: string[] = []
  const push = (part: string, minLen: number) => {
    const k = nk(part)
    if (k.length >= minLen && !out.includes(k)) out.push(k)
  }
  // O nome cru entra sem piso de tamanho: parte do cadastro do CRM foi
  // importada com a mesma grafia do ERP, número incluído ("Cristiane Pereira
  // Marques da Mata 93947488149"), e a igualdade exata com ele tem de valer.
  push(raw, 1)
  const base = stripAnnotations(raw)
  push(base, 1)
  for (const part of base.split(/[-/()]+/)) push(part, MIN_SEGMENT_LEN)
  return out
}

// Quanto os dois candidatos comprovam ser o mesmo cliente: 0 = não casam,
// senão o tamanho da evidência (quanto maior o trecho em comum, mais forte).
// A comparação é simétrica porque tanto faz qual dos dois cadastros tem o
// nome composto.
function matchScore(a: string, b: string): number {
  if (a === b) return a.length
  if (b.length >= MIN_PREFIX_LEN && a.startsWith(b)) return b.length
  if (a.length >= MIN_PREFIX_LEN && b.startsWith(a)) return a.length
  return 0
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Lê várias chaves de atacado_config numa única requisição ao PostgREST.
async function lerConfig(
  // deno-lint-ignore no-explicit-any
  supabase: any, keys: string[],
): Promise<Map<string, unknown>> {
  const { data } = await supabase.from('atacado_config').select('key, value').in('key', keys)
  return new Map(((data ?? []) as Array<{ key: string; value: unknown }>).map(r => [r.key, r.value]))
}

async function gravarHash(
  // deno-lint-ignore no-explicit-any
  supabase: any, key: string, hash: string,
): Promise<void> {
  const { error } = await supabase
    .from('atacado_config').upsert({ key, value: hash }, { onConflict: 'key' })
  if (error) console.error(`não foi possível gravar ${key}:`, error.message)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

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

    const cfg = await lerConfig(supabase, ['ids_ignorados', 'sync_pedidos_hash'])
    const idsIgnorados: number[] = ((cfg.get('ids_ignorados') ?? []) as unknown[]).map(Number)

    // Planilha (e lista de ignorados) idêntica à do último sync → nada a fazer.
    // Este é o caminho de ~99% das execuções do gatilho de 5 min: uma única
    // requisição ao PostgREST, em vez de ler o banco inteiro e reescrever.
    // `force: true` pula o atalho (botão "Sincronizar" da tela, ou depois de
    // mexer no banco por fora).
    const hashAtual = await sha256(`${csv}\n#ignorados:${idsIgnorados.join(',')}`)
    if (!body.force && hashAtual === cfg.get('sync_pedidos_hash')) {
      return json200({ ok: true, type, planilha_inalterada: true, upserted: 0, unchanged: 0 })
    }

    // Índice de nomes do CRM para o casamento. Cada cadastro entra com TODOS os
    // seus candidatos (nome inteiro, nome limpo e cada segmento), porque o nome
    // composto tanto pode estar deste lado quanto do lado do ERP. Só é montado
    // quando a planilha mudou.
    const { data: clientsData } = await supabase.from('crm_clients').select('id, nome')
    const clientKeys: Array<{ k: string; id: string }> = []
    for (const c of (clientsData ?? []) as Array<{ id: string; nome: string }>) {
      if (!c.nome?.trim()) continue
      for (const k of nameCandidates(c.nome)) clientKeys.push({ k, id: c.id })
    }

    // Só ~500 nomes distintos vêm do ERP para milhares de pedidos — memoiza.
    const matchCache = new Map<string, string | null>()

    function findClientId(nome: string | null | undefined): string | null {
      if (!nome?.trim()) return null
      const cached = matchCache.get(nome)
      if (cached !== undefined) return cached

      const candidates = nameCandidates(nome)
      let bestScore = 0
      let bestId: string | null = null
      let ambiguo = false

      for (const ck of clientKeys) {
        for (const ec of candidates) {
          const score = matchScore(ec, ck.k)
          if (score === 0) continue
          if (score > bestScore) { bestScore = score; bestId = ck.id; ambiguo = false }
          // Mesma evidência apontando para outro cadastro: normalmente cadastro
          // duplicado no CRM, ou dois clientes que dividem o nome fantasia
          // ("PADARIA PÃO NOSSO - JOANA" e "PADARIA PÃO NOSSO - JOSE AIRTON").
          // Chutar aqui vincularia o pedido ao cliente errado, então deixa para
          // o de-para manual da tela de Revenda.
          else if (score === bestScore && ck.id !== bestId) ambiguo = true
        }
      }

      const resultado = ambiguo ? null : bestId
      matchCache.set(nome, resultado)
      return resultado
    }

    // De-para id_cliente (ERP) → crm_clients.id.
    //
    // O nome que o ERP manda para o MESMO cliente muda com o tempo
    // ("SILVANA CORDEIRO DA SILVA LIMA" vira "SILVANA CORDEIRO DA SILVA LIMA
    // ( PANIF E LANCH NOVA OPÇÃO) (Rota Garavelo I)" e volta), então casar só
    // por nome deixava parte dos pedidos do cliente sem vínculo — e o módulo
    // Revenda somava um mês e não somava o outro. `id_cliente` não muda, então
    // o vínculo por id tem prioridade sobre o nome.
    const { data: linkData } = await supabase
      .from('atacado_cliente_links').select('cliente_id, crm_client_id')
    const linkByErpId = new Map<number, string>()
    for (const l of (linkData ?? []) as Array<{ cliente_id: number; crm_client_id: string }>) {
      if (l.cliente_id && l.crm_client_id) linkByErpId.set(Number(l.cliente_id), l.crm_client_id)
    }

    const rows = parseCSV(csv)
    const sheetHeaders = rows.length > 0 ? Object.keys(rows[0]) : []

    // `tipo` e `ocorrencia` são classificação manual (UI ou sync reg_lumar).
    // Só vão no lote quando a planilha de fato trouxer a coluna; senão a RPC
    // preserva o que está gravado (e aplica o default 'PEDIDO' em linha nova).
    const hasTipoCol       = sheetHeaders.includes('tipo')
    const hasOcorrenciaCol = sheetHeaders.includes('ocorrencia')

    // O lote inteiro vai numa única chamada RPC; o diff (e a supressão das
    // linhas iguais) acontece dentro do banco — ver as migrations
    // 20260901213000_sync_atacado_diff_rpc.sql e
    // 20261006120000_sync_atacado_rpc_cliente_id.sql
    const payload: Record<string, unknown>[] = []
    let skipped = 0
    let matchedById = 0, matchedByName = 0, unmatched = 0
    // Vínculos descobertos por nome nesta execução — gravados no de-para para
    // que as demais grafias do mesmo id_cliente já entrem vinculadas
    const learnedLinks = new Map<number, { crm_client_id: string; cliente_nome: string | null }>()
    const errors: string[] = []

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
      const erpClienteId = !isNaN(clienteId) && clienteId ? clienteId : null

      // Prioridade: de-para por id_cliente (estável, e onde mora a correção
      // manual feita na tela de Revenda) → casamento por nome.
      let clientId = erpClienteId ? (linkByErpId.get(erpClienteId) ?? null) : null
      if (clientId) {
        matchedById++
      } else {
        clientId = findClientId(clienteNome)
        if (clientId) {
          matchedByName++
          if (erpClienteId) {
            linkByErpId.set(erpClienteId, clientId)
            learnedLinks.set(erpClienteId, { crm_client_id: clientId, cliente_nome: clienteNome })
          }
        } else {
          unmatched++
        }
      }

      payload.push({
        id_venda:      idVenda,
        // a planilha chama de "venda" o número do pedido no ERP
        numero_pedido: parseInt(row.numeropedido ?? row.numero ?? row.numpedido ?? row.venda ?? '', 10) || null,
        // id_cliente do ERP: chave estável do vínculo; null preserva o gravado
        cliente_id:    erpClienteId,
        cliente_nome:  clienteNome,
        // null = sem match; a RPC preserva o vínculo já gravado (inclusive o
        // manual), que sempre vence o casamento por nome
        crm_client_id: clientId,
        valor:         parseValor(row.valor ?? row.total ?? row.valorliquido ?? row.valortotal ?? ''),
        // turno e entregador NÃO são preenchidos pelo sync ERP — são gerenciados
        // manualmente pela atendente (via UI ou sync reg_lumar)
        tipo:          hasTipoCol && row.tipo ? row.tipo.toUpperCase() : null,
        ocorrencia:    hasOcorrenciaCol && row.ocorrencia ? row.ocorrencia : null,
        data_emissao:  dataEmissao,
        // a RPC cai para emissão > valor já gravado quando vier null
        atualizacao,
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

    const inseridos   = Number(rpc?.inseridos ?? 0)
    const atualizados = Number(rpc?.atualizados ?? 0)

    // Persiste os vínculos descobertos por nome. ignoreDuplicates garante que
    // um vínculo MANUAL (feito na tela de Revenda) nunca seja sobrescrito.
    let linksLearned = 0
    if (learnedLinks.size) {
      const linkRows = [...learnedLinks.entries()].map(([cliente_id, v]) => ({
        cliente_id,
        crm_client_id: v.crm_client_id,
        cliente_nome:  v.cliente_nome,
        origem:        'AUTO',
      }))
      const { error } = await supabase
        .from('atacado_cliente_links')
        .upsert(linkRows, { onConflict: 'cliente_id', ignoreDuplicates: true })
      if (error) errors.push(`atacado_cliente_links: ${error.message}`)
      else linksLearned = linkRows.length
    }

    // Propaga o de-para para os demais pedidos do mesmo cliente. Só escreve onde
    // o de-para tem resposta, então nenhum vínculo existente é apagado. Só vale
    // a chamada quando este sync mexeu em pedidos ou aprendeu vínculos.
    let vinculosAplicados = 0
    if (inseridos + atualizados + linksLearned > 0) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('aplicar_vinculos_atacado')
      if (rpcError) errors.push(`aplicar_vinculos_atacado: ${rpcError.message}`)
      else vinculosAplicados = Number(rpcData ?? 0)
    }

    // Só grava o hash depois de um sync sem erro — se falhar, a próxima
    // execução tenta de novo em vez de considerar a planilha já aplicada.
    if (errors.length === 0) await gravarHash(supabase, 'sync_pedidos_hash', hashAtual)

    return json200({
      ok: errors.length === 0,
      type,
      total: rows.length,
      upserted: inseridos + atualizados,
      inseridos,
      atualizados,
      unchanged: Number(rpc?.sem_mudanca ?? 0),
      skipped,
      // diagnóstico do vínculo com o CRM — `unmatched` alto significa cliente
      // de Revenda cadastrado com nome que o ERP não usa: vincule na aba
      // "Compras Mensais" (card "Não vinculados")
      matchedById,
      matchedByName,
      unmatched,
      linksLearned,
      vinculosAplicados,
      sheetHeaders,
      error: errors.length ? errors[0] : undefined,
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
    const cfg = await lerConfig(supabase, ['sync_reg_lumar_hash'])
    if (!body.force && hashAtual === cfg.get('sync_reg_lumar_hash')) {
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

      // null = "planilha não informa"; a RPC preserva o valor já gravado
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
