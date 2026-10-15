import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, User, ArrowRight, Sparkles } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { fmtDia } from '../../lib/format'
import { getResponsaveis, type Deal, type DealHistory } from '../../types'
import { CORTE_COMITE, iniEfetivo, type PeriodoComite } from './comiteConfig'

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

interface Item { deal: Deal; novo: boolean; movimentos: DealHistory[] }

export default function ComiteNegocios({ ini, fim }: PeriodoComite) {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dentroDoCorte = fim >= CORTE_COMITE

  useEffect(() => {
    if (!dentroDoCorte) { setItens([]); return }
    let ativo = true
    ;(async () => {
      setLoading(true); setError(null)
      const de = iniEfetivo(ini)
      // updated_at é timestamptz: o dia vai de 00:00 a 23:59 no horário de Brasília.
      const [hist, novos] = await Promise.all([
        supabase.from('crm_deal_history').select('*')
          .gte('updated_at', `${de}T00:00:00-03:00`).lte('updated_at', `${fim}T23:59:59.999-03:00`)
          .order('updated_at', { ascending: true }),
        supabase.from('deals').select('*').gte('start_date', de).lte('start_date', fim),
      ])
      if (!ativo) return
      const err = hist.error ?? novos.error
      if (err) { setError(err.message); setItens([]); setLoading(false); return }

      const movs = (hist.data ?? []) as DealHistory[]
      const novosDeals = (novos.data ?? []) as Deal[]
      const ids = [...new Set(movs.map(m => m.deal_id))].filter(id => !novosDeals.some(d => d.id === id))
      let outros: Deal[] = []
      if (ids.length > 0) {
        const { data, error: e2 } = await supabase.from('deals').select('*').in('id', ids)
        if (e2) { if (ativo) { setError(e2.message); setLoading(false) } return }
        outros = (data ?? []) as Deal[]
      }
      if (!ativo) return
      const lista: Item[] = [
        ...novosDeals.map(d => ({ deal: d, novo: true, movimentos: movs.filter(m => m.deal_id === d.id) })),
        ...outros.map(d => ({ deal: d, novo: false, movimentos: movs.filter(m => m.deal_id === d.id) })),
      ]
      lista.sort((a, b) => {
        const ua = a.movimentos[a.movimentos.length - 1]?.updated_at ?? a.deal.created_at
        const ub = b.movimentos[b.movimentos.length - 1]?.updated_at ?? b.deal.created_at
        return ub.localeCompare(ua)
      })
      setItens(lista)
      setLoading(false)
    })()
    return () => { ativo = false }
  }, [ini, fim, dentroDoCorte])

  const resumo = useMemo(() => {
    const movs = itens.flatMap(i => i.movimentos)
    return {
      total: itens.length,
      novos: itens.filter(i => i.novo).length,
      ganhos: new Set(movs.filter(m => m.status_after === 'SUCESSO' && m.status_before !== 'SUCESSO').map(m => m.deal_id)).size,
      perdidos: new Set(movs.filter(m => (m.status_after === 'DESISTIU' || m.status_after === 'CANCELADO') && !FECHADOS.includes(m.status_before ?? '')).map(m => m.deal_id)).size,
    }
  }, [itens])

  if (!dentroDoCorte) {
    return <div className="card p-10 text-center text-slate-400 text-sm">O comitê de negócios começa em {fmtDia(CORTE_COMITE)}.</div>
  }
  if (loading && itens.length === 0) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" /> {error}
      </div>
    )
  }
  if (itens.length === 0) {
    return <div className="card p-10 text-center text-slate-400 text-sm">Nenhuma movimentação de negócios neste período.</div>
  }

  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="card p-3 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600 dark:text-slate-300">
        <span><strong>{resumo.total}</strong> negócio{resumo.total !== 1 ? 's' : ''} movimentado{resumo.total !== 1 ? 's' : ''}</span>
        <span><strong>{resumo.novos}</strong> novo{resumo.novos !== 1 ? 's' : ''}</span>
        <span className="text-green-600 dark:text-green-400"><strong>{resumo.ganhos}</strong> fechado{resumo.ganhos !== 1 ? 's' : ''} com sucesso</span>
        <span className="text-red-600 dark:text-red-400"><strong>{resumo.perdidos}</strong> perdido{resumo.perdidos !== 1 ? 's' : ''}</span>
      </div>

      {itens.map(({ deal: d, novo, movimentos }) => (
        <div key={d.id} className="card p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100">{d.client_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                {d.deal_type && <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{d.deal_type}</span>}
                {novo && <span className="font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center gap-1"><Sparkles size={10} /> Novo em {fmtDia(d.start_date)}</span>}
                <span className="text-slate-500 inline-flex items-center gap-1"><User size={11} /> {getResponsaveis(d) || 'Sem responsável'}</span>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">Situação atual: <Status s={d.status} /></div>
          </div>

          {novo && (d.interest || d.potential_notes) && (
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
        </div>
      ))}
    </div>
  )
}
