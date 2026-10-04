import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Módulo Merchant do iFood (homologação + operação): loja, status, pausas e horários.
// Credenciais só por Supabase secrets: IFOOD_CLIENT_ID, IFOOD_CLIENT_SECRET (e, opcional, IFOOD_MERCHANT_ID).
// Chamada autenticada (verify_jwt) — o chamador precisa ser usuário ativo do Comercial ou da Loja.
//   leitura: qualquer usuário ativo      pausar/reabrir: admin/atendente      horários: admin
const BASE = 'https://merchant-api.ifood.com.br'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(public status: number, msg: string, public detalhe?: unknown) { super(msg) }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// ── Token do iFood (vale ~3h; reaproveita enquanto o isolate continuar vivo) ─────────────
let tokenCache: { token: string; exp: number } | null = null

async function ifoodToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token
  const clientId = Deno.env.get('IFOOD_CLIENT_ID')
  const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new HttpError(500, 'Secrets IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET não configurados')
  const res = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grantType: 'client_credentials', clientId, clientSecret }).toString(),
  })
  if (!res.ok) throw new HttpError(502, `iFood autenticação → HTTP ${res.status}`, (await res.text()).slice(0, 300))
  const j = await res.json()
  if (!j.accessToken) throw new HttpError(502, 'Token do iFood ausente na resposta')
  tokenCache = { token: j.accessToken, exp: Date.now() + (Number(j.expiresIn) || 10800) * 1000 }
  return j.accessToken
}

async function ifood(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const token = await ifoodToken()
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = text
  try { data = text ? JSON.parse(text) : null } catch { /* mantém texto */ }
  if (!res.ok) throw new HttpError(502, `iFood ${method} ${path} → HTTP ${res.status}`, data)
  return { status: res.status, data }
}

async function merchantId(pedido?: string): Promise<string> {
  const fixo = pedido || Deno.env.get('IFOOD_MERCHANT_ID')
  if (fixo) return fixo
  const { data } = await ifood('GET', '/merchant/v1.0/merchants')
  if (!Array.isArray(data) || data.length === 0) throw new HttpError(404, 'Nenhuma loja liberada para este aplicativo no iFood')
  return data[0].id as string
}

// ── Quem está chamando ─────────────────────────────────────────────────────────────────
type Papel = 'admin' | 'atendente' | 'leitura'
async function chamador(req: Request): Promise<{ id: string; nome: string; papel: Papel }> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await admin.auth.getUser(jwt)
  if (!user) throw new HttpError(401, 'Sessão inválida')

  const [crm, loja] = await Promise.all([
    admin.from('crm_users').select('nome, role, ativo').eq('id', user.id).maybeSingle(),
    admin.from('loja_users').select('nome, role, ativo').eq('id', user.id).maybeSingle(),
  ])
  const c = crm.data?.ativo ? crm.data : null
  const l = loja.data?.ativo ? loja.data : null
  if (!c && !l) throw new HttpError(403, 'Usuário sem acesso')
  const papeis: string[] = [c?.role, l?.role].filter(Boolean) as string[]
  const papel: Papel = papeis.includes('admin') ? 'admin' : papeis.includes('atendente') ? 'atendente' : 'leitura'
  return { id: user.id, nome: (c?.nome ?? l?.nome ?? user.email ?? 'usuário') as string, papel }
}

function exige(papel: Papel, minimo: 'atendente' | 'admin', acao: string) {
  const ordem: Record<Papel, number> = { leitura: 0, atendente: 1, admin: 2 }
  if (ordem[papel] < ordem[minimo]) throw new HttpError(403, `Sem permissão para ${acao}`)
}

// ── Status → lojas_delivery_status (o dashboard e o App Loja leem dali) ─────────────────
async function sincronizarStatus(mid: string) {
  const { data } = await ifood('GET', `/merchant/v1.0/merchants/${mid}/status`)
  let aberta = false
  let pausada = false
  let motivo: string | null = null
  if (Array.isArray(data)) {
    const delivery = data.find((op: any) => String(op.operation).toUpperCase() === 'DELIVERY')
    if (delivery?.state === 'OK' && delivery?.available !== false) aberta = true
    else {
      const vals: any[] = Array.isArray(delivery?.validations) ? delivery.validations : []
      const pausa = vals.find(v => String(v?.code).includes('unavailabilities') && v?.state !== 'OK')
      pausada = !!pausa || delivery?.reopenable?.type === 'UNAVAILABILITY'
      const falha = pausa ?? vals.find(v => v?.state && v.state !== 'OK')
      motivo = [falha?.message?.title ?? delivery?.message?.title, falha?.message?.subtitle].filter(Boolean).join(' — ')
        || delivery?.state || 'Loja fechada no iFood'
    }
  }
  const status = aberta ? 'OPEN' : pausada ? 'PAUSED' : 'CLOSED'
  const agora = new Date().toISOString()
  await admin.from('lojas_delivery_status').upsert({
    canal: 'IFOOD', status,
    motivo_pausa: motivo,
    ultima_verificacao: agora,
    alerta_ativo: !aberta,
    mensagem_alerta: !aberta ? `iFood: Loja ${pausada ? 'em pausa' : 'fechada'}${motivo ? ' — ' + motivo : ''}` : null,
    updated_at: agora,
  }, { onConflict: 'canal' })
  return { status, motivo, bruto: data }
}

// O iFood lê start/end das pausas como horário LOCAL sem fuso; a loja (Goiânia) segue Brasília.
// Testado: com fuso do endereço do merchant de teste (AC) a pausa foi rejeitada como "no passado".
const FUSO = 'America/Sao_Paulo'

/** "2026-10-03T20:07:59" no fuso informado (formato sem offset que o iFood espera). */
function horaLocal(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

// ── Horários ───────────────────────────────────────────────────────────────────────────
const DIAS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// ── Ações ──────────────────────────────────────────────────────────────────────────────
async function executar(acao: string, p: any, quem: { papel: Papel }) {
  switch (acao) {
    // Cenário 1 — loja vinculada, detalhes e disponibilidade
    case 'merchants':
      return (await ifood('GET', '/merchant/v1.0/merchants')).data
    case 'detalhes': {
      const mid = await merchantId(p.merchantId)
      return (await ifood('GET', `/merchant/v1.0/merchants/${mid}`)).data
    }
    case 'status': {
      const mid = await merchantId(p.merchantId)
      return { merchantId: mid, ...(await sincronizarStatus(mid)) }
    }

    // Cenário 2 — pausas
    case 'pausas': {
      const mid = await merchantId(p.merchantId)
      return (await ifood('GET', `/merchant/v1.0/merchants/${mid}/interruptions`)).data
    }
    case 'pausar': {
      exige(quem.papel, 'atendente', 'pausar a loja')
      const mid = await merchantId(p.merchantId)
      const minutos = Math.round(Number(p.minutos))
      if (!Number.isFinite(minutos) || minutos < 1 || minutos > 24 * 60) throw new HttpError(400, 'Informe a duração da pausa em minutos (1 a 1440)')
      const inicio = new Date()
      const fim = new Date(inicio.getTime() + minutos * 60_000)
      const r = await ifood('POST', `/merchant/v1.0/merchants/${mid}/interruptions`, {
        description: String(p.motivo || 'Pausa pelo CRM Cantina').slice(0, 100),
        start: horaLocal(inicio, FUSO),
        end: horaLocal(fim, FUSO),
      })
      await new Promise(r => setTimeout(r, 1500))
      const st = await sincronizarStatus(mid)
      return { pausa: r.data, status: st.status }
    }
    case 'reabrir': {
      exige(quem.papel, 'atendente', 'reabrir a loja')
      const mid = await merchantId(p.merchantId)
      let ids: string[]
      if (p.id) ids = [String(p.id)]
      else {
        const { data } = await ifood('GET', `/merchant/v1.0/merchants/${mid}/interruptions`)
        ids = (Array.isArray(data) ? data : []).map((i: any) => i.id)
      }
      for (const id of ids) {
        try {
          await ifood('DELETE', `/merchant/v1.0/merchants/${mid}/interruptions/${id}`)
        } catch (e: any) {
          if (e?.detalhe?.error?.code === 'RecentlyCreatedInterruption') {
            throw new HttpError(409, 'O iFood só permite remover a pausa alguns instantes depois de criada. Tente de novo em instantes.', e.detalhe)
          }
          throw e
        }
      }
      await new Promise(r => setTimeout(r, 1500))
      const st = await sincronizarStatus(mid)
      return { removidas: ids.length, status: st.status }
    }

    // Cenário 3 — horários de funcionamento
    case 'horarios': {
      const mid = await merchantId(p.merchantId)
      return (await ifood('GET', `/merchant/v1.0/merchants/${mid}/opening-hours`)).data
    }
    case 'definir-horarios': {
      exige(quem.papel, 'admin', 'alterar os horários')
      const mid = await merchantId(p.merchantId)
      // p.turnos: [{ dia: 'SATURDAY', inicio: '10:00', fim: '19:00' }]
      const turnos = Array.isArray(p.turnos) ? p.turnos : []
      if (turnos.length === 0) throw new HttpError(400, 'Informe ao menos um turno')
      const shifts = turnos.map((t: any) => {
        const dia = String(t.dia).toUpperCase()
        const [h1, m1] = String(t.inicio).split(':').map(Number)
        const [h2, m2] = String(t.fim).split(':').map(Number)
        const dur = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0))
        if (!DIAS.includes(dia) || !Number.isFinite(dur) || dur <= 0) throw new HttpError(400, `Turno inválido: ${JSON.stringify(t)}`)
        return { dayOfWeek: dia, start: `${String(h1).padStart(2, '0')}:${String(m1 || 0).padStart(2, '0')}:00`, duration: dur }
      })
      const r = await ifood('PUT', `/merchant/v1.0/merchants/${mid}/opening-hours`, { storeId: mid, shifts })
      return { enviado: shifts, resposta: r.data }
    }
    default:
      throw new HttpError(400, `Ação desconhecida: ${acao}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const resp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  let acao = '?'
  let quem: { id: string; nome: string; papel: Papel } | null = null
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST')
    const p = await req.json().catch(() => ({}))
    acao = String(p.action ?? '')
    quem = await chamador(req)
    const resultado = await executar(acao, p, quem)

    // Auditoria só das ações que mudam algo na loja
    if (['pausar', 'reabrir', 'definir-horarios'].includes(acao)) {
      await admin.from('ifood_acoes_log').insert({ user_id: quem.id, nome: quem.nome, acao, detalhe: { ...p, action: undefined }, ok: true, resposta: resultado })
    }
    return resp({ ok: true, action: acao, resultado })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    console.error(`ifood-merchant[${acao}]:`, e?.message ?? e, e?.detalhe ?? '')
    if (quem && ['pausar', 'reabrir', 'definir-horarios'].includes(acao)) {
      await admin.from('ifood_acoes_log').insert({ user_id: quem.id, nome: quem.nome, acao, detalhe: null, ok: false, resposta: { erro: e?.message, detalhe: e?.detalhe ?? null } })
    }
    return resp({ ok: false, action: acao, erro: e?.message ?? String(e), detalhe: e?.detalhe ?? null }, status)
  }
})
