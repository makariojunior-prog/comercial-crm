import { useEffect, useState } from 'react'
import { RefreshCw, AlertCircle, ShoppingBag, PhoneCall, Repeat } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { fmtCurrency } from '../../lib/format'
import { variacao, type PeriodoComite } from './comiteConfig'

interface Resumo {
  varejo: {
    pedidos: number
    faturamento: number
    cancelados: number
    valor_cancelado: number
    anterior: { pedidos: number; faturamento: number }
    por_dia: { dia: string; pedidos: number; valor: number }[]
  }
  posvendas: {
    pos_venda: number
    recompra: number
    anterior: { pos_venda: number; recompra: number }
    por_usuario: { usuario: string; pos_venda: number; recompra: number }[]
  }
}

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacao(atual, anterior)
  const cor = v.sobe == null ? 'text-slate-400' : v.sobe ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  return <span className={`text-[11px] font-semibold ${cor}`}>{v.texto} <span className="font-normal text-slate-400">vs. semana anterior</span></span>
}

function Kpi({ label, valor, atual, anterior }: { label: string; valor: string; atual?: number; anterior?: number }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">{valor}</p>
      {atual != null && anterior != null && <Variacao atual={atual} anterior={anterior} />}
    </div>
  )
}

export default function ComiteResumo({ ini, fim }: PeriodoComite) {
  const [dados, setDados] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    setLoading(true); setError(null)
    supabase.rpc('crm_comite_resumo_semana', { p_ini: ini, p_fim: fim }).then(({ data, error: err }) => {
      if (!ativo) return
      if (err) { setError(err.message); setDados(null) } else setDados(data as Resumo)
      setLoading(false)
    })
    return () => { ativo = false }
  }, [ini, fim])

  if (loading && !dados) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={16} className="shrink-0" /> {error}
      </div>
    )
  }
  if (!dados) return null

  const { varejo: v, posvendas: p } = dados
  const ticket = v.pedidos > 0 ? v.faturamento / v.pedidos : 0
  const ticketAnt = v.anterior.pedidos > 0 ? v.anterior.faturamento / v.anterior.pedidos : 0
  const maxDia = Math.max(1, ...v.por_dia.map(d => Number(d.valor)))

  return (
    <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
      <section className="card p-4 space-y-3">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
          <ShoppingBag size={16} className="text-orange-500" /> Vendas do varejo
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Faturamento" valor={fmtCurrency(Number(v.faturamento))} atual={Number(v.faturamento)} anterior={Number(v.anterior.faturamento)} />
          <Kpi label="Pedidos" valor={String(v.pedidos)} atual={v.pedidos} anterior={v.anterior.pedidos} />
          <Kpi label="Ticket médio" valor={fmtCurrency(ticket)} atual={ticket} anterior={ticketAnt} />
          <Kpi label="Cancelados" valor={`${v.cancelados} · ${fmtCurrency(Number(v.valor_cancelado))}`} />
        </div>
        {v.por_dia.length > 0 && (
          <div className="space-y-1.5">
            {v.por_dia.map(d => (
              <div key={d.dia} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 capitalize text-slate-500 dark:text-slate-400">{format(parseISO(d.dia), 'EEE dd/MM', { locale: ptBR })}</span>
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-orange-400" style={{ width: `${(Number(d.valor) / maxDia) * 100}%` }} />
                </div>
                <span className="w-24 text-right font-medium text-slate-700 dark:text-slate-200 tabular-nums">{fmtCurrency(Number(d.valor))}</span>
                <span className="w-14 text-right text-slate-400 tabular-nums">{d.pedidos} ped.</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400">Pedidos por data de entrega, valor líquido, sem os cancelados (❌).</p>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
          <Repeat size={16} className="text-red-500" /> Recompra e pós-venda
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="🚨 Recompras realizadas" valor={String(p.recompra)} atual={p.recompra} anterior={p.anterior.recompra} />
          <Kpi label="📞 Pós-vendas realizados" valor={String(p.pos_venda)} atual={p.pos_venda} anterior={p.anterior.pos_venda} />
        </div>
        {p.por_usuario.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="pb-1 font-medium"><PhoneCall size={11} className="inline mr-1" />Atendente</th>
                <th className="pb-1 font-medium text-right">Recompra</th>
                <th className="pb-1 font-medium text-right">Pós-venda</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {p.por_usuario.map(u => (
                <tr key={u.usuario}>
                  <td className="py-1 text-slate-700 dark:text-slate-200">{u.usuario}</td>
                  <td className="py-1 text-right tabular-nums">{u.recompra}</td>
                  <td className="py-1 text-right tabular-nums">{u.pos_venda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400">Contatos registrados pela equipe nas abas Recompra e Pós-Venda do Varejo (por data da interação).</p>
      </section>
    </div>
  )
}
