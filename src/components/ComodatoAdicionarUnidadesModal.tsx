import { useState, useCallback } from 'react'
import { X, AlertCircle, Plus, Copy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import { COMODATO_ESTADO_LABELS, type ComodatoEstado, type ComodatoModelo } from '../types'

interface Props {
  modelo: ComodatoModelo
  onClose: () => void
  onSaved: () => void
}

interface Linha {
  serie: string
  dataAq: string
  estado: ComodatoEstado
  obs: string
}

const MAX_UNIDADES = 50
const ESTADOS = Object.keys(COMODATO_ESTADO_LABELS) as ComodatoEstado[]

export default function ComodatoAdicionarUnidadesModal({ modelo, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))

  // Valores comuns a todas as unidades (cada unidade pode ser ajustada abaixo)
  const [empresa, setEmpresa]       = useState<'lumar' | 'cantina'>('lumar')
  const [valor, setValor]           = useState(modelo.valor_referencia?.toString() ?? '')
  const [fornecedor, setFornecedor] = useState('')
  const [nf, setNf]                 = useState('')
  const [dataPadrao, setDataPadrao] = useState('')
  const [estadoPadrao, setEstadoPadrao] = useState<ComodatoEstado>('novo')
  const [obsPadrao, setObsPadrao]   = useState('')

  const novaLinha = (): Linha => ({ serie: '', dataAq: dataPadrao, estado: estadoPadrao, obs: obsPadrao })
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function setQuantidade(n: number) {
    const q = Math.max(1, Math.min(MAX_UNIDADES, Number.isFinite(n) ? n : 1))
    setLinhas(prev => q > prev.length
      ? [...prev, ...Array.from({ length: q - prev.length }, novaLinha)]
      : prev.slice(0, q))
  }

  function setLinha(i: number, patch: Partial<Linha>) {
    setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  function aplicarPadraoATodas() {
    setLinhas(prev => prev.map(l => ({ ...l, dataAq: dataPadrao, estado: estadoPadrao, obs: obsPadrao })))
  }

  async function save() {
    setSaving(true); setError(null)
    const base = {
      modelo_id: modelo.id,
      empresa,
      valor_aquisicao: valor ? Number(valor.replace(',', '.')) : null,
      fornecedor: fornecedor.trim() || null,
      nota_fiscal_compra: nf.trim() || null,
      manutencao_intervalo_meses: modelo.manutencao_intervalo_meses,
      origem: 'manual',
      ativo: true,
    }
    // Sem código de patrimônio: o banco gera um por unidade (FRZ-0001, FRZ-0002…)
    const registros = linhas.map(l => ({
      ...base,
      numero_serie: l.serie.trim() || null,
      data_aquisicao: l.dataAq || null,
      estado_conservacao: l.estado,
      observacoes: l.obs.trim() || null,
    }))
    const { error: err } = await supabase.from('comodato_equipamentos').insert(registros)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Plus size={18} className="text-orange-500" /> Adicionar unidades
            </h2>
            <p className="text-xs text-slate-400 truncate">{modelo.nome} · cada unidade ganha um cadastro próprio com código de patrimônio automático</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Quantidade</label>
              <input type="number" min={1} max={MAX_UNIDADES} className="input" value={linhas.length}
                onChange={e => setQuantidade(parseInt(e.target.value, 10))} />
            </div>
            <div>
              <label className="label">Empresa</label>
              <select className="input" value={empresa} onChange={e => setEmpresa(e.target.value as 'lumar' | 'cantina')}>
                <option value="lumar">Lumar</option>
                <option value="cantina">Cantina</option>
              </select>
            </div>
            <div>
              <label className="label">Valor de aquisição (R$)</label>
              <input className="input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
            </div>
            <div>
              <label className="label">Fornecedor</label>
              <input className="input" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
            </div>
            <div>
              <label className="label">Nota fiscal</label>
              <input className="input" value={nf} onChange={e => setNf(e.target.value)} />
            </div>
            <div>
              <label className="label">Data de aquisição (padrão)</label>
              <input type="date" className="input" value={dataPadrao} onChange={e => setDataPadrao(e.target.value)} />
            </div>
            <div>
              <label className="label">Estado (padrão)</label>
              <select className="input" value={estadoPadrao} onChange={e => setEstadoPadrao(e.target.value as ComodatoEstado)}>
                {ESTADOS.map(s => <option key={s} value={s}>{COMODATO_ESTADO_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Observações (padrão)</label>
              <input className="input" value={obsPadrao} onChange={e => setObsPadrao(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500 uppercase">Unidades ({linhas.length})</p>
            <button type="button" onClick={aplicarPadraoATodas} className="btn-ghost text-xs py-1 px-2 flex items-center gap-1">
              <Copy size={12} /> Aplicar padrão a todas
            </button>
          </div>

          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end rounded-xl border border-slate-100 dark:border-slate-700 p-2.5 bg-slate-50/60 dark:bg-slate-700/20">
                <div className="sm:col-span-1 text-xs font-bold text-slate-400 self-center">#{i + 1}</div>
                <div className="sm:col-span-3">
                  <label className="label text-[10px]">Nº de série</label>
                  <input className="input py-1.5 text-sm" value={l.serie} onChange={e => setLinha(i, { serie: e.target.value })} placeholder="opcional" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-[10px]">Aquisição</label>
                  <input type="date" className="input py-1.5 text-sm" value={l.dataAq} onChange={e => setLinha(i, { dataAq: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-[10px]">Estado</label>
                  <select className="input py-1.5 text-sm" value={l.estado} onChange={e => setLinha(i, { estado: e.target.value as ComodatoEstado })}>
                    {ESTADOS.map(s => <option key={s} value={s}>{COMODATO_ESTADO_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="label text-[10px]">Observações</label>
                  <input className="input py-1.5 text-sm" value={l.obs} onChange={e => setLinha(i, { obs: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando…' : `Criar ${linhas.length} unidade${linhas.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
