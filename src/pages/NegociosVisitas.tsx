import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Users, ClipboardList, MapPin, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { carregarJornada, chaveConta, montarContas, type DadosJornada } from '../lib/jornada'
import type { Deal, Visit } from '../types'
import JornadaClientes from '../components/jornada/JornadaClientes'
import JornadaPanel from '../components/jornada/JornadaPanel'
import RegistroNegocios from './RegistroNegocios'
import DashboardVisitas from './DashboardVisitas'
import VisitModal from '../components/VisitModal'
import DealModal from '../components/DealModal'

type Aba = 'clientes' | 'negocios' | 'visitas'

/**
 * Negócios & Visitas: uma tela só, com três visões —
 *  - Por cliente: um card por cliente com a linha do tempo de visitas, negócios e comitê (Jornada);
 *  - Negócios: o Kanban de sempre;
 *  - Visitas: a lista de visitas de sempre.
 * As rotas /negocios e /visitas continuam valendo (links, busca global, widgets do dashboard).
 */
export default function NegociosVisitas() {
  const { canAccess } = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const podeNeg = canAccess('negocios'), podeVis = canAccess('visitas')

  const abas = useMemo(() => ([
    ['clientes', 'Por cliente', Users],
    ...(podeNeg ? [['negocios', 'Negócios', ClipboardList]] : []),
    ...(podeVis ? [['visitas', 'Visitas', MapPin]] : []),
  ] as [Aba, string, typeof Users][]), [podeNeg, podeVis])

  const pedida = params.get('aba') as Aba | null
  const padrao: Aba = location.pathname.startsWith('/visitas') ? 'visitas' : params.get('openId') ? 'negocios' : 'clientes'
  const aba: Aba = abas.some(a => a[0] === pedida) ? pedida! : abas.some(a => a[0] === padrao) ? padrao : 'clientes'

  function trocarAba(a: Aba) {
    const p = new URLSearchParams(params)
    p.set('aba', a)
    p.delete('openId')
    setParams(p, { replace: true })
  }

  // ── Jornada (carregada sob demanda) ──
  const [dados, setDados] = useState<DadosJornada | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const carregar = useCallback(async () => {
    setLoading(true); setError(null)
    try { setDados(await carregarJornada()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => { if ((aba === 'clientes' || aberta) && !dados && !loading) carregar() }, [aba, aberta, dados, loading, carregar])

  const contas = useMemo(() => (dados ? montarContas(dados) : []), [dados])
  const contaAberta = aberta ? contas.find(c => c.chave === aberta) ?? null : null

  /** Abre a Jornada a partir de um card do Kanban ou da lista de visitas. */
  const abrirJornada = useCallback((nome: string, clientId?: string | null) => {
    const porId = clientId && dados?.clientes.find(c => c.id === clientId)
    setAberta(chaveConta(porId ? porId.nome : nome))
  }, [dados])

  // ── Modais abertos pela Jornada ──
  const [editVisit, setEditVisit] = useState<Visit | null | undefined>(undefined)
  const [editDeal, setEditDeal] = useState<Deal | null | undefined>(undefined)
  const [nomeNovo, setNomeNovo] = useState<string | undefined>(undefined)

  function salvo() {
    carregar()
    setVersao(v => v + 1) // recarrega Kanban/lista embutidos
  }

  if (!podeNeg && !podeVis) {
    return (
      <div className="card p-10 text-center text-slate-400 max-w-md mx-auto">
        <Lock size={28} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">Você não tem acesso a Negócios nem a Visitas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Negócios & Visitas</h1>
          <p className="text-xs text-slate-400 mt-0.5">Toda a vida do cliente num lugar só: visitas, negócios, observações e registros do comitê.</p>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 max-w-full overflow-x-auto">
          {abas.map(([a, label, Icon]) => (
            <button key={a} onClick={() => trocarAba(a)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                aba === a
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'clientes' && (
        <JornadaClientes contas={contas} loading={loading} error={error} onReload={carregar} onOpen={c => setAberta(c.chave)} />
      )}
      {aba === 'negocios' && <RegistroNegocios key={`n${versao}`} embedded onShowJornada={d => abrirJornada(d.client_name, d.client_id)} />}
      {aba === 'visitas' && <DashboardVisitas key={`v${versao}`} embedded onShowJornada={v => abrirJornada(v.client_name)} />}

      {aberta && (contaAberta ? (
        <JornadaPanel
          conta={contaAberta}
          onClose={() => setAberta(null)}
          onEditVisit={podeVis ? v => setEditVisit(v) : undefined}
          onEditDeal={podeNeg ? d => setEditDeal(d) : undefined}
          onNovaVisita={podeVis ? n => { setNomeNovo(n); setEditVisit(null) } : undefined}
          onNovoNegocio={podeNeg ? n => { setNomeNovo(n); setEditDeal(null) } : undefined}
          onChanged={carregar}
        />
      ) : !loading && dados && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[55] card px-4 py-2 text-sm text-slate-500 shadow-lg" onClick={() => setAberta(null)}>
          Cliente sem histórico para mostrar.
        </div>
      ))}

      {editVisit !== undefined && (
        <VisitModal visit={editVisit} initialClientName={editVisit ? undefined : nomeNovo}
          onClose={() => { setEditVisit(undefined); setNomeNovo(undefined) }} onSaved={salvo} />
      )}
      {editDeal !== undefined && (
        <DealModal deal={editDeal} initialClientName={editDeal ? undefined : nomeNovo}
          onClose={() => { setEditDeal(undefined); setNomeNovo(undefined) }} onSaved={salvo} />
      )}
    </div>
  )
}
