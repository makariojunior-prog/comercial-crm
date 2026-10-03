import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Credenciais do aplicativo iFood: SOMENTE por Supabase secrets (nunca no código — o repositório é público).
//   supabase secrets set IFOOD_CLIENT_ID=... IFOOD_CLIENT_SECRET=...
// IFOOD_MERCHANT_ID é opcional: sem ele usa a primeira loja liberada para o aplicativo.
const BASE = 'https://merchant-api.ifood.com.br'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

class IfoodError extends Error {}

async function ifood(path: string, token: string) {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new IfoodError(`iFood ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const clientId = Deno.env.get('IFOOD_CLIENT_ID')
    const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('Secrets IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET não configurados')

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. Autenticação (client_credentials, aplicativo centralizado)
    const params = new URLSearchParams({ grantType: 'client_credentials', clientId, clientSecret })
    const authRes = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!authRes.ok) throw new IfoodError(`iFood autenticação → HTTP ${authRes.status}: ${(await authRes.text()).slice(0, 300)}`)
    const token = (await authRes.json()).accessToken
    if (!token) throw new IfoodError('Token do iFood ausente na resposta')

    // 2. Loja
    let merchantId = Deno.env.get('IFOOD_MERCHANT_ID')
    if (!merchantId) {
      const merchants = await ifood('/merchant/v1.0/merchants', token)
      if (!Array.isArray(merchants) || merchants.length === 0) throw new IfoodError('Nenhuma loja liberada para este aplicativo no iFood')
      merchantId = merchants[0].id as string
    }

    // 3. Status operacional (lista de operações: DELIVERY, TAKEOUT…)
    const statusData = await ifood(`/merchant/v1.0/merchants/${merchantId}/status`, token)
    let aberta = false
    let motivo: string | null = null
    if (Array.isArray(statusData)) {
      // O iFood devolve operation em minúsculas ("delivery"); compara sem diferenciar caixa.
      const delivery = statusData.find((op: any) => String(op.operation).toUpperCase() === 'DELIVERY')
      if (delivery?.state === 'OK' && delivery?.available !== false) aberta = true
      else motivo = delivery?.message?.title || delivery?.state || 'Loja fechada no iFood'
    }
    const status = aberta ? 'OPEN' : 'CLOSED'

    // 4. Grava para o dashboard
    const agora = new Date().toISOString()
    const { error } = await supabase.from('lojas_delivery_status').upsert({
      canal: 'IFOOD',
      status,
      motivo_pausa: motivo,
      ultima_verificacao: agora,
      alerta_ativo: !aberta,
      mensagem_alerta: !aberta ? `iFood: Loja fechada/pausada${motivo ? ' — ' + motivo : ''}` : null,
      updated_at: agora,
    }, { onConflict: 'canal' })
    if (error) throw error

    return new Response(JSON.stringify({ success: true, merchantId, status, statusData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('sync-ifood-status:', err)
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: err instanceof IfoodError ? 502 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
