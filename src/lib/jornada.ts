import { supabase } from './supabase'
import type { ComiteDemanda, ComiteNota, Deal, DealHistory, LogOcorrencia, Visit } from '../types'

/**
 * Jornada do cliente: junta visitas, negócios (e seus movimentos), notas do comitê, observações do
 * comitê de clientes, ocorrências da logística e demandas num único "cliente" (conta).
 *
 * Visitas e negócios guardam só o nome digitado (a maioria é prospect, fora de crm_clients), então
 * a chave da conta é o nome normalizado. Quando o negócio aponta para um cliente do atacado
 * (client_id), a conta usa o nome do cadastro, juntando as duas grafias.
 */
export function chaveConta(nome: string | null | undefined): string {
  return (nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface ClienteBasico {
  id: string
  nome: string
  tipo: string | null
  rota: string | null
  comite_observacoes: string | null
  comite_realizado_em: string | null
}

export type EventoTipo = 'visita' | 'negocio_novo' | 'negocio_mov' | 'nota_comite' | 'comite_cliente' | 'ocorrencia' | 'demanda'

export interface Evento {
  id: string
  tipo: EventoTipo
  data: string            // ISO (yyyy-MM-dd ou timestamp) — usado para ordenar
  titulo: string
  texto?: string | null
  por?: string | null
  visit?: Visit
  deal?: Deal
  mov?: DealHistory
  nota?: ComiteNota
  ocorrencia?: LogOcorrencia
  demanda?: ComiteDemanda
}

export interface Conta {
  chave: string
  nome: string
  cliente: ClienteBasico | null
  visitas: Visit[]
  deals: Deal[]
  movimentos: DealHistory[]
  notas: ComiteNota[]
  ocorrencias: LogOcorrencia[]
  demandas: ComiteDemanda[]
  responsaveis: string[]
  ultima: string          // data da última atividade (yyyy-MM-dd)
}

export interface DadosJornada {
  visitas: Visit[]
  deals: Deal[]
  movimentos: DealHistory[]
  notas: ComiteNota[]
  ocorrencias: LogOcorrencia[]
  demandas: ComiteDemanda[]
  clientes: ClienteBasico[]
}

const VISIT_COLS = 'id, visit_date, visit_type, client_name, contact_name, contact_phone, responsible, responsaveis, local, demand, report, priority, status, photo_urls, has_amostra, amostra_produtos, deal_id, crm_event_id, created_at'

export async function carregarJornada(): Promise<DadosJornada> {
  const [v, d, h, n, o, dm, c] = await Promise.all([
    supabase.from('visits').select(VISIT_COLS).order('visit_date', { ascending: false }).limit(3000),
    supabase.from('deals').select('*'),
    supabase.from('crm_deal_history').select('*').order('updated_at', { ascending: false }).limit(5000),
    supabase.from('crm_comite_notas').select('*').order('created_at', { ascending: false }),
    supabase.from('log_ocorrencias').select('*, tipo:tipos_ocorrencia(id,nome,emoji,cor)').not('client_id', 'is', null),
    supabase.from('crm_comite_demandas').select('*').not('cliente_nome', 'is', null),
    supabase.from('crm_clients').select('id, nome, tipo, rota, comite_observacoes, comite_realizado_em'),
  ])
  const err = [v, d, h, n, o, dm, c].find(r => r.error)?.error
  if (err) throw new Error(err.message)
  return {
    visitas: (v.data ?? []) as Visit[],
    deals: (d.data ?? []) as Deal[],
    movimentos: (h.data ?? []) as DealHistory[],
    notas: (n.data ?? []) as ComiteNota[],
    ocorrencias: (o.data ?? []) as LogOcorrencia[],
    demandas: (dm.data ?? []) as ComiteDemanda[],
    clientes: (c.data ?? []) as ClienteBasico[],
  }
}

const dia = (s: string | null | undefined) => (s ?? '').slice(0, 10)
const respDe = (r: { responsible: string | null; responsaveis: string[] | null }) =>
  (r.responsaveis?.filter(Boolean).length ? r.responsaveis.filter(Boolean) : [r.responsible]).filter((x): x is string => !!x)

export function montarContas(d: DadosJornada): Conta[] {
  const clientesPorId = new Map(d.clientes.map(c => [c.id, c]))
  const clientesPorChave = new Map(d.clientes.map(c => [chaveConta(c.nome), c]))
  const contas = new Map<string, Conta>()

  const conta = (nome: string, clientId?: string | null): Conta => {
    const cli = (clientId && clientesPorId.get(clientId)) || clientesPorChave.get(chaveConta(nome)) || null
    const chave = chaveConta(cli?.nome ?? nome) || '(sem nome)'
    let c = contas.get(chave)
    if (!c) {
      c = { chave, nome: cli?.nome ?? nome.trim(), cliente: cli, visitas: [], deals: [], movimentos: [], notas: [], ocorrencias: [], demandas: [], responsaveis: [], ultima: '' }
      contas.set(chave, c)
    }
    return c
  }
  const toca = (c: Conta, data: string, resp: string[] = []) => {
    if (data > c.ultima) c.ultima = data
    for (const r of resp) if (!c.responsaveis.includes(r)) c.responsaveis.push(r)
  }

  const contaDoDeal = new Map<string, Conta>()
  for (const deal of d.deals) {
    const c = conta(deal.client_name, deal.client_id)
    c.deals.push(deal)
    contaDoDeal.set(deal.id, c)
    toca(c, dia(deal.last_contact_date ?? deal.start_date ?? deal.created_at), respDe(deal))
  }
  for (const v of d.visitas) {
    const c = (v.deal_id && contaDoDeal.get(v.deal_id)) || conta(v.client_name)
    c.visitas.push(v)
    toca(c, dia(v.visit_date ?? v.created_at), respDe(v))
  }
  for (const m of d.movimentos) {
    const c = contaDoDeal.get(m.deal_id) ?? conta(m.client_name)
    c.movimentos.push(m)
    toca(c, dia(m.updated_at))
  }
  for (const n of d.notas) {
    const c = (n.deal_id && contaDoDeal.get(n.deal_id)) || conta(n.cliente_nome, n.client_id)
    c.notas.push(n)
    toca(c, dia(n.created_at))
  }
  for (const o of d.ocorrencias) {
    const c = conta(o.cliente_nome ?? '', o.client_id)
    c.ocorrencias.push(o)
    toca(c, o.data)
  }
  for (const dm of d.demandas) {
    const c = conta(dm.cliente_nome ?? '', dm.client_id)
    c.demandas.push(dm)
    toca(c, dia(dm.created_at))
  }
  // Observação do Comitê de clientes (cadastro do atacado) só conta para quem já tem atividade
  for (const c of contas.values()) {
    if (c.cliente?.comite_realizado_em) toca(c, dia(c.cliente.comite_realizado_em))
  }

  return [...contas.values()]
    .filter(c => c.chave !== '(sem nome)')
    .sort((a, b) => b.ultima.localeCompare(a.ultima) || a.nome.localeCompare(b.nome, 'pt'))
}

/** Negócio "da vez" da conta: o aberto mais recente, senão o mais recente. */
export function negocioPrincipal(c: Conta): Deal | null {
  const ord = [...c.deals].sort((a, b) =>
    (b.last_contact_date ?? b.start_date ?? b.created_at).localeCompare(a.last_contact_date ?? a.start_date ?? a.created_at))
  return ord.find(x => !['SUCESSO', 'DESISTIU', 'CANCELADO'].includes(x.status ?? 'NOVO')) ?? ord[0] ?? null
}

export function eventosDaConta(c: Conta): Evento[] {
  const ev: Evento[] = []
  for (const v of c.visitas) {
    ev.push({
      id: `v-${v.id}`, tipo: 'visita', data: v.visit_date ?? v.created_at,
      titulo: [v.visit_type ?? 'Visita', v.status && v.status !== 'Realizada' ? `(${v.status})` : ''].filter(Boolean).join(' '),
      texto: v.report || v.demand, por: respDe(v).join(', '), visit: v,
    })
  }
  for (const deal of c.deals) {
    ev.push({
      id: `d-${deal.id}`, tipo: 'negocio_novo', data: deal.start_date ?? deal.created_at,
      titulo: `Negócio aberto${deal.deal_type ? ` · ${deal.deal_type}` : ''}`,
      texto: [deal.interest, deal.potential_notes].filter(Boolean).join(' — '), por: respDe(deal).join(', '), deal,
    })
  }
  const dealPorId = new Map(c.deals.map(x => [x.id, x]))
  for (const m of c.movimentos) {
    const mudou = m.status_before !== m.status_after
    ev.push({
      id: `m-${m.id}`, tipo: 'negocio_mov', data: m.updated_at,
      titulo: mudou ? `Negócio: ${m.status_before ?? '—'} → ${m.status_after ?? '—'}` : 'Acompanhamento do negócio',
      texto: m.follow_up, por: m.updated_by, mov: m, deal: dealPorId.get(m.deal_id),
    })
  }
  for (const n of c.notas) {
    ev.push({ id: `n-${n.id}`, tipo: 'nota_comite', data: n.created_at, titulo: 'Registro do comitê', texto: n.texto, por: n.created_by_nome, nota: n })
  }
  const cli = c.cliente
  if (cli && (cli.comite_observacoes || cli.comite_realizado_em)) {
    ev.push({
      id: `cc-${cli.id}`, tipo: 'comite_cliente', data: cli.comite_realizado_em ?? '',
      titulo: cli.comite_realizado_em ? 'Comitê de cliente novo realizado' : 'Observação do comitê de clientes',
      texto: cli.comite_observacoes,
    })
  }
  for (const o of c.ocorrencias) {
    ev.push({
      id: `o-${o.id}`, tipo: 'ocorrencia', data: o.data,
      titulo: `Ocorrência na entrega${o.tipo ? ` · ${o.tipo.emoji} ${o.tipo.nome}` : ''}`,
      texto: o.descricao, por: o.created_by_nome, ocorrencia: o,
    })
  }
  for (const dm of c.demandas) {
    ev.push({
      id: `dm-${dm.id}`, tipo: 'demanda', data: dm.created_at,
      titulo: `${dm.tipo === 'problema' ? 'Problema' : 'Demanda'} para ${dm.setor}: ${dm.titulo}`,
      texto: dm.descricao, por: dm.created_by_nome, demanda: dm,
    })
  }
  return ev.sort((a, b) => b.data.localeCompare(a.data))
}
