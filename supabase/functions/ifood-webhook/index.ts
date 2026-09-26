import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.log(`${emoji} [ifood-webhook] ${msg}`)
}

// ─── Handler principal ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Health-check / verificação de URL pelo iFood
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'ifood-webhook',
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

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

  // ─── Registrar evento no log ─────────────────────────────────────────────
  const { error: logErr } = await supabase
    .from('delivery_webhook_logs')
    .insert({
      canal: 'IFOOD',
      event_type: payload?.code ?? payload?.event_type ?? payload?.type ?? 'unknown',
      payload: payload,
      received_at: new Date().toISOString(),
    })

  if (logErr) {
    log('⚠️', `Erro ao salvar log: ${logErr.message}`)
  }

  // ─── Processar eventos de merchant status ────────────────────────────────
  // O iFood envia eventos com o campo "code" indicando o tipo.
  // Exemplos: MERCHANT_STATUS, ORDER_PLACED, ORDER_CONFIRMED, etc.
  const eventCode = (payload?.code ?? '').toUpperCase()

  if (eventCode.includes('MERCHANT') || eventCode.includes('STATUS')) {
    log('🏪', `Evento de merchant: ${eventCode}`)

    const available = payload?.available ?? payload?.data?.available
    const state = payload?.state ?? payload?.data?.state ?? ''

    let status = 'OPEN'
    let reason: string | null = null

    if (available === false) {
      status = 'CLOSED'
      reason = state || null

      // Diferenciar pausa emergencial de fechamento normal
      if (
        state?.toUpperCase()?.includes('PAUSE') ||
        state?.toUpperCase()?.includes('EMERGENCY')
      ) {
        status = 'PAUSED'
      }
    }

    const { error: upsertErr } = await supabase
      .from('lojas_delivery_status')
      .upsert({
        canal: 'IFOOD',
        status,
        motivo_pausa: reason,
        ultima_verificacao: new Date().toISOString(),
        alerta_ativo: status !== 'OPEN',
        mensagem_alerta: status !== 'OPEN'
          ? `iFood: Loja ${status === 'PAUSED' ? 'em pausa emergencial' : 'fechada'}${reason ? ' — ' + reason : ''}`
          : null,
      }, { onConflict: 'canal' })

    if (upsertErr) log('❌', `Erro upsert status: ${upsertErr.message}`)
    else log('✅', `Status iFood atualizado: ${status}`)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
