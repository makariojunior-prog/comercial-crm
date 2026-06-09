import { useState, useEffect, useCallback } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { RomaneioItem } from '../hooks/useRomaneioPedidos'
import type { RomaneioConciliacao, TipoOcorrencia, ConciliacaoMetodoPagamento } from '../types'

const METODOS = ['Pix', 'Dinheiro', 'Cartão', 'Boleto'] as const
type MetodoTipo = typeof METODOS[number]

interface Props {
  item: RomaneioItem
  existing?: RomaneioConciliacao | null
  onClose: () => void
  onSaved: () => void
}

export default function FinalizarConciliacaoModal({ item, existing, onClose, onSaved }: Props) {
  const { profile } = useAuth()
  const [tipos, setTipos] = useState<TipoOcorrencia[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estado do formulário
  const [metodos, setMetodos] = useState<Record<MetodoTipo, { checked: boolean; valor: number }>>({
    Pix: { checked: false, valor: 0 },
    Dinheiro: { checked: false, valor: 0 },
    Cartão: { checked: false, valor: 0 },
    Boleto: { checked: false, valor: 0 },
  })
  const [tipoOcorrenciaId, setTipoOcorrenciaId] = useState<string>('')
  const [observacoes, setObservacoes] = useState('')

  // Carregamento inicial
  useEffect(() => {
    loadTipos()
  }, [])

  // Pré-preenchimento se estiver editando
  useEffect(() => {
    if (existing) {
      setTipoOcorrenciaId(existing.tipo_ocorrencia_id || '')
      setObservacoes(existing.observacoes || '')
      const newMetodos = { ...metodos }
      existing.metodos_pagamento.forEach(m => {
        if (m.tipo in newMetodos) {
          newMetodos[m.tipo as MetodoTipo] = { checked: true, valor: m.valor }
        }
      })
      setMetodos(newMetodos)
    }
  }, [existing])

  const loadTipos = async () => {
    try {
      const { data, error: err } = await supabase
        .from('tipos_ocorrencia')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
      if (err) throw err
      setTipos(data || [])
      if (data && data.length > 0 && !existing) {
        setTipoOcorrenciaId(data[0].id)
      }
    } catch (err) {
      setError(`Erro ao carregar tipos: ${err instanceof Error ? err.message : 'desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }

  const valorRecebido = Object.values(metodos)
    .filter(m => m.checked)
    .reduce((sum, m) => sum + m.valor, 0)

  const divergencia = valorRecebido - item.valor

  const handleMetodoChange = (tipo: MetodoTipo, checked: boolean) => {
    setMetodos(prev => ({
      ...prev,
      [tipo]: { ...prev[tipo], checked },
    }))
  }

  const handleMetodoValor = (tipo: MetodoTipo, valor: string) => {
    const n = parseFloat(valor) || 0
    setMetodos(prev => ({
      ...prev,
      [tipo]: { ...prev[tipo], valor: Math.max(0, n) },
    }))
  }

  const handleSave = async () => {
    if (!profile?.id) {
      setError('Usuário não autenticado')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const metodosPagamento: ConciliacaoMetodoPagamento[] = Object.entries(metodos)
        .filter(([_, m]) => m.checked && m.valor > 0)
        .map(([tipo, m]) => ({ tipo: tipo as MetodoTipo, valor: m.valor }))

      const payload = {
        empresa: item.empresa,
        pedido_ref: item.uid.slice(1),
        cliente_nome: item.cliente,
        numero_pedido: item.pedido,
        data_entrega: item.data_entrega,
        entregador: item.entregador,
        valor_pedido: item.valor,
        status: 'finalizado' as const,
        data_conciliacao: new Date().toISOString(),
        usuario_conciliacao_id: profile.id,
        usuario_conciliacao_nome: profile.nome || profile.email,
        metodos_pagamento: metodosPagamento,
        valor_recebido: valorRecebido,
        tipo_ocorrencia_id: tipoOcorrenciaId || null,
        observacoes: observacoes.trim() || null,
      }

      if (existing) {
        // Atualizar
        const { error: err } = await supabase
          .from('romaneio_conciliacao')
          .update(payload)
          .eq('id', existing.id)
        if (err) throw err
      } else {
        // Inserir
        const { error: err } = await supabase
          .from('romaneio_conciliacao')
          .insert([payload])
        if (err) throw err
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(`Erro ao salvar: ${err instanceof Error ? err.message : 'desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white rounded p-4">Carregando...</div></div>

  const tipoSelecionado = tipos.find(t => t.id === tipoOcorrenciaId)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-xl shadow-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Finalizar Pedido</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
              {error}
            </div>
          )}

          {/* Dados do Pedido */}
          <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200">
            <div className="text-sm font-semibold text-slate-700">Dados do Pedido</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-slate-600">Empresa</div>
                <div className="font-semibold">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-bold text-white ${item.empresa === 'LUMAR' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                    {item.empresa}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-slate-600">Nº Pedido</div>
                <div className="font-semibold">{item.pedido}</div>
              </div>
              <div>
                <div className="text-slate-600">Cliente</div>
                <div className="font-semibold">{item.cliente}</div>
              </div>
              <div>
                <div className="text-slate-600">Entregador</div>
                <div className="font-semibold">{item.entregador || '—'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-600">Valor Original</div>
                <div className="font-semibold text-lg">
                  {item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Pagamento */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700">Métodos de Pagamento</div>
            <div className="space-y-2">
              {METODOS.map(tipo => (
                <div key={tipo} className="flex gap-2 items-end">
                  <label className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={metodos[tipo].checked}
                      onChange={e => handleMetodoChange(tipo, e.target.checked)}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm font-medium">{tipo}</span>
                  </label>
                  {metodos[tipo].checked && (
                    <input
                      type="number"
                      value={metodos[tipo].valor || ''}
                      onChange={e => handleMetodoValor(tipo, e.target.value)}
                      placeholder="0.00"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Resumo */}
            <div className="space-y-1 bg-blue-50 p-3 rounded border border-blue-200 mt-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Recebido:</span>
                <span className="font-semibold">
                  {valorRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              {divergencia !== 0 && (
                <div className={`flex justify-between text-sm font-semibold ${divergencia > 0 ? 'text-green-700' : 'text-red-700'}`}>
                  <span>Divergência:</span>
                  <span>{divergencia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tipo de Ocorrência */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Tipo de Ocorrência</label>
            <div className="relative">
              <select
                value={tipoOcorrenciaId}
                onChange={e => setTipoOcorrenciaId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none"
              >
                <option value="">Selecione...</option>
                {tipos.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.emoji} {t.nome}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>
            {tipoSelecionado && (
              <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: tipoSelecionado.cor + '20', color: tipoSelecionado.cor }}>
                {tipoSelecionado.emoji} {tipoSelecionado.nome}
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Observações</label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Adicione observações sobre a entrega..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm resize-none"
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t p-4 bg-slate-50">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !tipoOcorrenciaId}
            className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 font-medium"
          >
            {saving ? 'Salvando...' : 'Confirmar e Finalizar'}
          </button>
        </div>
      </div>
    </div>
  )
}
