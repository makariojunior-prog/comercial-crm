import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Visit } from '../types'
import { RESPONSAVEIS, VISIT_TYPES, VISIT_STATUS } from '../types'

interface Props {
  visit?: Visit | null
  onClose: () => void
  onSaved: () => void
}

const emptyForm = {
  visit_date: new Date().toISOString().split('T')[0],
  visit_type: 'Prospecção',
  client_name: '',
  responsible: 'MAKÁRIO',
  demand: '',
  report: '',
  priority: 'MÉDIA',
  status: 'Realizada',
}

export default function VisitModal({ visit, onClose, onSaved }: Props) {
  const [form, setForm] = useState(
    visit
      ? {
          visit_date: visit.visit_date ?? emptyForm.visit_date,
          visit_type: visit.visit_type ?? emptyForm.visit_type,
          client_name: visit.client_name,
          responsible: visit.responsible ?? emptyForm.responsible,
          demand: visit.demand ?? '',
          report: visit.report ?? '',
          priority: visit.priority ?? emptyForm.priority,
          status: visit.status ?? emptyForm.status,
        }
      : emptyForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.client_name.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = visit
      ? await supabase.from('visits').update(form).eq('id', visit.id)
      : await supabase.from('visits').insert(form)
    if (err) {
      setError('Erro ao salvar: ' + err.message)
      setSaving(false)
      return
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{visit ? 'Editar Visita' : 'Registrar Visita'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.visit_type} onChange={e => set('visit_type', e.target.value)}>
                {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente visitado" />
            </div>
            <div>
              <label className="label">Responsável</label>
              <select className="input" value={form.responsible} onChange={e => set('responsible', e.target.value)}>
                {RESPONSAVEIS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {VISIT_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Demanda / Objetivo</label>
              <input className="input" value={form.demand} onChange={e => set('demand', e.target.value)} placeholder="O que foi buscar nessa visita?" />
            </div>
            <div className="col-span-2">
              <label className="label">Relatório</label>
              <textarea className="input resize-none" rows={3} value={form.report} onChange={e => set('report', e.target.value)} placeholder="O que aconteceu? Resultados, próximos passos..." />
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {['ALTA', 'MÉDIA', 'BAIXA'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-5 pb-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200 py-2">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.client_name.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : visit ? 'Salvar' : 'Registrar Visita'}
          </button>
        </div>
      </div>
    </div>
  )
}
