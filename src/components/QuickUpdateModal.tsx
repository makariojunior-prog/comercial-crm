import { useEffect, useState, useCallback } from 'react'
import { X, Phone, MessageCircle, CheckCircle, TrendingUp, XCircle, MinusCircle, AlertCircle, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Deal, DealHistory, DealStatus } from '../types'
import { StatusBadge } from './StatusBadge'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  deal: Deal
  onClose: () => void
  onSaved: () => void
}

const statusOptions: { value: DealStatus; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'NOVO',         label: 'Novo',         icon: <MessageCircle size={15} />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'EM ANDAMENTO', label: 'Em Andamento', icon: <TrendingUp size={15} />,    color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'SUCESSO',      label: 'Sucesso ✅',   icon: <CheckCircle size={15} />,   color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'DESISTIU',     label: 'Desistiu',     icon: <MinusCircle size={15} />,   color: 'bg-red-50 text-red-600 border-red-200' },
  { value: 'CANCELADO',    label: 'Cancelado',    icon: <XCircle size={15} />,       color: 'bg-slate-50 text-slate-500 border-slate-200' },
]

const statusColor: Record<string, string> = {
  'NOVO': 'text-blue-600', 'EM ANDAMENTO': 'text-amber-600',
  'SUCESSO': 'text-green-600', 'DESISTIU': 'text-red-500', 'CANCELADO': 'text-slate-400',
}

export default function QuickUpdateModal({ deal, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [followUp, setFollowUp]       = useState('')
  const [status, setStatus]           = useState<DealStatus>(deal.status ?? 'NOVO')
  const [contactDate, setContactDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [history, setHistory]         = useState<DealHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    let active = true
    setLoadingHistory(true)
    supabase
      .from('crm_deal_history')
      .select('*')
      .eq('deal_id', deal.id)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        setHistory((data as DealHistory[]) ?? [])
        setLoadingHistory(false)
      })
    return () => { active = false }
  }, [deal.id])

  async function save() {
    if (!followUp.trim()) return
    setSaving(true)
    setError(null)

    const { error: dealErr } = await supabase
      .from('deals')
      .update({ follow_up: followUp, status, last_contact_date: contactDate })
      .eq('id', deal.id)

    if (dealErr) {
      setError('Erro ao salvar: ' + dealErr.message)
      setSaving(false)
      return
    }

    await supabase.from('crm_deal_history').insert({
      deal_id: deal.id,
      client_name: deal.client_name,
      status_before: deal.status,
      status_after: status,
      follow_up: followUp,
      last_contact_date: contactDate,
    })

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Atualizar Negócio</p>
            <h2 className="font-bold text-lg text-slate-800 leading-tight">{deal.client_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={deal.status} />
              {deal.contact_phone && (
                <a
                  href={`https://wa.me/55${deal.contact_phone.replace(/\D/g, '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
                >
                  <Phone size={12} /> {deal.contact_name ?? 'Contato'}
                </a>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">

          {/* Histórico */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-2">
              <Clock size={12} /> Histórico
            </p>
            {loadingHistory ? (
              <p className="text-xs text-slate-400">Carregando...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhuma atualização ainda.</p>
            ) : (
              <div className="relative space-y-3 pl-4 border-l-2 border-slate-200 max-h-48 overflow-y-auto pr-1">
                {history.map(h => (
                  <div key={h.id} className="relative">
                    <span className="absolute -left-[1.15rem] top-1 w-3 h-3 rounded-full bg-white border-2 border-slate-300" />
                    <p className="text-[11px] text-slate-400">
                      {h.last_contact_date
                        ? format(parseISO(h.last_contact_date), 'dd/MM/yyyy', { locale: ptBR })
                        : format(parseISO(h.updated_at), 'dd/MM/yyyy', { locale: ptBR })}
                      {h.status_before !== h.status_after && h.status_after && (
                        <span className="ml-1">
                          · <span className={statusColor[h.status_before ?? ''] ?? 'text-slate-500'}>{h.status_before}</span>
                          {' → '}
                          <span className={statusColor[h.status_after] ?? 'text-slate-700'}>{h.status_after}</span>
                        </span>
                      )}
                    </p>
                    {h.follow_up && (
                      <p className="text-xs text-slate-600 mt-0.5 italic">"{h.follow_up}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700" />

          {/* Nova atualização */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Nova atualização</p>

            {/* Data do contato */}
            <div>
              <label className="label">Data do contato</label>
              <input
                type="date"
                className="input"
                value={contactDate}
                onChange={e => setContactDate(e.target.value)}
              />
            </div>

            {/* Status */}
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
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Acompanhamento */}
            <div>
              <label className="label">O que aconteceu?</label>
              <textarea
                value={followUp}
                onChange={e => setFollowUp(e.target.value)}
                placeholder="Ex: Falei com a Wilma, vai testar primeiro e nos dá retorno na semana..."
                rows={3}
                className="input resize-none"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button
            onClick={save}
            disabled={saving || !followUp.trim()}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            {saving ? 'Salvando...' : '✅ Salvar Atualização'}
          </button>
        </div>
      </div>
    </div>
  )
}
