import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Package, Plus, RefreshCw, Search, Wrench, FileSignature, Boxes, AlertTriangle,
  Pencil, Undo2, ArrowRightLeft, ClipboardCheck, CheckCircle2, ExternalLink,
  TrendingUp, Warehouse, DollarSign, Trash2, ScrollText, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtCurrency, fmtDate } from '../lib/format'
import {
  SITUACAO_COLORS, ESTADO_COLORS, CONTRATO_COLORS,
  MANUT_STATUS_COLORS, PRIORIDADE_COLORS, CATEGORIA_LABELS,
  excluirComodato, mensagemErroComodato, type TabelaComodato,
} from '../lib/comodato'
import {
  COMODATO_SITUACAO_LABELS, COMODATO_ESTADO_LABELS, COMODATO_CONTRATO_LABELS,
  COMODATO_MANUT_TIPO_LABELS, COMODATO_MANUT_STATUS_LABELS, COMODATO_PRIORIDADE_LABELS,
  COMODATO_CATEGORIAS, comodatoContratoAlerta,
  type ComodatoEquipamentoView, type ComodatoContrato, type ComodatoManutencao,
  type ComodatoModelo, type ComodatoSituacao,
} from '../types'
import ComodatoEquipamentoModal from '../components/ComodatoEquipamentoModal'
import ComodatoAlocarModal from '../components/ComodatoAlocarModal'
import ComodatoContratoModal from '../components/ComodatoContratoModal'
import ComodatoManutencaoModal from '../components/ComodatoManutencaoModal'
import ComodatoModeloModal from '../components/ComodatoModeloModal'
import ComodatoAuditoriaTab from '../components/ComodatoAuditoriaTab'
import ConfirmDialog from '../components/ConfirmDialog'

type Tab = 'painel' | 'equipamentos' | 'disponiveis' | 'contratos' | 'manutencoes' | 'catalogo' | 'revisao' | 'auditoria'

interface RevisaoRow {
  tipo_pendencia: 'equipamento_a_revisar' | 'texto_nao_interpretado' | 'cliente_ausente_no_crm'
  client_id: string | null
  client_nome: string | null
  equipamento_id: string | null
  referencia: string | null
  descricao: string | null
  texto_original: string | null
}

// ─── KPI ──────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, hint, tone = 'slate' }: {
  icon: any; label: string; value: string; hint?: string; tone?: 'slate' | 'green' | 'orange' | 'red'
}) {
  const tones = {
    slate:  'bg-slate-50 dark:bg-slate-700/50 text-slate-500',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  }[tone]
  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-2.5">
        <div className={`p-2 rounded-xl shrink-0 ${tones}`}><Icon size={16} /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{value}</p>
          {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
        </div>
      </div>
    </div>
  )
}

// ─── Card de equipamento ──────────────────────────────────────────

function EquipCard({ e, onEdit, onAlocar, onDevolver, onOS, onDelete, canEdit, isAdmin }: {
  e: ComodatoEquipamentoView
  onEdit: () => void; onAlocar: () => void; onDevolver: () => void; onOS: () => void; onDelete: () => void
  canEdit: boolean; isAdmin: boolean
}) {
  return (
    <div className={`card overflow-hidden ${!e.ativo ? 'opacity-60' : ''}`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${
          e.situacao === 'disponivel' ? 'bg-green-50 dark:bg-green-900/20'
          : e.situacao === 'manutencao' ? 'bg-amber-50 dark:bg-amber-900/20'
          : 'bg-orange-50 dark:bg-orange-900/20'
        }`}>
          <Package size={16} className={
            e.situacao === 'disponivel' ? 'text-green-600 dark:text-green-400'
            : e.situacao === 'manutencao' ? 'text-amber-600 dark:text-amber-400'
            : 'text-orange-600 dark:text-orange-400'
          } />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs font-black bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
              {e.codigo_patrimonio}
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{e.modelo_nome ?? '—'}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SITUACAO_COLORS[e.situacao]}`}>
              {COMODATO_SITUACAO_LABELS[e.situacao]}
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ESTADO_COLORS[e.estado_conservacao]}`}>
              {COMODATO_ESTADO_LABELS[e.estado_conservacao]}
            </span>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-3 flex-wrap">
            {e.client_nome && <span>📍 {e.client_nome}{e.client_rota ? ` · ${e.client_rota}` : ''}</span>}
            {e.situacao === 'disponivel' && <span>🏭 Depósito</span>}
            {e.numero_serie && <span>Série {e.numero_serie}</span>}
            {e.dias_em_comodato != null && <span>{e.dias_em_comodato}d em comodato</span>}
            {e.valor_efetivo != null && <span>{fmtCurrency(e.valor_efetivo)}</span>}
          </div>

          {(e.sem_contrato || e.contrato_nao_assinado || e.manutencao_vencida || e.manutencao_proxima || e.revisar || e.os_abertas > 0) && (
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              {e.sem_contrato && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 inline-flex items-center gap-0.5">
                  <AlertTriangle size={9} /> sem contrato
                </span>
              )}
              {e.contrato_nao_assinado && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  contrato não assinado
                </span>
              )}
              {e.manutencao_vencida && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 inline-flex items-center gap-0.5">
                  <Wrench size={9} /> preventiva vencida
                </span>
              )}
              {e.manutencao_proxima && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                  preventiva em {fmtDate(e.proxima_manutencao)}
                </span>
              )}
              {e.os_abertas > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  {e.os_abertas} OS aberta{e.os_abertas > 1 ? 's' : ''}
                </span>
              )}
              {e.revisar && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                  revisar importação
                </span>
              )}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-1 shrink-0">
            <button onClick={onOS} className="btn-ghost p-2 text-slate-500" title="Abrir OS"><Wrench size={14} /></button>
            {e.situacao === 'em_comodato' ? (
              <button onClick={onDevolver} className="btn-ghost p-2 text-sky-500" title="Registrar devolução"><Undo2 size={14} /></button>
            ) : e.situacao === 'disponivel' ? (
              <button onClick={onAlocar} className="btn-ghost p-2 text-orange-500" title="Alocar em cliente"><ArrowRightLeft size={14} /></button>
            ) : null}
            <button onClick={onEdit} className="btn-ghost p-2 text-slate-500" title="Editar"><Pencil size={14} /></button>
            {isAdmin && (
              <button onClick={onDelete} className="btn-ghost p-2 text-red-500" title="Excluir (administrador)"><Trash2 size={14} /></button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────

export default function ComodatoPage() {
  const { canEdit, isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('painel')
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  const [equipamentos, setEquipamentos] = useState<ComodatoEquipamentoView[]>([])
  const [contratos, setContratos]       = useState<ComodatoContrato[]>([])
  const [manutencoes, setManutencoes]   = useState<ComodatoManutencao[]>([])
  const [modelos, setModelos]           = useState<ComodatoModelo[]>([])
  const [revisao, setRevisao]           = useState<RevisaoRow[]>([])

  const [filtroSituacao, setFiltroSituacao]   = useState<ComodatoSituacao | 'TODOS'>('TODOS')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS')
  const [manutSoAbertas, setManutSoAbertas]   = useState(true)

  const [editEquip, setEditEquip]       = useState<ComodatoEquipamentoView | null | undefined>(undefined)
  const [editContrato, setEditContrato] = useState<ComodatoContrato | null | undefined>(undefined)
  const [editManut, setEditManut]       = useState<ComodatoManutencao | null | undefined>(undefined)
  const [editModelo, setEditModelo]     = useState<ComodatoModelo | null | undefined>(undefined)
  const [alocarEquip, setAlocarEquip]   = useState<ComodatoEquipamentoView | null | undefined>(undefined)
  const [devolverEquip, setDevolver]    = useState<ComodatoEquipamentoView | null>(null)
  const [osEquip, setOsEquip]           = useState<ComodatoEquipamentoView | null>(null)

  // exclusão: só administrador (o banco também barra — RLS)
  const [excluir, setExcluir] = useState<{ tabela: TabelaComodato; id: string; titulo: string; aviso: string } | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [eq, ct, mt, md, rv] = await Promise.all([
      supabase.from('comodato_equipamentos_view').select('*').order('codigo_patrimonio'),
      supabase.from('comodato_contratos')
        .select('*, client:crm_clients(id, nome, rota, status)')
        .order('created_at', { ascending: false }),
      supabase.from('comodato_manutencoes')
        .select('*, equipamento:comodato_equipamentos(codigo_patrimonio, modelo_id), client:crm_clients(nome)')
        .order('data_abertura', { ascending: false }).limit(500),
      supabase.from('comodato_modelos').select('*').order('nome'),
      supabase.from('comodato_revisao_importacao').select('*').limit(500),
    ])
    setEquipamentos((eq.data ?? []) as ComodatoEquipamentoView[])
    setContratos((ct.data ?? []) as unknown as ComodatoContrato[])
    setManutencoes((mt.data ?? []) as unknown as ComodatoManutencao[])
    setModelos((md.data ?? []) as ComodatoModelo[])
    setRevisao((rv.data ?? []) as RevisaoRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function confirmarExclusao() {
    if (!excluir) return
    setExcluindo(true); setErroAcao(null)
    try {
      await excluirComodato(excluir.tabela, excluir.id)
      setExcluir(null)
      await load()
    } catch (e: any) {
      setErroAcao(mensagemErroComodato(e))
      setExcluir(null)
    }
    setExcluindo(false)
  }

  // ── KPIs ──
  const kpis = useMemo(() => {
    const ativos      = equipamentos.filter(e => e.ativo && e.situacao !== 'baixado')
    const emComodato  = ativos.filter(e => e.situacao === 'em_comodato')
    const disponiveis = ativos.filter(e => e.situacao === 'disponivel')
    const parados90   = disponiveis.filter(e => (e.dias_parado ?? 0) > 90)
    const valor = (l: ComodatoEquipamentoView[]) => l.reduce((s, e) => s + (e.valor_efetivo ?? 0), 0)
    return {
      total: ativos.length,
      emComodato: emComodato.length,
      disponiveis: disponiveis.length,
      manutencao: ativos.filter(e => e.situacao === 'manutencao').length,
      valorTotal: valor(ativos),
      valorParado: valor(disponiveis),
      parados90: parados90.length,
      utilizacao: ativos.length ? Math.round((emComodato.length / ativos.length) * 100) : 0,
      semContrato: ativos.filter(e => e.sem_contrato).length,
      naoAssinado: ativos.filter(e => e.contrato_nao_assinado).length,
      preventivaVencida: ativos.filter(e => e.manutencao_vencida).length,
      osAbertas: manutencoes.filter(m => m.status !== 'concluida' && m.status !== 'cancelada').length,
      contratosVencidos: contratos.filter(c => c.status === 'vigente' && comodatoContratoAlerta(c.data_fim) === 'vencido').length,
      contratosVencendo: contratos.filter(c => c.status === 'vigente' && comodatoContratoAlerta(c.data_fim) === 'vencendo').length,
      aRevisar: revisao.length,
    }
  }, [equipamentos, contratos, manutencoes, revisao])

  // ── Filtros ──
  const equipFiltrados = useMemo(() => {
    const q = search.trim().toUpperCase()
    return equipamentos.filter(e => {
      if (filtroSituacao !== 'TODOS' && e.situacao !== filtroSituacao) return false
      if (filtroCategoria !== 'TODAS' && e.categoria !== filtroCategoria) return false
      if (!q) return true
      return e.codigo_patrimonio.includes(q)
        || (e.modelo_nome ?? '').toUpperCase().includes(q)
        || (e.client_nome ?? '').toUpperCase().includes(q)
        || (e.numero_serie ?? '').toUpperCase().includes(q)
    })
  }, [equipamentos, search, filtroSituacao, filtroCategoria])

  const disponiveis = useMemo(
    () => equipamentos.filter(e => e.situacao === 'disponivel' && e.ativo)
      .sort((a, b) => (b.dias_parado ?? 0) - (a.dias_parado ?? 0)),
    [equipamentos]
  )

  const contratosFiltrados = useMemo(() => {
    const q = search.trim().toUpperCase()
    if (!q) return contratos
    return contratos.filter(c =>
      (c.client?.nome ?? '').toUpperCase().includes(q) || (c.numero ?? '').toUpperCase().includes(q))
  }, [contratos, search])

  const manutFiltradas = useMemo(() => {
    const q = search.trim().toUpperCase()
    return manutencoes.filter(m => {
      if (manutSoAbertas && (m.status === 'concluida' || m.status === 'cancelada')) return false
      if (!q) return true
      return (m.equipamento?.codigo_patrimonio ?? '').includes(q)
        || (m.client?.nome ?? '').toUpperCase().includes(q)
        || m.descricao.toUpperCase().includes(q)
    })
  }, [manutencoes, search, manutSoAbertas])

  /** Unidades com preventiva vencida ou a vencer e sem OS aberta — o que precisa virar OS. */
  const preventivasPendentes = useMemo(
    () => equipamentos
      .filter(e => e.ativo && (e.manutencao_vencida || e.manutencao_proxima) && e.os_abertas === 0)
      .sort((a, b) => (a.proxima_manutencao ?? '').localeCompare(b.proxima_manutencao ?? '')),
    [equipamentos]
  )

  const TABS: { id: Tab; label: string; icon: any; count: number | null }[] = [
    { id: 'painel',       label: 'Painel',       icon: TrendingUp,     count: null },
    { id: 'equipamentos', label: 'Equipamentos', icon: Package,        count: kpis.total },
    { id: 'disponiveis',  label: 'Disponíveis',  icon: Warehouse,      count: kpis.disponiveis },
    { id: 'contratos',    label: 'Contratos',    icon: FileSignature,  count: contratos.length },
    { id: 'manutencoes',  label: 'Manutenções',  icon: Wrench,         count: kpis.osAbertas },
    { id: 'catalogo',     label: 'Catálogo',     icon: Boxes,          count: modelos.length },
    ...(kpis.aRevisar > 0
      ? [{ id: 'revisao' as Tab, label: 'Revisão', icon: ClipboardCheck, count: kpis.aRevisar }]
      : []),
    ...(isAdmin
      ? [{ id: 'auditoria' as Tab, label: 'Auditoria', icon: ScrollText, count: null }]
      : []),
  ]

  const mostraBusca = tab !== 'painel' && tab !== 'revisao' && tab !== 'auditoria'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Comodato</h1>
          {(kpis.semContrato > 0 || kpis.preventivaVencida > 0 || kpis.contratosVencidos > 0) && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-bold">
              <AlertTriangle size={11} />
              {kpis.semContrato + kpis.preventivaVencida + kpis.contratosVencidos} pendência(s)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2" title="Atualizar">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {canEdit && tab === 'catalogo' && (
            <button onClick={() => setEditModelo(null)} className="btn-primary"><Plus size={16} /> <span className="hidden sm:inline">Modelo</span></button>
          )}
          {canEdit && tab === 'contratos' && (
            <button onClick={() => setEditContrato(null)} className="btn-primary"><Plus size={16} /> <span className="hidden sm:inline">Contrato</span></button>
          )}
          {canEdit && tab === 'manutencoes' && (
            <button onClick={() => setEditManut(null)} className="btn-primary"><Plus size={16} /> <span className="hidden sm:inline">OS</span></button>
          )}
          {canEdit && (tab === 'equipamentos' || tab === 'disponiveis' || tab === 'painel') && (
            <>
              <button onClick={() => setAlocarEquip(null)} className="btn-secondary"><ArrowRightLeft size={16} /> <span className="hidden sm:inline">Alocar</span></button>
              <button onClick={() => setEditEquip(null)} className="btn-primary"><Plus size={16} /> <span className="hidden sm:inline">Equipamento</span></button>
            </>
          )}
        </div>
      </div>

      {erroAcao && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{erroAcao}</span>
          <button onClick={() => setErroAcao(null)} className="shrink-0 hover:opacity-70"><X size={16} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t.id
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <t.icon size={15} />
            {t.label}
            {t.count !== null && (
              <span className={`text-[10px] px-1.5 rounded-full font-bold ${
                tab === t.id ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Busca + filtros */}
      {mostraBusca && (
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)}
                   placeholder={
                     tab === 'contratos' ? 'Buscar por cliente ou número do contrato…'
                     : tab === 'manutencoes' ? 'Buscar por patrimônio, cliente ou problema…'
                     : 'Buscar por patrimônio, modelo, série ou cliente…'
                   } />
          </div>
          {tab === 'equipamentos' && (
            <>
              <select className="input w-auto" value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as any)}>
                <option value="TODOS">Todas as situações</option>
                {(Object.keys(COMODATO_SITUACAO_LABELS) as ComodatoSituacao[]).map(k => (
                  <option key={k} value={k}>{COMODATO_SITUACAO_LABELS[k]}</option>
                ))}
              </select>
              <select className="input w-auto" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
                <option value="TODAS">Todas as categorias</option>
                {COMODATO_CATEGORIAS.map(c => <option key={c} value={c}>{CATEGORIA_LABELS[c] ?? c}</option>)}
              </select>
            </>
          )}
          {tab === 'manutencoes' && (
            <button onClick={() => setManutSoAbertas(v => !v)}
                    className={`btn-ghost text-xs py-2 px-3 whitespace-nowrap ${manutSoAbertas ? 'text-orange-500' : ''}`}>
              {manutSoAbertas ? 'Só abertas' : 'Todas as OS'}
            </button>
          )}
        </div>
      )}

      {/* ── Painel ── */}
      {tab === 'painel' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Package}    label="Parque total"        value={String(kpis.total)}          hint={`${kpis.utilizacao}% em uso`} />
            <Kpi icon={DollarSign} label="Capital imobilizado" value={fmtCurrency(kpis.valorTotal)} hint="Soma dos bens ativos" tone="orange" />
            <Kpi icon={Warehouse}  label="Disponíveis"         value={String(kpis.disponiveis)}     hint={`${fmtCurrency(kpis.valorParado)} parados`} tone="green" />
            <Kpi icon={Wrench}     label="OS abertas"          value={String(kpis.osAbertas)}       hint={`${kpis.preventivaVencida} preventivas vencidas`} tone={kpis.osAbertas ? 'red' : 'slate'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="card p-4 space-y-2.5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Risco contratual</h3>
              {[
                { n: kpis.semContrato,       txt: 'equipamentos no cliente sem contrato vinculado', tone: 'red' },
                { n: kpis.naoAssinado,       txt: 'equipamentos com contrato não assinado',         tone: 'amber' },
                { n: kpis.contratosVencidos, txt: 'contratos vigentes já vencidos',                 tone: 'red' },
                { n: kpis.contratosVencendo, txt: 'contratos vencendo em até 60 dias',              tone: 'amber' },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`w-8 text-right font-bold ${
                    r.n === 0 ? 'text-slate-300 dark:text-slate-600'
                    : r.tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                  }`}>{r.n}</span>
                  <span className={r.n === 0 ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'}>{r.txt}</span>
                </div>
              ))}
              {kpis.semContrato === 0 && kpis.naoAssinado === 0 && kpis.contratosVencidos === 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 pt-1">
                  <CheckCircle2 size={12} /> Nenhum bem cedido sem cobertura contratual.
                </p>
              )}
            </div>

            <div className="card p-4 space-y-2.5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capital ocioso</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-8 text-right font-bold text-slate-700 dark:text-slate-200">{kpis.disponiveis}</span>
                <span className="text-slate-600 dark:text-slate-300">unidades no depósito</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-8 text-right font-bold ${kpis.parados90 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>
                  {kpis.parados90}
                </span>
                <span className="text-slate-600 dark:text-slate-300">paradas há mais de 90 dias</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-8 text-right font-bold text-slate-700 dark:text-slate-200">{kpis.manutencao}</span>
                <span className="text-slate-600 dark:text-slate-300">em manutenção</span>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                Antes de comprar um equipamento novo, realoque o que já está parado — é o ganho
                mais barato de utilização do capital investido.
              </p>
            </div>
          </div>

          {preventivasPendentes.length > 0 && (
            <div className="card p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">
                Preventivas a programar
              </h3>
              <div className="space-y-1.5">
                {preventivasPendentes.slice(0, 8).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                      {e.codigo_patrimonio}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1">
                      {e.modelo_nome}{e.client_nome ? ` · ${e.client_nome}` : ' · depósito'}
                    </span>
                    <span className={`text-[11px] font-bold shrink-0 ${e.manutencao_vencida ? 'text-red-600 dark:text-red-400' : 'text-sky-600 dark:text-sky-400'}`}>
                      {fmtDate(e.proxima_manutencao)}
                    </span>
                    {canEdit && (
                      <button onClick={() => setOsEquip(e)} className="btn-ghost p-1.5 text-orange-500 shrink-0" title="Abrir OS">
                        <Wrench size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Equipamentos / Disponíveis ── */}
      {(tab === 'equipamentos' || tab === 'disponiveis') && (
        loading ? (
          <div className="card p-8 text-center text-slate-400">Carregando…</div>
        ) : (tab === 'equipamentos' ? equipFiltrados : disponiveis).length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            {tab === 'disponiveis'
              ? 'Nenhuma unidade disponível no depósito. Todo o parque está alocado.'
              : 'Nenhum equipamento encontrado.'}
          </div>
        ) : (
          <div className="space-y-2">
            {tab === 'disponiveis' && (
              <p className="text-xs text-slate-400 px-1">
                Ordenado pelas unidades paradas há mais tempo — comece por elas ao atender um pedido novo.
              </p>
            )}
            {(tab === 'equipamentos' ? equipFiltrados : disponiveis).map(e => (
              <EquipCard key={e.id} e={e} canEdit={canEdit} isAdmin={isAdmin}
                onDelete={() => setExcluir({
                  tabela: 'comodato_equipamentos', id: e.id,
                  titulo: `Excluir equipamento ${e.codigo_patrimonio}`,
                  aviso: 'O histórico de alocações e as ordens de serviço deste equipamento também serão apagados. Se ele só saiu de uso, prefira dar baixa. A exclusão fica registrada na auditoria.',
                })}
                onEdit={() => setEditEquip(e)}
                onAlocar={() => setAlocarEquip(e)}
                onDevolver={() => setDevolver(e)}
                onOS={() => setOsEquip(e)}
              />
            ))}
          </div>
        )
      )}

      {/* ── Contratos ── */}
      {tab === 'contratos' && (
        loading ? (
          <div className="card p-8 text-center text-slate-400">Carregando…</div>
        ) : contratosFiltrados.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">Nenhum contrato cadastrado.</div>
        ) : (
          <div className="space-y-2">
            {contratosFiltrados.map(c => {
              const alerta = comodatoContratoAlerta(c.data_fim)
              const itens = equipamentos.filter(e => e.contrato_id === c.id).length
              return (
                <div key={c.id} className="card px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-xl bg-orange-50 dark:bg-orange-900/20 shrink-0">
                    <FileSignature size={16} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{c.client?.nome ?? '—'}</span>
                      {c.numero && <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{c.numero}</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CONTRATO_COLORS[c.status]}`}>
                        {COMODATO_CONTRATO_LABELS[c.status]}
                      </span>
                      {c.contrato_assinado ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 inline-flex items-center gap-0.5">
                          <CheckCircle2 size={9} /> Assinado
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Não assinado</span>
                      )}
                      {alerta && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${
                          alerta === 'vencido'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        }`}>
                          <AlertTriangle size={9} /> {alerta === 'vencido' ? 'vencido' : 'vencendo'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-3 flex-wrap">
                      <span>{itens} {itens === 1 ? 'equipamento' : 'equipamentos'}</span>
                      {c.data_inicio && <span>Início {fmtDate(c.data_inicio)}</span>}
                      {c.data_fim && <span>Vence {fmtDate(c.data_fim)}</span>}
                      {c.valor_total_bens != null && <span>{fmtCurrency(c.valor_total_bens)}</span>}
                      {c.volume_minimo && <span>Mín. {c.volume_minimo}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {c.arquivo_url && (
                      <a href={c.arquivo_url} target="_blank" rel="noreferrer" className="btn-ghost p-2 text-slate-500" title="Abrir PDF">
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {canEdit && (
                      <button onClick={() => setEditContrato(c)} className="btn-ghost p-2 text-slate-500" title="Editar">
                        <Pencil size={14} />
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setExcluir({
                        tabela: 'comodato_contratos', id: c.id,
                        titulo: `Excluir contrato ${c.numero ?? ''} de ${c.client?.nome ?? 'cliente'}`.replace('  ', ' '),
                        aviso: 'Os aditivos do contrato serão apagados. Se o contrato só terminou, prefira alterar o status para encerrado ou cancelado. A exclusão fica registrada na auditoria.',
                      })} className="btn-ghost p-2 text-red-500" title="Excluir (administrador)">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Manutenções ── */}
      {tab === 'manutencoes' && (
        <div className="space-y-4">
          {preventivasPendentes.length > 0 && manutSoAbertas && (
            <div className="card p-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">
                Preventivas sem OS aberta ({preventivasPendentes.length})
              </h3>
              <div className="space-y-1.5">
                {preventivasPendentes.map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                      {e.codigo_patrimonio}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1">
                      {e.modelo_nome}{e.client_nome ? ` · ${e.client_nome}` : ' · depósito'}
                    </span>
                    <span className={`text-[11px] font-bold shrink-0 ${e.manutencao_vencida ? 'text-red-600 dark:text-red-400' : 'text-sky-600 dark:text-sky-400'}`}>
                      {fmtDate(e.proxima_manutencao)}
                    </span>
                    {canEdit && (
                      <button onClick={() => setOsEquip(e)} className="btn-ghost p-1.5 text-orange-500 shrink-0" title="Abrir OS">
                        <Wrench size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="card p-8 text-center text-slate-400">Carregando…</div>
          ) : manutFiltradas.length === 0 ? (
            <div className="card p-8 text-center text-slate-400">
              {manutSoAbertas ? 'Nenhuma ordem de serviço aberta.' : 'Nenhuma ordem de serviço registrada.'}
            </div>
          ) : (
            <div className="space-y-2">
              {manutFiltradas.map(m => (
                <div key={m.id} className="card px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 shrink-0">
                    <Wrench size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                        {m.equipamento?.codigo_patrimonio ?? '—'}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${MANUT_STATUS_COLORS[m.status]}`}>
                        {COMODATO_MANUT_STATUS_LABELS[m.status]}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {COMODATO_MANUT_TIPO_LABELS[m.tipo]}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORIDADE_COLORS[m.prioridade]}`}>
                        {COMODATO_PRIORIDADE_LABELS[m.prioridade]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{m.descricao}</p>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-3 flex-wrap mt-0.5">
                      {m.client?.nome && <span>📍 {m.client.nome}</span>}
                      <span>Aberta {fmtDate(m.data_abertura)}</span>
                      {m.data_agendada && <span>Agendada {fmtDate(m.data_agendada)}</span>}
                      {m.data_conclusao && <span>Concluída {fmtDate(m.data_conclusao)}</span>}
                      {m.custo != null && <span>{fmtCurrency(m.custo)}</span>}
                      {m.tecnico && <span>👤 {m.tecnico}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <button onClick={() => setEditManut(m)} className="btn-ghost p-2 text-slate-500 shrink-0" title="Editar">
                      <Pencil size={14} />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setExcluir({
                      tabela: 'comodato_manutencoes', id: m.id,
                      titulo: `Excluir OS de ${m.equipamento?.codigo_patrimonio ?? 'equipamento'}`,
                      aviso: 'A exclusão fica registrada na auditoria.',
                    })} className="btn-ghost p-2 text-red-500 shrink-0" title="Excluir (administrador)">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Catálogo ── */}
      {tab === 'catalogo' && (
        loading ? (
          <div className="card p-8 text-center text-slate-400">Carregando…</div>
        ) : modelos.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">Nenhum modelo cadastrado.</div>
        ) : (
          <div className="space-y-2">
            {modelos
              .filter(m => !search.trim() || m.nome.toUpperCase().includes(search.trim().toUpperCase()))
              .map(m => {
                const unidades = equipamentos.filter(e => e.modelo_id === m.id)
                const emUso = unidades.filter(e => e.situacao === 'em_comodato').length
                return (
                  <div key={m.id} className={`card px-4 py-3 flex items-start gap-3 ${!m.ativo ? 'opacity-60' : ''}`}>
                    <div className="mt-0.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-700/50 shrink-0">
                      <Boxes size={16} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{m.nome}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {CATEGORIA_LABELS[m.categoria] ?? m.categoria}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-3 flex-wrap">
                        <span>{unidades.length} {unidades.length === 1 ? 'unidade' : 'unidades'} · {emUso} em uso</span>
                        {m.marca && <span>{m.marca}</span>}
                        {m.capacidade && <span>{m.capacidade}</span>}
                        {m.valor_referencia != null && <span>Ref. {fmtCurrency(m.valor_referencia)}</span>}
                        {m.manutencao_intervalo_meses && <span>Preventiva {m.manutencao_intervalo_meses}m</span>}
                      </div>
                    </div>
                    {canEdit && (
                      <button onClick={() => setEditModelo(m)} className="btn-ghost p-2 text-slate-500 shrink-0" title="Editar">
                        <Pencil size={14} />
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setExcluir({
                        tabela: 'comodato_modelos', id: m.id,
                        titulo: `Excluir modelo ${m.nome}`,
                        aviso: unidades.length > 0
                          ? 'Este modelo possui unidades cadastradas e o banco vai recusar a exclusão. Inative o modelo em vez de excluir.'
                          : 'A exclusão fica registrada na auditoria.',
                      })} className="btn-ghost p-2 text-red-500 shrink-0" title="Excluir (administrador)">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
          </div>
        )
      )}

      {/* ── Revisão da importação ── */}
      {tab === 'revisao' && (
        <div className="space-y-3">
          <div className="card p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Estes registros vieram do campo livre de comodato do cadastro de clientes. Confira cada unidade
            (número de série, valor, estado) e desmarque “Pendente de revisão” ao terminar. Textos que a
            importação não conseguiu interpretar precisam ser lançados manualmente.
          </div>
          {revisao.length === 0 ? (
            <div className="card p-8 text-center text-slate-400">Nada pendente de revisão.</div>
          ) : (
            <div className="space-y-2">
              {revisao.map((r, i) => {
                const equip = r.equipamento_id ? equipamentos.find(e => e.id === r.equipamento_id) : null
                return (
                  <div key={i} className="card px-4 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                      r.tipo_pendencia === 'equipamento_a_revisar' ? 'bg-sky-50 dark:bg-sky-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
                    }`}>
                      <ClipboardCheck size={16} className={
                        r.tipo_pendencia === 'equipamento_a_revisar' ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'
                      } />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {r.referencia && (
                          <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">
                            {r.referencia}
                          </span>
                        )}
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{r.client_nome ?? '—'}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {r.tipo_pendencia === 'equipamento_a_revisar' ? 'conferir unidade'
                            : r.tipo_pendencia === 'texto_nao_interpretado' ? 'texto não interpretado'
                            : 'cliente só no ERP'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{r.descricao ?? '—'}</p>
                      {r.texto_original && r.texto_original !== r.descricao && (
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">Original: {r.texto_original}</p>
                      )}
                    </div>
                    {canEdit && equip && (
                      <button onClick={() => setEditEquip(equip)} className="btn-ghost p-2 text-slate-500 shrink-0" title="Conferir">
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Auditoria (só administrador) ── */}
      {tab === 'auditoria' && isAdmin && <ComodatoAuditoriaTab />}

      <ConfirmDialog
        open={!!excluir}
        title={excluir?.titulo}
        message={excluir?.aviso ?? ''}
        confirmLabel="Excluir"
        loading={excluindo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluir(null)}
      />

      {/* Modais */}
      {editEquip !== undefined && (
        <ComodatoEquipamentoModal equipamento={editEquip} onClose={() => setEditEquip(undefined)} onSaved={load} />
      )}
      {alocarEquip !== undefined && (
        <ComodatoAlocarModal modo="alocar" equipamento={alocarEquip} onClose={() => setAlocarEquip(undefined)} onSaved={load} />
      )}
      {devolverEquip && (
        <ComodatoAlocarModal modo="devolver" equipamento={devolverEquip} onClose={() => setDevolver(null)} onSaved={load} />
      )}
      {editContrato !== undefined && (
        <ComodatoContratoModal contrato={editContrato} onClose={() => setEditContrato(undefined)} onSaved={load} />
      )}
      {editManut !== undefined && (
        <ComodatoManutencaoModal manutencao={editManut} onClose={() => setEditManut(undefined)} onSaved={load} />
      )}
      {osEquip && (
        <ComodatoManutencaoModal equipamento={osEquip} onClose={() => setOsEquip(null)} onSaved={load} />
      )}
      {editModelo !== undefined && (
        <ComodatoModeloModal modelo={editModelo} onClose={() => setEditModelo(undefined)} onSaved={load} />
      )}
    </div>
  )
}
