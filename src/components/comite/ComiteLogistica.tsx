import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtCurrency } from '../../lib/format'
import type { LogOcorrencia } from '../../types'
import { CardOcorrencia } from '../OcorrenciasLogisticaTab'
import type { PeriodoComite } from './comiteConfig'

/** Ocorrências do dia a dia da Logística registradas na semana do comitê. */
export default function ComiteLogistica({ ini, fim }: PeriodoComite) {
  const [lista, setLista] = useState<LogOcorrencia[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setLoading(true); setError(null)
    supabase.from('log_ocorrencias')
      .select('*, tipo:tipos_ocorrencia(id,nome,emoji,cor), driver:crm_drivers(id,nome), vehicle:crm_vehicles(id,apelido,placa)')
      .gte('data', ini).lte('data', fim).order('data').order('created_at')
      .then(({ data, error: err }) => {
        if (!ativo) return
        if (err) { setError(err.message); setLista([]) } else setLista((data ?? []) as LogOcorrencia[])
        setLoading(false)
      })
    return () => { ativo = false }
  }, [ini, fim])

  const resumo = useMemo(() => {
    const porTipo = new Map<string, number>()
    for (const o of lista) {
      const k = o.tipo ? `${o.tipo.emoji} ${o.tipo.nome}` : 'Sem tipo'
      porTipo.set(k, (porTipo.get(k) ?? 0) + 1)
    }
    return {
      abertas: lista.filter(o => o.status === 'aberta').length,
      graves: lista.filter(o => o.gravidade === 'alta').length,
      prejuizo: lista.reduce((s, o) => s + Number(o.prejuizo ?? 0), 0),
      porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [lista])

  if (loading && lista.length === 0) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  if (error) {
    return <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"><AlertCircle size={16} className="shrink-0" /> {error}</div>
  }
  if (lista.length === 0) {
    return (
      <div className="card p-10 text-center text-slate-400 text-sm">
        <Truck size={26} className="mx-auto mb-2 opacity-40" />
        Nenhuma ocorrência da logística registrada nesta semana.
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
      <div className="card p-3 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-slate-600 dark:text-slate-300">
        <span><strong>{lista.length}</strong> ocorrência{lista.length !== 1 ? 's' : ''}</span>
        <span className={resumo.abertas ? 'text-amber-600' : ''}><strong>{resumo.abertas}</strong> em aberto</span>
        <span className={resumo.graves ? 'text-red-600' : ''}><strong>{resumo.graves}</strong> grave{resumo.graves !== 1 ? 's' : ''}</span>
        {resumo.prejuizo > 0 && <span className="text-red-600">Prejuízo estimado: <strong>{fmtCurrency(resumo.prejuizo)}</strong></span>}
        <span className="flex gap-1 flex-wrap">
          {resumo.porTipo.map(([t, n]) => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700">{t}: <strong>{n}</strong></span>
          ))}
        </span>
      </div>
      {lista.map(o => <CardOcorrencia key={o.id} o={o} />)}
    </div>
  )
}
