import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  RefreshCw, ChevronLeft, ChevronRight, Calendar,
  Phone, CheckCircle2, Package2, AlertTriangle,
  Truck, MessageCircle, Settings, Download, X, Plus,
  Clock, History, ChevronDown, Search, Pencil,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'
import type { AtacadoPedido, Client } from '../types'

// ─── Constants ────────────────────────────────────────────────
const PT_DAYS       = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
const PT_DAY_LABELS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']
const TURNOS_LIST   = ['MANHÃ', 'TARDE', 'NOITE']
const RETIRADA_VALS = ['RETIRADA', 'BALCÃO', 'RETIRADA/BALCÃO']

const firstName = (nome: string) => nome.trim().split(/\s+/)[0].toUpperCase()
const MSG_PADRAO    = 'Bom dia! ☀️\n\nQual será o seu pedido de hoje? 🥖❄️\n\n_*Lumar Alimentos*_'

// ─── Types ────────────────────────────────────────────────────
interface RotinaLog {
  id: number
  client_id: string
  data_contato: string
  tipo: string
  feito: boolean
  feito_em: string | null
}

// ─── Helpers ──────────────────────────────────────────────────
function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dayRange(date: Date): [string, string] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return [start.toISOString(), new Date(start.getTime() + 86400000).toISOString()]
}

function turnoScore(t: string | null) {
  return t === 'MANHÃ' ? 1 : t === 'TARDE' ? 2 : t === 'NOITE' ? 3 : 4
}

function circularSort(pedidos: AtacadoPedido[]): AtacadoPedido[] {
  const h = new Date().getHours()
  const now = h < 12 ? 1 : h < 18 ? 2 : 3
  return [...pedidos].sort((a, b) => {
    const sa = turnoScore(a.turno), sb = turnoScore(b.turno)
    const ca = sa >= now ? sa - now : sa + 3 - now
    const cb = sb >= now ? sb - now : sb + 3 - now
    if (ca !== cb) return ca - cb
    return (a.crm_client?.rota ?? '').localeCompare(b.cliente?.rota ?? '', 'pt-BR')
  })
}

function whatsappUrl(telefone: string, msg: string) {
  const num = telefone.replace(/\D/g, '')
  const full = num.startsWith('55') ? num : `55${num}`
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`
}

function fmtRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 0) return `em ${Math.abs(diff)} d`
  return `há ${diff} d`
}

// Exibe o número do pedido — usa numero_pedido quando existe, senão id_venda
function pedNum(p: AtacadoPedido): string {
  if (p.numero_pedido) return String(p.numero_pedido)
  if (p.id_venda)      return `#${p.id_venda}`
  return '—'
}

// ─── Main Component ───────────────────────────────────────────
export default function DashboardAtacado() {
  const [activeTab, setActiveTab]       = useState<'novos' | 'rotas' | 'retirada'>('novos')
  const [pedidosNovos, setPedidosNovos] = useState<AtacadoPedido[]>([])
  const [pedidosDia, setPedidosDia]     = useState<AtacadoPedido[]>([])
  const [historico, setHistorico]       = useState<AtacadoPedido[]>([])
  const [rotinaClientes, setRotinaClientes] = useState<Client[]>([])
  const [rotinaLog, setRotinaLog]       = useState<RotinaLog[]>([])
  const [rotinaDate, setRotinaDate]     = useState(new Date())
  const [rotasDate, setRotasDate]       = useState(new Date())
  const [loading, setLoading]           = useState(true)
  const [showHistorico, setShowHistorico] = useState(false)
  const [histSoOcorrencia, setHistSoOcorrencia] = useState(false)
  const [editPedidoId, setEditPedidoId] = useState<number | null>(null)
  const [directOpenPedido, setDirectOpenPedido] = useState<AtacadoPedido | null>(null)
  const [syncing, setSyncing]           = useState<string | null>(null)
  const [syncMsg, setSyncMsg]           = useState<string | null>(null)
  const [showConfig, setShowConfig]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [cobrancaAberto, setCobrancaAberto] = useState<Map<string, number>>(new Map())
  const [drivers, setDrivers]           = useState<string[]>([])

  const todayStr    = format(new Date(), 'yyyy-MM-dd')
  const rotasDateStr = format(rotasDate, 'yyyy-MM-dd')
  const isRotasHoje  = rotasDateStr === todayStr

  const pedidosRota      = useMemo(() => pedidosDia.filter(p => !RETIRADA_VALS.includes(p.entregador ?? '')), [pedidosDia])
  const pedidosRetirada  = useMemo(() => pedidosDia.filter(p =>  RETIRADA_VALS.includes(p.entregador ?? '')), [pedidosDia])
  const sortedPedidosDia = useMemo(() => circularSort(pedidosRota), [pedidosRota])
  const kpiSemEntregador = useMemo(() => pedidosRota.filter(p => !p.entregador).length, [pedidosRota])
  const kpiValor         = useMemo(() => pedidosDia.reduce((s, p) => s + p.valor, 0), [pedidosDia])
  const isRotinaHoje      = format(rotinaDate, 'yyyy-MM-dd') === todayStr

  // Filtered novos based on search
  const filteredNovos = useMemo(() => {
    if (!searchQuery.trim()) return pedidosNovos
    const q = searchQuery.toLowerCase().trim()
    return pedidosNovos.filter(p =>
      String(p.numero_pedido ?? '').includes(q) ||
      String(p.id_venda ?? '').includes(q) ||
      (p.crm_client?.nome ?? p.cliente_nome ?? '').toLowerCase().includes(q)
    )
  }, [pedidosNovos, searchQuery])

  const filteredHistorico = useMemo(() => {
    let result = historico
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(p =>
        String(p.numero_pedido ?? '').includes(q) ||
        String(p.id_venda ?? '').includes(q) ||
        (p.crm_client?.nome ?? p.cliente_nome ?? '').toLowerCase().includes(q)
      )
    }
    if (histSoOcorrencia) result = result.filter(p => p.ocorrencia?.trim())
    return result
  }, [historico, searchQuery, histSoOcorrencia])

  // Pedido currently being edited (from any list)
  const pedidoParaEditar = useMemo(
    () => [...pedidosNovos, ...pedidosDia, ...historico].find(p => p.id === editPedidoId) ?? null,
    [editPedidoId, pedidosNovos, pedidosDia, historico],
  )

  // Load cobrança open totals for alert badges
  useEffect(() => {
    supabase.from('cobranca').select('cliente_nome, valor').eq('situacao', 'EM ABERTO')
      .then(({ data }) => {
        const map = new Map<string, number>()
        ;(data ?? []).forEach((r: { cliente_nome: string; valor: number }) => {
          const key = r.cliente_nome.toUpperCase().trim()
          map.set(key, (map.get(key) ?? 0) + r.valor)
        })
        setCobrancaAberto(map)
      })
  }, [])

  // ─── Loaders ────────────────────────────────────────────
  const JOIN = '*, crm_client:crm_clients(id,nome,rota,pgto,setor,restricao,observacoes,telefone,turno)'

  const loadNovos = useCallback(async () => {
    const { data } = await supabase
      .from('atacado_pedidos')
      .select(JOIN)
      .is('data_entrega', null)
      .eq('ignorado', false)
      .neq('tipo', 'CANCELADO')
      .order('id_venda', { ascending: false })
      .limit(500)
    setPedidosNovos((data ?? []) as AtacadoPedido[])
  }, [])

  const loadRotas = useCallback(async () => {
    const { data } = await supabase
      .from('atacado_pedidos')
      .select(JOIN)
      .eq('data_entrega', rotasDateStr)
      .neq('tipo', 'CANCELADO')
      .order('atualizacao')
    setPedidosDia((data ?? []) as AtacadoPedido[])
  }, [rotasDateStr])

  const loadRotina = useCallback(async (date: Date) => {
    const nomeDia = PT_DAYS[date.getDay()]
    const dateStr = format(date, 'yyyy-MM-dd')
    const [{ data: cls }, { data: logs }] = await Promise.all([
      supabase
        .from('crm_clients')
        .select('id, nome, telefone, rota, setor, restricao, bonificacao, mensagem')
        .in('status', ['ATIVO', 'PERDENDO'])
        .eq('ativo', true)
        .ilike('dia_entrega', `%${nomeDia}%`),
      supabase
        .from('rotina_log')
        .select('*')
        .eq('data_contato', dateStr)
        .eq('tipo', 'recompra'),
    ])
    const sorted = ((cls ?? []) as Client[]).sort((a, b) => {
      const wa = a.mensagem === 'SIM' ? 0 : 1
      const wb = b.mensagem === 'SIM' ? 0 : 1
      if (wa !== wb) return wa - wb
      return (a.rota ?? '').localeCompare(b.rota ?? '', 'pt-BR')
    })
    setRotinaClientes(sorted)
    setRotinaLog((logs ?? []) as RotinaLog[])
  }, [])

  const loadHistorico = useCallback(async () => {
    const { data } = await supabase
      .from('atacado_pedidos')
      .select('*, crm_client:crm_clients(id,nome,rota)')
      .not('data_entrega', 'is', null)
      .eq('ignorado', false)
      .neq('tipo', 'CANCELADO')
      .order('data_entrega', { ascending: false })
      .limit(200)
    setHistorico((data ?? []) as AtacadoPedido[])
  }, [])

  async function load() {
    setLoading(true)
    await Promise.all([loadNovos(), loadRotas(), loadRotina(rotinaDate)])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    supabase.from('crm_drivers').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setDrivers((data ?? []).map((d: any) => firstName(d.nome)).filter(Boolean))
      })
  }, [])

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const openId = searchParams.get('openId')
    if (!openId) return
    setSearchParams({}, { replace: true })
    supabase.from('atacado_pedidos').select('*, crm_client:crm_clients(id,nome,rota)').eq('id', parseInt(openId, 10)).single()
      .then(({ data }) => { if (data) setDirectOpenPedido(data as AtacadoPedido) })
  }, [])

  useEffect(() => { loadRotina(rotinaDate) }, [rotinaDate, loadRotina])
  useEffect(() => { loadRotas() }, [loadRotas])
  useEffect(() => { if (showHistorico) loadHistorico() }, [showHistorico, loadHistorico])

  // Auto-refresh every 90 s
  useEffect(() => {
    const id = setInterval(() => { loadNovos(); loadRotas() }, 90000)
    return () => clearInterval(id)
  }, [loadNovos, loadRotas])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('atacado-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atacado_pedidos' }, () => {
        loadNovos(); loadRotas()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadNovos, loadRotas])

  // ─── Mutations ──────────────────────────────────────────
  async function updatePedido(id: number, patch: Partial<AtacadoPedido>) {
    await supabase.from('atacado_pedidos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setPedidosDia(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  async function savePedidoEdit(id: number, patch: Partial<AtacadoPedido>) {
    // Auto-preenche turno/pgto do cliente se o pedido não tiver explicitamente definido
    if (!patch.turno) {
      const pedido = [...pedidosNovos, ...pedidosDia, ...historico].find(p => p.id === id)
      if (pedido?.crm_client?.turno) patch.turno = pedido.crm_client.turno
    }
    await supabase.from('atacado_pedidos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    await Promise.all([loadNovos(), loadRotas()])
    if (showHistorico) await loadHistorico()
    setEditPedidoId(null)
    if (patch.data_entrega === rotasDateStr) setActiveTab('rotas')
  }

  async function ignorarPedido(id: number) {
    await supabase.from('atacado_pedidos').update({ ignorado: true, updated_at: new Date().toISOString() }).eq('id', id)
    setPedidosNovos(prev => prev.filter(p => p.id !== id))
  }

  async function toggleContato(clientId: string, feito: boolean) {
    const dateStr = format(rotinaDate, 'yyyy-MM-dd')
    const { data } = await supabase
      .from('rotina_log')
      .upsert(
        { client_id: clientId, data_contato: dateStr, tipo: 'recompra', feito, feito_em: feito ? new Date().toISOString() : null },
        { onConflict: 'client_id,data_contato,tipo' },
      )
      .select().maybeSingle()
    if (data) setRotinaLog(prev => {
      const idx = prev.findIndex(l => l.client_id === clientId)
      return idx >= 0 ? prev.map((l, i) => i === idx ? data as RotinaLog : l) : [...prev, data as RotinaLog]
    })
  }

  async function syncSheet(type: 'pedidos' | 'reg_lumar') {
    setSyncing(type); setSyncMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('sync-atacado', { body: { type } })
      if (error) { setSyncMsg(`Erro: ${error.message}`); return }
      if (data?.ok === false) {
        setSyncMsg(`Erro: ${data.error}${data.hint ? ' — ' + data.hint : ''}`)
        return
      }
      if (type === 'pedidos') {
        const cols = data.sheetHeaders?.join(', ') ?? 'n/a'
        setSyncMsg(`✓ ${data.upserted} pedidos importados (${data.skipped} ignorados) — colunas: ${cols}`)
        await loadNovos()
      } else {
        const cols = data.sheetHeaders?.join(', ') ?? 'n/a'
        setSyncMsg(`✓ ${data.updated} atualizados, ${data.datesSet ?? 0} datas de entrega definidas (${data.skipped} ignorados) — colunas: ${cols}`)
        await Promise.all([loadNovos(), loadRotas(), showHistorico ? loadHistorico() : Promise.resolve()])
      }
    } catch (e: unknown) {
      setSyncMsg(`Erro: ${e instanceof Error ? e.message : 'desconhecido'}`)
    } finally { setSyncing(null) }
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Package2 size={22} className="text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard Atacado</h1>
            <p className="text-xs text-slate-400 capitalize">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => syncSheet('reg_lumar')} disabled={!!syncing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Atualizar turno/entregador do REG-LUMAR"
          >
            <RefreshCw size={13} className={syncing === 'reg_lumar' ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">REG-LUMAR</span>
          </button>
          <button
            onClick={() => syncSheet('pedidos')} disabled={!!syncing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
            title="Importar pedidos da planilha de recepção"
          >
            <Download size={13} className={syncing === 'pedidos' ? 'animate-bounce' : ''} />
            <span className="hidden sm:inline">Importar</span>
          </button>
          <button
            onClick={() => setShowConfig(c => !c)}
            className={`p-1.5 rounded-lg border transition-colors ${showConfig ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 text-orange-500' : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
            title="Configurações"
          >
            <Settings size={15} />
          </button>
          <button onClick={load} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" title="Recarregar">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Search bar + date navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar pedido por número ou cliente..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl px-1 py-1 shrink-0">
          <button onClick={() => setRotasDate(d => subDays(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setRotasDate(new Date())}
            className={`px-2 py-0.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${isRotasHoje ? 'text-orange-500 font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100'}`}
          >
            <Calendar size={10} className="inline mr-1" />
            {isRotasHoje ? 'Hoje' : format(rotasDate, "dd/MM", { locale: ptBR })}
          </button>
          <button onClick={() => setRotasDate(d => addDays(d, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-2 ${syncMsg.startsWith('Erro') ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'}`}>
          <span className="flex-1">{syncMsg}</span>
          <button onClick={() => setSyncMsg(null)}><X size={11} /></button>
        </div>
      )}

      {showConfig && <IdsIgnoradosPanel />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="Aguardando data"
          value={pedidosNovos.length}
          color={pedidosNovos.length > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
          icon={<Clock size={15} className={pedidosNovos.length > 0 ? 'text-amber-500' : 'text-slate-400'} />}
        />
        <KPICard label="Entregas hoje" value={pedidosDia.length} icon={<Package2 size={15} className="text-slate-400" />} />
        <KPICard label="Valor do dia" value={fmtCurrency(kpiValor)} color="text-green-600 dark:text-green-400" icon={<span className="text-xs font-bold text-green-600">R$</span>} />
        <KPICard
          label="Rotina"
          value={rotinaClientes.length}
          sub={`${rotinaLog.filter(l => l.feito).length} contatados`}
          icon={<Phone size={15} className="text-slate-400" />}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

        {/* Left — tabs */}
        <div className="xl:col-span-3 card overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('novos')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'novos' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-b-2 border-amber-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <Clock size={13} /> Novos
              {pedidosNovos.length > 0 && (
                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pedidosNovos.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('rotas')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'rotas' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-b-2 border-orange-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <Truck size={13} />
              {isRotasHoje ? 'Rotas' : format(rotasDate, 'dd/MM', { locale: ptBR })}
              {kpiSemEntregador > 0 && (
                <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{kpiSemEntregador}!</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('retirada')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'retirada' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              🏭 Retirada
              {pedidosRetirada.length > 0 && (
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pedidosRetirada.length}</span>
              )}
            </button>
          </div>

          {/* Rotas date navigation bar */}
          {(activeTab === 'rotas' || activeTab === 'retirada') && (
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setRotasDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500">
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setRotasDate(new Date())}
                className={`flex-1 text-center text-xs py-0.5 rounded font-medium transition-colors ${isRotasHoje ? 'text-orange-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                <Calendar size={10} className="inline mr-1" />
                {isRotasHoje ? 'Hoje' : format(rotasDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </button>
              <button onClick={() => setRotasDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500">
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Novos Pedidos */}
          {activeTab === 'novos' && (
            filteredNovos.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {searchQuery ? 'Nenhum pedido encontrado para essa busca' : 'Nenhum pedido aguardando data de entrega'}
                </p>
                {!searchQuery && <p className="text-xs mt-1 opacity-70">Dados atualizados automaticamente a cada 90 s</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                      <th className="px-3 py-2 font-semibold">Ped.</th>
                      <th className="px-3 py-2 font-semibold">Valor</th>
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Recebido</th>
                      <th className="px-3 py-2 font-semibold w-28">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredNovos.map(p => (
                      <NovoPedidoRow key={p.id} pedido={p} onEdit={() => setEditPedidoId(p.id)} onIgnorar={() => ignorarPedido(p.id)} cobrancaAberto={cobrancaAberto} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Rotas */}
          {activeTab === 'rotas' && (
            sortedPedidosDia.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Package2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma entrega para {isRotasHoje ? 'hoje' : format(rotasDate, "dd/MM", { locale: ptBR })}</p>
                {isRotasHoje && <p className="text-xs mt-1 opacity-70">Defina a data de entrega nos pedidos aguardando</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                      <th className="px-3 py-2 font-semibold">Ped.</th>
                      <th className="px-3 py-2 font-semibold">Valor</th>
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Rota/Setor</th>
                      <th className="px-3 py-2 font-semibold w-28">Turno</th>
                      <th className="px-3 py-2 font-semibold w-32">Entregador</th>
                      <th className="px-3 py-2 font-semibold">Pgto</th>
                      <th className="px-3 py-2 font-semibold w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedPedidosDia.map(p => (
                      <RotaRow key={p.id} pedido={p}
                        onUpdate={patch => updatePedido(p.id, patch)}
                        onEdit={() => setEditPedidoId(p.id)}
                        cobrancaAberto={cobrancaAberto}
                        drivers={drivers}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Retirada / Balcão */}
          {activeTab === 'retirada' && (
            pedidosRetirada.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Package2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma retirada {isRotasHoje ? 'hoje' : `em ${format(rotasDate, "dd/MM", { locale: ptBR })}`}</p>
                <p className="text-xs mt-1 opacity-70">Pedidos com entregador = RETIRADA aparecem aqui</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-blue-50 dark:bg-blue-900/20 text-slate-500 dark:text-slate-400 text-left">
                      <th className="px-3 py-2 font-semibold">Ped.</th>
                      <th className="px-3 py-2 font-semibold">Valor</th>
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Turno</th>
                      <th className="px-3 py-2 font-semibold">Pgto</th>
                      <th className="px-3 py-2 font-semibold w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {pedidosRetirada.map(p => {
                      const nome = p.crm_client?.nome ?? p.cliente_nome ?? `#${p.id_venda}`
                      return (
                        <tr key={p.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-700 dark:text-slate-300">{pedNum(p)}</td>
                          <td className="px-3 py-2.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{fmtCurrency(p.valor)}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[200px]">{nome}</p>
                            {p.crm_client?.restricao && <p className="text-[10px] text-amber-600">{p.crm_client?.restricao}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{p.turno ?? '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{p.pgto?.join(' + ') ?? p.crm_client?.pgto ?? '—'}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setEditPedidoId(p.id)} title="Editar"
                              className="text-slate-400 hover:text-blue-500 transition-colors">
                              <Pencil size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Right — Rotina */}
        <div className="xl:col-span-2 card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-700 dark:text-slate-200 text-xs tracking-wide uppercase">
                📞 ROTINA DE {PT_DAY_LABELS[rotinaDate.getDay()]}
              </h2>
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {rotinaClientes.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setRotinaDate(d => subDays(d, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setRotinaDate(new Date())}
                className={`flex-1 text-center text-xs py-0.5 rounded font-medium transition-colors ${isRotinaHoje ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`}
              >
                <Calendar size={10} className="inline mr-1" />
                {isRotinaHoje ? 'Hoje' : format(rotinaDate, 'dd/MM (EEE)', { locale: ptBR })}
              </button>
              <button onClick={() => setRotinaDate(d => addDays(d, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {rotinaClientes.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              <CheckCircle2 size={24} className="mx-auto mb-1.5 opacity-30" />
              <p className="text-xs">Agenda livre {isRotinaHoje ? 'hoje' : 'neste dia'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[520px] overflow-y-auto">
              {rotinaClientes.map(c => {
                const log = rotinaLog.find(l => l.client_id === c.id)
                return (
                  <ContatoRow
                    key={c.id}
                    cliente={c}
                    feito={log?.feito ?? false}
                    onToggle={feito => toggleContato(c.id, feito)}
                    cobrancaAberto={cobrancaAberto}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowHistorico(h => !h)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <History size={15} className="text-slate-400" />
            Histórico de Pedidos
            {historico.length > 0 && (
              <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full">{historico.length}</span>
            )}
          </span>
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${showHistorico ? 'rotate-180' : ''}`} />
        </button>

        {showHistorico && (
          <>
            {/* Filtro ocorrência */}
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex items-center gap-2">
              <button
                onClick={() => setHistSoOcorrencia(v => !v)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                  histSoOcorrencia
                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                ⚠️ {histSoOcorrencia ? 'Somente com ocorrência' : 'Filtrar por ocorrência'}
              </button>
              {histSoOcorrencia && (
                <span className="text-xs text-slate-400">{filteredHistorico.length} resultado(s)</span>
              )}
            </div>
            {filteredHistorico.length === 0 ? (
              <div className="py-8 text-center text-slate-400 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs">{searchQuery || histSoOcorrencia ? 'Nenhum pedido encontrado para esse filtro' : 'Nenhum pedido com data de entrega definida'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
                <table className="w-full text-xs min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                      <th className="px-3 py-2 font-semibold">Entrega</th>
                      <th className="px-3 py-2 font-semibold">Ped.</th>
                      <th className="px-3 py-2 font-semibold">Cliente</th>
                      <th className="px-3 py-2 font-semibold">Rota</th>
                      <th className="px-3 py-2 font-semibold text-right">Valor</th>
                      <th className="px-3 py-2 font-semibold">Turno</th>
                      <th className="px-3 py-2 font-semibold">Entregador</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Ocorrência</th>
                      <th className="px-3 py-2 font-semibold w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredHistorico.map(p => {
                      const nome = p.crm_client?.nome ?? p.cliente_nome ?? `#${p.id_venda}`
                      const isHoje = p.data_entrega === todayStr
                      return (
                        <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${isHoje ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''} ${p.ocorrencia ? 'bg-amber-50/40 dark:bg-amber-900/5' : ''}`}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">
                            {isHoje ? (
                              <span className="text-orange-500 font-bold">Hoje</span>
                            ) : (
                              <span className="text-slate-600 dark:text-slate-400">{p.data_entrega ? format(new Date(p.data_entrega + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{pedNum(p)}</td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 truncate max-w-[140px]">{nome}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.crm_client?.rota ?? '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-green-600 dark:text-green-400">{fmtCurrency(p.valor)}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.turno ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.entregador ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.tipo === 'BONIFICACAO' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                              {p.tipo}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-amber-700 dark:text-amber-400 text-[10px] max-w-[180px] truncate" title={p.ocorrencia ?? ''}>
                            {p.ocorrencia ? `⚠️ ${p.ocorrencia}` : ''}
                          </td>
                          <td className="px-3 py-2">
                            <button onClick={() => setEditPedidoId(p.id)} title="Editar pedido"
                              className="text-slate-400 hover:text-orange-500 transition-colors">
                              <Pencil size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit pedido modal */}
      {editPedidoId !== null && pedidoParaEditar && (
        <EditPedidoModal
          pedido={pedidoParaEditar}
          onClose={() => setEditPedidoId(null)}
          onSave={patch => savePedidoEdit(editPedidoId, patch)}
          drivers={drivers}
        />
      )}
      {/* Direct-open modal from global search */}
      {directOpenPedido && (
        <EditPedidoModal
          pedido={directOpenPedido}
          onClose={() => setDirectOpenPedido(null)}
          onSave={patch => savePedidoEdit(directOpenPedido.id, patch).then(() => setDirectOpenPedido(null))}
          drivers={drivers}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function KPICard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: React.ReactNode
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span>{icon}</span>}
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function NovoPedidoRow({ pedido: p, onEdit, onIgnorar, cobrancaAberto }: {
  pedido: AtacadoPedido; onEdit: () => void; onIgnorar: () => void; cobrancaAberto: Map<string, number>
}) {
  const nome = p.crm_client?.nome ?? p.cliente_nome ?? `#${p.id_venda}`
  const divida = cobrancaAberto.get(nome.toUpperCase().trim()) ?? 0
  return (
    <tr className="hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors">
      <td className="px-3 py-2.5 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
        {pedNum(p)}
      </td>
      <td className="px-3 py-2.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
        {p.valor > 0 ? p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{nome}</p>
          {divida > 0 && (
            <span title={`Cobrança em aberto: ${fmtCurrency(divida)}`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 whitespace-nowrap shrink-0">
              ⚠ {fmtCurrency(divida)}
            </span>
          )}
        </div>
        {p.crm_client?.restricao && (
          <p className="text-[10px] text-amber-600 truncate">{p.crm_client?.restricao}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.tipo === 'BONIFICACAO' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
          {p.tipo}
        </span>
      </td>
      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {fmtCurrency(p.valor) && fmtRelative(p.atualizacao)}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors whitespace-nowrap"
          >
            <Calendar size={11} /> Definir data
          </button>
          <button
            onClick={onIgnorar}
            title="Ignorar pedido (retirada na fábrica, correção, etc.)"
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 transition-colors whitespace-nowrap"
          >
            <X size={11} /> Ignorar
          </button>
        </div>
      </td>
    </tr>
  )
}

function RotaRow({ pedido: p, onUpdate, onEdit, cobrancaAberto, drivers }: {
  pedido: AtacadoPedido
  onUpdate: (patch: Partial<AtacadoPedido>) => void
  onEdit: () => void
  cobrancaAberto: Map<string, number>
  drivers: string[]
}) {
  const nome = p.crm_client?.nome ?? p.cliente_nome ?? `#${p.id_venda}`
  const divida = cobrancaAberto.get(nome.toUpperCase().trim()) ?? 0
  const rota = p.crm_client?.rota ?? '—'
  const setor = p.crm_client?.setor
  const pgto = p.pgto?.join(' + ') ?? p.crm_client?.pgto ?? '—'

  // Local state prevents row from jumping while the user is still editing.
  // onUpdate is only called when focus leaves the row (onBlur).
  const [localTurno, setLocalTurno] = useState(p.turno ?? '')
  const [localEntregador, setLocalEntregador] = useState(p.entregador ?? '')
  const dirty = useRef(false)

  // Sync external changes (realtime, etc.) only when not in the middle of editing
  useEffect(() => {
    if (!dirty.current) {
      setLocalTurno(p.turno ?? '')
      setLocalEntregador(p.entregador ?? '')
    }
  }, [p.turno, p.entregador])

  function handleChange(field: 'turno' | 'entregador', value: string) {
    const newTurno      = field === 'turno'      ? value : localTurno
    const newEntregador = field === 'entregador' ? value : localEntregador
    if (field === 'turno') setLocalTurno(value)
    else setLocalEntregador(value)

    if (newTurno && newEntregador) {
      // Both defined → save and allow sort now
      dirty.current = false
      onUpdate({ turno: newTurno || null, entregador: newEntregador || null })
    } else {
      dirty.current = true
    }
  }

  function handleRowBlur(e: React.FocusEvent<HTMLTableRowElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    // Persist partial changes on blur so nothing is lost
    if (dirty.current) {
      onUpdate({ turno: localTurno || null, entregador: localEntregador || null })
      dirty.current = false
    }
  }

  const turnoDisplay = localTurno || p.crm_client?.turno || ''
  const turnoEhDoCliente = !localTurno && !!p.crm_client?.turno

  const turnoColor = turnoDisplay === 'MANHÃ'
    ? turnoEhDoCliente ? 'text-yellow-400/60 dark:text-yellow-500/60' : 'text-yellow-600 dark:text-yellow-400'
    : turnoDisplay === 'TARDE'
    ? turnoEhDoCliente ? 'text-orange-400/60' : 'text-orange-500'
    : turnoDisplay === 'NOITE'
    ? turnoEhDoCliente ? 'text-blue-400/60' : 'text-blue-500'
    : 'text-slate-400'

  return (
    <tr
      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      onBlur={handleRowBlur}
    >
      <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">{pedNum(p)}</td>
      <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{fmtCurrency(p.valor)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[150px]">{nome}</p>
          {divida > 0 && (
            <span title={`Cobrança em aberto: ${fmtCurrency(divida)}`}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 whitespace-nowrap shrink-0">
              ⚠ {fmtCurrency(divida)}
            </span>
          )}
        </div>
        {p.crm_client?.restricao && <p className="text-[10px] text-amber-600 truncate">{p.crm_client?.restricao}</p>}
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
        <p>{rota}</p>
        {setor && <p className="text-[10px] text-slate-400">{setor}</p>}
      </td>
      <td className="px-3 py-2">
        <select
          value={turnoDisplay}
          onChange={e => handleChange('turno', e.target.value)}
          title={turnoEhDoCliente ? 'Turno padrão do cliente (clique para fixar)' : undefined}
          className={`text-xs font-semibold bg-transparent border-0 outline-none cursor-pointer w-full ${turnoColor}`}
        >
          <option value="">— turno —</option>
          {TURNOS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={localEntregador}
          onChange={e => handleChange('entregador', e.target.value)}
          className="text-xs bg-transparent border-0 outline-none cursor-pointer text-slate-700 dark:text-slate-300 w-full"
        >
          <option value="">— entregador —</option>
          <option value="RETIRADA">🏭 RETIRADA</option>
          {drivers.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{pgto}</td>
      <td className="px-3 py-2">
        <button onClick={onEdit} title="Editar pedido"
          className="text-slate-400 hover:text-orange-500 transition-colors">
          <Pencil size={13} />
        </button>
      </td>
    </tr>
  )
}

function ContatoRow({ cliente: c, feito, onToggle, cobrancaAberto }: {
  cliente: Client; feito: boolean; onToggle: (feito: boolean) => void; cobrancaAberto: Map<string, number>
}) {
  const tel = c.telefone?.replace(/\D/g, '') ?? ''
  const waUrl = tel ? whatsappUrl(tel, MSG_PADRAO) : null
  const enviaMensagem = c.mensagem === 'SIM'
  const divida = cobrancaAberto.get(c.nome.toUpperCase().trim()) ?? 0

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 transition-colors ${feito ? 'bg-green-50 dark:bg-green-900/10' : divida > 0 ? 'bg-red-50/40 dark:bg-red-900/5 hover:bg-red-50/60 dark:hover:bg-red-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
      <button
        onClick={() => onToggle(!feito)}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${feito ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-green-400'}`}
      >
        {feito && <CheckCircle2 size={10} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {enviaMensagem && <Phone size={11} className="text-blue-500 shrink-0" />}
          <p className={`text-xs font-semibold truncate ${feito ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {c.nome}
          </p>
          {divida > 0 && (
            <span title={`Cobrança em aberto: ${fmtCurrency(divida)}`}
              className="text-[9px] font-bold px-1 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 whitespace-nowrap shrink-0">
              ⚠ {fmtCurrency(divida)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {c.rota && <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400">{c.rota}</span>}
          {c.restricao && <span className="text-[10px] text-amber-600 dark:text-amber-400">{c.restricao}</span>}
          {c.bonificacao && <span className="text-[10px] text-purple-500 dark:text-purple-400">🎁 {c.bonificacao}</span>}
        </div>
      </div>
      {waUrl && enviaMensagem && (
        <a
          href={waUrl} target="_blank" rel="noopener noreferrer"
          className="shrink-0 p-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 transition-colors"
          title={`WhatsApp: ${c.telefone}`}
          onClick={() => { if (!feito) onToggle(true) }}
        >
          <MessageCircle size={13} />
        </a>
      )}
    </div>
  )
}

const PGTO_OPTIONS = ['BOLETO', 'C. CRÉDITO', 'C. DÉBITO', 'DINHEIRO', 'LINK', 'PIX - CANTINA', 'PIX - LUCIANO', 'PRAZO 14 DIAS']

// ─── Edit Pedido Modal ────────────────────────────────────────
function EditPedidoModal({ pedido: p, onClose, onSave, drivers }: {
  pedido: AtacadoPedido
  onClose: () => void
  onSave: (patch: Partial<AtacadoPedido>) => void
  drivers: string[]
}) {
  const nome = p.crm_client?.nome ?? p.cliente_nome ?? `#${p.id_venda}`
  const turnoEfetivo = p.turno ?? p.crm_client?.turno ?? ''
  const pgtoCliente  = p.crm_client?.pgto ?? null

  const [date, setDate]             = useState(p.data_entrega ?? format(new Date(), 'yyyy-MM-dd'))
  const [turno, setTurno]           = useState(turnoEfetivo)
  const [entregador, setEntregador] = useState(p.entregador ?? '')
  const [veiculo, setVeiculo]       = useState(p.veiculo ?? '')
  const [observacoes, setObservacoes] = useState(p.observacoes ?? '')
  const [valor, setValor]           = useState(p.valor > 0 ? String(p.valor) : '')
  const [pgtoList, setPgtoList]     = useState<string[]>(p.pgto ?? (pgtoCliente ? [pgtoCliente] : []))
  const [saving, setSaving]         = useState(false)

  function togglePgto(opt: string) {
    setPgtoList(prev =>
      prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt]
    )
  }

  async function handleSave() {
    if (!date) return
    setSaving(true)
    const patch: Partial<AtacadoPedido> = {
      data_entrega: date,
      turno:        turno || null,
      entregador:   entregador || null,
      veiculo:      veiculo || null,
      observacoes:  observacoes || null,
      pgto:         pgtoList.length > 0 ? pgtoList : null,
    }
    const vStripped = valor.replace(/[^\d,.]/g, '')
    const vNorm = (vStripped.includes(',') && vStripped.includes('.'))
      ? vStripped.replace(/\./g, '').replace(',', '.')
      : vStripped.includes(',') ? vStripped.replace(',', '.') : vStripped
    const parsedValor = parseFloat(vNorm)
    if (!isNaN(parsedValor) && parsedValor > 0) patch.valor = parsedValor
    await onSave(patch)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-sm max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Editar pedido</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{pedNum(p)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2.5">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{nome}</p>
            <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{p.tipo}</span>
              {p.crm_client?.rota && <span className="text-orange-500">{p.crm_client.rota}</span>}
            </div>
          </div>

          {/* Data entrega */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Data de entrega</label>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
            <div className="flex gap-2 mt-2">
              {[0, 1, 2].map(d => {
                const dt = format(addDays(new Date(), d), 'yyyy-MM-dd')
                const label = d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : format(addDays(new Date(), d), 'EEE', { locale: ptBR })
                return (
                  <button key={d} onClick={() => setDate(dt)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${date === dt ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Turno */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Turno
              {!p.turno && p.crm_client?.turno && (
                <span className="ml-1.5 font-normal text-[10px] text-blue-500">(padrão do cliente)</span>
              )}
            </label>
            <select value={turno} onChange={e => setTurno(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="">— sem turno —</option>
              {TURNOS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Entregador */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Entregador</label>
            <select value={entregador} onChange={e => setEntregador(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400">
              <option value="">— sem entregador —</option>
              <option value="RETIRADA">🏭 RETIRADA / BALCÃO</option>
              {drivers.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {/* Veículo */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Veículo de entrega</label>
            <input
              type="text" placeholder="Ex: Van Branca, Carro 01, Bicicleta..."
              value={veiculo} onChange={e => setVeiculo(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Observações</label>
            <textarea
              placeholder="Notas específicas para este pedido..."
              value={observacoes} onChange={e => setObservacoes(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none min-h-[80px]"
            />
          </div>

          {/* Pgto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Forma de pagamento
              {pgtoCliente && (
                <span className="ml-1.5 font-normal text-[10px] text-blue-500">(padrão do cliente: {pgtoCliente})</span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PGTO_OPTIONS.map(opt => {
                const selected = pgtoList.includes(opt)
                const isDefault = opt === pgtoCliente
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => togglePgto(opt)}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all ${
                      selected
                        ? 'bg-orange-500 border-orange-500 text-white'
                        : isDefault
                        ? 'border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt}{isDefault && !selected ? ' ★' : ''}
                  </button>
                )
              })}
            </div>
            {pgtoList.length === 0 && pgtoCliente && (
              <p className="text-[10px] text-slate-400 mt-1">Nenhuma selecionada — usará padrão do cliente</p>
            )}
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Valor (R$) <span className="font-normal text-slate-400">— atual: {fmtCurrency(p.valor)}</span>
            </label>
            <input
              type="number" step="0.01" min="0"
              value={valor} onChange={e => setValor(e.target.value)}
              placeholder={String(p.valor)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!date || saving}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function IdsIgnoradosPanel() {
  const [ids, setIds]       = useState<number[]>([])
  const [input, setInput]   = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('atacado_config').select('value').eq('key', 'ids_ignorados').maybeSingle()
      .then(({ data }) => setIds(((data?.value ?? []) as unknown[]).map(Number).filter(Boolean)))
  }, [])

  async function persist(newIds: number[]) {
    setSaving(true)
    await supabase.from('atacado_config').upsert({ key: 'ids_ignorados', value: newIds, updated_at: new Date().toISOString() })
    setIds(newIds); setSaving(false)
  }

  function addId() {
    const n = parseInt(input.trim())
    if (!n || isNaN(n) || ids.includes(n)) { setInput(''); return }
    persist([...ids, n]); setInput('')
  }

  return (
    <div className="card p-4 space-y-2">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">IDs de clientes ignorados na importação</p>
      <div className="flex flex-wrap gap-1.5 min-h-[24px]">
        {ids.length === 0 && <p className="text-xs text-slate-400 italic">Nenhum ID configurado</p>}
        {ids.map(id => (
          <span key={id} className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded px-2 py-0.5 font-mono">
            {id}
            <button onClick={() => persist(ids.filter(i => i !== id))} disabled={saving} className="text-slate-400 hover:text-red-500 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 max-w-xs">
        <input
          type="number" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addId()} placeholder="ID do cliente"
          className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button onClick={addId} disabled={saving || !input.trim()}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
          <Plus size={12} /> Adicionar
        </button>
      </div>
    </div>
  )
}
