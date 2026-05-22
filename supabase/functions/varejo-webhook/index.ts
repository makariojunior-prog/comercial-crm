import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CARDAPIO_API_KEY = Deno.env.get('CARDAPIO_API_KEY') ?? ''
const CARDAPIO_BASE = 'https://integracao.cardapioweb.com'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function getStatusIcon(status: string): string {
  const s = (status ?? '').toUpperCase()
  if (['RELEASED', 'DISPATCHED', 'DELIVERING', 'SAIU_PARA_ENTREGA'].includes(s)) return '🛵'
  if (['CLOSED', 'CONCLUDED', 'COMPLETED', 'DELIVERED', 'ENTREGUE'].includes(s)) return '✅'
  if (['CANCELED', 'CANCELLED'].includes(s)) return '❌'
  return '⚠️'
}

function getOrigem(salesChannel: string, deliveredBy: string): string {
  const ch = (salesChannel ?? '').toLowerCase()
  const by = (deliveredBy ?? '').toLowerCase()
  if (ch === 'ifood') return by === 'food99' ? '99FOOD' : 'IFOOD'
  return 'CARDAPIO WEB'
}

function getTurno(isoDateTime: string | null): string | null {
  if (!isoDateTime) return null
  const m = isoDateTime.match(/T(\d{2}):/)
  if (!m) return null
  const h = parseInt(m[1])
  if (h >= 6 && h < 12) return 'MANHÃ'
  if (h >= 12 && h < 18) return 'TARDE'
  return 'NOITE'
}

async function processOrder(payload: any): Promise<void> {
  const orderId = payload?.order_id
  if (!orderId) return

  console.log(`📦 Recebido webhook: order_id=${orderId} event=${payload?.event_type}`)

  // Busca detalhes completos do pedido na API do Cardápio Web
  const apiRes = await fetch(`${CARDAPIO_BASE}/api/partner/v1/orders/${orderId}`, {
    headers: { 'X-API-KEY': CARDAPIO_API_KEY },
    signal: AbortSignal.timeout(12000),
  })

  if (!apiRes.ok) {
    console.error(`❌ API Cardápio Web: ${apiRes.status} para order_id=${orderId}`)
    return
  }

  const order = await apiRes.json()

  // Apenas pedidos de delivery
  if (order.order_type !== 'delivery') {
    console.log(`ℹ️ Ignorado: pedido ${order.display_id} não é delivery (${order.order_type})`)
    return
  }

  const displayId = String(order.display_id).trim()
  const statusIcon = getStatusIcon(order.status)
  const origem = getOrigem(order.sales_channel, order.delivered_by)

  // Calcula campos financeiros e de endereço (necessários tanto para update quanto insert)
  const total = parseFloat(order.total ?? 0)
  const frete = parseFloat(order.delivery_fee ?? 0)
  const addr = order.delivery_address ?? {}
  const bairro: string = addr.neighborhood || 'Não informado'
  const rua = addr.address || addr.street || ''
  const numero = addr.number || 'S/N'
  const enderecoCompleto = `${rua ? rua + ', ' : ''}${numero} - ${bairro}, ${addr.city || 'Goiânia'} - ${addr.state || 'GO'}${addr.zip_code ? ', ' + addr.zip_code : ''}`

  // Tenta atualizar pedido existente — atualiza campos da API (preço, status, obs, endereço)
  // Preserva campos do atendente: turno, entregador, atendente, rota_definida, marcador, ocorrencia
  const { data: updated, error: updErr } = await supabase
    .from('varejo_pedidos')
    .update({
      status_icon:       statusIcon,
      valor_liquido:     total - frete,
      frete:             frete,
      restricao:         order.observation || null,
      bairro:            bairro || null,
      endereco_completo: enderecoCompleto || null,
      complemento:       addr.complement || null,
      updated_at:        new Date().toISOString(),
    })
    .eq('num_pedido', displayId)
    .select('num_pedido')

  if (updErr) console.error(`Supabase update error: ${updErr.message}`)

  if (updated && updated.length > 0) {
    console.log(`🔄 Atualizado: ${displayId} → status=${statusIcon} valor_liquido=${total - frete}`)
    return
  }

  // Pedido novo — monta e insere
  const isScheduled = order.order_timing === 'scheduled'
  const scheduledStart: string | null = order.schedule?.scheduled_date_time_start ?? null
  const turno = isScheduled ? getTurno(scheduledStart) : null
  const dataEntrega: string | null = isScheduled
    ? (scheduledStart?.substring(0, 10) ?? null)
    : new Date().toISOString().substring(0, 10)

  const telefone = String(order.customer?.phone ?? '').replace(/\D/g, '')

  // Conta quantas vezes este telefone já pediu
  let qtdPedidos = 1
  if (telefone.length > 5) {
    const { count } = await supabase
      .from('varejo_pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('telefone', telefone)
    qtdPedidos = (count ?? 0) + 1
  }

  const record = {
    num_pedido:           displayId,
    data_entrega:         dataEntrega,
    status_icon:          statusIcon,
    marcador:             '⭕️',
    cliente:              order.customer?.name ?? null,
    bairro:               bairro || null,
    turno:                turno,
    origem:               origem,
    valor_liquido:        total - frete,
    frete:                frete,
    qtd_pedidos_cliente:  qtdPedidos,
    telefone:             telefone || null,
    endereco_completo:    enderecoCompleto || null,
    complemento:          addr.complement || null,
    restricao:            order.observation || null,
    order_timing:         order.order_timing ?? null,
    scheduled_start:      scheduledStart,
    data_entrega_definida: !!(dataEntrega && turno),
    source:               'webhook',
    updated_at:           new Date().toISOString(),
  }

  const { error: insErr } = await supabase
    .from('varejo_pedidos')
    .insert(record)

  if (insErr) console.error(`❌ Insert error (${displayId}): ${insErr.message}`)
  else console.log(`✅ Novo pedido inserido: ${displayId} (${origem}) | data=${dataEntrega} turno=${turno ?? '-'}`)
}

Deno.serve(async (req) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', service: 'varejo-webhook' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Responde 200 imediatamente para o Cardápio Web não marcar como falha
  let payload: any = null
  try { payload = await req.json() } catch { /* payload inválido */ }

  const task = processOrder(payload).catch(e => console.error('processOrder fatal:', e.message))

  try {
    // @ts-ignore — disponível no Supabase Edge Runtime
    EdgeRuntime.waitUntil(task)
  } catch {
    // fallback: task já está rodando em background
  }

  return new Response('OK', { status: 200 })
})
