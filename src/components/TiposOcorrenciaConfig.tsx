import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import TipoOcorrenciaModal from './TipoOcorrenciaModal'
import type { TipoOcorrencia } from '../types'

export default function TiposOcorrenciaConfig() {
  const [tipos, setTipos] = useState<TipoOcorrencia[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTipo, setEditingTipo] = useState<TipoOcorrencia | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    loadTipos()
  }, [])

  const loadTipos = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('tipos_ocorrencia')
        .select('*')
        .order('ordem')
      if (error) throw error
      setTipos(data || [])
    } catch (err) {
      console.error('Erro ao carregar tipos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleEdit = (tipo: TipoOcorrencia) => {
    setEditingTipo(tipo)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja deletar este tipo de ocorrência?')) return
    try {
      const { error } = await supabase
        .from('tipos_ocorrencia')
        .delete()
        .eq('id', id)
      if (error) throw error
      await loadTipos()
    } catch (err) {
      console.error('Erro ao deletar:', err)
    }
  }

  const handleOpenNew = () => {
    setEditingTipo(null)
    setShowModal(true)
  }

  if (loading) {
    return <div className="text-center py-8 text-slate-600">Carregando...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tipos de Ocorrência</h3>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          <Plus size={18} /> Novo
        </button>
      </div>

      <div className="space-y-2">
        {tipos.length === 0 ? (
          <div className="text-center py-8 text-slate-600">Nenhum tipo de ocorrência cadastrado.</div>
        ) : (
          tipos.map(tipo => (
            <div
              key={tipo.id}
              className="flex items-center gap-3 bg-white border-l-4 p-3 rounded hover:shadow-sm transition"
              style={{ borderColor: tipo.cor }}
            >
              <div className="text-2xl">{tipo.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{tipo.nome}</div>
                <div className="text-xs text-slate-600">
                  Ordem: {tipo.ordem} • {tipo.ativo ? '✓ Ativo' : '✗ Inativo'}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded border"
                style={{ backgroundColor: tipo.cor }}
                title={tipo.cor}
              />
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(tipo)}
                  className="p-2 hover:bg-blue-50 text-blue-600 rounded transition"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(tipo.id)}
                  className="p-2 hover:bg-red-50 text-red-600 rounded transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <TipoOcorrenciaModal
          tipo={editingTipo}
          onClose={() => {
            setShowModal(false)
            setEditingTipo(null)
          }}
          onSaved={async () => {
            setShowModal(false)
            setEditingTipo(null)
            await loadTipos()
          }}
        />
      )}
    </div>
  )
}
