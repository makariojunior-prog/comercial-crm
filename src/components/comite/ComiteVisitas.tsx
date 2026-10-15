import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, MapPin, User, Gift, CalendarDays, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDia } from '../../lib/format'
import { getResponsaveis, type Visit } from '../../types'
import { CORTE_COMITE, iniEfetivo, type PeriodoComite } from './comiteConfig'

export default function ComiteVisitas({ ini, fim }: PeriodoComite) {
  const [visitas, setVisitas] = useState<Visit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dentroDoCorte = fim >= CORTE_COMITE

  useEffect(() => {
    if (!dentroDoCorte) { setVisitas([]); return }
    let ativo = true
    setLoading(true); setError(null)
    supabase.from('visits').select('*')
      .eq('status', 'Realizada')
      .gte('visit_date', iniEfetivo(ini)).lte('visit_date', fim)
      .order('visit_date', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!ativo) return
        if (err) { setError(err.message); setVisitas([]) } else setVisitas((data ?? []) as Visit[])
        setLoading(false)
      })
    return () => { ativo = false }
  }, [ini, fim, dentroDoCorte])

  const porColaborador = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of visitas) {
      const nomes = (v.responsaveis?.filter(Boolean).length ? v.responsaveis!.filter(Boolean) : [v.responsible ?? 'Sem responsável'])
      for (const n of nomes) m.set(n, (m.get(n) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [visitas])

  if (!dentroDoCorte) {
    return <div className="card p-10 text-center text-slate-400 text-sm">O comitê de visitas começa em {fmtDia(CORTE_COMITE)}.</div>
  }
  if (loading && visitas.length === 0) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" /> {error}
      </div>
    )
  }
  if (visitas.length === 0) {
    return <div className="card p-10 text-center text-slate-400 text-sm">Nenhuma visita realizada neste período.</div>
  }

  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="card p-3 flex items-center gap-2 flex-wrap text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{visitas.length} visita{visitas.length !== 1 ? 's' : ''} realizada{visitas.length !== 1 ? 's' : ''}</span>
        {porColaborador.map(([nome, n]) => (
          <span key={nome} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{nome}: <strong>{n}</strong></span>
        ))}
      </div>

      {visitas.map(v => {
        const fotos = v.photo_urls ?? []
        const produtos = v.amostra_produtos ?? []
        return (
          <div key={v.id} className="card p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 dark:text-slate-100">{v.client_name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
                  {v.visit_type && <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{v.visit_type}</span>}
                  {v.has_amostra && <span className="font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 inline-flex items-center gap-1"><Gift size={10} /> Amostra</span>}
                  {v.local && <span className="text-slate-500 inline-flex items-center gap-1"><MapPin size={11} /> {v.local}</span>}
                </div>
              </div>
              <div className="text-right text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                <p className="inline-flex items-center gap-1"><CalendarDays size={12} /> <strong className="text-slate-700 dark:text-slate-200">{fmtDia(v.visit_date)}</strong></p>
                <p className="flex items-center justify-end gap-1"><User size={12} /> {getResponsaveis(v) || 'Sem responsável'}</p>
              </div>
            </div>

            {v.has_amostra && produtos.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Amostras:</span> {produtos.join(', ')}
              </p>
            )}

            <div>
              <p className="text-[11px] font-semibold text-slate-400 mb-0.5 inline-flex items-center gap-1"><ClipboardList size={11} /> Relatório</p>
              {v.report?.trim()
                ? <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{v.report}</p>
                : <p className="text-sm italic text-slate-400">Sem relatório escrito.</p>}
            </div>

            {fotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {fotos.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" title="Abrir foto">
                    <img src={url} alt={`Foto ${i + 1} da visita a ${v.client_name}`} loading="lazy"
                      className="w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-600 hover:opacity-90" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
