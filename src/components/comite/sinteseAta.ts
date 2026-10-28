import { fmtCurrency } from '../../lib/format'

export interface Snapshot {
  resumo?: { varejo?: { faturamento: number; pedidos: number }; posvendas?: { pos_venda: number; recompra: number } }
  visitas?: { cliente: string; data: string; tipo: string | null; responsaveis: string | null; amostra: boolean; relatorio: string | null }[]
  negocios?: { cliente: string; status: string | null; tipo: string | null; novo: boolean; movimentos: number; ganho: boolean }[]
  ocorrencias?: { data: string; tipo: string | null; gravidade: string; status: string; cliente: string | null; descricao: string }[]
  demandas_abertas?: { titulo: string; setor: string; tipo: string; prioridade: string; status: string; desde: string }[]
  notas?: { cliente: string; texto: string; por: string | null }[]
}

const dm = (iso: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[2]}/${m[1]}` : iso }
const corta = (t: string | null | undefined, n: number) => {
  const x = (t ?? '').replace(/\s+/g, ' ').trim()
  return x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x
}
const lista = (xs: string[]) => [...new Set(xs)].join(', ')

/**
 * Síntese da semana para a pauta da ata, montada só com o que já foi registrado no Comitê
 * (negócios, visitas, logística, demandas e notas). Texto simples, para o time editar à vontade.
 */
export function montarSintese(s: Snapshot, rotuloSemana: string): string {
  const blocos: string[] = [`Síntese da semana ${rotuloSemana}`]

  const v = s.resumo?.varejo, p = s.resumo?.posvendas
  const vendas: string[] = []
  if (v && (v.pedidos || v.faturamento)) vendas.push(`Cantina: ${fmtCurrency(v.faturamento)} em ${v.pedidos} pedidos`)
  if (p && (p.pos_venda || p.recompra)) vendas.push(`pós-venda ${p.pos_venda}, recompra ${p.recompra}`)
  if (vendas.length) blocos.push(`VENDAS\n• ${vendas.join(' · ')}`)

  const negocios = s.negocios ?? []
  if (negocios.length) {
    const ganhos = negocios.filter(n => n.ganho), novos = negocios.filter(n => n.novo && !n.ganho)
    const perdidos = negocios.filter(n => ['DESISTIU', 'CANCELADO'].includes(n.status ?? ''))
    const linhas = [`${negocios.length} negócio(s) com movimento: ${novos.length} novo(s), ${ganhos.length} ganho(s), ${perdidos.length} perdido(s)`]
    if (ganhos.length) linhas.push(`Ganhos: ${lista(ganhos.map(n => n.cliente))}`)
    if (novos.length) linhas.push(`Novos: ${lista(novos.map(n => n.cliente))}`)
    if (perdidos.length) linhas.push(`Perdidos: ${lista(perdidos.map(n => n.cliente))}`)
    blocos.push(`NEGÓCIOS\n${linhas.map(l => `• ${l}`).join('\n')}`)
  }

  const visitas = s.visitas ?? []
  if (visitas.length) {
    const comAmostra = visitas.filter(x => x.amostra).length
    const linhas = [`${visitas.length} visita(s) realizada(s)${comAmostra ? `, ${comAmostra} com amostra` : ''}`]
    for (const x of visitas.slice(0, 8)) {
      const rel = corta(x.relatorio, 130)
      linhas.push(`${dm(x.data)} ${x.cliente}${x.tipo ? ` (${x.tipo})` : ''}${rel ? `: ${rel}` : ''}`)
    }
    if (visitas.length > 8) linhas.push(`… e mais ${visitas.length - 8} visita(s)`)
    blocos.push(`VISITAS\n${linhas.map(l => `• ${l}`).join('\n')}`)
  }

  const ocorr = s.ocorrencias ?? []
  if (ocorr.length) {
    const abertas = ocorr.filter(o => o.status !== 'resolvida')
    const linhas = [`${ocorr.length} ocorrência(s) na logística, ${abertas.length} em aberto`]
    for (const o of ocorr.slice(0, 6)) {
      linhas.push(`${dm(o.data)} ${o.tipo ?? 'Ocorrência'}${o.cliente ? ` · ${o.cliente}` : ''}${o.status === 'resolvida' ? ' [resolvida]' : ''}: ${corta(o.descricao, 110)}`)
    }
    if (ocorr.length > 6) linhas.push(`… e mais ${ocorr.length - 6}`)
    blocos.push(`LOGÍSTICA\n${linhas.map(l => `• ${l}`).join('\n')}`)
  }

  const demandas = s.demandas_abertas ?? []
  if (demandas.length) {
    const ord = [...demandas].sort((a, b) => ['alta', 'media', 'baixa'].indexOf(a.prioridade) - ['alta', 'media', 'baixa'].indexOf(b.prioridade))
    const linhas = [`${demandas.length} demanda(s) aguardando outros setores`]
    for (const d of ord.slice(0, 8)) linhas.push(`[${d.setor}] ${d.titulo} (prioridade ${d.prioridade}, desde ${dm(d.desde)})`)
    if (demandas.length > 8) linhas.push(`… e mais ${demandas.length - 8}`)
    blocos.push(`DEMANDAS E PROBLEMAS\n${linhas.map(l => `• ${l}`).join('\n')}`)
  }

  const notas = s.notas ?? []
  if (notas.length) {
    blocos.push(`REGISTROS DO COMITÊ\n${notas.map(n => `• ${n.cliente}: ${corta(n.texto, 160)}${n.por ? ` (${n.por})` : ''}`).join('\n')}`)
  }

  return blocos.length === 1 ? '' : blocos.join('\n\n')
}
