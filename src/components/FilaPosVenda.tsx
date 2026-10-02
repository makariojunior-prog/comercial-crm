import { useState, useEffect, useCallback } from 'react'
import { Phone, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PosVendaCliente } from '../types'
import PosVendaInteracaoModal from './PosVendaInteracaoModal'
import { ClienteCard, ocultarDaRecompra } from './PosVendaTab'
import { useAuth } from '../contexts/AuthContext'

// Meta diária de Recompra: a Fila mostra só os próximos; o restante fica na aba Recompra.
const PROXIMAS_RECOMPRAS = 40

/**
 * Continuação da Fila do Varejo: depois dos pedidos novos (sempre no topo), os Pós-Vendas
 * pendentes e as próximas Recompras do dia.
 */
export default function FilaPosVenda({ onVerRecompras }: { onVerRecompras: () => void }) {
  const [posVendas, setPosVendas] = useState<PosVendaCliente[]>([])
  const [recompras, setRecompras] = useState<PosVendaCliente[]>([])
  const [totalRecompras, setTotalRecompras] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<PosVendaCliente | null>(null)
  const { isAdmin } = useAuth()

  const load = useCallback(async () => {
    const [pv, rc] = await Promise.all([
      supabase.from('crm_posvendas').select('*').eq('prioridade', 1)
        .order('dias_sem_contato', { ascending: false }).limit(1000),
      supabase.from('crm_posvendas').select('*', { count: 'exact' }).eq('prioridade', 2)
        .order('dias_sem_contato', { ascending: false }).order('telefone').limit(PROXIMAS_RECOMPRAS),
    ])
    setPosVendas((pv.data ?? []) as PosVendaCliente[])
    setRecompras((rc.data ?? []) as PosVendaCliente[])
    setTotalRecompras(rc.count ?? 0)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function ocultar(c: PosVendaCliente) {
    if (await ocultarDaRecompra(c)) load()
  }

  if (loading) {
    return <div className="h-24 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-sky-600 dark:text-sky-400">
          <Phone size={14} /> Pós-Venda pendentes · {posVendas.length}
        </h3>
        {posVendas.length === 0 ? (
          <p className="card p-4 text-center text-xs text-slate-400">Nenhum pós-venda pendente.</p>
        ) : (
          <div className="space-y-2">
            {posVendas.map(c => <ClienteCard key={c.telefone} cliente={c} onAction={() => setModal(c)} onOcultar={isAdmin ? () => ocultar(c) : undefined} />)}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
          <Send size={14} /> Próximas Recompras · {recompras.length}
          <span className="text-[11px] font-normal text-slate-400">meta do dia: {PROXIMAS_RECOMPRAS} clientes</span>
        </h3>
        {recompras.length === 0 ? (
          <p className="card p-4 text-center text-xs text-slate-400">Nenhuma recompra pendente.</p>
        ) : (
          <div className="space-y-2">
            {recompras.map(c => <ClienteCard key={c.telefone} cliente={c} onAction={() => setModal(c)} onOcultar={isAdmin ? () => ocultar(c) : undefined} />)}
          </div>
        )}
        {totalRecompras > recompras.length && (
          <button onClick={onVerRecompras} className="w-full text-xs text-orange-500 hover:text-orange-600 py-2">
            Quer fazer mais? Ver as outras {totalRecompras - recompras.length} na aba Recompra →
          </button>
        )}
      </section>

      {modal && (
        <PosVendaInteracaoModal
          cliente={modal}
          tipoDefault={modal.prioridade === 1 ? 1 : 2}
          onClose={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
