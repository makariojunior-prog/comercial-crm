import { useState, useEffect, useCallback } from 'react'
import { Phone, Send, Clock, Pencil, Check, X, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface LinhaPlacar { tipo: number; atendente: string; hoje: number }

const META_RECOMPRA_PADRAO = 40
const ATUALIZA_A_CADA_MS = 60_000

/**
 * Placar do dia: atendimentos de Pós-Venda e Recompra por atendente, em barras verticais.
 * Meta do Pós-Venda = clientes pendentes; meta da Recompra = mínimo diário da EQUIPE
 * (soma de todos os atendentes; configurável pelo administrador).
 */
export default function PosVendaWidget() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [linhas, setLinhas]             = useState<LinhaPlacar[]>([])
  const [pendentes, setPendentes]       = useState(0)
  const [metaRecompra, setMetaRecompra] = useState(META_RECOMPRA_PADRAO)
  const [loading, setLoading]           = useState(true)

  const load = useCallback(async () => {
    const [placar, pend, meta] = await Promise.all([
      supabase.rpc('crm_posvendas_placar_hoje'),
      supabase.from('crm_posvendas').select('telefone', { count: 'exact', head: true }).eq('prioridade', 1),
      supabase.from('posvendas_metas').select('meta_recompra_dia').eq('id', 1).maybeSingle(),
    ])
    setLinhas((placar.data ?? []) as LinhaPlacar[])
    setPendentes(pend.count ?? 0)
    if (meta.data?.meta_recompra_dia != null) setMetaRecompra(meta.data.meta_recompra_dia)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, ATUALIZA_A_CADA_MS)
    return () => clearInterval(t)
  }, [load])

  async function salvarMeta(valor: number) {
    const { error } = await supabase
      .from('posvendas_metas')
      .update({ meta_recompra_dia: valor, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) { alert('Não foi possível salvar a meta: ' + error.message); return false }
    setMetaRecompra(valor)
    return true
  }

  const posVenda = linhas.filter(l => l.tipo === 1)
  const recompra = linhas.filter(l => l.tipo === 2)

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Pós-Venda e Recompra — hoje</h3>
        <button
          onClick={() => navigate('/varejo')}
          className="text-[11px] text-sky-500 hover:text-sky-600 whitespace-nowrap"
        >
          Abrir fila →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
        <Painel
          icone={<Phone size={14} className="text-sky-500" />}
          titulo="Pós-Venda"
          cor="sky"
          dados={posVenda}
          meta={pendentes}
          loading={loading}
          resumoMeta={
            pendentes > 0
              ? <>Pendentes agora: <strong>{pendentes}</strong></>
              : <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 size={12} /> Nenhum pendente</span>
          }
          rotuloMeta="pendentes"
        />
        <Painel
          icone={<Send size={14} className="text-red-500" />}
          titulo="Recompra"
          cor="red"
          dados={recompra}
          meta={metaRecompra}
          loading={loading}
          resumoMeta={
            <span className="inline-flex items-center gap-1">
              <span>Meta: <strong>{metaRecompra}</strong> no total do dia</span>
              {isAdmin && <EditarMeta valor={metaRecompra} onSalvar={salvarMeta} />}
            </span>
          }
          rotuloMeta={`meta ${metaRecompra}`}
          metaTotal
        />
      </div>

      <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
        <Clock size={12} className="shrink-0 mt-0.5" />
        <span>Ao enviar mensagens, aguardar um intervalo mínimo de 2 minutos entre cada cliente.</span>
      </p>
    </div>
  )
}

function Painel({ icone, titulo, cor, dados, meta, loading, resumoMeta, rotuloMeta, metaTotal }: {
  icone: React.ReactNode
  titulo: string
  cor: 'sky' | 'red'
  dados: LinhaPlacar[]
  meta: number
  loading: boolean
  resumoMeta: React.ReactNode
  rotuloMeta: string
  /** true = a meta vale para a soma da equipe (barra de progresso); false = linha de referência no gráfico */
  metaTotal?: boolean
}) {
  const ordenado = [...dados].sort((a, b) => b.hoje - a.hoje || a.atendente.localeCompare(b.atendente))
  const total = ordenado.reduce((s, d) => s + d.hoje, 0)
  const maior = Math.max(metaTotal ? 0 : meta, ...ordenado.map(d => d.hoje), 1)
  const escala = maior * 1.12
  const ALTURA = 96
  const atingiuTotal = metaTotal && meta > 0 && total >= meta
  const pct = metaTotal && meta > 0 ? Math.min(100, (total / meta) * 100) : 0

  const corBarra = cor === 'sky' ? 'bg-sky-400 dark:bg-sky-500' : 'bg-red-400 dark:bg-red-500'

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        {icone}
        <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs">{titulo}</h4>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          atingiuTotal
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}>
          {loading ? '…' : metaTotal ? `${total} / ${meta}${atingiuTotal ? ' ✓' : ''}` : `${total} hoje`}
        </span>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{resumoMeta}</div>

      {metaTotal && !loading && meta > 0 && (
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${atingiuTotal ? 'bg-green-500' : 'bg-red-400 dark:bg-red-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ height: ALTURA + 30 }} className="bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
      ) : ordenado.length === 0 ? (
        <div style={{ height: ALTURA + 30 }} className="flex items-center justify-center text-[11px] text-slate-400">
          Nenhum atendimento registrado
        </div>
      ) : (
        <div className="relative pt-4">
          <div className="relative flex items-end justify-around gap-2 px-1 border-b border-slate-200 dark:border-slate-700" style={{ height: ALTURA }}>
            {!metaTotal && meta > 0 && (
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400 pointer-events-none"
                style={{ bottom: `${(meta / escala) * 100}%` }}
              >
                <span className="absolute right-0 -top-4 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-white/80 dark:bg-slate-800/80 px-1 rounded">
                  {rotuloMeta}
                </span>
              </div>
            )}
            {ordenado.map(d => (
              <div key={d.atendente} className="flex-1 max-w-[56px] h-full flex flex-col items-center justify-end">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-none mb-0.5">{d.hoje}</span>
                <div
                  className={`w-full rounded-t-md transition-all duration-500 ${atingiuTotal ? 'bg-green-500' : corBarra}`}
                  style={{ height: `${(d.hoje / escala) * 100}%`, minHeight: d.hoje > 0 ? 3 : 0 }}
                  title={`${d.atendente}: ${d.hoje}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-around gap-2 px-1 pt-1">
            {ordenado.map(d => (
              <span
                key={d.atendente}
                title={d.atendente}
                className="flex-1 max-w-[56px] text-center text-[10px] text-slate-500 dark:text-slate-400 truncate"
              >
                {d.atendente.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EditarMeta({ valor, onSalvar }: { valor: number; onSalvar: (v: number) => Promise<boolean> }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(String(valor))

  if (!editando) {
    return (
      <button
        onClick={() => { setTexto(String(valor)); setEditando(true) }}
        title="Alterar meta diária de Recompra"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <Pencil size={11} />
      </button>
    )
  }

  async function confirmar() {
    const n = Math.floor(Number(texto))
    if (!Number.isFinite(n) || n < 0) return
    if (await onSalvar(n)) setEditando(false)
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number" min={0} value={texto} autoFocus
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') setEditando(false) }}
        className="input !py-0.5 !px-1.5 !w-14 !text-xs"
      />
      <button onClick={confirmar} className="text-green-600 hover:text-green-700" title="Salvar"><Check size={13} /></button>
      <button onClick={() => setEditando(false)} className="text-slate-400 hover:text-slate-600" title="Cancelar"><X size={13} /></button>
    </span>
  )
}
