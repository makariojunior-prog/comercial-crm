import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, RefreshCw, Eye, EyeOff, AlertCircle, Download, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportPriceItems } from '../lib/export'
import type { PriceItem } from '../types'
import PriceItemModal from '../components/PriceItemModal'

type Empresa = 'lumar' | 'cantina'

function fmt(v: number | null) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function margem(preco: number | null, custo: number | null): string {
  if (!preco || !custo || preco === 0) return '—'
  return ((preco - custo) / preco * 100).toFixed(1) + '%'
}

function margemColor(preco: number | null, custo: number | null): string {
  if (!preco || !custo) return 'text-slate-400'
  const m = (preco - custo) / preco * 100
  if (m >= 30) return 'text-green-600 font-semibold'
  if (m >= 15) return 'text-amber-600'
  return 'text-red-500'
}

export default function TabelasPreco() {
  const [items, setItems]       = useState<PriceItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [empresa, setEmpresa]   = useState<Empresa>('lumar')
  const [search, setSearch]     = useState('')
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [modoTabela, setModoTabela] = useState(false)
  const [editItem, setEditItem] = useState<PriceItem | null | undefined>(undefined)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('crm_price_items')
      .select('*')
      .order('nome', { ascending: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setItems(data as PriceItem[] ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteItem(id: string) {
    if (!confirm('Excluir este produto?')) return
    await supabase.from('crm_price_items').delete().eq('id', id)
    setItems(prev => prev.filter(x => x.id !== id))
  }

  const filtered = items.filter(it => {
    if (it.empresa !== empresa) return false
    if (somenteAtivos && !it.ativo) return false
    if (search) {
      const q = search.toLowerCase()
      return it.nome.toLowerCase().includes(q)
    }
    return true
  })

  const isLumar   = empresa === 'lumar'
  const isCantina = empresa === 'cantina'

  const lumarCount   = items.filter(x => x.empresa === 'lumar'   && (!somenteAtivos || x.ativo)).length
  const cantinaCount = items.filter(x => x.empresa === 'cantina' && (!somenteAtivos || x.ativo)).length

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tabelas de Preço</h1>
          <p className="text-xs text-slate-400">Gerencie os preços de venda Lumar e Cantina em Casa</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModoTabela(m => !m)}
            className={`btn text-xs py-1.5 ${modoTabela ? 'btn-primary' : 'btn-secondary'}`}
            title="Modo Tabela — visualização para cliente"
          >
            {modoTabela ? <EyeOff size={14} /> : <Eye size={14} />}
            {modoTabela ? 'Ver custos' : 'Modo Tabela'}
          </button>
          <button onClick={() => { try { exportPriceItems(filtered, empresa, modoTabela) } catch { alert('Erro ao exportar') } }} className="btn-secondary text-xs py-1.5">
            <Download size={14} /> Excel
          </button>
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditItem(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Produto</span>
          </button>
        </div>
      </div>

      {/* Tabs empresa */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(['lumar', 'cantina'] as const).map(e => (
          <button
            key={e}
            onClick={() => setEmpresa(e)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              empresa === e
                ? e === 'lumar' ? 'bg-blue-600 text-white shadow-sm' : 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {e === 'lumar' ? `🔵 Lumar (${lumarCount})` : `🟠 Cantina em Casa (${cantinaCount})`}
          </button>
        ))}
      </div>

      {/* Modo Tabela banner */}
      {modoTabela && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-xs text-blue-700 flex items-center gap-2">
          <Eye size={14} /> <strong>Modo Tabela:</strong> custos e margens ocultos — visualização para apresentar ao cliente.
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8 text-sm" placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={somenteAtivos} onChange={e => setSomenteAtivos(e.target.checked)} className="w-4 h-4 accent-orange-500" />
          Apenas ativos
        </label>
        <p className="text-xs text-slate-400 ml-auto">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {loadError}
          <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <p>Nenhum produto encontrado</p>
          <button onClick={() => setEditItem(null)} className="btn-primary mt-3 mx-auto"><Plus size={14} /> Adicionar produto</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto</th>
                  {!modoTabela && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Custo</th>}
                  {isLumar && <th className="text-right px-4 py-3 text-xs font-semibold text-blue-600 uppercase tracking-wide">Preço Lumar</th>}
                  {isCantina && <th className="text-right px-4 py-3 text-xs font-semibold text-orange-600 uppercase tracking-wide">Varejo</th>}
                  {isCantina && <th className="text-right px-4 py-3 text-xs font-semibold text-orange-500 uppercase tracking-wide">Revenda</th>}
                  {!modoTabela && isLumar   && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Margem</th>}
                  {!modoTabela && isCantina && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Mg. Varejo</th>}
                  {!modoTabela && isCantina && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Mg. Revenda</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(it => (
                  <tr key={it.id} className={`hover:bg-slate-50 transition-colors ${!it.ativo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{it.nome}</span>
                        {it.pf && <span title="Preço Preferencial"><Star size={12} className="text-amber-400 fill-amber-400 shrink-0" /></span>}
                        {!it.ativo && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-medium">inativo</span>}
                      </div>
                    </td>
                    {!modoTabela && <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fmt(it.custo)}</td>}
                    {isLumar && <td className="px-4 py-3 text-right font-semibold text-blue-700 tabular-nums">{fmt(it.preco_lumar)}</td>}
                    {isCantina && <td className="px-4 py-3 text-right font-semibold text-orange-700 tabular-nums">{fmt(it.preco_varejo)}</td>}
                    {isCantina && <td className="px-4 py-3 text-right font-semibold text-orange-600 tabular-nums">{fmt(it.preco_revenda)}</td>}
                    {!modoTabela && isLumar   && <td className={`px-4 py-3 text-right tabular-nums ${margemColor(it.preco_lumar, it.custo)}`}>{margem(it.preco_lumar, it.custo)}</td>}
                    {!modoTabela && isCantina && <td className={`px-4 py-3 text-right tabular-nums ${margemColor(it.preco_varejo, it.custo)}`}>{margem(it.preco_varejo, it.custo)}</td>}
                    {!modoTabela && isCantina && <td className={`px-4 py-3 text-right tabular-nums ${margemColor(it.preco_revenda, it.custo)}`}>{margem(it.preco_revenda, it.custo)}</td>}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditItem(it)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><Pencil size={14} /></button>
                        <button onClick={() => deleteItem(it.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resumo rodapé */}
          {!modoTabela && (
            <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 flex flex-wrap gap-4 text-xs text-slate-500">
              {isLumar && (() => {
                const ativos = filtered.filter(x => x.preco_lumar && x.custo)
                const avgM = ativos.length ? ativos.reduce((s, x) => s + (x.preco_lumar! - x.custo!) / x.preco_lumar! * 100, 0) / ativos.length : 0
                return <span>Margem média: <strong className={margemColor(avgM + 1, 1)}>{avgM.toFixed(1)}%</strong></span>
              })()}
              {isCantina && (() => {
                const av = filtered.filter(x => x.preco_varejo && x.custo)
                const ar = filtered.filter(x => x.preco_revenda && x.custo)
                const avgV = av.length ? av.reduce((s, x) => s + (x.preco_varejo! - x.custo!) / x.preco_varejo! * 100, 0) / av.length : 0
                const avgR = ar.length ? ar.reduce((s, x) => s + (x.preco_revenda! - x.custo!) / x.preco_revenda! * 100, 0) / ar.length : 0
                return <>
                  <span>Mg. varejo média: <strong className={margemColor(avgV + 1, 1)}>{avgV.toFixed(1)}%</strong></span>
                  <span>Mg. revenda média: <strong className={margemColor(avgR + 1, 1)}>{avgR.toFixed(1)}%</strong></span>
                </>
              })()}
              <span className="ml-auto">{filtered.length} produto{filtered.length !== 1 ? 's' : ''} listados</span>
            </div>
          )}
        </div>
      )}

      {editItem !== undefined && (
        <PriceItemModal
          item={editItem}
          defaultEmpresa={empresa}
          onClose={() => setEditItem(undefined)}
          onSaved={load}
        />
      )}
    </div>
  )
}
