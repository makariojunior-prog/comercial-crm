import { useState } from 'react'
import { Gavel, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { chaveConta } from '../../lib/jornada'
import { useAuth } from '../../contexts/AuthContext'
import type { ComiteNota } from '../../types'

interface Props {
  semanaIni: string
  clienteNome: string
  clientId?: string | null
  dealId?: string | null
  visitId?: string | null
  notas: ComiteNota[]
  onSaved: (n: ComiteNota) => void
}

/** Registros do comitê sobre um item (visita/negócio). Aparecem também na Jornada do cliente. */
export default function NotasComite({ semanaIni, clienteNome, clientId, dealId, visitId, notas, onSaved }: Props) {
  const { profile } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!texto.trim()) return
    setSalvando(true)
    const { data, error } = await supabase.from('crm_comite_notas').insert({
      semana_ini: semanaIni, conta: chaveConta(clienteNome), cliente_nome: clienteNome,
      client_id: clientId ?? null, deal_id: dealId ?? null, visit_id: visitId ?? null,
      texto: texto.trim(), created_by_nome: profile?.nome ?? null,
    }).select('*').single()
    setSalvando(false)
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return }
    onSaved(data as ComiteNota)
    setTexto(''); setAberto(false)
  }

  return (
    <div className="space-y-1.5">
      {notas.map(n => (
        <div key={n.id} className="rounded-lg bg-orange-50 dark:bg-orange-900/15 border border-orange-100 dark:border-orange-900/40 px-3 py-2 text-sm">
          <p className="text-[11px] text-orange-700 dark:text-orange-300 font-semibold inline-flex items-center gap-1">
            <Gavel size={11} /> Comitê · {format(new Date(n.created_at), 'dd/MM')}{n.created_by_nome ? ` · ${n.created_by_nome}` : ''}
          </p>
          <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{n.texto}</p>
        </div>
      ))}
      {aberto ? (
        <div className="flex gap-2">
          <textarea autoFocus className="input text-sm flex-1" rows={2} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Decisão ou orientação do comitê..." />
          <div className="flex flex-col gap-1 self-end">
            <button onClick={salvar} disabled={salvando || !texto.trim()} className="btn-primary text-xs py-1.5">Salvar</button>
            <button onClick={() => { setAberto(false); setTexto('') }} className="btn-ghost text-xs py-1">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAberto(true)} className="text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">
          <Plus size={12} /> Registrar no comitê
        </button>
      )}
    </div>
  )
}

/** Carrega as notas do comitê de uma semana, indexadas por visita e por negócio. */
export async function carregarNotasSemana(semanaIni: string) {
  const { data } = await supabase.from('crm_comite_notas').select('*').eq('semana_ini', semanaIni).order('created_at')
  return (data ?? []) as ComiteNota[]
}
