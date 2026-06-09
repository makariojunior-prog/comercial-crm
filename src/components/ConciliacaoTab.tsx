import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, Plus, Pencil, Trash2, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useRomaneioPedidos, type RomaneioItem } from '../hooks/useRomaneioPedidos'
import FinalizarConciliacaoModal from './FinalizarConciliacaoModal'
import type { RomaneioConciliacao, TipoOcorrencia } from '../types'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  date?: string
  entregador?: string
  turnoManha?: boolean
  turnoTarde?: boolean
  turnoNoite?: boolean
  empresaLumar?: boolean
  empresaCantina?: boolean
  drivers?: { id: string; nome: string }[]
  onRefresh?: () => void
}

type SubTab = 'pendentes' | 'historico'

export default function ConciliacaoTab({
  drivers = [],
}: Props) {
  const { profile, isAdmin } = useAuth()
  const { items, load } = useRomaneioPedidos()

  // Filtros de Romaneio
  const todayStr = new Date().toISOString().split('T')[0]
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterEntregador, setFilterEntregador] = useState('')
  const [filterTurnoManha, setFilterTurnoManha] = useState(true)
  const [filterTurnoTarde, setFilterTurnoTarde] = useState(true)
  const [filterTurnoNoite, setFilterTurnoNoite] = useState(true)
  const [filterEmpresaLumar, setFilterEmpresaLumar] = useState(true)
  const [filterEmpresaCantina, setFilterEmpresaCantina] = useState(true)

  // Sub-abas e estado de UI
  const [subTab, setSubTab] = useState<SubTab>('pendentes')
  const [conciliados, setConciliados] = useState<Map<string, RomaneioConciliacao>>(new Map())
  const [historico, setHistorico] = useState<RomaneioConciliacao[]>([])
  const [tipos, setTipos] = useState<TipoOcorrencia[]>([])
  const [loading, setLoading] = useState(false)

  // Seleção múltipla
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [finalizandoLote, setFinalizandoLote] = useState(false)

  // Modal de finalização
  const [editingItem, setEditingItem] = useState<RomaneioItem | null>(null)
  const [editingExisting, setEditingExisting] = useState<RomaneioConciliacao | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Filtros de histórico
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEntregador, setFiltroEntregador] = useState('')
  const [filtroDataDe, setFiltroDataDe] = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')

  // Carregamento inicial
  useEffect(() => {
    loadAll()
  }, [filterDate, filterEntregador, filterTurnoManha, filterTurnoTarde, filterTurnoNoite, filterEmpresaLumar, filterEmpresaCantina])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Carregar pedidos do romaneio
      await load({
        date: filterDate,
        entregador: filterEntregador,
        turnoManha: filterTurnoManha,
        turnoTarde: filterTurnoTarde,
        turnoNoite: filterTurnoNoite,
        empresaLumar: filterEmpresaLumar,
        empresaCantina: filterEmpresaCantina,
      })

      // 2. Carregar conciliações do dia
      const { data: conc } = await supabase
        .from('romaneio_conciliacao')
        .select('*')
        .eq('data_entrega', filterDate)
        .eq('status', 'finalizado')

      const concMap = new Map<string, RomaneioConciliacao>()
      if (conc) {
        conc.forEach(c => {
          const uid = `${c.empresa === 'LUMAR' ? 'L' : 'C'}${c.pedido_ref}`
          concMap.set(uid, c)
        })
      }
      setConciliados(concMap)

      // 3. Carregar histórico (últimos 30 dias)
      const dataMinima = new Date(new Date(filterDate).setDate(new Date(filterDate).getDate() - 30)).toISOString().split('T')[0]
      const { data: hist } = await supabase
        .from('romaneio_conciliacao')
        .select('*, tipo_ocorrencia:tipos_ocorrencia(nome,emoji,cor)')
        .eq('status', 'finalizado')
        .gte('data_entrega', dataMinima)
        .order('data_conciliacao', { ascending: false })

      setHistorico((hist || []) as RomaneioConciliacao[])

      // 4. Carregar tipos de ocorrência
      const { data: tiposData } = await supabase
        .from('tipos_ocorrencia')
        .select('*')
        .eq('ativo', true)
        .order('ordem')

      setTipos(tiposData || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }, [filterDate, filterEntregador, filterTurnoManha, filterTurnoTarde, filterTurnoNoite, filterEmpresaLumar, filterEmpresaCantina, load])

  // Itens pendentes (sem conciliação)
  const itensPendentes = useMemo(() => {
    return items.filter(item => !conciliados.has(item.uid))
  }, [items, conciliados])

  // Histórico filtrado
  const historicoFiltrado = useMemo(() => {
    return historico.filter(h => {
      if (filtroCliente && !h.cliente_nome?.toLowerCase().includes(filtroCliente.toLowerCase())) return false
      if (filtroTipo && h.tipo_ocorrencia_id !== filtroTipo) return false
      if (filtroEntregador && h.entregador !== filtroEntregador) return false
      if (filtroDataDe && h.data_entrega && h.data_entrega < filtroDataDe) return false
      if (filtroDataAte && h.data_entrega && h.data_entrega > filtroDataAte) return false
      return true
    })
  }, [historico, filtroCliente, filtroTipo, filtroEntregador, filtroDataDe, filtroDataAte])

  // Finalizar lote
  const handleFinalizarLote = useCallback(async () => {
    if (selected.size === 0) return
    setFinalizandoLote(true)

    try {
      const itensSelecionados = itensPendentes.filter(i => selected.has(i.uid))

      // Encontrar tipo "Sem Ocorrência"
      const tipoSemOcorrencia = tipos.find(t => t.nome === 'Sem Ocorrência')

      const conciliacoes = itensSelecionados.map(item => ({
        empresa: item.empresa,
        pedido_ref: item.uid.slice(1),
        cliente_nome: item.cliente,
        numero_pedido: item.pedido,
        data_entrega: item.data_entrega,
        entregador: item.entregador,
        valor_pedido: item.valor,
        status: 'finalizado' as const,
        data_conciliacao: new Date().toISOString(),
        usuario_conciliacao_id: profile?.id || null,
        usuario_conciliacao_nome: profile?.nome || profile?.email || null,
        metodos_pagamento: [{tipo: 'Dinheiro', valor: item.valor}] as any,
        valor_recebido: item.valor,
        tipo_ocorrencia_id: tipoSemOcorrencia?.id || null,
        observacoes: null,
      }))

      const { error } = await supabase
        .from('romaneio_conciliacao')
        .insert(conciliacoes)

      if (error) throw error

      setSelected(new Set())
      await loadAll()
    } catch (err) {
      console.error('Erro ao finalizar lote:', err)
    } finally {
      setFinalizandoLote(false)
    }
  }, [selected, itensPendentes, tipos, profile, loadAll])

  const handleDeleteConciliacao = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar esta conciliação?')) return
    try {
      const { error } = await supabase
        .from('romaneio_conciliacao')
        .delete()
        .eq('id', id)
      if (error) throw error
      await loadAll()
    } catch (err) {
      console.error('Erro ao deletar:', err)
    }
  }

  const handleModalOpen = (item: RomaneioItem) => {
    setEditingItem(item)
    setEditingExisting(conciliados.get(item.uid) || null)
    setShowModal(true)
  }

  const handleModalOpenHistorico = (conc: RomaneioConciliacao) => {
    if (!isAdmin) return
    // Reconverter para RomaneioItem para edição
    const item: RomaneioItem = {
      uid: `${conc.empresa === 'LUMAR' ? 'L' : 'C'}${conc.pedido_ref}`,
      empresa: conc.empresa as 'LUMAR' | 'CANTINA',
      pedido: conc.numero_pedido || conc.pedido_ref,
      cliente: conc.cliente_nome || '—',
      turno: '',
      rota: '',
      pgto: '',
      valor: conc.valor_pedido,
      obs: '',
      ocorrencia_db: '',
      data_entrega: conc.data_entrega,
      entregador: conc.entregador,
    }
    setEditingItem(item)
    setEditingExisting(conc)
    setShowModal(true)
  }

  const pendentesCount = itensPendentes.length
  const historicoCount = historicoFiltrado.length

  return (
    <div className="space-y-4">
      {/* Filtros de Romaneio */}
      <div className="space-y-3 bg-slate-50 p-3 rounded border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Data */}
          <div>
            <label className="text-xs font-semibold text-slate-700">Data</label>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Entregador */}
          <div>
            <label className="text-xs font-semibold text-slate-700">Entregador</label>
            <select
              value={filterEntregador}
              onChange={e => setFilterEntregador(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Todos</option>
              <option value="RETIRADA">🏪 RETIRADA</option>
              {drivers.map(d => (
                <option key={d.id} value={d.nome}>{d.nome}</option>
              ))}
            </select>
          </div>

          {/* Placeholder para alinhar */}
          <div />
        </div>

        {/* Turnos */}
        <div className="flex gap-2 items-center">
          <span className="text-xs font-semibold text-slate-700">Turnos:</span>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filterTurnoManha}
              onChange={e => setFilterTurnoManha(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            MANHÃ
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filterTurnoTarde}
              onChange={e => setFilterTurnoTarde(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            TARDE
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filterTurnoNoite}
              onChange={e => setFilterTurnoNoite(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            NOITE
          </label>
        </div>

        {/* Empresas */}
        <div className="flex gap-2 items-center">
          <span className="text-xs font-semibold text-slate-700">Empresas:</span>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filterEmpresaLumar}
              onChange={e => setFilterEmpresaLumar(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            🚚 LUMAR
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={filterEmpresaCantina}
              onChange={e => setFilterEmpresaCantina(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            🍔 CANTINA
          </label>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setSubTab('pendentes')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            subTab === 'pendentes'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          Pendentes ({pendentesCount})
        </button>
        <button
          onClick={() => setSubTab('historico')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            subTab === 'historico'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
        >
          Histórico ({historicoCount})
        </button>
      </div>

      {/* Aba: Pendentes */}
      {subTab === 'pendentes' && (
        <div className="space-y-4">
          {itensPendentes.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 p-3 rounded flex-wrap">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.size === itensPendentes.length && itensPendentes.length > 0}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelected(new Set(itensPendentes.map(i => i.uid)))
                    } else {
                      setSelected(new Set())
                    }
                  }}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-sm font-semibold text-blue-700">
                  {selected.size > 0 ? `${selected.size}/${itensPendentes.length} pedidos` : 'Selecionar Todos'}
                </span>
              </label>
              {selected.size > 0 && (
                <button
                  onClick={handleFinalizarLote}
                  disabled={finalizandoLote}
                  className="ml-auto px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {finalizandoLote ? 'Finalizando...' : 'Finalizar Selecionados'}
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-slate-600">Carregando...</div>
          ) : itensPendentes.length === 0 ? (
            <div className="text-center py-8 text-slate-600">Nenhum pedido pendente de conciliação.</div>
          ) : (
            <div className="space-y-2">
              {itensPendentes.map(item => (
                <div
                  key={item.uid}
                  className="flex items-center gap-3 bg-white border border-slate-200 p-3 rounded hover:shadow-sm transition"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(item.uid)}
                    onChange={e => {
                      const s = new Set(selected)
                      if (e.target.checked) s.add(item.uid)
                      else s.delete(item.uid)
                      setSelected(s)
                    }}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{item.cliente}</div>
                    <div className="text-xs text-slate-600">
                      Pedido {item.pedido} • {item.entregador || '—'} • {item.empresa}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">{fmt(item.valor)}</div>
                  </div>
                  <button
                    onClick={() => handleModalOpen(item)}
                    className="px-3 py-1 bg-orange-500 text-white text-sm rounded hover:bg-orange-600"
                  >
                    Finalizar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Finalização/Edição */}
      {showModal && editingItem && (
        <FinalizarConciliacaoModal
          item={editingItem}
          existing={editingExisting}
          onClose={() => {
            setShowModal(false)
            setEditingItem(null)
            setEditingExisting(null)
          }}
          onSaved={() => {
            setShowModal(false)
            setEditingItem(null)
            setEditingExisting(null)
            loadAll()
          }}
        />
      )}

      {/* Aba: Histórico */}
      {subTab === 'historico' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <input
              type="date"
              value={filtroDataDe}
              onChange={e => setFiltroDataDe(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="De"
            />
            <input
              type="date"
              value={filtroDataAte}
              onChange={e => setFiltroDataAte(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Até"
            />
            <select
              value={filtroEntregador}
              onChange={e => setFiltroEntregador(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Entregador</option>
              {drivers.map(d => (
                <option key={d.id} value={d.nome}>
                  {d.nome}
                </option>
              ))}
            </select>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Ocorrência</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.nome}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filtroCliente}
              onChange={e => setFiltroCliente(e.target.value)}
              placeholder="Cliente..."
              className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Cartões */}
          {historicoFiltrado.length === 0 ? (
            <div className="text-center py-8 text-slate-600">Nenhum histórico encontrado.</div>
          ) : (
            <div className="space-y-2">
              {historicoFiltrado.map(conc => {
                const tipo = conc.tipo_ocorrencia as any
                return (
                  <div
                    key={conc.id}
                    className="bg-white border-l-4 p-3 rounded shadow-sm hover:shadow-md transition"
                    style={{ borderColor: tipo?.cor || '#64748b' }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{conc.cliente_nome}</div>
                        <div className="text-xs text-slate-600">
                          Pedido {conc.numero_pedido} • {conc.entregador || '—'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">{fmt(conc.valor_pedido)}</div>
                        {conc.divergencia !== 0 && (
                          <div className={`text-xs ${conc.divergencia > 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {conc.divergencia > 0 ? '+' : ''}{fmt(conc.divergencia)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Métodos de Pagamento */}
                    {conc.metodos_pagamento && conc.metodos_pagamento.length > 0 && (
                      <div className="text-xs text-slate-600 mb-2">
                        {conc.metodos_pagamento.map(m => (
                          <span key={m.tipo} className="inline-block mr-2">
                            {m.tipo}: {fmt(m.valor)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Ocorrência e Data */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      {tipo && (
                        <span className="px-2 py-1 rounded" style={{ backgroundColor: tipo.cor + '20', color: tipo.cor }}>
                          {tipo.emoji} {tipo.nome}
                        </span>
                      )}
                      <span className="text-slate-600">
                        {conc.data_conciliacao ? format(parseISO(conc.data_conciliacao), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
                      </span>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleModalOpenHistorico(conc)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteConciliacao(conc.id)}
                            className="p-1 hover:bg-red-100 text-red-700 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {conc.observacoes && (
                      <div className="text-xs text-slate-600 mt-2 italic">{conc.observacoes}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de Finalização */}
      {showModal && editingItem && (
        <FinalizarConciliacaoModal
          item={editingItem}
          existing={editingExisting}
          onClose={() => {
            setShowModal(false)
            setEditingItem(null)
            setEditingExisting(null)
          }}
          onSaved={() => {
            setShowModal(false)
            setEditingItem(null)
            setEditingExisting(null)
            loadAll()
          }}
        />
      )}
    </div>
  )
}
