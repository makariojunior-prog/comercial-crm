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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Índice de nomes do CRM para o casamento. Cada cadastro entra com TODOS os
  // seus candidatos (nome inteiro, nome limpo e cada segmento), porque o nome
  // composto tanto pode estar deste lado quanto do lado do ERP.
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

    // A planilha de recepção do ERP traz só id_venda/venda/id_cliente/cliente/
    // valor/cidade/datas. `tipo` e `ocorrencia` são classificação manual (UI ou
    // sync reg_lumar) — escrevê-los sempre revertia todo BONIFICACAO/CANCELADO
    // para 'PEDIDO' a cada sync, e o módulo Revenda voltava a contar
    // bonificação e pedido cancelado como faturamento. Só inclui no upsert
    // quando a planilha de fato trouxer a coluna; em linha nova o banco aplica
    // o default 'PEDIDO'.
    const hasTipoCol       = sheetHeaders.includes('tipo')
    const hasOcorrenciaCol = sheetHeaders.includes('ocorrencia')

    let batch: Record<string, unknown>[] = []
    let upserted = 0, skipped = 0
    let matchedById = 0, matchedByName = 0, unmatched = 0
    // Vínculos descobertos por nome nesta execução — gravados no de-para para
    // que as demais grafias do mesmo id_cliente já entrem vinculadas
    const learnedLinks = new Map<number, { crm_client_id: string; cliente_nome: string | null }>()
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

      batch.push({
        id_venda:      idVenda,
        // a planilha chama de "venda" o número do pedido no ERP
        numero_pedido: parseInt(row.numeropedido ?? row.numero ?? row.numpedido ?? row.venda ?? '', 10) || null,
        // id_cliente do ERP: chave estável do vínculo, usada pelo de-para acima
        ...(erpClienteId ? { cliente_id: erpClienteId } : {}),
        cliente_nome:  clienteNome,
        // crm_client_id NÃO entra aqui. O upsert em lote do PostgREST monta uma
        // única instrução com a união das colunas do lote, então uma linha que
        // omite a coluna recebe NULL explícito e perde o vínculo que já tinha —
        // foi assim que 179 pedidos de clientes com cadastro duplicado no CRM
        // ficaram órfãos. O vínculo é aplicado depois, pelo de-para, via
        // aplicar_vinculos_atacado().
        valor:         parseValor(row.valor ?? row.total ?? row.valorliquido ?? row.valortotal ?? ''),
        // turno e entregador NÃO são preenchidos pelo sync ERP — são gerenciados manualmente
        // pela atendente (via UI ou sync reg_lumar). Incluí-los aqui apagaria os valores manuais.
        // tipo/ocorrencia seguem a mesma regra (ver hasTipoCol acima).
        ...(hasTipoCol       && row.tipo       ? { tipo: row.tipo.toUpperCase() } : {}),
        ...(hasOcorrenciaCol && row.ocorrencia ? { ocorrencia: row.ocorrencia }   : {}),
        data_emissao:  dataEmissao,
        // atualizacao NOT NULL — fallback garante que nunca será null
        atualizacao:   atualizacao ?? dataEmissao ?? now,
        updated_at:    now,
      })

      if (batch.length >= 50) await flushBatch()
    }
    await flushBatch()

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
      if (error) upsertErrors.push(`atacado_cliente_links: ${error.message}`)
      else linksLearned = linkRows.length
    }

    // Propaga o de-para para os pedidos. Só escreve onde o de-para tem
    // resposta, então nenhum vínculo existente é apagado.
    let vinculosAplicados = 0
    const { data: rpcData, error: rpcError } = await supabase.rpc('aplicar_vinculos_atacado')
    if (rpcError) upsertErrors.push(`aplicar_vinculos_atacado: ${rpcError.message}`)
    else vinculosAplicados = Number(rpcData ?? 0)

    return json200({
      ok: upsertErrors.length === 0,
      type,
      total: rows.length,
      upserted,
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
