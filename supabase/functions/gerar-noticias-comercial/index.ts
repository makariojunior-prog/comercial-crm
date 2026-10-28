import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Gera as notícias da barra do Comercial (lida pelos outros apps via crm_noticias_feed).
// Junta o que aconteceu nos últimos 7 dias (negócios, visitas, demandas a outros setores,
// ocorrências da logística, notas do comitê e vendas do varejo), aplica os aprendizados
// cadastrados no módulo IA e publica os itens com relevância >= limiar.
//
// Acesso (verify_jwt=false por causa do pg_cron): header x-cron-secret igual ao segredo do
// vault (crm_noticias_cron_secret) OU sessão de Administrador do Comercial.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}
// Modelo padrão; para trocar sem novo deploy, cadastre o secret COMERCIAL_GEMINI_MODEL.
const GEMINI_MODEL = Deno.env.get('COMERCIAL_GEMINI_MODEL') || 'gemini-3.8-flash'
const CATEGORIAS = ['negocio', 'visita', 'problema', 'logistica', 'varejo', 'demanda', 'destaque'] as const

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const corta = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/** Data yyyy-MM-dd no horário de Brasília (UTC−3), deslocada em `dias`. */
const diaBRT = (dias = 0) => new Date(Date.now() - 3 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10)

const INSTRUCOES = `Você é o editor da barra de notícias interna do grupo Cantina em Casa (varejo/delivery de panificados congelados) e Lumar Alimentos (fábrica, atacado). A barra passa no topo dos apps do Financeiro, Compras, RH, Produção e na TV da loja, para que toda a empresa saiba o que está acontecendo no Comercial.

Escreva em português do Brasil, tom jornalístico curto e profissional, sem emojis e sem exageros.
- titulo: até 90 caracteres, informativo (quem/o quê). Ex.: "Padaria Pão Nobre fecha pedido recorrente de pão de queijo".
- texto: 1 frase de até 220 caracteres com o essencial e, se houver, o que se espera dos outros setores.
- categoria: negocio | visita | problema | logistica | varejo | demanda | destaque.
- relevancia (1 a 5) para a EMPRESA INTEIRA:
  5 = muito importante (cliente grande fechado ou perdido, problema que afeta outros setores, meta batida);
  4 = importante (negócio ganho, demanda aberta para outro setor, ocorrência grave de entrega);
  3 = vale saber (avanço relevante de negociação, visita com sinal claro de compra, variação forte de vendas);
  2 = rotina com algum interesse; 1 = rotina sem interesse (não polui a barra).
Regras:
- Use só fatos presentes nos dados. Não invente números, nomes ou datas.
- Agrupe eventos parecidos em um item (ex.: "5 visitas de prospecção em Goiânia na semana").
- Não exponha dados pessoais (telefone, CPF) nem valores de comissão ou salário.
- Problemas e demandas para outros setores devem dizer qual setor e o que é preciso.
- Não repita itens que já estão na lista "mantidas" (editados manualmente).
- Gere no máximo {MAX} itens, do mais relevante ao menos relevante. Se a semana foi fraca, gere poucos.`

type Saida = { noticias: { titulo: string; texto: string; categoria: string; relevancia: number }[] }

/** Gemini, com a chave do secret COMERCIAL_GEMINI_API_KEY (cadastrado só para esta função). */
async function gerar(system: string, prompt: string): Promise<Saida & { modelo: string }> {
  const apiKey = Deno.env.get('COMERCIAL_GEMINI_API_KEY')
  if (!apiKey) throw new Error('COMERCIAL_GEMINI_API_KEY não configurada nos secrets do Supabase')

  const chamar = async (generationConfig: Record<string, unknown>) => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 100_000)
    try {
      return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: ctrl.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt + '\n\nResponda só com JSON no formato {"noticias":[{"titulo","texto","categoria","relevancia"}]}.' }] }],
          generationConfig,
        }),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw new Error(`Gemini (${GEMINI_MODEL}) não respondeu em 100 s`)
      throw e
    } finally { clearTimeout(timer) }
  }

  const base = { temperature: 0.3, maxOutputTokens: 16384, responseMimeType: 'application/json' }
  // Raciocínio curto: a notícia é um resumo, não precisa de cadeia longa de pensamento.
  let r = await chamar({ ...base, thinkingConfig: { thinkingLevel: 'low' } })
  if (r.status === 400) r = await chamar(base) // modelo sem esse parâmetro
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  const bloqueio = j?.promptFeedback?.blockReason
  if (bloqueio) throw new Error(`Gemini bloqueou o pedido (${bloqueio})`)
  const texto: string = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  const limpo = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  let saida: Saida
  try { saida = JSON.parse(limpo) as Saida } catch { throw new Error('Gemini devolveu um JSON inválido') }
  if (!Array.isArray(saida?.noticias)) throw new Error('Gemini não devolveu a lista de notícias')
  return { ...saida, modelo: GEMINI_MODEL }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Acesso ──
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  let autorizado = false
  if (cronHeader) {
    const { data: segredo } = await supabase.rpc('crm_noticias_cron_secret')
    autorizado = typeof segredo === 'string' && segredo.length > 0 && segredo === cronHeader
  } else {
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } }
    if (user) {
      const { data: perfil } = await supabase.from('crm_users').select('role, ativo').eq('id', user.id).maybeSingle()
      autorizado = !!perfil?.ativo && perfil.role === 'admin'
    }
  }
  if (!autorizado) return json({ ok: false, error: 'Sem permissão' }, 403)

  const { data: cfg } = await supabase.from('crm_noticias_config').select('*').eq('id', 1).maybeSingle()
  const forcar = new URL(req.url).searchParams.get('forcar') === '1'
  if (cfg && !cfg.ativo && !forcar) return json({ ok: true, ignorado: 'Geração desligada no módulo IA' })
  const limiar: number = cfg?.limiar_relevancia ?? 3
  const maxItens: number = cfg?.max_itens ?? 12

  const registrar = (status: string) =>
    supabase.from('crm_noticias_config').update({ ultima_execucao: new Date().toISOString(), ultimo_status: status }).eq('id', 1)

  try {
    const ini = diaBRT(-6), fim = diaBRT(0)
    const iniTs = `${ini}T00:00:00-03:00`

    const [hist, novos, visitas, demandas, ocorr, notas, varejo, mantidas, aprend, reuniao] = await Promise.all([
      supabase.from('crm_deal_history').select('deal_id, client_name, status_before, status_after, follow_up, updated_at, updated_by')
        .gte('updated_at', iniTs).order('updated_at'),
      supabase.from('deals').select('id, client_name, deal_type, status, interest, potential_notes, start_date, responsaveis, responsible, origem_negocio')
        .gte('start_date', ini),
      supabase.from('visits').select('client_name, visit_date, visit_type, local, report, demand, has_amostra, amostra_produtos, responsaveis, responsible')
        .eq('status', 'Realizada').gte('visit_date', ini).order('visit_date'),
      supabase.from('crm_comite_demandas').select('titulo, descricao, setor, tipo, prioridade, status, cliente_nome, created_at, resolvida_em, resolucao')
        .or(`status.in.(aberta,em_andamento),created_at.gte."${iniTs}",resolvida_em.gte."${iniTs}"`),
      supabase.from('log_ocorrencias').select('data, descricao, gravidade, status, cliente_nome, prejuizo, tipo:tipos_ocorrencia(nome)')
        .gte('data', ini).order('data'),
      supabase.from('crm_comite_notas').select('cliente_nome, texto, created_at').gte('created_at', iniTs),
      supabase.from('varejo_pedidos').select('data_entrega, valor_liquido, status_icon').gte('data_entrega', diaBRT(-13)).lte('data_entrega', fim),
      supabase.from('crm_noticias').select('titulo, texto').eq('editada', true).eq('publicada', true).eq('oculta', false).gt('valida_ate', new Date().toISOString()),
      supabase.from('crm_ia_aprendizados').select('tipo, texto').eq('ativo', true).order('created_at'),
      supabase.from('crm_comite_reunioes').select('semana_ini, ata, encaminhamentos').gte('realizada_em', ini).order('semana_ini', { ascending: false }).limit(1),
    ])
    const erro = [hist, novos, visitas, demandas, ocorr, notas, varejo, mantidas, aprend, reuniao].find(r => r.error)?.error
    if (erro) throw new Error(erro.message)

    // Negócios: novos + movimentados (com o estado atual)
    const idsMov = [...new Set((hist.data ?? []).map(h => h.deal_id))]
    const { data: movDeals } = idsMov.length
      ? await supabase.from('deals').select('id, client_name, deal_type, status').in('id', idsMov)
      : { data: [] as { id: string; client_name: string; deal_type: string | null; status: string | null }[] }
    const negocios = [
      ...(novos.data ?? []).map(d => ({
        cliente: d.client_name, tipo: d.deal_type, situacao: d.status, novo_em: d.start_date, origem: d.origem_negocio,
        responsaveis: (d.responsaveis?.length ? d.responsaveis : [d.responsible]).filter(Boolean).join(', '),
        interesse: corta([d.interest, d.potential_notes].filter(Boolean).join(' — '), 300),
      })),
      ...(movDeals ?? []).filter(d => !(novos.data ?? []).some(n => n.id === d.id)).map(d => ({ cliente: d.client_name, tipo: d.deal_type, situacao: d.status })),
    ]
    const movimentos = (hist.data ?? []).map(h => ({
      cliente: h.client_name, de: h.status_before, para: h.status_after, quando: h.updated_at.slice(0, 10),
      por: h.updated_by, acompanhamento: corta(h.follow_up, 300),
    }))

    const vendas = (varejo.data ?? []).filter(v => v.status_icon !== '❌')
    const soma = (de: string, ate: string) => vendas.filter(v => v.data_entrega >= de && v.data_entrega <= ate)
      .reduce((a, v) => ({ pedidos: a.pedidos + 1, valor: a.valor + Number(v.valor_liquido ?? 0) }), { pedidos: 0, valor: 0 })
    const semana = soma(ini, fim), anterior = soma(diaBRT(-13), diaBRT(-7))

    const dados = {
      periodo: { de: ini, ate: fim },
      negocios, movimentos_de_negocios: movimentos,
      visitas_realizadas: (visitas.data ?? []).map(v => ({
        cliente: v.client_name, data: v.visit_date, tipo: v.visit_type, local: v.local,
        responsaveis: (v.responsaveis?.length ? v.responsaveis : [v.responsible]).filter(Boolean).join(', '),
        amostra: v.has_amostra ? (v.amostra_produtos ?? []).join(', ') || 'sim' : null,
        relatorio: corta(v.report, 400), demanda: corta(v.demand, 200),
      })),
      demandas_para_outros_setores: (demandas.data ?? []).map(d => ({
        titulo: d.titulo, setor: d.setor, tipo: d.tipo, prioridade: d.prioridade, status: d.status,
        cliente: d.cliente_nome, desde: d.created_at.slice(0, 10), descricao: corta(d.descricao, 300),
        resolucao: d.status === 'resolvida' ? corta(d.resolucao, 200) : undefined,
      })),
      ocorrencias_logistica: (ocorr.data ?? []).map(o => ({
        data: o.data, tipo: (o.tipo as { nome?: string } | null)?.nome ?? null, gravidade: o.gravidade, status: o.status,
        cliente: o.cliente_nome, prejuizo: o.prejuizo, descricao: corta(o.descricao, 300),
      })),
      notas_do_comite: (notas.data ?? []).map(n => ({ cliente: n.cliente_nome, nota: corta(n.texto, 300) })),
      ultima_reuniao_comite: reuniao.data?.[0]
        ? { semana: reuniao.data[0].semana_ini, encaminhamentos: corta(reuniao.data[0].encaminhamentos, 600), ata: corta(reuniao.data[0].ata, 600) }
        : null,
      vendas_varejo: { semana, semana_anterior: anterior },
      mantidas: (mantidas.data ?? []).map(m => m.titulo),
    }

    const regras = (aprend.data ?? [])
    const blocoAprendizados = regras.length
      ? '\n\nAPRENDIZADOS (correções e preferências da equipe — siga sempre):\n' +
        regras.map(a => `- [${a.tipo}] ${a.texto}`).join('\n')
      : ''

    const system = INSTRUCOES.replace('{MAX}', String(maxItens)) + blocoAprendizados
    const prompt = `Dados do Comercial (JSON):\n${JSON.stringify(dados)}`
    const saida = await gerar(system, prompt)

    const itens = (saida.noticias ?? []).slice(0, maxItens).map(n => ({
      titulo: corta(n.titulo, 120),
      texto: corta(n.texto, 300),
      categoria: (CATEGORIAS as readonly string[]).includes(n.categoria) ? n.categoria : 'destaque',
      relevancia: Math.min(5, Math.max(1, Math.round(n.relevancia))),
    }))

    // O lote novo substitui o anterior; itens editados à mão seguem publicados até vencer.
    const loteId = crypto.randomUUID()
    const { error: eOld } = await supabase.from('crm_noticias').update({ publicada: false })
      .eq('publicada', true).eq('editada', false)
    if (eOld) throw new Error(eOld.message)
    if (itens.length) {
      const { error: eIns } = await supabase.from('crm_noticias').insert(itens.map(i => ({
        ...i, lote_id: loteId, publicada: i.relevancia >= limiar,
      })))
      if (eIns) throw new Error(eIns.message)
    }

    const publicadas = itens.filter(i => i.relevancia >= limiar).length
    await registrar(`ok (${saida.modelo}): ${publicadas} publicada(s), ${itens.length - publicadas} abaixo do limiar`)
    return json({ ok: true, lote_id: loteId, modelo: saida.modelo, geradas: itens.length, publicadas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await registrar(`erro: ${msg.slice(0, 300)}`)
    return json({ ok: false, error: msg }, 500)
  }
})
