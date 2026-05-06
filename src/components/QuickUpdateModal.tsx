import { useState } from 'react'
import { X, Phone, MessageCircle, CheckCircle, TrendingUp, XCircle, MinusCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Deal, DealStatus } from '../types'
import { StatusBadge } from './StatusBadge'

interface Props {
  deal: Deal
  onClose: () => void
  onSaved: () => void
}

const statusOptions: { value: DealStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'NOVO', label: 'Novo', icon: <MessageCircle size={16} />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'EM ANDAMENTO', label: 'Em Andamento', icon: <TrendingUp size={16} />, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'SUCESSO', label: 'Sucesso! ✅', icon: <CheckCircle size={16} />, color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'DESISTIU', label: 'Desistiu', icon: <MinusCircle size={16} />, color: 'bg-red-50 text-red-600 border-red-200' },
  { value: 'CANCELADO', label: 'Cancelado', icon: <XCircle size={16} />, color: 'bg-slate-50 text-slate-500 border-slate-200' },
]

export default function QuickUpdateModal({ deal, onClose, onSaved }: Props) {
  const [followUp, setFollowUp] = useState(deal.follow_up ?? '')
  const [status, setStatus] = useState<DealStatus>(deal.status ?? 'NOVO')
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  async function save() {
    setSaving(true)
    await supabase
      .from('deals')
      .update({
        follow_up: followUp,
        status,
        last_contact_date: today,
      })
      .eq('id', deal.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Atualizar Negócio</p>
            <h2 className="font-bold text-lg text-slate-800 leading-tight">{deal.client_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={deal.status} />
              {deal.contact_phone && (
                <a
                  href={`https://wa.me/55${deal.contact_phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                >
                  <Phone size={12} />
                  {deal.contact_name ?? 'Contato'}
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Status rápido */}
          <div>
            <label className="label">Status do negócio</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    status === opt.value
                      ? opt.color + ' border-2'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Acompanhamento */}
          <div>
            <label className="label">O que aconteceu? (acompanhamento)</label>
            <textarea
              value={followUp}
              onChange={e => setFollowUp(e.target.value)}
              placeholder="Ex: Falei com a Wilma, vai testar primeiro e nos dá um retorno na semana que vem..."
              rows={3}
              className="input resize-none"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
              📅 <strong>Data de contato</strong> será registrada como <strong>hoje</strong> automaticamente.
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            {saving ? 'Salvando...' : '✅ Salvar Atualização'}
          </button>
        </div>
      </div>
    </div>
  )
}
