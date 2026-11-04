import { useCallback, useState } from 'react'
import { ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEscKey } from '../hooks/useEscKey'

const SETORES = ['Produção', 'Logística', 'Comercial', 'Financeiro', 'RH', 'Marketing', 'Qualidade', 'Administrativo', 'Loja / Delivery', 'Manutenção', 'Outro']
const PRIORIDADES = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['urgente', 'Urgente']] as const
const UNIDADES = ['un', 'kg', 'L', 'cx', 'm']

/** Botão para os cabeçalhos + formulário: a solicitação cai direto no app de Compras (tabela compras_solicitacoes). */
export default function SolicitarCompra({ escuro = false }: { escuro?: boolean }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Solicitar compra"
        className={escuro
          ? 'p-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors'
          : 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition-colors'}
      >
        <ShoppingCart size={escuro ? 15 : 14} />
        {!escuro && <span>Solicitar compra</span>}
      </button>
      {aberto && <Formulario onClose={() => setAberto(false)} />}
    </>
  )
}

function Formulario({ onClose }: { onClose: () => void }) {
  useEscKey(useCallback(onClose, [onClose]))
  const { user, profile } = useAuth()
  const [item, setItem] = useState('')
  const [setor, setSetor] = useState('Comercial')
  const [quantidade, setQuantidade] = useState('')
  const [unidade, setUnidade] = useState('un')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState('media')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  async function enviar() {
    const qtd = parseFloat(quantidade.replace(',', '.'))
    if (!item.trim()) return setError('Informe o item desejado.')
    if (!qtd || qtd <= 0) return setError('Informe a quantidade.')
    if (!user?.id) return setError('Sessão inválida.')
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('compras_solicitacoes').insert({
      item: item.trim(), setor, quantidade: qtd, unidade, prazo: prazo || null, prioridade,
      observacao: observacao.trim() || null, origem: 'crm', solicitante_id: user.id,
      solicitante_nome: profile?.nome ?? null, solicitante_email: profile?.email ?? user.email ?? null,
    })
    setSaving(false)
    if (err) return setError(err.message)
    setEnviado(true)
  }

  const campo = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-800 dark:text-slate-100'
  const rotulo = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><ShoppingCart size={18} /> Solicitar compra</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {enviado ? (
          <div className="py-6 text-center">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Solicitação enviada ao time de Compras ✅</p>
            <button onClick={onClose} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white">Fechar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div><label className={rotulo}>Item desejado *</label><input className={campo} value={item} onChange={e => setItem(e.target.value)} autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={rotulo}>Setor *</label><select className={campo} value={setor} onChange={e => setSetor(e.target.value)}>{SETORES.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label className={rotulo}>Prioridade</label><select className={campo} value={prioridade} onChange={e => setPrioridade(e.target.value)}>{PRIORIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
              <div><label className={rotulo}>Quantidade *</label><input className={campo} inputMode="decimal" value={quantidade} onChange={e => setQuantidade(e.target.value)} /></div>
              <div><label className={rotulo}>Unidade</label><select className={campo} value={unidade} onChange={e => setUnidade(e.target.value)}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div><label className={rotulo}>Prazo para aquisição (opcional)</label><input type="date" className={campo} value={prazo} onChange={e => setPrazo(e.target.value)} /></div>
            <div><label className={rotulo}>Observações</label><textarea className={`${campo} min-h-[70px]`} value={observacao} onChange={e => setObservacao(e.target.value)} /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
              <button onClick={enviar} disabled={saving} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Enviando…' : 'Enviar'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
