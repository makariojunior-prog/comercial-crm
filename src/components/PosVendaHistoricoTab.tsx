import { useState, useEffect } from 'react'
import { Search, Calendar, Trash2 } from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { PosVendaInteracao } from '../types'

interface HistoricoItem extends PosVendaInteracao {
  prioridade?: number
}

export default function PosVendaHistoricoTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState<HistoricoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | '1' | '2'>('todos')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!from || !to) return
      setLoading(true)

      let q = supabase
        .from('crm_posvendas_interacoes')
        .select('*')
        .gte('data_interacao', from)
        .lte('data_interacao', to)
        .order('created_at', { ascending: false })
        .limit(500)

      if (debouncedSearch) {
        const s = debouncedSearch.replace(/[%]/g, '')
        if (s) q = q.or(`nome.ilike.%${s}%,telefone.ilike.%${s}%,observacao.ilike.%${s}%`)
      }

      const { data: rows } = await q
      if (!active) return

      // Try to match with prioridade by searching original pós-venda data
      const items = (rows ?? []) as HistoricoItem[]

      setData(items)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [debouncedSearch, from, to])

  const filtrar = (item: HistoricoItem) => {
    if (filtroTipo === '1') return item.tipo === 1
    if (filtroTipo === '2') return item.tipo === 2
    return true
  }
  const filtered = data.filter(filtrar)

  async function deletar(id: string) {
    if (!confirm('Tem certeza que deseja deletar esta interação?')) return
    setDeleting(id)
    const { error } = await supabase
      .from('crm_posvendas_interacoes')
      .delete()
      .eq('id', id)
    setDeleting(null)
    if (error) {
      alert(`Erro ao deletar: ${error.message}`)
      return
    }
    setData(data.filter(d => d.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 text-sm"
            placeholder="Cliente, telefone ou observação..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={14} className="text-slate-400" />
          <input type="date" className="input text-sm w-auto" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-400">até</span>
          <input type="date" className="input text-sm w-auto" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {(['todos', '1', '2'] as const).map(tipo => (
            <button
              key={tipo}
              onClick={() => setFiltroTipo(tipo)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                filtroTipo === tipo
                  ? tipo === '1'
                    ? 'bg-sky-100 border-sky-300 text-sky-700 dark:bg-sky-900/30 dark:border-sky-700 dark:text-sky-300'
                    : tipo === '2'
                    ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300'
                    : 'bg-slate-200 border-slate-300 text-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                  : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {tipo === 'todos' ? 'Todos' : tipo === '1' ? '📞 Pós-Venda' : '🚨 Recompra'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <p className="text-sm">Nenhuma interação encontrada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {filtered.length} interação{filtered.length !== 1 ? 's' : ''}
          </p>
          {filtered.map(item => {
            const isRecompra = item.tipo === 2
            return (
              <div
                key={item.id}
                className={`card p-3 border-l-4 ${
                  isRecompra
                    ? 'border-l-red-400 bg-red-50/30 dark:bg-red-900/10'
                    : 'border-l-sky-400 bg-sky-50/30 dark:bg-sky-900/10'
                } group`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                        {item.nome || item.telefone}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isRecompra
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                        }`}
                      >
                        {isRecompra ? '🚨 Recompra' : '📞 Pós-Venda'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2">
                      {item.observacao || '—'}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                      <span>📅 {format(parseISO(item.data_interacao), 'dd/MM/yyyy')}</span>
                      <span>🕐 {format(parseISO(item.created_at), 'HH:mm:ss')}</span>
                      {item.usuario_nome && <span>👤 {item.usuario_nome}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {item.telefone}
                    </p>
                    <button
                      onClick={() => deletar(item.id)}
                      disabled={deleting === item.id}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-400 hover:text-red-600 transition-colors"
                      title="Deletar interação"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
