import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`${emoji} [food99-webhook] ${msg}`)
}

// ─── Handler principal ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Health-check / verificação de URL pela 99Food
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'food99-webhook',
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Aceita apenas POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let payload: any = null
  try {
    payload = await req.json()
  } catch {
    log('❌', 'Payload inválido (não é JSON)')
    return new Response('Bad Request', { status: 400 })
  }

  log('📥', `Evento recebido: ${JSON.stringify(payload).substring(0, 500)}`)

  // ─── Registrar evento no log para análise futura ─────────────────────────
  // Salva todos os eventos recebidos para que possamos entender a estrutura
  // dos payloads enquanto a documentação da 99Food for sendo explorada.
  const { error: logErr } = await supabase
    .from('delivery_webhook_logs')
    .insert({
      canal: '99FOOD',
      event_type: payload?.type ?? payload?.event_type ?? payload?.action ?? 'unknown',
      payload: payload,
      received_at: new Date().toISOString(),
    })

  if (logErr) {
    log('⚠️', `Erro ao salvar log: ${logErr.message}`)
  }

  // ─── Processar eventos de status da loja ─────────────────────────────────
  // Os nomes dos eventos podem variar dependendo da documentação da 99Food.
  // Registramos tudo no log e processamos os eventos conhecidos.
  const eventType = (
    payload?.type ??
    payload?.event_type ??
    payload?.action ??
    ''
  ).toLowerCase()

  // Eventos de status da loja (aberta/fechada/pausada)
  if (
    eventType.includes('store') ||
    eventType.includes('shop') ||
    eventType.includes('merchant') ||
    eventType.includes('loja')
  ) {
    log('🏪', `Evento de loja detectado: ${eventType}`)

    const status = inferStoreStatus(payload)
    if (status) {
      const { error: upsertErr } = await supabase
        .from('lojas_delivery_status')
        .upsert({
          canal: '99FOOD',
          status: status.status,
          motivo_pausa: status.reason,
          ultima_verificacao: new Date().toISOString(),
          alerta_ativo: status.status !== 'OPEN',
          mensagem_alerta: status.status !== 'OPEN'
            ? `99Food: Loja ${status.status === 'PAUSED' ? 'pausada' : 'fechada'}${status.reason ? ' — ' + status.reason : ''}`
            : null,
        }, { onConflict: 'canal' })

      if (upsertErr) log('❌', `Erro upsert status: ${upsertErr.message}`)
      else log('✅', `Status da loja atualizado: ${status.status}`)
    }
  }

  // Eventos de pedido — logamos para futuro processamento
  if (
    eventType.includes('order') ||
    eventType.includes('pedido')
  ) {
    log('📦', `Evento de pedido: ${eventType}`)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ─── Inferir status da loja a partir do payload ──────────────────────────────
// A 99Food pode usar diferentes formatos de payload. Esta função tenta extrair
// o status independente do formato, e será refinada conforme os logs reais.

function inferStoreStatus(payload: any): { status: string; reason: string | null } | null {
  // Tenta extrair de campos comuns
  const rawStatus = (
    payload?.status ??
    payload?.store_status ??
    payload?.shop_status ??
    payload?.data?.status ??
    ''
  ).toString().toUpperCase()

  if (!rawStatus) return null

  if (['OPEN', 'ONLINE', 'AVAILABLE', 'ACTIVE', 'ABERTA'].includes(rawStatus)) {
    return { status: 'OPEN', reason: null }
  }

  if (['CLOSED', 'OFFLINE', 'UNAVAILABLE', 'INACTIVE', 'FECHADA'].includes(rawStatus)) {
    return { status: 'CLOSED', reason: payload?.reason ?? payload?.motivo ?? null }
  }

  if (['PAUSED', 'BUSY', 'PAUSADA'].includes(rawStatus)) {
    return { status: 'PAUSED', reason: payload?.reason ?? payload?.motivo ?? null }
  }

  // Status desconhecido — registra mas não atualiza
  log('⚠️', `Status desconhecido: ${rawStatus}`)
  return null
}
