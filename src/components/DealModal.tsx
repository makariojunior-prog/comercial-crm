import { useState, useEffect } from 'react'
import { X, AlertCircle, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Deal, DealStatus, DealPriority } from '../types'
import { DEAL_TYPES, STATUS_ORDER } from '../types'

interface Props {
  deal?: Deal | null
  onClose: () => void
  onSaved: () => void
}

const emptyForm = {
  start_date:       new Date().toISOString().split('T')[0],
  client_name:      '',
  contact_name:     '',
  contact_phone:    '',
  deal_type:        'CANTINA REVENDA',
  interest:         '',
  last_contact_date: new Date().toISOString().split('T')[0],
  status:           'NOVO' as DealStatus,
  priority:         'MÉDIA' as DealPriority,
  follow_up:        '',
  end_date:         '',
  potential_notes:  '',
}

export default function DealModal({ deal, onClose, onSaved }: Props) {
  const [form, setForm] = useState(
    deal ? {
      start_date:       deal.start_date        ?? emptyForm.start_date,
      client_name:      deal.client_name,
      contact_name:     deal.contact_name       ?? '',
      contact_phone:    deal.contact_phone      ?? '',
      deal_type:        deal.deal_type          ?? emptyForm.deal_type,
      interest:         deal.interest           ?? '',
      last_contact_date: deal.last_contact_date ?? emptyForm.last_contact_date,
      status:           deal.status             ?? emptyForm.status,
      priority:         deal.priority           ?? emptyForm.priority,
      follow_up:        deal.follow_up          ?? '',
      end_date:         deal.end_date           ?? '',
      potential_notes:  deal.potential_notes    ?? '',
    } : emptyForm
  )

  const initResponsaveis = (): string[] => {
    if (deal?.responsaveis?.length) return deal.responsaveis
    if (deal?.responsible) return [deal.responsible]
    return []
  }
  const [responsaveis, setResponsaveis] = useState<string[]>(initResponsaveis)
  const [staffOptions, setStaffOptions] = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('crm_staff')
      .select('name')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setStaffOptions(data.map((s: any) => s.name as string))
      })
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleResp(name: string) {
    setResponsaveis(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  async function save() {
    if (!form.client_name.trim()) return setError('Nome do cliente é obrigatório')
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      responsible:     responsaveis[0] ?? null,
      responsaveis:    responsaveis,
      end_date:        form.end_date        || null,
      potential_notes: form.potential_notes || null,
    }
    const { error: err } = deal
      ? await supabase.from('deals').update(payload).eq('id', deal.id)
      : await supabase.from('deals').insert(payload)
    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }

  const isClosing = form.status === 'SUCESSO' || form.status === 'DESISTIU' || form.status === 'CANCELADO'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800">{deal ? 'Editar Negócio' : 'Novo Negócio'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className="label">Nome do Contato</label>
              <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Pessoa de contato" />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="62 9xxxx-xxxx" />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.deal_type} onChange={e => set('deal_type', e.target.value)}>
                {DEAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_ORDER.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {['ALTA', 'MÉDIA', 'BAIXA'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Data Início</label>
              <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Último Contato</label>
              <input type="date" className="input" value={form.last_contact_date} onChange={e => set('last_contact_date', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Interesse / Objetivo</label>
              <input className="input" value={form.interest} onChange={e => set('interest', e.target.value)} placeholder="Ex: Revender Cantina em Casa no estabelecimento" />
            </div>
          </div>

          {/* Responsáveis multi-select */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Users size={13} /> Responsáveis
            </label>
            {staffOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Carregando equipe… Cadastre membros em Usuários &gt; Equipe.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staffOptions.map(name => {
                  const sel = responsaveis.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleResp(name)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                        sel
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  )
                })}
              </div>
            )}
            {responsaveis.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                {responsaveis.length} selecionado(s): {responsaveis.join(', ')}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">Acompanhamento</label>
              <textarea className="input resize-none" rows={3} value={form.follow_up} onChange={e => set('follow_up', e.target.value)} placeholder="Situação atual, próximos passos..." />
            </div>
            <div>
              <label className="label">Potencial não atendido</label>
              <input className="input" value={form.potential_notes} onChange={e => set('potential_notes', e.target.value)} placeholder="Ex: Não temos estrutura para atender essa demanda agora" />
            </div>
            {isClosing && (
              <div>
                <label className="label">Data de Encerramento</label>
                <input type="date" className="input" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="px-5 pb-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200 py-2">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.client_name.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : deal ? 'Salvar Alterações' : 'Criar Negócio'}
          </button>
        </div>
      </div>
    </div>
  )
}
