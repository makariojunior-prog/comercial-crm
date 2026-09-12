import { useState, useMemo } from 'react'
import { X, Link2, Search, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import type { Client } from '../types'

// Um cliente do ERP cujos pedidos não têm vínculo com o cadastro do CRM
export interface OrphanGroup {
  key: string
  clienteId: number | null   // id_cliente do ERP (chave estável do vínculo)
  nome: string               // última grafia que o ERP mandou
  qtd: number
  valor: number
}

interface Props {
  groups: OrphanGroup[]
  clients: Client[]
  periodo: string
  onClose: () => void
  onSaved: () => void
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function VincularClientesModal({ groups, clients, periodo, onClose, onSaved }: Props) {
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [search, setSearch]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEscKey(onClose)

  const ordenados = useMemo(() => {
    const arr = [...groups].sort((a, b) => b.valor - a.valor)
    if (!search.trim()) return arr
    const q = search.toLowerCase()
    return arr.filter(g => g.nome.toLowerCase().includes(q))
  }, [groups, search])

  const clientesOrdenados = useMemo(
    () => [...clients].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [clients],
  )

  const pendentes = Object.values(selection).filter(Boolean).length

  async function salvar() {
    setSaving(true)
    setError(null)
    const falhas: string[] = []

    for (const g of groups) {
      const crmClientId = selection[g.key]
      if (!crmClientId) continue

      if (g.clienteId != null) {
        // De-para por id_cliente: o vínculo sobrevive às mudanças de nome que o
        // ERP faz e o próximo sync já aplica em todos os pedidos desse cliente.
        const { error: linkErr } = await supabase
          .from('atacado_cliente_links')
          .upsert({
            cliente_id:    g.clienteId,
            crm_client_id: crmClientId,
            cliente_nome:  g.nome,
            origem:        'MANUAL',
            updated_at:    new Date().toISOString(),
          }, { onConflict: 'cliente_id' })
        if (linkErr) { falhas.push(`${g.nome}: ${linkErr.message}`); continue }

        // Aplica já no histórico, sem esperar o próximo sync
        const { error: updErr } = await supabase
          .from('atacado_pedidos')
          .update({ crm_client_id: crmClientId })
          .eq('cliente_id', g.clienteId)
        if (updErr) falhas.push(`${g.nome}: ${updErr.message}`)
      } else {
        // Pedidos antigos, gravados antes do sync passar a guardar o id_cliente
        const { error: updErr } = await supabase
          .from('atacado_pedidos')
          .update({ crm_client_id: crmClientId })
          .eq('cliente_nome', g.nome)
          .is('crm_client_id', null)
        if (updErr) falhas.push(`${g.nome}: ${updErr.message}`)
      }
    }

    setSaving(false)
    if (falhas.length) { setError(falhas[0]); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Link2 size={16} className="text-orange-500" /> Vincular clientes do ERP
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {groups.length} cliente{groups.length !== 1 ? 's' : ''} do ERP sem cadastro correspondente em {periodo}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Explicação */}
        <div className="px-4 pt-3">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/40 p-3 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
            O ERP manda o nome do titular junto com o nome fantasia e muda a grafia de tempos
            em tempos, então nem todo pedido consegue achar sozinho o cadastro do CRM. Ao
            vincular aqui, o de-para fica gravado pelo <strong>id do cliente no ERP</strong> — o
            histórico é corrigido na hora e os próximos pedidos já entram vinculados,
            independente de como o ERP escrever o nome.
          </div>
        </div>

        {/* Busca */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="input pl-8"
              placeholder="Buscar pelo nome que vem do ERP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {ordenados.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Nenhum cliente encontrado</p>
          ) : ordenados.map(g => (
            <div
              key={g.key}
              className="flex flex-col md:flex-row md:items-center gap-2 p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 break-words">{g.nome}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {g.clienteId != null ? `ERP #${g.clienteId} · ` : ''}
                  {g.qtd} pedido{g.qtd !== 1 ? 's' : ''} · {fmtBRL(g.valor)}
                </p>
              </div>
              <select
                className="input py-1.5 text-xs md:w-72 shrink-0"
                value={selection[g.key] ?? ''}
                onChange={e => setSelection(s => ({ ...s, [g.key]: e.target.value }))}
              >
                <option value="">— não vincular —</option>
                {clientesOrdenados.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 dark:border-slate-700 p-4 space-y-2">
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {pendentes > 0 ? `${pendentes} vínculo${pendentes !== 1 ? 's' : ''} a gravar` : 'Selecione o cadastro do CRM de cada cliente'}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-secondary py-2" disabled={saving}>Cancelar</button>
              <button onClick={salvar} className="btn-primary py-2" disabled={saving || pendentes === 0}>
                {saving ? 'Gravando…' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
