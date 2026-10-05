import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// clientSecret do aplicativo no Portal do Desenvolvedor iFood (Supabase secret IFOOD_CLIENT_SECRET).
// O iFood assina cada entrega com HMAC-SHA256(corpo bruto, clientSecret) no header X-IFood-Signature.
const CLIENT_SECRET = Deno.env.get('IFOOD_CLIENT_SECRET') ?? ''

function log(emoji: string, msg: string) {
  console.log(`${emoji} [ifood-webhook] ${msg}`)
}

async function assinaturaValida(rawBody: string, recebida: string | null): Promise<boolean> {
  if (!recebida) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(CLIENT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  const esperada = Array.from(mac, b => b.toString(16).padStart(2, '0')).join('')
  const a = esperada
  const b = recebida.trim().toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  // Health-check
  if (req.method === 'GET') {
    return json({ status: 'ok', service: 'ifood-webhook', assinatura: CLIENT_SECRET ? 'ativa' : 'desativada', timestamp: new Date().toISOString() })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const raw = await req.text()

  // Sem o secret configurado o endpoint continua aceitando (como antes), mas avisa no log.
  if (CLIENT_SECRET) {
    if (!(await assinaturaValida(raw, req.headers.get('x-ifood-signature')))) {
      log('🚫', 'Assinatura X-IFood-Signature ausente ou inválida — evento rejeitado')
      return json({ error: 'invalid signature' }, 401)
    }
  } else {
    log('⚠️', 'IFOOD_CLIENT_SECRET não configurado: assinatura NÃO está sendo validada')
  }

  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    log('❌', 'Payload inválido (não é JSON)')
    return json({ error: 'bad request' }, 400)
  }

  // O iFood entrega um array de eventos; aceitamos também um evento único.
  const todos: any[] = Array.isArray(payload) ? payload : [payload]

  // KEEPALIVE é só o batimento do iFood (~a cada 30 s): responde 202 e não grava, senão o log enche.
  const eventos = todos.filter(ev => String(ev?.fullCode ?? ev?.code ?? '').toUpperCase() !== 'KEEPALIVE')
  if (eventos.length === 0) return json({ ok: true }, 202)
  log('📥', `${eventos.length} evento(s): ${raw.substring(0, 500)}`)

  const agora = new Date().toISOString()
  const { error: logErr } = await supabase.from('delivery_webhook_logs').insert(
    eventos.map(ev => ({
      canal: 'IFOOD',
      event_type: ev?.fullCode ?? ev?.code ?? ev?.event_type ?? ev?.type ?? 'unknown',
      payload: ev,
      received_at: agora,
    })),
  )
  if (logErr) log('⚠️', `Erro ao salvar log: ${logErr.message}`)

  // Eventos do módulo Merchant (abertura/fechamento/pausa da loja)
  for (const ev of eventos) {
    const code = String(ev?.fullCode ?? ev?.code ?? '').toUpperCase()
    if (!code.startsWith('MERCHANT')) continue

    const available = ev?.available ?? ev?.metadata?.available ?? ev?.data?.available
    const state = String(ev?.state ?? ev?.metadata?.state ?? ev?.data?.state ?? '')

    let status = 'OPEN'
    let reason: string | null = null
    if (available === false) {
      status = 'CLOSED'
      reason = state || null
      if (/PAUSE|EMERGENCY/i.test(state)) status = 'PAUSED'
    }

    const { error: upsertErr } = await supabase.from('lojas_delivery_status').upsert({
      canal: 'IFOOD',
      status,
      motivo_pausa: reason,
      ultima_verificacao: agora,
      alerta_ativo: status !== 'OPEN',
      mensagem_alerta: status !== 'OPEN'
        ? `iFood: Loja ${status === 'PAUSED' ? 'em pausa emergencial' : 'fechada'}${reason ? ' — ' + reason : ''}`
        : null,
      updated_at: agora,
    }, { onConflict: 'canal' })
    if (upsertErr) log('❌', `Erro upsert status: ${upsertErr.message}`)
    else log('✅', `Status iFood atualizado: ${status}`)
  }

  // O iFood espera 202 em até 5 s; falhas fazem ele reenviar o evento.
  return json({ ok: true }, 202)
})
