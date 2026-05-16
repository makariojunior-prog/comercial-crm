import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  RefreshCw, ChevronLeft, ChevronRight, Calendar,
  Phone, CheckCircle2, Package2, AlertTriangle,
  Truck, MessageCircle, Settings, Download, X, Plus,
  Clock, History, ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AtacadoPedido, Client } from '../types'

// ─── Constants ────────────────────────────────────────────────
const PT_DAYS       = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
const PT_DAY_LABELS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']
const TURNOS_LIST   = ['MANHÃ', 'TARDE', 'NOITE']
const ENTREGADORES  = ['THALES', 'DIOGO', 'PAULO', 'VINICIUS', 'JOSELITO', 'GABRIEL', 'HIOGO', 'ALEXANDER']
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
    return (a.cliente?.rota ?? '').localeCompare(b.cliente?.rota ?? '', 'pt-BR')
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
  return `há ${diff} d`
}

// ─── Main Component ───────────────────────────────────────────
export default function DashboardAtacado() {
  const [activeTab, setActiveTab]       = useState<'novos' | 'rotas'>('novos')
  const [pedidosNovos, setPedidosNovos] = useState<AtacadoPedido[]>([])
  const [pedidosDia, setPedidosDia]     = useState<AtacadoPedido[]>([])
  const [historico, setHistorico]       = useState<AtacadoPedido[]>([])
  const [rotinaClientes, setRotinaClientes] = useState<Client[]>([])
  const [rotinaLog, setRotinaLog]       = useState<RotinaLog[]>([])
  const [rotinaDate, setRotinaDate]     = useState(new Date())
  const [loading, setLoading]           = useState(true)
  const [showHistorico, setShowHistorico] = useState(false)
  const [setDateId, setSetDateId]       = useState<number | null>(null)
  const [syncing, setSyncing]           = useState<string | null>(null)
  const [syncMsg, setSyncMsg]           = useState<string | null>(null)
  const [showConfig, setShowConfig]     = useState(false)

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const sortedPedidosDia  = useMemo(() => circularSort(pedidosDia), [pedidosDia])
  const kpiSemEntregador  = useMemo(() => pedidosDia.filter(p => !p.entregador).length, [pedidosDia])
  const kpiValor          = useMemo(() => pedidosDia.reduce((s, p) => s + p.valor, 0), [pedidosDia])
  const isRotinaHoje      = format(rotinaDate, 'yyyy-MM-dd') === todayStr

  // ─── Loaders ────────────────────────────────────────────
  const JOIN = '*, cliente:atacado_clientes(id,cliente,telefone,rota,setor,pgto_padrao,restricao,observacoes)'

  const loadNovos = useCallback(async () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await supabase
      .from('atacado_pedidos')
      .select(JOIN)
      .is('data_entrega', null)
      .gte('atualizacao', cutoff)
      .neq('tipo', 'CANCELADO')
      .order('atualizacao', { ascending: false })
    setPedidosNovos((data ?? []) as AtacadoPedido[])
  }, [])

  const loadRotas = useCallback(async () => {
    const { data } = await supabase
      .from('atacado_pedidos')
      .select(JOIN)
      .eq('data_entrega', todayStr)
      .neq('tipo', 'CANCELADO')
      .order('atualizacao')
    setPedidosDia((data ?? []) as AtacadoPedido[])
  }, [todayStr])

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
      .select('*, cliente:atacado_clientes(id,cliente,rota)')
      .not('data_entrega', 'is', null)
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
  useEffect(() => { loadRotina(rotinaDate) }, [rotinaDate, loadRotina])
  useEffect(() => { if (showHistorico) loadHistorico() }, [showHistorico, loadHistorico])

  // Auto-refresh every 90 s when page is open
  useEffect(() => {
    const id = setInterval(() => { loadNovos(); loadRotas() }, 90000)
    return () => clearInterval(id)
  }, [loadNovos, loadRotas])

  // Realtime: any change to atacado_pedidos
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

  async function confirmarDataEntrega(id: number, date: string) {
    await supabase.from('atacado_pedidos').update({ data_entrega: date, updated_at: new Date().toISOString() }).eq('id', id)
    setPedidosNovos(prev => prev.filter(p => p.id !== id))
    if (date === todayStr) { await loadRotas(); setActiveTab('rotas') }
    if (showHistorico) await loadHistorico()
    setSetDateId(null)
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
        setSyncMsg(`✓ ${data.upserted} pedidos importados (${data.skipped} ignorados) — colunas detectadas: ${cols}`)
        await loadNovos()
      } else {
        setSyncMsg(`✓ ${data.updated} atualizados (${data.skipped} ignorados)`)
        await loadRotas()
      }
    } catch (e: unknown) {
      setSyncMsg(`Erro: ${e instanceof Error ? e.message : 'desconhecido'}`)
    } finally { setSyncing(null) }
  }

  const pedidoParaData = pedidosNovos.find(p => p.id === setDateId) ?? null

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
              <Clock size={13} /> Novos Pedidos
              {pedidosNovos.length > 0 && (
                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pedidosNovos.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('rotas')}
              className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'rotas' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-b-2 border-orange-500' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <Truck size={13} /> Rotas de Hoje
              {kpiSemEntregador > 0 && (
                <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{kpiSemEntregador}!</span>
              )}
            </button>
          </div>

          {/* Novos Pedidos */}
          {activeTab === 'novos' && (
            pedidosNovos.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum pedido aguardando data de entrega</p>
                <p className="text-xs mt-1 opacity-70">Dados atualizados automaticamente a cada 90 s</p>
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
                    {pedidosNovos.map(p => (
                      <NovoPedidoRow key={p.id} pedido={p} onSetDate={() => setSetDateId(p.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Rotas de Hoje */}
          {activeTab === 'rotas' && (
            pedidosDia.length === 0 ? (
              <div className="py-10 text-center text-slate-400">
                <Package2 size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma entrega definida para hoje</p>
                <p className="text-xs mt-1 opacity-70">Defina a data de entrega nos pedidos aguardando</p>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {sortedPedidosDia.map(p => (
                      <RotaRow key={p.id} pedido={p} onUpdate={patch => updatePedido(p.id, patch)} />
                    ))}
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
          historico.length === 0 ? (
            <div className="py-8 text-center text-slate-400 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs">Nenhum pedido com data de entrega definida</p>
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-700">
              <table className="w-full text-xs min-w-[640px]">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {historico.map(p => {
                    const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`
                    const isHoje = p.data_entrega === todayStr
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${isHoje ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">
                          {isHoje ? (
                            <span className="text-orange-500 font-bold">Hoje</span>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400">{p.data_entrega ? format(new Date(p.data_entrega + 'T12:00:00'), 'dd/MM', { locale: ptBR }) : '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{p.numero_pedido ?? '—'}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{nome}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.cliente?.rota ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-green-600 dark:text-green-400">{fmtCurrency(p.valor)}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.turno ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.entregador ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.tipo === 'BONIFICACAO' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                            {p.tipo}
                          </span>
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

      {/* Set data entrega modal */}
      {setDateId !== null && pedidoParaData && (
        <SetDataEntregaModal
          pedido={pedidoParaData}
          onClose={() => setSetDateId(null)}
          onSave={date => confirmarDataEntrega(setDateId, date)}
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

function NovoPedidoRow({ pedido: p, onSetDate }: { pedido: AtacadoPedido; onSetDate: () => void }) {
  const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`
  return (
    <tr className="hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors">
      <td className="px-3 py-2.5 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
        {p.numero_pedido ?? `#${p.id_venda}`}
      </td>
      <td className="px-3 py-2.5 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
        {fmtCurrency(p.valor)}
      </td>
      <td className="px-3 py-2.5">
        <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[180px]">{nome}</p>
        {p.cliente?.restricao && (
          <p className="text-[10px] text-amber-600 truncate">{p.cliente.restricao}</p>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.tipo === 'BONIFICACAO' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
          {p.tipo}
        </span>
      </td>
      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {fmtRelative(p.atualizacao)}
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={onSetDate}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors whitespace-nowrap"
        >
          <Calendar size={11} /> Definir data
        </button>
      </td>
    </tr>
  )
}

function RotaRow({ pedido: p, onUpdate }: { pedido: AtacadoPedido; onUpdate: (patch: Partial<AtacadoPedido>) => void }) {
  const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`
  const rota = p.cliente?.rota ?? '—'
  const setor = p.cliente?.setor
  const pgto = p.cliente?.pgto_padrao ?? '—'

  const turnoColor = p.turno === 'MANHÃ'
    ? 'text-yellow-600 dark:text-yellow-400'
    : p.turno === 'TARDE' ? 'text-orange-500'
    : p.turno === 'NOITE' ? 'text-blue-500'
    : 'text-slate-400'

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">{p.numero_pedido ?? '—'}</td>
      <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{fmtCurrency(p.valor)}</td>
      <td className="px-3 py-2">
        <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[180px]">{nome}</p>
        {p.cliente?.restricao && <p className="text-[10px] text-amber-600 truncate">{p.cliente.restricao}</p>}
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
        <p>{rota}</p>
        {setor && <p className="text-[10px] text-slate-400">{setor}</p>}
      </td>
      <td className="px-3 py-2">
        <select value={p.turno ?? ''} onChange={e => onUpdate({ turno: e.target.value || null })}
          className={`text-xs font-semibold bg-transparent border-0 outline-none cursor-pointer ${turnoColor} w-full`}>
          <option value="">— turno —</option>
          {TURNOS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={p.entregador ?? ''} onChange={e => onUpdate({ entregador: e.target.value || null })}
          className="text-xs bg-transparent border-0 outline-none cursor-pointer text-slate-700 dark:text-slate-300 w-full">
          <option value="">— entregador —</option>
          {ENTREGADORES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{pgto}</td>
    </tr>
  )
}

function ContatoRow({ cliente: c, feito, onToggle }: {
  cliente: Client; feito: boolean; onToggle: (feito: boolean) => void
}) {
  const tel = c.telefone?.replace(/\D/g, '') ?? ''
  const waUrl = tel ? whatsappUrl(tel, MSG_PADRAO) : null
  const enviaMensagem = c.mensagem === 'SIM'

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 transition-colors ${feito ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
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

function SetDataEntregaModal({ pedido: p, onClose, onSave }: {
  pedido: AtacadoPedido; onClose: () => void; onSave: (date: string) => void
}) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Definir data de entrega</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2.5 space-y-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{nome}</p>
            <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Ped. {p.numero_pedido ?? `#${p.id_venda}`}</span>
              <span className="font-medium text-green-600 dark:text-green-400">{fmtCurrency(p.valor)}</span>
              <span>{p.tipo}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Data de entrega</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="flex gap-2 pt-1">
            {/* Quick picks */}
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
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
          <button onClick={() => onSave(date)} disabled={!date}
            className="flex-1 py-2 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors">
            Confirmar entrega
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
