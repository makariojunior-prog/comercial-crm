import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  RefreshCw, ChevronLeft, ChevronRight, Calendar,
  Phone, CheckCircle2, Package2, AlertTriangle,
  Truck, MessageCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AtacadoPedido, AtacadoCliente, AtacadoContatoLog } from '../types'

// ─── Constants ────────────────────────────────────────────────
const PT_DAYS       = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
const PT_DAY_LABELS = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']
const TURNOS_LIST   = ['MANHÃ', 'TARDE', 'NOITE']
const ENTREGADORES  = ['THALES', 'DIOGO', 'PAULO', 'VINICIUS', 'JOSELITO', 'GABRIEL', 'HIOGO', 'ALEXANDER']
const MSG_PADRAO    = 'Bom dia! ☀️\n\nQual será o seu pedido de hoje? 🥖❄️\n\n_*Lumar Alimentos*_'

// ─── Helpers ──────────────────────────────────────────────────
function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dayRange(date: Date): [string, string] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end   = new Date(start.getTime() + 86400000)
  return [start.toISOString(), end.toISOString()]
}

function turnoScore(t: string | null): number {
  return t === 'MANHÃ' ? 1 : t === 'TARDE' ? 2 : t === 'NOITE' ? 3 : 4
}

function circularSort(pedidos: AtacadoPedido[]): AtacadoPedido[] {
  const h = new Date().getHours()
  const turnoAtual = h < 12 ? 1 : h < 18 ? 2 : 3
  return [...pedidos].sort((a, b) => {
    const sa = turnoScore(a.turno), sb = turnoScore(b.turno)
    const ca = sa >= turnoAtual ? sa - turnoAtual : sa + 3 - turnoAtual
    const cb = sb >= turnoAtual ? sb - turnoAtual : sb + 3 - turnoAtual
    if (ca !== cb) return ca - cb
    const ra = (a.cliente?.rota ?? '').toLowerCase()
    const rb = (b.cliente?.rota ?? '').toLowerCase()
    if (ra !== rb) return ra.localeCompare(rb, 'pt-BR')
    return (a.entregador ?? '').localeCompare(b.entregador ?? '', 'pt-BR')
  })
}

function whatsappUrl(telefone: string, msg: string) {
  const num = telefone.replace(/\D/g, '')
  const full = num.startsWith('55') ? num : `55${num}`
  return `https://wa.me/${full}?text=${encodeURIComponent(msg)}`
}

// ─── Main Page ────────────────────────────────────────────────
export default function DashboardAtacado() {
  const [pedidos, setPedidos]           = useState<AtacadoPedido[]>([])
  const [pedidosOntem, setPedidosOntem] = useState<AtacadoPedido[]>([])
  const [clientes, setClientes]         = useState<AtacadoCliente[]>([])
  const [contatosLog, setContatosLog]   = useState<AtacadoContatoLog[]>([])
  const [posVendaLog, setPosVendaLog]   = useState<AtacadoContatoLog[]>([])
  const [rotinaDate, setRotinaDate]     = useState(new Date())
  const [loading, setLoading]           = useState(true)

  // KPIs
  const semEntregador = useMemo(() => pedidos.filter(p => !p.entregador).length, [pedidos])
  const totalValor    = useMemo(() => pedidos.reduce((s, p) => s + p.valor, 0), [pedidos])
  const porTurno      = useMemo(() => ({
    MANHÃ:   pedidos.filter(p => p.turno === 'MANHÃ').length,
    TARDE:   pedidos.filter(p => p.turno === 'TARDE').length,
    NOITE:   pedidos.filter(p => p.turno === 'NOITE').length,
    sem:     pedidos.filter(p => !p.turno).length,
  }), [pedidos])

  const sortedPedidos = useMemo(() => circularSort(pedidos), [pedidos])

  // ─── Loaders ──────────────────────────────────────────────
  const loadPedidos = useCallback(async () => {
    const [start, end] = dayRange(new Date())
    const { data } = await supabase
      .from('atacado_pedidos')
      .select('*, cliente:atacado_clientes(id,cliente,telefone,rota,setor,pgto_padrao,restricao,observacoes)')
      .gte('atualizacao', start)
      .lt('atualizacao', end)
      .neq('tipo', 'CANCELADO')
      .order('atualizacao')
    setPedidos((data ?? []) as AtacadoPedido[])
  }, [])

  const loadRotina = useCallback(async (date: Date) => {
    const nomeDia = PT_DAYS[date.getDay()]
    const dateStr = format(date, 'yyyy-MM-dd')
    const [{ data: cls }, { data: logs }] = await Promise.all([
      supabase
        .from('atacado_clientes')
        .select('*')
        .eq('status', 'MENSAL')
        .contains('dias_entrega', [nomeDia]),
      supabase
        .from('atacado_contatos_log')
        .select('*')
        .eq('data_contato', dateStr)
        .eq('tipo', 'recompra'),
    ])
    const sorted = ((cls ?? []) as AtacadoCliente[]).sort((a, b) => {
      if (a.enviar_mensagem !== b.enviar_mensagem) return a.enviar_mensagem ? -1 : 1
      return (a.rota ?? '').localeCompare(b.rota ?? '', 'pt-BR')
    })
    setClientes(sorted)
    setContatosLog((logs ?? []) as AtacadoContatoLog[])
  }, [])

  const loadPosVenda = useCallback(async () => {
    const ontem = subDays(new Date(), 1)
    const [start, end] = dayRange(ontem)
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const [{ data: peds }, { data: logs }] = await Promise.all([
      supabase
        .from('atacado_pedidos')
        .select('*, cliente:atacado_clientes(id,cliente,telefone,rota)')
        .gte('atualizacao', start)
        .lt('atualizacao', end)
        .neq('tipo', 'CANCELADO'),
      supabase
        .from('atacado_contatos_log')
        .select('*')
        .eq('data_contato', hoje)
        .eq('tipo', 'pos_venda'),
    ])
    setPedidosOntem((peds ?? []) as AtacadoPedido[])
    setPosVendaLog((logs ?? []) as AtacadoContatoLog[])
  }, [])

  async function load() {
    setLoading(true)
    await Promise.all([loadPedidos(), loadRotina(rotinaDate), loadPosVenda()])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadRotina(rotinaDate) }, [rotinaDate])

  // Realtime: novos pedidos chegando do ERP
  useEffect(() => {
    const ch = supabase.channel('atacado-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atacado_pedidos' }, () => loadPedidos())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'atacado_pedidos' }, () => loadPedidos())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadPedidos])

  // ─── Mutations ────────────────────────────────────────────
  async function updatePedido(id: number, patch: Partial<AtacadoPedido>) {
    await supabase.from('atacado_pedidos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }

  async function toggleContato(clienteId: number, feito: boolean) {
    const dateStr = format(rotinaDate, 'yyyy-MM-dd')
    const { data } = await supabase
      .from('atacado_contatos_log')
      .upsert({
        cliente_id: clienteId, data_contato: dateStr, tipo: 'recompra',
        feito, feito_em: feito ? new Date().toISOString() : null,
      }, { onConflict: 'cliente_id,data_contato,tipo' })
      .select().maybeSingle()
    if (data) setContatosLog(prev => {
      const idx = prev.findIndex(l => l.cliente_id === clienteId)
      return idx >= 0 ? prev.map((l, i) => i === idx ? data as AtacadoContatoLog : l) : [...prev, data as AtacadoContatoLog]
    })
  }

  async function marcarPosVenda(clienteId: number) {
    const hoje = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('atacado_contatos_log')
      .upsert({
        cliente_id: clienteId, data_contato: hoje, tipo: 'pos_venda',
        feito: true, feito_em: new Date().toISOString(),
      }, { onConflict: 'cliente_id,data_contato,tipo' })
      .select().maybeSingle()
    if (data) setPosVendaLog(prev => {
      const idx = prev.findIndex(l => l.cliente_id === clienteId)
      return idx >= 0 ? prev.map((l, i) => i === idx ? data as AtacadoContatoLog : l) : [...prev, data as AtacadoContatoLog]
    })
  }

  const rotinaTitle = `ROTINA DE ${PT_DAY_LABELS[rotinaDate.getDay()]}`
  const isRotinaHoje = format(rotinaDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Package2 size={22} className="text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard Atacado</h1>
            <p className="text-xs text-slate-400 capitalize">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <button onClick={load} className="btn-ghost p-2" title="Recarregar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Pedidos hoje" value={pedidos.length} icon={<Package2 size={16} />} />
        <KPICard label="Valor total" value={fmtCurrency(totalValor)} color="text-green-600 dark:text-green-400" icon={<span className="text-xs font-bold text-green-600">R$</span>} />
        <KPICard
          label="Sem entregador"
          value={semEntregador}
          color={semEntregador > 0 ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}
          icon={semEntregador > 0 ? <AlertTriangle size={16} className="text-red-500" /> : <Truck size={16} />}
        />
        <KPICard
          label="Por turno"
          value={`${porTurno.MANHÃ}M · ${porTurno.TARDE}T · ${porTurno.NOITE}N`}
          sub={porTurno.sem > 0 ? `${porTurno.sem} sem turno` : undefined}
          icon={<span className="text-xs">🌅</span>}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

        {/* Rotas do Dia */}
        <div className="xl:col-span-3 card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm flex items-center gap-2">
              <Truck size={15} className="text-orange-500" />
              Pedidos de Hoje
              <span className="ml-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pedidos.length}
              </span>
            </h2>
          </div>

          {pedidos.length === 0 && !loading ? (
            <div className="py-10 text-center text-slate-400">
              <Package2 size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum pedido registrado hoje</p>
              <p className="text-xs mt-1">Os pedidos chegam automaticamente do ERP</p>
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
                  {sortedPedidos.map(p => (
                    <RotaRow key={p.id} pedido={p} onUpdate={patch => updatePedido(p.id, patch)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rotina + Pós-venda */}
        <div className="xl:col-span-2 space-y-4">

          {/* Rotina de Contatos */}
          <div className="card overflow-hidden">
            {/* Header com navegação de data */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-700 dark:text-slate-200 text-xs tracking-wide uppercase">
                  📞 {rotinaTitle}
                </h2>
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {clientes.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRotinaDate(d => subDays(d, 1))}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setRotinaDate(new Date())}
                  className={`flex-1 text-center text-xs py-0.5 rounded font-medium transition-colors ${
                    isRotinaHoje
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  <Calendar size={10} className="inline mr-1" />
                  {isRotinaHoje ? 'Hoje' : format(rotinaDate, "dd/MM (EEE)", { locale: ptBR })}
                </button>
                <button
                  onClick={() => setRotinaDate(d => addDays(d, 1))}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {clientes.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <CheckCircle2 size={24} className="mx-auto mb-1.5 opacity-30" />
                <p className="text-xs">✅ Agenda livre {isRotinaHoje ? 'hoje' : 'neste dia'}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[480px] overflow-y-auto">
                {clientes.map(c => {
                  const log = contatosLog.find(l => l.cliente_id === c.id)
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

          {/* Pós-venda de Ontem */}
          <PosVendaWidget
            pedidos={pedidosOntem}
            logs={posVendaLog}
            onMarcar={marcarPosVenda}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function KPICard({ label, value, sub, color, icon }: {
  label: string
  value: string | number
  sub?: string
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-slate-400">{icon}</span>}
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function RotaRow({ pedido: p, onUpdate }: { pedido: AtacadoPedido; onUpdate: (patch: Partial<AtacadoPedido>) => void }) {
  const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`
  const rota = p.cliente?.rota ?? '—'
  const setor = p.cliente?.setor
  const pgto = p.cliente?.pgto_padrao ?? '—'

  const turnoColor = p.turno === 'MANHÃ'
    ? 'text-yellow-600 dark:text-yellow-400'
    : p.turno === 'TARDE'
    ? 'text-orange-500'
    : p.turno === 'NOITE'
    ? 'text-blue-500'
    : 'text-slate-400'

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300">
        {p.numero_pedido ?? '—'}
      </td>
      <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
        {fmtCurrency(p.valor)}
      </td>
      <td className="px-3 py-2">
        <p className="font-medium text-slate-800 dark:text-slate-100 leading-tight truncate max-w-[180px]">{nome}</p>
        {p.cliente?.restricao && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate">{p.cliente.restricao}</p>
        )}
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
        <p>{rota}</p>
        {setor && <p className="text-[10px] text-slate-400">{setor}</p>}
      </td>
      <td className="px-3 py-2">
        <select
          value={p.turno ?? ''}
          onChange={e => onUpdate({ turno: e.target.value || null })}
          className={`text-xs font-semibold bg-transparent border-0 outline-none cursor-pointer ${turnoColor} w-full`}
        >
          <option value="">— turno —</option>
          {TURNOS_LIST.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={p.entregador ?? ''}
          onChange={e => onUpdate({ entregador: e.target.value || null })}
          className="text-xs bg-transparent border-0 outline-none cursor-pointer text-slate-700 dark:text-slate-300 w-full"
        >
          <option value="">— entregador —</option>
          {ENTREGADORES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{pgto}</td>
    </tr>
  )
}

function ContatoRow({ cliente: c, feito, onToggle }: {
  cliente: AtacadoCliente
  feito: boolean
  onToggle: (feito: boolean) => void
}) {
  const tel = c.telefone?.replace(/\D/g, '') ?? ''
  const waUrl = tel ? whatsappUrl(tel, MSG_PADRAO) : null

  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 transition-colors ${feito ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
      <button
        onClick={() => onToggle(!feito)}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          feito ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-green-400'
        }`}
      >
        {feito && <CheckCircle2 size={10} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {c.enviar_mensagem && (
            <span className="text-blue-500 dark:text-blue-400" title="Enviar mensagem">
              <Phone size={11} />
            </span>
          )}
          <p className={`text-xs font-semibold truncate ${feito ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {c.cliente}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {c.rota && (
            <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400">{c.rota}</span>
          )}
          {c.restricao && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">{c.restricao}</span>
          )}
          {c.bonificacao && (
            <span className="text-[10px] text-purple-500 dark:text-purple-400">🎁 {c.bonificacao}</span>
          )}
        </div>
      </div>

      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
          title={`WhatsApp: ${c.telefone}`}
          onClick={() => { if (!feito) onToggle(true) }}
        >
          <MessageCircle size={13} />
        </a>
      )}
    </div>
  )
}

function PosVendaWidget({ pedidos, logs, onMarcar }: {
  pedidos: AtacadoPedido[]
  logs: AtacadoContatoLog[]
  onMarcar: (clienteId: number) => void
}) {
  const pendentes = pedidos.filter(p => {
    const cid = p.cliente_id ?? p.cliente?.id
    return cid && !logs.find(l => l.cliente_id === cid && l.feito)
  })

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-xs tracking-wide uppercase">
          📦 Pós-venda de Ontem
        </h2>
        <div className="flex items-center gap-1.5">
          {pendentes.length > 0 && (
            <span className="bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {pedidos.length}
          </span>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <div className="py-6 text-center text-slate-400">
          <p className="text-xs">Nenhuma entrega ontem</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[320px] overflow-y-auto">
          {pedidos.map(p => {
            const cid = p.cliente_id ?? p.cliente?.id
            const log = cid ? logs.find(l => l.cliente_id === cid && l.feito) : null
            const nome = p.cliente?.cliente ?? p.cliente_nome ?? `#${p.id_venda}`
            const tel = p.cliente?.telefone?.replace(/\D/g, '') ?? ''
            const waUrl = tel ? whatsappUrl(tel, `Bom dia! 😊 Tudo certo com a entrega de ontem, ${p.cliente?.cliente?.split(' ')[0] ?? ''}?`) : null

            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2.5 ${log ? 'bg-green-50 dark:bg-green-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'} transition-colors`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${log ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                    {nome}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">{fmtCurrency(p.valor)}</span>
                    {p.cliente?.rota && (
                      <span className="text-[10px] text-slate-400">{p.cliente.rota}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {waUrl && !log && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 transition-colors"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle size={13} />
                    </a>
                  )}
                  {!log && cid ? (
                    <button
                      onClick={() => onMarcar(cid)}
                      className="text-[10px] text-slate-500 hover:text-green-600 font-medium px-1.5 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    >
                      ✓ feito
                    </button>
                  ) : log ? (
                    <span className="text-[10px] text-green-500">✓</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
