import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, ShoppingBag, Package2 } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface VarejoStats {
  entregas:   { qtd: number; valor: number }
  retiradas:  { qtd: number; valor: number }
  ifood:      { qtd: number; valor: number }
  food99:     { qtd: number; valor: number }
}

interface AtacadoStats {
  qtd:   number
  valor: number
}

export default function ResumoPedidosWidget() {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate]         = useState(todayStr)
  const [loading, setLoading]   = useState(true)
  const [varejo, setVarejo]     = useState<VarejoStats | null>(null)
  const [atacado, setAtacado]   = useState<AtacadoStats | null>(null)

  const dateObj   = new Date(date + 'T12:00')
  const isToday   = date === todayStr
  const dateLabel = format(dateObj, "EEE, dd/MM", { locale: ptBR })

  const load = useCallback(async () => {
    setLoading(true)

    const [{ data: vData }, { data: aData }] = await Promise.all([
      supabase
        .from('varejo_pedidos')
        .select('origem, order_type, entregador, valor_liquido, frete')
        .eq('data_entrega', date)
        .neq('status_icon', '❌'),
      supabase
        .from('atacado_pedidos')
        .select('valor')
        .eq('data_entrega', date)
        .eq('ignorado', false)
        .neq('tipo', 'CANCELADO'),
    ])

    // Varejo stats
    const vs: VarejoStats = {
      entregas:  { qtd: 0, valor: 0 },
      retiradas: { qtd: 0, valor: 0 },
      ifood:     { qtd: 0, valor: 0 },
      food99:    { qtd: 0, valor: 0 },
    }
    for (const p of (vData ?? []) as any[]) {
      const isRetirada = p.order_type === 'takeout' || p.entregador === 'RETIRADA'
      const isIfood    = (p.origem ?? '').toUpperCase() === 'IFOOD'
      const is99       = (p.origem ?? '').toUpperCase() === '99FOOD'
      const liq        = Number(p.valor_liquido ?? 0)

      if (isRetirada) {
        vs.retiradas.qtd++; vs.retiradas.valor += liq
      } else if (isIfood) {
        vs.ifood.qtd++; vs.ifood.valor += liq
      } else if (is99) {
        vs.food99.qtd++; vs.food99.valor += liq
      } else {
        vs.entregas.qtd++; vs.entregas.valor += liq
      }
    }

    // Atacado stats
    const as: AtacadoStats = { qtd: 0, valor: 0 }
    for (const p of (aData ?? []) as any[]) {
      as.qtd++
      as.valor += Number(p.valor ?? 0)
    }

    setVarejo(vs)
    setAtacado(as)
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  const prev = () => setDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'))
  const next = () => setDate(format(addDays(dateObj, 1), 'yyyy-MM-dd'))
  const goToday = () => setDate(todayStr)

  const varejoTotal = varejo
    ? varejo.entregas.qtd + varejo.retiradas.qtd + varejo.ifood.qtd + varejo.food99.qtd
    : 0
  const varejoValor = varejo
    ? varejo.entregas.valor + varejo.retiradas.valor + varejo.ifood.valor + varejo.food99.valor
    : 0

  return (
    <div className="space-y-3">
      {/* Header + nav de data */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm">
          <ShoppingBag size={15} className="text-orange-500" />
          Resumo do Dia
        </h2>
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-xl p-0.5">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={goToday}
            className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
              isToday
                ? 'bg-white dark:bg-slate-600 text-orange-600 shadow-sm'
                : 'text-slate-500 hover:bg-white dark:hover:bg-slate-600'
            }`}
          >
            {isToday ? 'Hoje' : dateLabel}
          </button>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
            <ChevronRight size={13} />
          </button>
          {loading && <RefreshCw size={11} className="animate-spin text-slate-400 mx-1" />}
        </div>
      </div>

      {!isToday && (
        <p className="text-[11px] text-slate-400 capitalize -mt-1">
          {format(dateObj, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* ── VAREJO ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <ShoppingBag size={10} /> Varejo
              </p>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                {varejoTotal} ped. · {fmt(varejoValor)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Entregas',  data: varejo!.entregas,  color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' },
                { label: 'Retiradas', data: varejo!.retiradas, color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' },
                { label: 'iFood',     data: varejo!.ifood,     color: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
                { label: '99Food',    data: varejo!.food99,    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' },
              ].map(({ label, data, color }) => (
                <div key={label} className={`rounded-xl px-3 py-2 ${color}`}>
                  <p className="text-[10px] font-semibold opacity-75">{label}</p>
                  <p className="text-lg font-bold leading-tight">{data.qtd}</p>
                  <p className="text-[10px] font-medium opacity-80">{data.valor > 0 ? fmt(data.valor) : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── ATACADO ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Package2 size={10} /> Atacado (Lumar)
              </p>
            </div>
            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 opacity-80">Entregas no dia</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300 leading-tight">{atacado!.qtd}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 opacity-80">Valor total</p>
                <p className="text-sm font-bold text-green-700 dark:text-green-300">{atacado!.valor > 0 ? fmt(atacado!.valor) : '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
