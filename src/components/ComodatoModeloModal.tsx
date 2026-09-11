import { useState, useCallback } from 'react'
import { X, AlertCircle, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import { COMODATO_CATEGORIAS, type ComodatoModelo } from '../types'
import { CATEGORIA_LABELS } from '../lib/comodato'

interface Props {
  modelo?: ComodatoModelo | null
  onClose: () => void
  onSaved: () => void
}

export default function ComodatoModeloModal({ modelo, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [nome, setNome]             = useState(modelo?.nome ?? '')
  const [categoria, setCategoria]   = useState<string>(modelo?.categoria ?? 'FREEZER')
  const [marca, setMarca]           = useState(modelo?.marca ?? '')
  const [modeloTxt, setModeloTxt]   = useState(modelo?.modelo ?? '')
  const [capacidade, setCapacidade] = useState(modelo?.capacidade ?? '')
  const [valorRef, setValorRef]     = useState(modelo?.valor_referencia?.toString() ?? '')
  const [intervalo, setIntervalo]   = useState(modelo?.manutencao_intervalo_meses?.toString() ?? '')
  const [observacoes, setObs]       = useState(modelo?.observacoes ?? '')
  const [ativo, setAtivo]           = useState(modelo?.ativo ?? true)

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')
    setSaving(true); setError(null)

    const payload = {
      nome: nome.trim().toUpperCase(),
      categoria,
      marca: marca.trim() || null,
      modelo: modeloTxt.trim() || null,
      capacidade: capacidade.trim() || null,
      valor_referencia: valorRef ? Number(valorRef.replace(',', '.')) : null,
      manutencao_intervalo_meses: intervalo ? parseInt(intervalo, 10) : null,
      observacoes: observacoes.trim() || null,
      ativo,
    }

    const { error: err } = modelo?.id
      ? await supabase.from('comodato_modelos').update(payload).eq('id', modelo.id)
      : await supabase.from('comodato_modelos').insert(payload)

    setSaving(false)
    if (err) {
      setError(err.code === '23505' ? 'Já existe um modelo com esse nome.' : err.message)
      return
    }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Package size={18} className="text-orange-500" />
            {modelo ? 'Editar Modelo' : 'Novo Modelo do Catálogo'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="label">Nome / Descrição</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)}
                   placeholder="Ex: FREEZER FRICON 450LT" />
            <p className="text-[11px] text-slate-400 mt-1">
              É o nome que aparece no cadastro do cliente. Cada unidade física ganha um patrimônio próprio.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoria</label>
              <select className="input" value={categoria} onChange={e => setCategoria(e.target.value)}>
                {COMODATO_CATEGORIAS.map(c => (
                  <option key={c} value={c}>{CATEGORIA_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Marca</label>
              <input className="input" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ex: Fricon" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Modelo do fabricante</label>
              <input className="input" value={modeloTxt} onChange={e => setModeloTxt(e.target.value)} placeholder="Ex: HCED 503" />
            </div>
            <div>
              <label className="label">Capacidade</label>
              <input className="input" value={capacidade} onChange={e => setCapacidade(e.target.value)} placeholder="Ex: 450 L" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor de referência (R$)</label>
              <input className="input" type="number" step="0.01" value={valorRef}
                     onChange={e => setValorRef(e.target.value)} placeholder="Ex: 3800.00" />
            </div>
            <div>
              <label className="label">Preventiva a cada (meses)</label>
              <input className="input" type="number" min="1" value={intervalo}
                     onChange={e => setIntervalo(e.target.value)} placeholder="Ex: 6" />
            </div>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px]" value={observacoes} onChange={e => setObs(e.target.value)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Modelo ativo</span>
            <button type="button" onClick={() => setAtivo(v => !v)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${ativo ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
              {ativo ? 'Sim' : 'Não'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
