import { useState } from 'react'
import { X, User, Phone, MapPin, Building2, MessageSquare, Save, AlertCircle, Trash2, CheckCircle2, AlertTriangle, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client, ClientStatus } from '../types'

interface ClientModalProps {
  client?: Client | null
  onClose: () => void
  onSaved: () => void
}

export default function ClientModal({ client, onClose, onSaved }: ClientModalProps) {
  const [nome, setNome] = useState(client?.nome ?? '')
  const [telefone, setTelefone] = useState(client?.telefone ?? '')
  const [cnpj_cpf, setCnpjCpf] = useState(client?.cnpj_cpf ?? '')
  const [rota, setRota] = useState(client?.rota ?? '')
  const [setor, setSetor] = useState(client?.setor ?? '')
  const [pgto, setPgto] = useState(client?.pgto ?? '')
  const [localizacao, setLocalizacao] = useState(client?.localizacao ?? '')
  const [dia_entrega, setDiaEntrega] = useState(client?.dia_entrega ?? '')
  const [observacoes, setObservacoes] = useState(client?.observacoes ?? '')
  const [tipo, setTipo] = useState(client?.tipo ?? '')
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? 'ATIVO')
  
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')
    
    setSaving(true)
    setError(null)
    
    const clientData = {
      nome: nome.trim().toUpperCase(),
      telefone: telefone.trim() || null,
      cnpj_cpf: cnpj_cpf.trim() || null,
      rota: rota.trim() || null,
      setor: setor.trim() || null,
      pgto: pgto.trim() || null,
      localizacao: localizacao.trim() || null,
      dia_entrega: dia_entrega.trim() || null,
      observacoes: observacoes.trim() || null,
      tipo: tipo.trim() || null,
      status,
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
      <div className="relative bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <User size={18} className="text-orange-500" />
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label text-xs font-black uppercase text-slate-400">Nome do Cliente</label>
              <input className="input font-bold" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: JOÃO DA SILVA" autoFocus />
            </div>
            
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">CPF / CNPJ</label>
              <input className="input" value={cnpj_cpf} onChange={e => setCnpjCpf(e.target.value)} placeholder="00.000..." />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">WhatsApp / Telefone</label>
              <input className="input" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(62) 9..." />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Rota</label>
              <input className="input" value={rota} onChange={e => setRota(e.target.value)} placeholder="Ex: GARAVELO" />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Setor</label>
              <input className="input" value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex: MARISTA" />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Tipo (Lumar/Cantina)</label>
              <input className="input" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Ex: LUMAR" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Forma de Pagamento</label>
              <input className="input" value={pgto} onChange={e => setPgto(e.target.value)} placeholder="Ex: PIX - LUCIANO" />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Dias de Entrega</label>
              <input className="input" value={dia_entrega} onChange={e => setDiaEntrega(e.target.value)} placeholder="Ex: SEGUNDA, QUARTA" />
            </div>
          </div>

          <div>
            <label className="label text-xs font-black uppercase text-slate-400">Link Localização (Maps)</label>
            <input className="input" value={localizacao} onChange={e => setLocalizacao(e.target.value)} placeholder="https://maps..." />
          </div>

          <div>
            <label className="label text-xs font-black uppercase text-slate-400">Situação do Cliente</label>
            <div className="flex gap-2">
              <button onClick={() => setStatus('ATIVO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'ATIVO' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                <CheckCircle2 size={16} /> ATIVO
              </button>
              <button onClick={() => setStatus('PERDENDO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'PERDENDO' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                <AlertTriangle size={16} /> PERDENDO
              </button>
              <button onClick={() => setStatus('PERDIDO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'PERDIDO' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                <UserX size={16} /> PERDIDO
              </button>
            </div>
          </div>

          <div>
            <label className="label text-xs font-black uppercase text-slate-400">Observações Gerais</label>
            <textarea className="input min-h-[80px]" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Detalhes, restrições, horários..." />
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3 bg-slate-50/50">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center gap-2 py-3 shadow-md">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
