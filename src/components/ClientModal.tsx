import { useState } from 'react'
import { X, User, Phone, MapPin, Building2, MessageSquare, Save, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client } from '../types'

interface ClientModalProps {
  client?: Client | null
  onClose: () => void
  onSaved: () => void
}

export default function ClientModal({ client, onClose, onSaved }: ClientModalProps) {
  const [nome, setNome] = useState(client?.nome ?? '')
  const [telefone, setTelefone] = useState(client?.telefone ?? '')
  const [setor, setSetor] = useState(client?.setor ?? '')
  const [empresa, setEmpresa] = useState(client?.empresa ?? '')
  const [origem, setOrigem] = useState(client?.origem ?? '')
  const [atendente, setAtendente] = useState(client?.atendente ?? '')
  const [observacao, setObservacao] = useState(client?.observacao ?? '')
  const [ativo, setAtivo] = useState(client?.ativo ?? true)
  
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')
    
    setSaving(true)
    setError(null)
    
    const clientData = {
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      setor: setor.trim() || null,
      empresa: empresa.trim() || null,
      origem: origem.trim() || null,
      atendente: atendente.trim() || null,
      observacao: observacao.trim() || null,
      ativo,
    }

    try {
      if (client?.id) {
        const { error: err } = await supabase.from('crm_clients').update(clientData).eq('id', client.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('crm_clients').insert({ ...clientData, pedidos_count: 0 })
        if (err) throw err
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <User size={18} className="text-orange-500" />
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="label">Nome do Cliente / Empresa</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João Silva ou Empresa LTDA" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5"><Phone size={14} /> Telefone</label>
              <input className="input" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(62) 9..." />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><MapPin size={14} /> Setor/Região</label>
              <input className="input" value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex: Marista" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5"><Building2 size={14} /> Empresa (Lumar/Cantina)</label>
              <input className="input" value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Ex: Lumar" />
            </div>
            <div>
              <label className="label">Origem</label>
              <input className="input" value={origem} onChange={e => setOrigem(e.target.value)} placeholder="Ex: Instagram" />
            </div>
          </div>

          <div>
            <label className="label">Atendente Responsável</label>
            <input className="input" value={atendente} onChange={e => setAtendente(e.target.value)} placeholder="Quem cadastrou?" />
          </div>

          <div>
            <label className="label flex items-center gap-1.5"><MessageSquare size={14} /> Observações</label>
            <textarea className="input min-h-[80px]" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Detalhes, preferências de horário, etc..." />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 accent-orange-500 rounded" />
            Cliente ativo
          </label>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center gap-2">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
