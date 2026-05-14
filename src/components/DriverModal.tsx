import { useState, useCallback } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Driver, CnhCategoria } from '../types'
import { CNH_CATEGORIAS } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  driver?: Driver | null
  onClose: () => void
  onSaved: () => void
}

const empty = (): Partial<Driver> & Record<string, any> => ({
  nome: '', telefone: '', cpf: '',
  cnh_numero: '', cnh_categoria: '' as any, cnh_vencimento: '',
  cnh_pontuacao: '' as any, toxicologico_vencimento: '',
  ativo: true,
})

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

export default function DriverModal({ driver, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))

  const [form, setForm] = useState<Record<string, any>>(driver ? {
    nome: driver.nome,
    telefone: driver.telefone ?? '',
    cpf: driver.cpf ?? '',
    cnh_numero: driver.cnh_numero ?? '',
    cnh_categoria: driver.cnh_categoria ?? '',
    cnh_vencimento: driver.cnh_vencimento ?? '',
    cnh_pontuacao: (driver as any).cnh_pontuacao ?? '',
    toxicologico_vencimento: (driver as any).toxicologico_vencimento ?? '',
    ativo: driver.ativo,
  } : empty())

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError(null)

    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      cpf: form.cpf || null,
      cnh_numero: form.cnh_numero || null,
      cnh_categoria: (form.cnh_categoria as CnhCategoria) || null,
      cnh_vencimento: form.cnh_vencimento || null,
      cnh_pontuacao: form.cnh_pontuacao !== '' ? Number(form.cnh_pontuacao) : null,
      toxicologico_vencimento: form.toxicologico_vencimento || null,
      ativo: form.ativo,
    }

    const { error: err } = driver
      ? await supabase.from('crm_drivers').update(payload).eq('id', driver.id)
      : await supabase.from('crm_drivers').insert(payload)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
  }

  const profCnh = ['C', 'D', 'E'].includes(form.cnh_categoria)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{driver ? 'Editar Motorista' : 'Novo Motorista'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Dados pessoais */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Dados Pessoais</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Nome *</label>
                <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" autoFocus />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={form.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" inputMode="numeric" />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input" value={form.cpf} onChange={e => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
              </div>
            </div>
          </div>

          {/* CNH */}
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-3">Habilitação (CNH)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nº da CNH</label>
                <input className="input" value={form.cnh_numero} onChange={e => set('cnh_numero', e.target.value)} placeholder="00000000000" />
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={form.cnh_categoria} onChange={e => set('cnh_categoria', e.target.value)}>
                  <option value="">Selecione</option>
                  {CNH_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Vencimento da CNH</label>
                <input type="date" className="input" value={form.cnh_vencimento} onChange={e => set('cnh_vencimento', e.target.value)} />
              </div>
              <div>
                <label className="label">Pontos na CNH</label>
                <input type="number" min={0} max={40} className="input" value={form.cnh_pontuacao} onChange={e => set('cnh_pontuacao', e.target.value)} placeholder="0–40" />
              </div>
            </div>
            {profCnh && (
              <div className="mt-3">
                <label className="label">Exame Toxicológico — Vencimento <span className="text-amber-500 ml-1 font-normal">(obrigatório cat. {form.cnh_categoria})</span></label>
                <input type="date" className="input" value={form.toxicologico_vencimento} onChange={e => set('toxicologico_vencimento', e.target.value)} />
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Motorista ativo</span>
            <button type="button" onClick={() => set('ativo', !form.ativo)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${form.ativo ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
              {form.ativo ? 'Ativo' : 'Inativo'}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.nome.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : driver ? 'Salvar' : 'Criar Motorista'}
          </button>
        </div>
      </div>
    </div>
  )
}
