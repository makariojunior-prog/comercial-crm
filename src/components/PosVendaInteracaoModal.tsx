import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { PosVendaCliente, PosVendaInteracao } from '../types'

export const P: Record<number, { icon: string; label: string; border: string; badge: string }> = {
  1: {
    icon: '📞', label: 'Pós-Venda',
    border: 'border-l-sky-400',
    badge: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  },
  2: {
    icon: '🚨', label: 'Recompra',
    border: 'border-l-red-400',
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  },
  3: {
    icon: '⚪', label: 'Aguardando',
    border: 'border-l-slate-200 dark:border-l-slate-600',
    badge: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  },
}

export function fmtTel(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return tel
}

interface Props {
  cliente: PosVendaCliente
  onClose: () => void
}

export default function PosVendaInteracaoModal({ cliente, onClose }: Props) {
  const { user, profile } = useAuth()
  const atendenteNome = profile?.nome || profile?.email || user?.email?.split('@')[0] || 'Atendente'
  const [data, setData]         = useState(format(new Date(), 'yyyy-MM-dd'))
  const [obs, setObs]           = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [hist, setHist]         = useState<PosVendaInteracao[]>([])
  const [loadHist, setLoadHist] = useState(true)
  const cfg = P[cliente.prioridade] ?? P[3]

  useEffect(() => {
    (async () => {
      setLoadHist(true)
      const { data: rows } = await supabase
        .from('crm_posvendas_interacoes')
        .select('*')
        .eq('telefone', cliente.telefone)
        .order('data_interacao', { ascending: false })
        .limit(30)
      setHist((rows ?? []) as PosVendaInteracao[])
      setLoadHist(false)
    })()
  }, [cliente.telefone])

  async function salvar() {
    if (!obs.trim()) return
    setSaving(true)
    setSaveError(null)
    const { error } = await supabase.from('crm_posvendas_interacoes').insert({
      telefone:       cliente.telefone,
      nome:           cliente.nome,
      data_interacao: data,
      observacao:     obs.trim(),
      usuario_id:     user?.id ?? null,
      usuario_nome:   atendenteNome,
    })
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.icon} {cfg.label}
              </span>
              {cliente.n_pedidos === 1 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  1º pedido
                </span>
              )}
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-100">{cliente.nome ?? cliente.telefone}</p>
            <a
              href={`https://wa.me/${cliente.telefone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 dark:text-green-400 hover:underline"
            >
              {fmtTel(cliente.telefone)}
            </a>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={18} />
          </button>
        </div>

        {/* Stats strip */}
        <div className="flex gap-5 px-4 py-3 bg-slate-50 dark:bg-slate-700/40 text-xs shrink-0 flex-wrap">
          <div>
            <p className="font-bold text-slate-700 dark:text-slate-200">{format(parseISO(cliente.ult_compra), 'dd/MM/yy')}</p>
            <p className="text-slate-400">Última compra</p>
          </div>
          <div>
            <p className={`font-bold ${cliente.dias_sem_contato >= 40 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
              {cliente.dias_sem_contato}d
            </p>
            <p className="text-slate-400">Sem contato</p>
          </div>
          <div>
            <p className="font-bold text-slate-700 dark:text-slate-200">{cliente.n_pedidos}</p>
            <p className="text-slate-400">Pedidos</p>
          </div>
          {cliente.ult_interacao && (
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-200">{format(parseISO(cliente.ult_interacao), 'dd/MM/yy')}</p>
              <p className="text-slate-400">Ult. interação</p>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-5">
          {/* New interaction form */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nova interação</p>
              <span className="text-[11px] text-slate-400">
                por <span className="font-semibold text-slate-500 dark:text-slate-300">{atendenteNome}</span>
              </span>
            </div>
            <input
              type="date"
              className="input text-sm w-full"
              value={data}
              onChange={e => setData(e.target.value)}
            />
            <textarea
              className="input text-sm w-full h-24 resize-none"
              placeholder="O que foi conversado? (ex: cliente gostou muito, vai fazer novo pedido semana que vem)"
              value={obs}
              onChange={e => setObs(e.target.value)}
              autoFocus
            />
            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancelar</button>
              <button
                onClick={salvar}
                disabled={saving || !obs.trim()}
                className="btn-primary text-sm"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>

          {/* History */}
          {(loadHist || hist.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Histórico de interações
              </p>
              {loadHist ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-14 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {hist.map(h => (
                    <div key={h.id} className="text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-slate-600 dark:text-slate-300">
                          {format(parseISO(h.data_interacao), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                        {h.usuario_nome && (
                          <span className="text-[10px] text-slate-400 shrink-0">{h.usuario_nome}</span>
                        )}
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{h.observacao}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
