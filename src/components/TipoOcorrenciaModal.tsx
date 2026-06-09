import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { TipoOcorrencia } from '../types'

interface Props {
  tipo?: TipoOcorrencia | null
  onClose: () => void
  onSaved: () => void
}

export default function TipoOcorrenciaModal({ tipo, onClose, onSaved }: Props) {
  const [nome, setNome] = useState('')
  const [emoji, setEmoji] = useState('')
  const [cor, setCor] = useState('#64748b')
  const [ativo, setAtivo] = useState(true)
  const [ordem, setOrdem] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tipo) {
      setNome(tipo.nome)
      setEmoji(tipo.emoji)
      setCor(tipo.cor)
      setAtivo(tipo.ativo)
      setOrdem(tipo.ordem)
    }
  }, [tipo])

  const handleSave = async () => {
    if (!nome.trim()) {
      setError('Nome é obrigatório')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = { nome: nome.trim(), emoji, cor, ativo, ordem }

      if (tipo) {
        // Atualizar
        const { error: err } = await supabase
          .from('tipos_ocorrencia')
          .update(payload)
          .eq('id', tipo.id)
        if (err) throw err
      } else {
        // Inserir
        const { error: err } = await supabase
          .from('tipos_ocorrencia')
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-xl shadow-lg flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">
            {tipo ? 'Editar Ocorrência' : 'Nova Ocorrência'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nome *
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Cliente Ausente"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Emoji
            </label>
            <input
              type="text"
              value={emoji}
              onChange={e => setEmoji(e.target.value.slice(0, 2))}
              placeholder="🚪"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              maxLength={2}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Cor
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={cor}
                onChange={e => setCor(e.target.value)}
                className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
              />
              <input
                type="text"
                value={cor}
                onChange={e => setCor(e.target.value)}
                placeholder="#64748b"
                className="flex-1 px-3 py-2 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="mt-2 p-3 rounded" style={{ backgroundColor: cor + '20', color: cor }}>
              {emoji} Prévia de cor
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Ordem
            </label>
            <input
              type="number"
              value={ordem}
              onChange={e => setOrdem(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ativo}
              onChange={e => setAtivo(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <span className="text-sm font-medium">Ativo</span>
          </label>
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
            disabled={saving}
            className="flex-1 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 font-medium"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
