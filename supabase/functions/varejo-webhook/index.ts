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
  if (by === 'food99') return '99FOOD'
  if (ch === 'ifood' || by === 'ifood' || by === 'ifood_shipping') return 'IFOOD'
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

async function fetchOrderFromAPI(orderId: string): Promise<any | null> {
  const apiRes = await fetch(`${CARDAPIO_BASE}/api/partner/v1/orders/${orderId}`, {
    headers: { 'X-API-KEY': CARDAPIO_API_KEY },
    signal: AbortSignal.timeout(12000),
  })
  if (!apiRes.ok) {
    console.error(`❌ API Cardápio Web: ${apiRes.status} para order_id=${orderId}`)
    return null
  }
  return await apiRes.json()
}

async function upsertOrder(orderId: string, order: any): Promise<void> {
  // Workaround: Cardápio Web às vezes retorna order_type='takeout' para pedidos
  // que têm endereço de entrega (bug da API). Se há bairro/rua, é delivery.
  const addr = order.delivery_address ?? {}
  const hasDeliveryAddress = !!(addr.neighborhood || addr.address || addr.street)
  const isTakeout = order.order_type === 'takeout' && !hasDeliveryAddress

  const displayId = String(order.display_id).trim()
  const statusIcon = getStatusIcon(order.status)
  const origem = getOrigem(order.sales_channel, order.delivered_by)

  const total = parseFloat(order.total ?? 0)
  const frete = isTakeout ? 0 : parseFloat(order.delivery_fee ?? 0)
  const bairro: string = isTakeout ? '' : (addr.neighborhood || 'Não informado')
  const rua = addr.address || addr.street || ''
  const numero = addr.number || 'S/N'
  const enderecoCompleto = isTakeout
    ? null
    : `${rua ? rua + ', ' : ''}${numero} - ${bairro}, ${addr.city || 'Goiânia'} - ${addr.state || 'GO'}${addr.zip_code ? ', ' + addr.zip_code : ''}`

  let turno: string | null = null
  let dataEntregaCalc: string | null = null
  let scheduledStart: string | null = null
  let dataEntregaDefinida = false

  // isScheduled: turno/data_entrega vêm da API apenas para pedidos agendados.
  // Para imediatos, esses campos são gerenciados pelo atendente no CRM — nunca sobrescrever.
  const isScheduled = !isTakeout && order.order_timing === 'scheduled'

  if (!isTakeout) {
    scheduledStart = order.schedule?.scheduled_date_time_start ?? null
    turno = isScheduled ? getTurno(scheduledStart) : null
    dataEntregaCalc = isScheduled
      ? (scheduledStart?.substring(0, 10) ?? null)
      : new Date().toISOString().substring(0, 10)
    dataEntregaDefinida = !!(dataEntregaCalc && turno)
  }

  // Campos que sempre refletem o estado mais recente da API
  const updateFields: Record<string, unknown> = {
    status_icon:       statusIcon,
    origem:            origem,
    order_type:        isTakeout ? 'takeout' : 'delivery',
    valor_liquido:     total - frete,
    restricao:         order.observation || null,
    cardapio_order_id: orderId,
    updated_at:        new Date().toISOString(),
  }

  if (!isTakeout) {
    updateFields.frete             = frete
    updateFields.bairro            = bairro || null
    updateFields.endereco_completo = enderecoCompleto
    updateFields.complemento       = addr.complement || null
    // turno/scheduled_start/data_entrega_definida/data_entrega são gerenciados
    // pelo atendente para pedidos imediatos — nunca sobrescrever via resync
    if (isScheduled) {
      updateFields.turno                 = turno
      updateFields.scheduled_start       = scheduledStart
      updateFields.data_entrega_definida = dataEntregaDefinida
      if (dataEntregaCalc) updateFields.data_entrega = dataEntregaCalc
    }
  }

  const { data: updated, error: updErr } = await supabase
    .from('varejo_pedidos')
    .update(updateFields)
    .eq('num_pedido', displayId)
    .select('num_pedido')

  if (updErr) console.error(`Supabase update error: ${updErr.message}`)

  if (updated && updated.length > 0) {
    console.log(`🔄 Atualizado: ${displayId} status=${statusIcon} type=${isTakeout ? 'takeout' : 'delivery'} valor=${total - frete}`)
    return
  }

  // Pedido novo — insere
  const telefone = String(order.customer?.phone ?? '').replace(/\D/g, '')

  let qtdPedidos = 1
  if (telefone.length > 5) {
    const { count } = await supabase
      .from('varejo_pedidos')
      .select('*', { count: 'exact', head: true })
      .eq('telefone', telefone)
    qtdPedidos = (count ?? 0) + 1
  }

  const record: Record<string, unknown> = {
    num_pedido:            displayId,
    data_entrega:          isTakeout ? new Date().toISOString().substring(0, 10) : dataEntregaCalc,
    status_icon:           statusIcon,
    marcador:              '⭕️',
    cliente:               order.customer?.name ?? null,
    origem:                origem,
    order_type:            isTakeout ? 'takeout' : 'delivery',
    valor_liquido:         total - frete,
    frete:                 frete,
    qtd_pedidos_cliente:   qtdPedidos,
    telefone:              telefone || null,
    restricao:             order.observation || null,
    order_timing:          order.order_timing ?? null,
    data_entrega_definida: isTakeout ? true : dataEntregaDefinida,
    cardapio_order_id:     orderId,
    source:                'webhook',
    updated_at:            new Date().toISOString(),
  }

  if (!isTakeout) {
    record.bairro              = bairro || null
    record.turno               = turno
    record.scheduled_start     = scheduledStart
    record.endereco_completo   = enderecoCompleto
    record.complemento         = addr.complement || null
  }

  const { error: insErr } = await supabase
    .from('varejo_pedidos')
    .insert(record)

  if (insErr) console.error(`❌ Insert error (${displayId}): ${insErr.message}`)
  else console.log(`✅ Novo pedido: ${displayId} (${isTakeout ? 'retirada' : origem}) | data=${record.data_entrega}`)
}

async function processOrder(payload: any): Promise<void> {
  const orderId = payload?.order_id
  if (!orderId) return

  console.log(`📦 Webhook: order_id=${orderId} event=${payload?.event_type}`)

  const order = await fetchOrderFromAPI(orderId)
  if (!order) return

  if (order.order_type !== 'delivery' && order.order_type !== 'takeout') {
    console.log(`ℹ️ Ignorado: pedido ${order.display_id} tipo=${order.order_type}`)
    return
  }

  await upsertOrder(orderId, order)
}

// Rebusca todos os pedidos abertos do Cardápio Web dos últimos 2 dias
async function resyncRecentes(): Promise<{ ok: boolean; total: number; atualizados: number; erros: number }> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)

  const { data: pedidos, error } = await supabase
    .from('varejo_pedidos')
    .select('num_pedido, cardapio_order_id')
    .not('cardapio_order_id', 'is', null)
    .gte('data_entrega', twoDaysAgo)
    .not('status_icon', 'in', '("✅","❌")')

  if (error) {
    console.error('resync query error:', error.message)
    return { ok: false, total: 0, atualizados: 0, erros: 1 }
  }

  const lista = pedidos ?? []
  console.log(`🔁 Resync: ${lista.length} pedidos abertos a verificar`)

  let atualizados = 0
  let erros = 0

  for (const p of lista) {
    try {
      const order = await fetchOrderFromAPI(p.cardapio_order_id!)
      if (!order) { erros++; continue }
      await upsertOrder(p.cardapio_order_id!, order)
      atualizados++
    } catch (e: any) {
      console.error(`resync error ${p.num_pedido}:`, e.message)
      erros++
    }
    // Pausa para não estourar rate limit da API
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`✅ Resync: ${atualizados} atualizados, ${erros} erros de ${lista.length} total`)
  return { ok: true, total: lista.length, atualizados, erros }
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', service: 'varejo-webhook' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let payload: any = null
  try { payload = await req.json() } catch { /* payload inválido */ }

  // Resync periódico — chamado pelo pg_cron ou manualmente
  if (payload?.type === 'resync') {
    const result = await resyncRecentes()
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Webhook normal do Cardápio Web
  const task = processOrder(payload).catch(e => console.error('processOrder fatal:', e.message))

  try {
    // @ts-ignore — disponível no Supabase Edge Runtime
    EdgeRuntime.waitUntil(task)
  } catch {
    // fallback
  }

  return new Response('OK', { status: 200 })
})
