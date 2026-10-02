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
 * Meta do Pós-Venda = clientes pendentes; meta da Recompra = mínimo diário por atendente
 * (configurável pelo administrador).
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Pós-Venda e Recompra — hoje</h3>
        <button
          onClick={() => navigate('/varejo')}
          className="text-[11px] text-sky-500 hover:text-sky-600 whitespace-nowrap"
        >
          Abrir fila →
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        <Clock size={14} className="shrink-0 mt-0.5" />
        <span>Lembrete: não envie mais de uma mensagem para o mesmo cliente a cada 5 minutos.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
              Meta: <strong>{metaRecompra}</strong> por atendente/dia
              {isAdmin && <EditarMeta valor={metaRecompra} onSalvar={salvarMeta} />}
            </span>
          }
          rotuloMeta={`meta ${metaRecompra}`}
          colorirPorMeta
        />
      </div>
    </div>
  )
}

function Painel({ icone, titulo, cor, dados, meta, loading, resumoMeta, rotuloMeta, colorirPorMeta }: {
  icone: React.ReactNode
  titulo: string
  cor: 'sky' | 'red'
  dados: LinhaPlacar[]
  meta: number
  loading: boolean
  resumoMeta: React.ReactNode
  rotuloMeta: string
  colorirPorMeta?: boolean
}) {
  const ordenado = [...dados].sort((a, b) => b.hoje - a.hoje || a.atendente.localeCompare(b.atendente))
  const total = ordenado.reduce((s, d) => s + d.hoje, 0)
  const maior = Math.max(meta, ...ordenado.map(d => d.hoje), 1)
  const escala = maior * 1.12
  const ALTURA = 130

  const corPadrao = cor === 'sky' ? 'bg-sky-400 dark:bg-sky-500' : 'bg-red-400 dark:bg-red-500'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {icone}
        <h4 className="font-bold text-slate-700 dark:text-slate-200 text-xs">{titulo}</h4>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
          {loading ? '…' : `${total} hoje`}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">{resumoMeta}</span>
      </div>

      {loading ? (
        <div className="h-[170px] bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
      ) : ordenado.length === 0 ? (
        <div className="h-[170px] flex items-center justify-center text-[11px] text-slate-400">
          Nenhum atendimento registrado
        </div>
      ) : (
        <div className="relative pt-5">
          <div className="relative flex items-end justify-around gap-3 px-2 border-b border-slate-200 dark:border-slate-700" style={{ height: ALTURA }}>
            {meta > 0 && (
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-amber-400 pointer-events-none"
                style={{ bottom: `${(meta / escala) * 100}%` }}
              >
                <span className="absolute right-0 -top-4 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-white/80 dark:bg-slate-800/80 px-1 rounded">
                  {rotuloMeta}
                </span>
              </div>
            )}
            {ordenado.map(d => {
              const atingiu = meta > 0 ? d.hoje >= meta : true
              const corBarra = colorirPorMeta && atingiu ? 'bg-green-500' : corPadrao
              return (
                <div key={d.atendente} className="flex-1 max-w-[72px] h-full flex flex-col items-center justify-end">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-none mb-0.5">
                    {d.hoje}{colorirPorMeta && atingiu && d.hoje > 0 ? ' ✓' : ''}
                  </span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${corBarra}`}
                    style={{ height: `${(d.hoje / escala) * 100}%`, minHeight: d.hoje > 0 ? 3 : 0 }}
                    title={`${d.atendente}: ${d.hoje}`}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-around gap-3 px-2 pt-1">
            {ordenado.map(d => (
              <span
                key={d.atendente}
                title={d.atendente}
                className="flex-1 max-w-[72px] text-center text-[11px] text-slate-500 dark:text-slate-400 truncate"
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
