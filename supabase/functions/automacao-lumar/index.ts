import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

interface Config {
  id: string
  nome: string
  ativo: boolean
  hora_envio: string
  mensagem_template: string
  msgs_por_lote: number
  pausa_entre_msgs_ms: number
  pausa_min_ms: number
  pausa_max_ms: number
  limite_diario: number
}

interface FilaItem {
  id: string
  cliente_nome: string
  telefone: string
  mensagem: string | null
  tentativas: number
}

function nk(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Retorna a data de hoje no fuso BRT (UTC-3) no formato YYYY-MM-DD
function hojeISO(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function diaSemanaHoje(): number {
  return new Date(Date.now() - 3 * 3600_000).getUTCDay()
}

function normalizaTelefone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  if (digits.length === 12 || digits.length === 13) return digits
  return null
}

function primeiroNome(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || nome
}

function montaMensagem(template: string, nome: string): string {
  return template.replace(/\{CLIENTE\}/g, primeiroNome(nome))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const json = (data: unknown, status = 200) => new Response(
    JSON.stringify(data),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )

  let body: { type?: string; numero?: string; mensagem?: string } = {}
  try { body = await req.json() } catch { /* no body */ }
  const type = body.type ?? 'status'

  const { data: cfgData, error: cfgErr } = await supabase
    .from('automacao_config').select('*').eq('nome', 'LUMAR').maybeSingle()
  if (cfgErr || !cfgData) return json({ ok: false, error: 'Config não encontrada' }, 500)
  const cfg = cfgData as Config

  const hoje = hojeISO()
  const dow = diaSemanaHoje()
  const fimDeSemana = dow === 0 || dow === 6
  const diaNome = DIAS_SEMANA[dow]

  async function logar(reg: {
    cliente_nome?: string | null
    telefone?: string | null
    mensagem?: string | null
    status: string
    erro?: string | null
  }) {
    await supabase.from('automacao_logs').insert({
      automacao: 'LUMAR',
      data_exec: hoje,
      cliente_nome: reg.cliente_nome ?? null,
      telefone: reg.telefone ?? null,
      mensagem: reg.mensagem ?? null,
      status: reg.status,
      erro: reg.erro ?? null,
    })
  }

  async function clientesDoDia() {
    const { data } = await supabase
      .from('crm_clients')
      .select('nome, telefone, dia_entrega, mensagem, ativo, rota, turno')
      .eq('ativo', true)
    const rows = (data ?? []) as Array<{
      nome: string; telefone: string | null; dia_entrega: string | null
      mensagem: string | null; rota: string | null; turno: string | null
    }>
    return rows.filter((c) => {
      if (nk(c.mensagem ?? '') !== 'sim') return false
      if (!c.dia_entrega) return false
      const dias = c.dia_entrega.split(',').map((d) => nk(d))
      return dias.some((d) => d.startsWith(diaNome) || diaNome.startsWith(d))
    })
  }

  async function enviarDigisac(numero: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
    const token = Deno.env.get('DIGISAC_TOKEN')
    const serviceId = Deno.env.get('DIGISAC_SERVICE_ID')
    const baseUrl = Deno.env.get('DIGISAC_BASE_URL')
    if (!token || !serviceId || !baseUrl) {
      return { ok: false, erro: 'Credenciais Digisac ausentes (DIGISAC_TOKEN, DIGISAC_SERVICE_ID, DIGISAC_BASE_URL)' }
    }
    try {
      const res = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: texto,
          number: numero,
          serviceId,
          origin: 'bot',
          dontOpenticket: true,
        }),
      })
      if (!res.ok) {
        const detalhe = await res.text().catch(() => '')
        return { ok: false, erro: `HTTP ${res.status} ${detalhe.slice(0, 200)}` }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'Erro de rede' }
    }
  }

  // Cria a fila do dia se ainda não existir. Retorna quantos itens foram inseridos (0 se já existia).
  async function criarFilaSeNecessario(): Promise<{ criados: number; erro?: string }> {
    const { count: jaExiste } = await supabase
      .from('automacao_fila')
      .select('id', { count: 'exact', head: true })
      .eq('automacao', 'LUMAR')
      .eq('data_exec', hoje)
    if ((jaExiste ?? 0) > 0) return { criados: 0 }

    const clientes = await clientesDoDia()
    const limitados = clientes.slice(0, cfg.limite_diario)
    const itens = limitados
      .map((c) => {
        const tel = normalizaTelefone(c.telefone ?? '')
        if (!tel) return null
        return { automacao: 'LUMAR', data_exec: hoje, cliente_nome: c.nome, telefone: tel, mensagem: montaMensagem(cfg.mensagem_template, c.nome), status: 'pendente' }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    if (itens.length === 0) {
      await logar({ status: 'sistema', erro: 'Nenhum cliente válido para hoje' })
      return { criados: 0, erro: 'Nenhum cliente com entrega hoje' }
    }
    const { error: insErr } = await supabase.from('automacao_fila').insert(itens)
    if (insErr) return { criados: 0, erro: insErr.message }
    await logar({ status: 'sistema', erro: `Fila criada com ${itens.length} itens` })
    return { criados: itens.length }
  }

  // Processa um lote da fila pendente. Retorna resultado do lote.
  async function processarLote(): Promise<{ processados: number; enviados: number; erros: number; restantes: number }> {
    const { count: jaEnviados } = await supabase
      .from('automacao_logs')
      .select('id', { count: 'exact', head: true })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'enviado')
    if ((jaEnviados ?? 0) >= cfg.limite_diario) {
      return { processados: 0, enviados: 0, erros: 0, restantes: 0 }
    }

    const { data: pendentes } = await supabase
      .from('automacao_fila').select('*')
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'pendente')
      .order('created_at', { ascending: true }).limit(cfg.msgs_por_lote)
    const lote = (pendentes ?? []) as FilaItem[]

    const { count: restantes } = await supabase
      .from('automacao_fila').select('id', { count: 'exact', head: true })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'pendente')

    if (lote.length === 0) return { processados: 0, enviados: 0, erros: 0, restantes: restantes ?? 0 }

    let enviados = 0, erros = 0
    for (let i = 0; i < lote.length; i++) {
      const item = lote[i]
      const texto = item.mensagem ?? montaMensagem(cfg.mensagem_template, item.cliente_nome)
      const res = await enviarDigisac(item.telefone, texto)
      if (res.ok) {
        enviados++
        await supabase.from('automacao_fila').update({ status: 'enviado', processed_at: new Date().toISOString(), tentativas: item.tentativas + 1 }).eq('id', item.id)
        await logar({ cliente_nome: item.cliente_nome, telefone: item.telefone, mensagem: texto, status: 'enviado' })
      } else {
        erros++
        await supabase.from('automacao_fila').update({ status: 'erro', erro: res.erro, processed_at: new Date().toISOString(), tentativas: item.tentativas + 1 }).eq('id', item.id)
        await logar({ cliente_nome: item.cliente_nome, telefone: item.telefone, mensagem: texto, status: 'erro', erro: res.erro })
      }
      if (i < lote.length - 1) await sleep(cfg.pausa_entre_msgs_ms)
    }

    const { count: restantesApos } = await supabase
      .from('automacao_fila').select('id', { count: 'exact', head: true })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'pendente')
    return { processados: lote.length, enviados, erros, restantes: restantesApos ?? 0 }
  }

  // ── status ───────────────────────────────────────────────────────────────────
  if (type === 'status') {
    const { data: fila } = await supabase
      .from('automacao_fila').select('status').eq('automacao', 'LUMAR').eq('data_exec', hoje)
    const contagem: Record<string, number> = {}
    for (const f of (fila ?? []) as Array<{ status: string }>) {
      contagem[f.status] = (contagem[f.status] ?? 0) + 1
    }
    const { count: enviadosHoje } = await supabase
      .from('automacao_logs').select('id', { count: 'exact', head: true })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'enviado')
    return json({ ok: true, config: cfg, hoje, fim_de_semana: fimDeSemana, fila: contagem, enviados_hoje: enviadosHoje ?? 0 })
  }

  // ── simular ──────────────────────────────────────────────────────────────────
  if (type === 'simular') {
    const clientes = await clientesDoDia()
    const lista = clientes.map((c) => {
      const tel = normalizaTelefone(c.telefone ?? '')
      return { cliente_nome: c.nome, telefone: c.telefone, telefone_normalizado: tel, rota: c.rota, turno: c.turno, valido: !!tel }
    })
    return json({
      ok: true, hoje, fim_de_semana: fimDeSemana, total: lista.length,
      validos: lista.filter((l) => l.valido).length,
      mensagem_exemplo: lista[0] ? montaMensagem(cfg.mensagem_template, lista[0].cliente_nome) : montaMensagem(cfg.mensagem_template, 'Cliente'),
      clientes: lista,
    })
  }

  // ── executar (chamado pelo pg_cron a cada 5 min, 08:00–09:55 UTC = 05:00–06:55 BRT) ──
  if (type === 'executar') {
    if (!cfg.ativo) return json({ ok: false, mensagem: 'Automação INATIVA — sem envios.' })
    if (fimDeSemana) return json({ ok: true, mensagem: 'Fim de semana — sem envios.' })

    const { data: feriado } = await supabase
      .from('automacao_feriados').select('descricao').eq('data', hoje).maybeSingle()
    if (feriado) return json({ ok: true, mensagem: `Feriado (${(feriado as { descricao?: string }).descricao ?? ''}) — sem envios.` })

    const { criados, erro: erroFila } = await criarFilaSeNecessario()
    if (erroFila && criados === 0) return json({ ok: true, fila_criada: 0, mensagem: erroFila })

    const loteResult = await processarLote()
    return json({ ok: true, fila_criada: criados, ...loteResult })
  }

  // ── iniciar (manual — cria fila via painel) ──────────────────────────────────
  if (type === 'iniciar') {
    if (!cfg.ativo) return json({ ok: false, error: 'Automação está INATIVA. Ative-a no painel para iniciar envios.' })
    if (fimDeSemana) return json({ ok: false, error: 'Hoje é fim de semana — sem envios.' })
    const { data: feriado } = await supabase
      .from('automacao_feriados').select('descricao').eq('data', hoje).maybeSingle()
    if (feriado) return json({ ok: false, error: `Hoje é feriado (${(feriado as { descricao?: string }).descricao ?? 'sem descrição'}) — sem envios.` })

    const { criados, erro: erroFila } = await criarFilaSeNecessario()
    if (erroFila) return json({ ok: false, error: erroFila }, criados === 0 ? 400 : 200)
    if (criados === 0) return json({ ok: false, error: 'Fila de hoje já foi criada.' })
    return json({ ok: true, fila_criada: criados })
  }

  // ── processar (manual — dispara um lote via painel) ──────────────────────────
  if (type === 'processar') {
    if (!cfg.ativo) return json({ ok: false, error: 'Automação está INATIVA — envios reais recusados.' })
    const loteResult = await processarLote()
    return json({ ok: true, ...loteResult })
  }

  // ── cancelar (para emergencial — zera a fila pendente) ───────────────────────
  if (type === 'cancelar') {
    const { data: cancelados, error: cancErr } = await supabase
      .from('automacao_fila')
      .update({ status: 'pulado', processed_at: new Date().toISOString() })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'pendente')
      .select('id')
    if (cancErr) return json({ ok: false, error: cancErr.message }, 500)
    const n = (cancelados ?? []).length
    await logar({ status: 'sistema', erro: `${n} envios pendentes cancelados` })
    return json({ ok: true, cancelados: n })
  }

  // ── reenviar-erros (reseta itens com erro para pendente) ────────────────────
  if (type === 'reenviar-erros') {
    const { data: resetados, error: resetErr } = await supabase
      .from('automacao_fila')
      .update({ status: 'pendente', erro: null, processed_at: null })
      .eq('automacao', 'LUMAR').eq('data_exec', hoje).eq('status', 'erro')
      .select('id')
    if (resetErr) return json({ ok: false, error: resetErr.message }, 500)
    const n = (resetados ?? []).length
    await logar({ status: 'sistema', erro: `${n} itens com erro resetados para pendente` })
    return json({ ok: true, resetados: n })
  }

  // ── teste (envia mensagem real para número específico) ───────────────────────
  if (type === 'teste') {
    const tel = normalizaTelefone(body.numero ?? '')
    if (!tel) return json({ ok: false, error: 'Número inválido. Informe DDD + número (ex: 62999887766).' }, 400)
    const texto = body.mensagem?.trim() ? body.mensagem.trim() : montaMensagem(cfg.mensagem_template, 'Teste')
    const res = await enviarDigisac(tel, texto)
    await logar({ cliente_nome: '🧪 TESTE', telefone: tel, mensagem: texto, status: res.ok ? 'enviado' : 'erro', erro: res.erro ?? null })
    return json({ ok: res.ok, erro: res.erro, numero_normalizado: tel, mensagem_enviada: texto })
  }

  return json({ ok: false, error: 'type deve ser: executar | iniciar | processar | simular | status | cancelar | reenviar-erros | teste' }, 400)
})
