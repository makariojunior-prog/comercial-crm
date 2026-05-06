import { useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PriceItem } from '../types'

interface Props {
  item?: PriceItem | null
  defaultEmpresa?: 'lumar' | 'cantina'
  onClose: () => void
  onSaved: () => void
}

const empty = (empresa: 'lumar' | 'cantina') => ({
  empresa,
  nome: '',
  custo: '',
  preco_lumar: '',
  preco_varejo: '',
  preco_revenda: '',
  pf: false,
  ativo: true,
})

export default function PriceItemModal({ item, defaultEmpresa = 'lumar', onClose, onSaved }: Props) {
  const [form, setForm] = useState(
    item
      ? {
          empresa: item.empresa,
          nome: item.nome,
          custo: item.custo?.toString() ?? '',
          preco_lumar: item.preco_lumar?.toString() ?? '',
          preco_varejo: item.preco_varejo?.toString() ?? '',
          preco_revenda: item.preco_revenda?.toString() ?? '',
          pf: item.pf,
          ativo: item.ativo,
        }
      : empty(defaultEmpresa)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toNum(v: string) {
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      empresa: form.empresa,
      nome: form.nome.trim(),
      custo: toNum(form.custo),
      preco_lumar:   form.empresa === 'lumar'   ? toNum(form.preco_lumar) : null,
      preco_varejo:  form.empresa === 'cantina' ? toNum(form.preco_varejo) : null,
      preco_revenda: form.empresa === 'cantina' ? toNum(form.preco_revenda) : null,
      pf: form.pf,
      ativo: form.ativo,
    }

    const { error: err } = item
      ? await supabase.from('crm_price_items').update(payload).eq('id', item.id)
      : await supabase.from('crm_price_items').insert(payload)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }

  const isLumar   = form.empresa === 'lumar'
  const isCantina = form.empresa === 'cantina'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{item ? 'Editar Produto' : 'Novo Produto'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Empresa */}
            <div className="col-span-2">
              <label className="label">Empresa</label>
              <div className="flex gap-2">
                {(['lumar', 'cantina'] as const).map(e => (
                  <button key={e} type="button" onClick={() => set('empresa', e)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.empresa === e
                        ? e === 'lumar' ? 'bg-blue-50 border-blue-300 text-blue-700 border-2' : 'bg-orange-50 border-orange-300 text-orange-700 border-2'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}>
                    {e === 'lumar' ? '🔵 Lumar' : '🟠 Cantina em Casa'}
                  </button>
                ))}
              </div>
            </div>

            {/* Nome */}
            <div className="col-span-2">
              <label className="label">Nome do Produto *</label>
              <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Pão Francês 12h (60g)" autoFocus />
            </div>

            {/* Custo */}
            <div>
              <label className="label">Custo (R$)</label>
              <input type="number" step="0.01" className="input" value={form.custo} onChange={e => set('custo', e.target.value)} placeholder="0,00" />
            </div>

            {/* Preços conforme empresa */}
            {isLumar && (
              <div>
                <label className="label">Preço Lumar (R$/kg)</label>
                <input type="number" step="0.01" className="input" value={form.preco_lumar} onChange={e => set('preco_lumar', e.target.value)} placeholder="0,00" />
              </div>
            )}
            {isCantina && (<>
              <div>
                <label className="label">Preço Varejo (R$/pct)</label>
                <input type="number" step="0.01" className="input" value={form.preco_varejo} onChange={e => set('preco_varejo', e.target.value)} placeholder="0,00" />
              </div>
              <div>
                <label className="label">Preço Revenda (R$/pct)</label>
                <input type="number" step="0.01" className="input" value={form.preco_revenda} onChange={e => set('preco_revenda', e.target.value)} placeholder="0,00" />
              </div>
            </>)}

            {/* Checkboxes */}
            <div className="col-span-2 flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={form.pf} onChange={e => set('pf', e.target.checked)} className="w-4 h-4 accent-orange-500" />
                PF (Preço Preferencial)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 accent-orange-500" />
                Produto ativo
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.nome.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : item ? 'Salvar' : 'Criar Produto'}
          </button>
        </div>
      </div>
    </div>
  )
}
