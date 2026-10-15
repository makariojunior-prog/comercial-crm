import { useMemo, useState } from 'react'
import { Handshake, ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { addWeeks, endOfWeek, format, startOfWeek } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { fmtDia } from '../lib/format'
import { CORTE_COMITE } from '../components/comite/comiteConfig'
import ComiteResumo from '../components/comite/ComiteResumo'
import ComiteVisitas from '../components/comite/ComiteVisitas'
import ComiteNegocios from '../components/comite/ComiteNegocios'
import ComiteClientes from './ComiteClientes'

type Aba = 'resumo' | 'visitas' | 'negocios' | 'clientes'

const ABAS: [Aba, string][] = [
  ['resumo', 'Resumo da semana'],
  ['visitas', 'Visitas'],
  ['negocios', 'Negócios'],
  ['clientes', 'Clientes novos'],
]

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const segunda = (d: Date) => startOfWeek(d, { weekStartsOn: 1 })

/** O comitê é na terça e revisa a semana (seg–dom) anterior; antes do corte, abre na semana atual. */
function semanaInicial() {
  const anterior = addWeeks(segunda(new Date()), -1)
  return iso(anterior) >= CORTE_COMITE ? anterior : segunda(new Date())
}

export default function Comite() {
  const { isAdmin } = useAuth()
  const [aba, setAba] = useState<Aba>('resumo')
  const [inicioSemana, setInicioSemana] = useState(semanaInicial)

  const periodo = useMemo(() => {
    const ini = segunda(inicioSemana), fim = endOfWeek(inicioSemana, { weekStartsOn: 1 })
    return { ini: iso(ini), fim: iso(fim), emAndamento: iso(fim) >= iso(new Date()) }
  }, [inicioSemana])

  const podeVoltar = periodo.ini > CORTE_COMITE
  const podeAvancar = !periodo.emAndamento

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center text-slate-400 max-w-md mx-auto">
        <Lock size={28} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">O Comitê é exclusivo para Administradores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Handshake size={20} className="text-orange-500" /> Comitê
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Revisão semanal do comercial: visitas, negócios, vendas do varejo, recompra e pós-venda (a partir de {fmtDia(CORTE_COMITE)}) e clientes novos do atacado.
        </p>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
          {ABAS.map(([a, label]) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                aba === a
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {aba !== 'clientes' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={() => setInicioSemana(s => addWeeks(s, -1))} disabled={!podeVoltar} className="btn-ghost p-1.5 disabled:opacity-30" title="Semana anterior"><ChevronLeft size={16} /></button>
              <button onClick={() => setInicioSemana(s => addWeeks(s, 1))} disabled={!podeAvancar} className="btn-ghost p-1.5 disabled:opacity-30" title="Próxima semana"><ChevronRight size={16} /></button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Semana de <strong>{fmtDia(periodo.ini)}</strong> a <strong>{fmtDia(periodo.fim)}</strong>
              {periodo.emAndamento && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">em andamento</span>}
            </p>
          </div>
        )}
      </div>

      {aba === 'resumo'   && <ComiteResumo ini={periodo.ini} fim={periodo.fim} />}
      {aba === 'visitas'  && <ComiteVisitas ini={periodo.ini} fim={periodo.fim} />}
      {aba === 'negocios' && <ComiteNegocios ini={periodo.ini} fim={periodo.fim} />}
      {aba === 'clientes' && <ComiteClientes embedded />}
    </div>
  )
}
