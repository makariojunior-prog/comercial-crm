import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, User, ArrowRight, Sparkles, Trophy, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { fmtDia } from '../../lib/format'
import { getResponsaveis, type ComiteNota, type Deal, type DealHistory } from '../../types'
import { CORTE_COMITE, iniEfetivo, type PeriodoComite } from './comiteConfig'
import NotasComite, { carregarNotasSemana } from './NotasComite'

const STATUS_COR: Record<string, string> = {
  'NOVO': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'EM ANDAMENTO': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'SUCESSO': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'DESISTIU': 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200',
  'CANCELADO': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}
const FECHADOS = ['SUCESSO', 'DESISTIU', 'CANCELADO']

function Status({ s }: { s: string | null }) {
  if (!s) return <span className="text-slate-400">—</span>
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COR[s] ?? 'bg-slate-100 text-slate-600'}`}>{s}</span>
}

interface Item { deal: Deal; novo: boolean; ganho: boolean; movimentos: DealHistory[] }

/** Data (yyyy-MM-dd, horário de Brasília) em que o negócio virou SUCESSO pela última vez. */
function dataDoGanho(deal: Deal, hist: DealHistory[]): string | null {
  const h = hist.filter(m => m.deal_id === deal.id && m.status_after === 'SUCESSO' && m.status_before !== 'SUCESSO')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (h) return format(parseISO(h.updated_at), 'yyyy-MM-dd')
  return deal.end_date ?? null
}

export default function ComiteNegocios({ ini, fim }: PeriodoComite) {
  const [itens, setItens] = useState<Item[]>([])
  const [carteira, setCarteira] = useState<{ deal: Deal; ganhoEm: string | null }[]>([])
  const [notas, setNotas] = useState<ComiteNota[]>([])
  const [verCarteira, setVerCarteira] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dentroDoCorte = fim >= CORTE_COMITE

  useEffect(() => { carregarNotasSemana(ini).then(setNotas) }, [ini])

  useEffect(() => {
    if (!dentroDoCorte) { setItens([]); setCarteira([]); return }
    let ativo = true
    ;(async () => {
      setLoading(true); setError(null)
      const de = iniEfetivo(ini)
      // updated_at é timestamptz: o dia vai de 00:00 a 23:59 no horário de Brasília.
      const [hist, novos, sucesso] = await Promise.all([
        supabase.from('crm_deal_history').select('*')
          .gte('updated_at', `${de}T00:00:00-03:00`).lte('updated_at', `${fim}T23:59:59.999-03:00`)
          .order('updated_at', { ascending: true }),
        supabase.from('deals').select('*').gte('start_date', de).lte('start_date', fim),
        supabase.from('deals').select('*').eq('status', 'SUCESSO'),
      ])
      if (!ativo) return
      const err = hist.error ?? novos.error ?? sucesso.error
      if (err) { setError(err.message); setItens([]); setLoading(false); return }

      const movs = (hist.data ?? []) as DealHistory[]
      const novosDeals = (novos.data ?? []) as Deal[]
      const ganhos = (sucesso.data ?? []) as Deal[]
      const idsGanho = ganhos.map(d => d.id)
      const [{ data: histGanhos }, outrosRes] = await Promise.all([
        idsGanho.length
          ? supabase.from('crm_deal_history').select('*').in('deal_id', idsGanho).eq('status_after', 'SUCESSO')
          : Promise.resolve({ data: [] as DealHistory[] }),
        (async () => {
          const ids = [...new Set(movs.map(m => m.deal_id))].filter(id => !novosDeals.some(d => d.id === id))
          return ids.length ? supabase.from('deals').select('*').in('id', ids) : { data: [] as Deal[], error: null }
        })(),
      ])
      if (!ativo) return
      if (outrosRes.error) { setError(outrosRes.error.message); setLoading(false); return }
      const outros = (outrosRes.data ?? []) as Deal[]
      const hg = (histGanhos ?? []) as DealHistory[]

      const naSemana = (d: string | null) => !!d && d >= de && d <= fim
      const lista: Item[] = []
      const visto = new Set<string>()
      for (const d of [...novosDeals, ...outros]) {
        visto.add(d.id)
        const m = movs.filter(x => x.deal_id === d.id)
        const ganho = m.some(x => x.status_after === 'SUCESSO' && x.status_before !== 'SUCESSO')
          || (d.status === 'SUCESSO' && naSemana(d.end_date))
        lista.push({ deal: d, novo: novosDeals.some(n => n.id === d.id), ganho, movimentos: m })
      }
      // Ganhos da semana registrados só pela data de término (sem movimento no histórico)
      for (const d of ganhos) {
        if (!visto.has(d.id) && naSemana(d.end_date)) lista.push({ deal: d, novo: false, ganho: true, movimentos: [] })
      }
      lista.sort((a, b) => {
        if (a.ganho !== b.ganho) return a.ganho ? -1 : 1
        const ua = a.movimentos[a.movimentos.length - 1]?.updated_at ?? a.deal.created_at
        const ub = b.movimentos[b.movimentos.length - 1]?.updated_at ?? b.deal.created_at
        return ub.localeCompare(ua)
      })
      setItens(lista)
      setCarteira(ganhos.map(d => ({ deal: d, ganhoEm: dataDoGanho(d, hg) }))
        .sort((a, b) => (b.ganhoEm ?? b.deal.last_contact_date ?? '').localeCompare(a.ganhoEm ?? a.deal.last_contact_date ?? '')))
      setLoading(false)
    })()
    return () => { ativo = false }
  }, [ini, fim, dentroDoCorte])

  const resumo = useMemo(() => {
    const movs = itens.flatMap(i => i.movimentos)
    return {
      total: itens.length,
      novos: itens.filter(i => i.novo).length,
      ganhos: itens.filter(i => i.ganho).length,
      perdidos: new Set(movs.filter(m => (m.status_after === 'DESISTIU' || m.status_after === 'CANCELADO') && !FECHADOS.includes(m.status_before ?? '')).map(m => m.deal_id)).size,
    }
  }, [itens])

  if (!dentroDoCorte) {
    return <div className="card p-10 text-center text-slate-400 text-sm">O comitê de negócios começa em {fmtDia(CORTE_COMITE)}.</div>
  }
  if (loading && itens.length === 0 && carteira.length === 0) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" /> {error}
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="card p-3 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600 dark:text-slate-300">
        <span><strong>{resumo.total}</strong> negócio{resumo.total !== 1 ? 's' : ''} movimentado{resumo.total !== 1 ? 's' : ''}</span>
        <span><strong>{resumo.novos}</strong> novo{resumo.novos !== 1 ? 's' : ''}</span>
        <span className="text-green-600 dark:text-green-400"><strong>{resumo.ganhos}</strong> fechado{resumo.ganhos !== 1 ? 's' : ''} com sucesso</span>
        <span className="text-red-600 dark:text-red-400"><strong>{resumo.perdidos}</strong> perdido{resumo.perdidos !== 1 ? 's' : ''}</span>
      </div>

      {itens.length === 0 && (
        <div className="card p-8 text-center text-slate-400 text-sm">Nenhuma movimentação de negócios neste período.</div>
      )}

      {itens.map(({ deal: d, novo, ganho, movimentos }) => (
        <div key={d.id} className={`card p-4 space-y-2.5 ${ganho ? 'border-l-4 border-l-green-500 bg-green-50/40 dark:bg-green-900/10' : ''}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                {ganho && <Trophy size={15} className="text-green-600 shrink-0" />} {d.client_name}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                {d.deal_type && <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{d.deal_type}</span>}
                {ganho && <span className="font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Ganho nesta semana</span>}
                {novo && <span className="font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center gap-1"><Sparkles size={10} /> Novo em {fmtDia(d.start_date)}</span>}
                <span className="text-slate-500 inline-flex items-center gap-1"><User size={11} /> {getResponsaveis(d) || 'Sem responsável'}</span>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">Situação atual: <Status s={d.status} /></div>
          </div>

          {(novo || ganho) && (d.interest || d.potential_notes) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
              {[d.interest, d.potential_notes].filter(Boolean).join(' — ')}
            </p>
          )}

          {movimentos.length > 0 && (
            <ol className="space-y-2 border-l-2 border-slate-100 dark:border-slate-700 pl-3">
              {movimentos.map(m => {
                const mudou = m.status_before !== m.status_after
                return (
                  <li key={m.id} className="text-xs">
                    <p className="flex items-center gap-1.5 flex-wrap text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{format(parseISO(m.updated_at), 'dd/MM HH:mm')}</span>
                      {mudou
                        ? <><Status s={m.status_before} /> <ArrowRight size={11} /> <Status s={m.status_after} /></>
                        : <><span>Atualização</span> <Status s={m.status_after} /></>}
                      {m.updated_by && <span>· {m.updated_by}</span>}
                    </p>
                    {m.follow_up?.trim() && <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{m.follow_up}</p>}
                  </li>
                )
              })}
            </ol>
          )}

          <NotasComite semanaIni={ini} clienteNome={d.client_name} clientId={d.client_id} dealId={d.id}
            notas={notas.filter(n => n.deal_id === d.id && !n.visit_id)} onSaved={n => setNotas(ns => [...ns, n])} />
        </div>
      ))}

      {/* Carteira de negócios ganhos (todos os SUCESSO, para acompanhar a conversão em pedidos) */}
      <div className="card overflow-hidden">
        <button onClick={() => setVerCarteira(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
          {verCarteira ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          <Trophy size={15} className="text-green-600" />
          <span className="font-bold text-sm text-slate-800 dark:text-slate-100">Carteira de negócios de sucesso</span>
          <span className="text-xs text-slate-500">({carteira.length})</span>
        </button>
        {verCarteira && (
          carteira.length === 0
            ? <p className="px-4 pb-4 text-sm text-slate-400">Nenhum negócio fechado com sucesso.</p>
            : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-y border-slate-100 dark:border-slate-700">
                    <th className="px-4 py-1.5 font-medium">Cliente</th>
                    <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Tipo</th>
                    <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Responsável</th>
                    <th className="px-4 py-1.5 font-medium text-right">Ganho em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {carteira.map(({ deal: d, ganhoEm }) => (
                    <tr key={d.id} className={ganhoEm && ganhoEm >= ini && ganhoEm <= fim ? 'bg-green-50/60 dark:bg-green-900/10' : ''}>
                      <td className="px-4 py-1.5 font-medium text-slate-700 dark:text-slate-200">{d.client_name}</td>
                      <td className="px-2 py-1.5 text-slate-500 hidden sm:table-cell">{d.deal_type ?? '—'}</td>
                      <td className="px-2 py-1.5 text-slate-500 hidden sm:table-cell">{getResponsaveis(d) || '—'}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{ganhoEm ? fmtDia(ganhoEm) : <span className="text-slate-400">sem data</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}
      </div>
    </div>
  )
}
