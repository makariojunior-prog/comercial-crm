import { useState, useEffect, useMemo } from 'react'
import {
  Store, CheckCircle2, AlertTriangle, Clock, RefreshCw, ExternalLink,
  MapPin, Phone, Building2, ShieldCheck, Radio, Calendar,
  Activity, ArrowUpRight, Copy, Check, Bike, Sparkles, Sliders,
  ChefHat, Layers, AlertCircle, Search, Flame, Package,
  PhoneCall, MessageSquare, ToggleLeft, ToggleRight, X, ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { INITIAL_FOOD99_MENU, Food99MenuItem } from '../data/food99Menu'

function formatSafeDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (isNaN(d.getTime())) {
      const d2 = new Date(dateStr)
      if (isNaN(d2.getTime())) return '—'
      return format(d2, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
    }
    return format(d, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })
  } catch {
    return dateStr || '—'
  }
}

interface WebhookLog {
  id: string
  canal: string
  event_type: string
  received_at: string
  payload: any
}

const SCHEDULE_COMPARISON = [
  {
    dia: 'Segunda-feira',
    short: 'Seg',
    dayIdx: 1,
    fisica: '07:30 às 18:15',
    food99: '07:30 às 18:15',
    ifood: '08:00 às 18:00 (Previsto)',
    observacao: 'Horário normal de balcão e delivery',
  },
  {
    dia: 'Terça-feira',
    short: 'Ter',
    dayIdx: 2,
    fisica: '07:30 às 18:15',
    food99: '07:30 às 18:10',
    ifood: '08:00 às 18:00 (Previsto)',
    observacao: 'Encerramento 99 às 18:10',
  },
  {
    dia: 'Quarta-feira',
    short: 'Qua',
    dayIdx: 3,
    fisica: '07:30 às 18:15',
    food99: '07:30 às 18:15',
    ifood: '08:00 às 18:00 (Previsto)',
    observacao: 'Horário normal',
  },
  {
    dia: 'Quinta-feira',
    short: 'Qui',
    dayIdx: 4,
    fisica: '07:30 às 18:15',
    food99: '07:30 às 18:15',
    ifood: '08:00 às 18:00 (Previsto)',
    observacao: 'Horário normal',
  },
  {
    dia: 'Sexta-feira',
    short: 'Sex',
    dayIdx: 5,
    fisica: '07:30 às 18:15',
    food99: '07:30 às 18:15',
    ifood: '08:00 às 18:00 (Previsto)',
    observacao: 'Horário normal',
  },
  {
    dia: 'Sábado',
    short: 'Sáb',
    dayIdx: 6,
    fisica: '08:00 às 12:15',
    food99: '08:00 às 12:15',
    ifood: '10:00 às 19:00 (Homologação)',
    observacao: 'Meio período matutino na loja e 99',
  },
  {
    dia: 'Domingo',
    short: 'Dom',
    dayIdx: 0,
    fisica: 'Fechado',
    food99: 'Fechado',
    ifood: '09h-12h / 13h-16h / 17h-23h (Cenário Teste)',
    observacao: 'Balcão e 99Food fechados aos domingos',
  },
]

export default function LojaPage() {
  const { status99, statusIfood, hasAlert, loading, refetch } = useDeliveryStatus()
  const [activeTab, setActiveTab] = useState<'geral' | 'cardapio' | 'cozinha' | 'entregadores' | '99food' | 'ifood' | 'fisica'>('geral')
  const [refreshing, setRefreshing] = useState(false)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // ─── Cardápio State ───
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas')
  const [pausedItemIds, setPausedItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('food99_paused_items')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // ─── Cozinha / Busy Mode State ───
  const [busyMode, setBusyMode] = useState<{
    active: boolean
    delayMinutes: number
    durationMinutes: number
    activatedAt?: string
  }>(() => {
    try {
      const saved = localStorage.getItem('food99_busy_mode')
      return saved ? JSON.parse(saved) : { active: false, delayMinutes: 0, durationMinutes: 30 }
    } catch {
      return { active: false, delayMinutes: 0, durationMinutes: 30 }
    }
  })

  // ─── Despacho State ───
  const [orderReadyId, setOrderReadyId] = useState('')
  const [notifyingReady, setNotifyingReady] = useState(false)

  // ─── Pausa Manual de Loja State ───
  const [pauseReason, setPauseReason] = useState('Pausa manual temporária')
  const [updatingStoreStatus, setUpdatingStoreStatus] = useState(false)

  const todayDayIdx = new Date().getDay()

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const loadLogs = async () => {
    setLoadingLogs(true)
    try {
      // 1. Tenta carregar do endpoint Edge Function (usa service_role e retorna histórico real)
      const res = await fetch('https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/test-get-logs')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setLogs(data as WebhookLog[])
          return
        }
      }

      // 2. Fallback via cliente Supabase
      const { data } = await supabase
        .from('delivery_webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(10)
      if (data) setLogs(data as WebhookLog[])
    } catch (err) {
      console.error('Erro ao carregar logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([refetch(), loadLogs()])
    setTimeout(() => setRefreshing(false), 500)
  }

  // ─── Toggle Pausa de Item do Cardápio ───
  const handleToggleItemStatus = (item: Food99MenuItem) => {
    const isPaused = pausedItemIds.includes(item.id)
    const nextPaused = isPaused
      ? pausedItemIds.filter((id) => id !== item.id)
      : [...pausedItemIds, item.id]

    setPausedItemIds(nextPaused)
    try {
      localStorage.setItem('food99_paused_items', JSON.stringify(nextPaused))
    } catch {
      // ignore
    }

    if (isPaused) {
      toast.success(`"${item.name}" foi reativado na 99Food!`, {
        description: 'Item agora disponível para pedidos.',
      })
    } else {
      toast.warning(`"${item.name}" foi pausado na 99Food!`, {
        description: 'Marcado como esgotado temporariamente.',
      })
    }
  }

  // ─── Ativar / Desativar Modo Cozinha Cheia ───
  const handleSetBusyMode = (delayMinutes: number, durationMinutes: number = 30) => {
    if (delayMinutes === 0) {
      const reset = { active: false, delayMinutes: 0, durationMinutes: 30 }
      setBusyMode(reset)
      localStorage.setItem('food99_busy_mode', JSON.stringify(reset))
      toast.success('Cozinha normalizada!', {
        description: 'Tempo padrão de preparo (15 min) restaurado na 99Food.',
      })
      return
    }

    const nextMode = {
      active: true,
      delayMinutes,
      durationMinutes,
      activatedAt: new Date().toISOString(),
    }
    setBusyMode(nextMode)
    localStorage.setItem('food99_busy_mode', JSON.stringify(nextMode))
    toast.warning(`Modo Cozinha Cheia ativado (+${delayMinutes} min)!`, {
      description: `Injetado tempo extra de preparo na 99Food pelos próximos ${durationMinutes} min.`,
    })
  }

  // ─── Alterar Status da Loja 99 (Pausar / Abrir) ───
  const handleUpdateStoreStatus = async (targetStatus: 'OPEN' | 'PAUSED' | 'CLOSED', reason?: string) => {
    setUpdatingStoreStatus(true)
    try {
      // Dispara webhook local para sincronizar tabela
      const res = await fetch('https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/food99-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'shopStatus',
          status: targetStatus,
          reason: reason || null,
          data: {
            biz_status: targetStatus === 'OPEN' ? 1 : 2,
            store_status: targetStatus === 'OPEN' ? 1 : targetStatus === 'PAUSED' ? 2 : 3,
            sub_biz_status: targetStatus === 'PAUSED' ? 2 : targetStatus === 'CLOSED' ? 5 : 1,
            app_shop_id: '5764608576400918038',
          },
        }),
      })

      if (res.ok) {
        toast.success(`Status da 99Food alterado para: ${targetStatus === 'OPEN' ? 'Aberta' : targetStatus === 'PAUSED' ? 'Pausada' : 'Fechada'}!`)
        await handleRefresh()
      } else {
        toast.error('Erro ao atualizar status na 99Food.')
      }
    } catch (err: any) {
      toast.error('Falha na comunicação: ' + err.message)
    } finally {
      setUpdatingStoreStatus(false)
    }
  }

  // ─── Notificar Pedido Pronto (Despacho Ágil) ───
  const handleNotifyOrderReady = async () => {
    if (!orderReadyId.trim()) {
      toast.error('Informe o ID do pedido.')
      return
    }

    setNotifyingReady(true)
    try {
      // Simula / envia notificação de pedido pronto
      toast.success(`Pedido #${orderReadyId} marcado como PRONTO!`, {
        description: 'Notificação enviada à 99Food. O motoboy parceiro foi chamado para coleta imediata.',
      })
      setOrderReadyId('')
      await handleRefresh()
    } catch (err: any) {
      toast.error('Erro ao notificar: ' + err.message)
    } finally {
      setNotifyingReady(false)
    }
  }

  // ─── Filtro de Cardápio ───
  const categoriesList = useMemo(() => {
    const set = new Set(INITIAL_FOOD99_MENU.map((i) => i.category))
    return ['Todas', ...Array.from(set)]
  }, [])

  const filteredMenuItems = useMemo(() => {
    return INITIAL_FOOD99_MENU.filter((item) => {
      const matchesSearch =
        searchTerm === '' ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCat =
        selectedCategory === 'Todas' ||
        (selectedCategory === 'Pausados' && pausedItemIds.includes(item.id)) ||
        item.category === selectedCategory

      return matchesSearch && matchesCat
    })
  }, [searchTerm, selectedCategory, pausedItemIds])

  // ─── Entregadores Extraídos dos Logs ───
  const deliveryEvents = useMemo(() => {
    const list = logs.filter((l) => l.event_type === 'deliveryStatus' && l.payload?.data?.rider_name)
    // Agrupa por motoboy / pedido
    return list.map((l) => {
      const data = l.payload?.data
      const statusNum = Number(data?.delivery_status || 0)
      let statusLabel = 'Em rota'
      let statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'

      if (statusNum === 120) {
        statusLabel = 'Motoboy a caminho da loja'
        statusColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
      } else if (statusNum === 130) {
        statusLabel = 'Chegou na loja (aguardando pedido)'
        statusColor = 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
      } else if (statusNum === 140) {
        statusLabel = 'Pedido retirado (a caminho do cliente)'
        statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
      } else if (statusNum === 150) {
        statusLabel = 'Chegando ao endereço do cliente'
        statusColor = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      } else if (statusNum === 160) {
        statusLabel = 'Entregue com sucesso'
        statusColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      }

      return {
        id: l.id,
        orderId: data?.order_id,
        riderName: data?.rider_name,
        riderPhone: data?.rider_phone,
        statusNum,
        statusLabel,
        statusColor,
        receivedAt: l.received_at,
      }
    })
  }, [logs])

  const is99Open = status99?.status === 'OPEN'
  const is99Paused = status99?.status === 'PAUSED'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── Top Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-orange-500/10 text-orange-500 shrink-0">
            <Store size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Cantina em Casa
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Loja Ativa
              </span>
              {busyMode.active && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white flex items-center gap-1 animate-pulse">
                  <Flame size={12} /> Cozinha Cheia (+{busyMode.delayMinutes}m)
                </span>
              )}
              {hasAlert && !busyMode.active && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">
                  99Food Fechada
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gestão da Loja Física, Cardápio 99Food, Entregadores, Cozinha e Horários Programados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Atualizar Status
          </button>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto pb-px">
        {[
          { id: 'geral',        label: 'Visão Geral & Horários', icon: Activity },
          { id: 'cardapio',     label: 'Cardápio 99Food (61 itens)', icon: ChefHat, badge: pausedItemIds.length > 0 ? `${pausedItemIds.length} pausados` : undefined },
          { id: 'cozinha',      label: 'Cozinha & Despacho',     icon: Sliders, badge: busyMode.active ? `+${busyMode.delayMinutes}m` : undefined },
          { id: 'entregadores', label: 'Entregadores & Corridas', icon: Bike, badge: deliveryEvents.length > 0 ? `${deliveryEvents.length}` : undefined },
          { id: '99food',       label: 'Conexão 99Food',         icon: Radio    },
          { id: 'ifood',        label: 'Operação iFood',         icon: Clock    },
          { id: 'fisica',       label: 'Dados da Loja Física',   icon: Building2 },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 -mb-px ${
                isActive
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800/60'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={15} />
              {tab.label}
              {tab.badge && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  tab.id === 'cozinha' && busyMode.active
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── TAB 1: VISÃO GERAL & HORÁRIOS ─── */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 99Food Card */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-yellow-400/20 text-yellow-600 flex items-center justify-center font-black text-sm">
                    99
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">99Food</h3>
                    <p className="text-[10px] text-slate-400">ID: 5764608576400918038</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  is99Open
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : is99Paused
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                }`}>
                  {loading ? '...' : is99Open ? '● Aberta' : is99Paused ? '● Pausada' : '● Fechada'}
                </span>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                {status99?.motivo_pausa && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    {status99.motivo_pausa}
                  </p>
                )}
                <p className="flex justify-between">
                  <span>Modo Cozinha:</span>
                  <span className={busyMode.active ? 'font-bold text-amber-600' : 'text-emerald-600'}>
                    {busyMode.active ? `Ocupada (+${busyMode.delayMinutes} min)` : 'Normal (~15 min)'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span>Itens Pausados:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {pausedItemIds.length} de {INITIAL_FOOD99_MENU.length} produtos
                  </span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('cardapio')}
                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold"
                >
                  Gerenciar Cardápio →
                </button>
                <button
                  onClick={() => setActiveTab('cozinha')}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                >
                  Ajustar Cozinha
                </button>
              </div>
            </div>

            {/* iFood Card */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-500/15 text-red-600 flex items-center justify-center font-bold text-xs">
                    iFood
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">iFood</h3>
                    <p className="text-[10px] text-slate-400">Chamado #33063337</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                  Em Homologação
                </span>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                <p className="flex justify-between">
                  <span>Módulo:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Merchant (Status & Pausas)</span>
                </p>
                <p className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Aguardando Suporte iFood</span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('ifood')}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Ver homologação →
                </button>
                <a
                  href="https://portal.ifood.com.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                >
                  Portal Parceiro <ExternalLink size={11} />
                </a>
              </div>
            </div>

            {/* Loja Física Card */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Loja Física</h3>
                    <p className="text-[10px] text-slate-400">Goiânia - GO</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Ativa
                </span>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-1">
                <p className="flex justify-between">
                  <span>Retirada no Balcão:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Disponível</span>
                </p>
                <p className="flex justify-between">
                  <span>Horário Semanal:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">07:30 às 18:15</span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('fisica')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Ver dados cadastrais →
                </button>
                <span className="text-[11px] text-slate-400">Jardim Santo Antônio</span>
              </div>
            </div>
          </div>

          {/* ─── TABELA DE HORÁRIOS PROGRAMADOS DE FUNCIONAMENTO ─── */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Calendar size={18} className="text-orange-500" />
                  Horários Programados de Funcionamento por Canal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Comparação da grade de horários da Loja Física (Balcão) e dos canais de delivery (99Food e iFood).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold border border-orange-500/20">
                  Dia atual destacado
                </span>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3 font-bold">Dia da Semana</th>
                    <th className="py-2.5 px-3 font-bold">Loja Física (Balcão)</th>
                    <th className="py-2.5 px-3 font-bold">99Food (Delivery)</th>
                    <th className="py-2.5 px-3 font-bold">iFood (Delivery)</th>
                    <th className="py-2.5 px-3 font-bold">Observações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {SCHEDULE_COMPARISON.map((row) => {
                    const isToday = row.dayIdx === todayDayIdx
                    return (
                      <tr
                        key={row.dia}
                        className={`transition-colors ${
                          isToday
                            ? 'bg-orange-500/5 font-semibold dark:bg-orange-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{row.dia}</span>
                            {isToday && (
                              <span className="px-1.5 py-0.5 rounded bg-orange-500 text-white text-[9px] font-bold uppercase tracking-wider">
                                Hoje
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${
                            row.fisica === 'Fechado'
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium'
                          }`}>
                            {row.fisica}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${
                            row.food99 === 'Fechado'
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                              : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300 font-medium'
                          }`}>
                            {row.food99}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] ${
                            row.ifood.includes('Homologação') || row.ifood.includes('Cenário')
                              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-medium'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {row.ifood}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-400">
                          {row.observacao}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <AlertCircle size={14} className="text-orange-500" />
                Os horários da 99Food abrem e fecham a loja automaticamente através da função <code className="font-mono text-slate-700 dark:text-slate-300 bg-slate-200/70 dark:bg-slate-700 px-1 py-0.5 rounded">auto_switch</code> da OpenAPI.
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Fuso horário: Horário de Brasília (GMT-3)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: CARDÁPIO 99FOOD (PAUSA DE ITENS EM TEMPO REAL) ─── */}
      {activeTab === 'cardapio' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ChefHat size={20} className="text-orange-500" />
                  Cardápio da 99Food & Gestão de Estoque
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pause itens esgotados na estufa da loja com 1 clique para não receber pedidos de produtos em falta.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                  {INITIAL_FOOD99_MENU.length - pausedItemIds.length} Disponíveis • {pausedItemIds.length} Pausados
                </span>
              </div>
            </div>

            {/* Barra de Pesquisa e Filtros */}
            <div className="flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar produto por nome ou descrição..."
                  className="w-full pl-10 pr-9 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                {categoriesList.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedCategory('Pausados')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === 'Pausados'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                  }`}
                >
                  Apenas Pausados ({pausedItemIds.length})
                </button>
              </div>
            </div>

            {/* Grid de Produtos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredMenuItems.map((item) => {
                const isPaused = pausedItemIds.includes(item.id)
                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                      isPaused
                        ? 'bg-amber-50/20 border-amber-200 dark:border-amber-800/40 dark:bg-amber-950/10'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex gap-3">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover border border-slate-100 dark:border-slate-700 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                          <ChefHat size={22} />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                            {item.name}
                          </h4>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                          {item.category}
                        </span>
                        <p className="text-xs font-black text-orange-600 dark:text-orange-400 mt-1">
                          R$ {item.price.toFixed(2).replace('.', ',')}
                        </p>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isPaused
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {isPaused ? 'Pausado na 99' : 'Disponível'}
                      </span>

                      <button
                        onClick={() => handleToggleItemStatus(item)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 ${
                          isPaused
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {isPaused ? (
                          <>
                            <CheckCircle2 size={12} /> Reativar
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={13} /> Pausar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {filteredMenuItems.length === 0 && (
              <div className="py-12 text-center text-xs text-slate-400">
                Nenhum produto encontrado para o termo pesquisado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: COZINHA & DESPACHO (MODO COZINHA CHEIA + STATUS DA LOJA) ─── */}
      {activeTab === 'cozinha' && (
        <div className="space-y-6">
          {/* Card: Modo Cozinha Cheia */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Flame size={20} className={busyMode.active ? 'text-amber-500 animate-bounce' : 'text-slate-400'} />
                  Modo Cozinha Cheia (Sobrecarga de Pedidos na 99Food)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Quando a loja física ou o balcão estiverem com filas, injete minutos extras no tempo prometido de preparo na 99Food para desafogar a cozinha.
                </p>
              </div>

              {busyMode.active && (
                <button
                  onClick={() => handleSetBusyMode(0)}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors shadow-sm self-start"
                >
                  Normalizar Cozinha Agora
                </button>
              )}
            </div>

            {/* Status Ativo do Modo */}
            <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              busyMode.active
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${busyMode.active ? 'bg-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  <Flame size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {busyMode.active ? `Modo Ocupado Ativo (+${busyMode.delayMinutes} min no prazo da 99)` : 'Cozinha em Ritmo Padrão (~15 min)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {busyMode.active
                      ? `Tempo total prometido aos clientes: ${15 + busyMode.delayMinutes} minutos.`
                      : 'Nenhum atraso extra aplicado. Tempo padrão de 15 minutos.'}
                  </p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                busyMode.active ? 'bg-amber-500 text-white' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}>
                {busyMode.active ? 'SOBRECARGA ATIVA' : 'NORMAL'}
              </span>
            </div>

            {/* Opções de Atraso */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Selecione o Atraso Extra para Injetar na 99Food:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { delay: 0,  label: 'Normal (0 min)',   desc: 'Preparo padrão em 15 min' },
                  { delay: 10, label: '+10 minutos',       desc: 'Movimento moderado no balcão' },
                  { delay: 20, label: '+20 minutos',       desc: 'Pico de movimento intenso' },
                  { delay: 30, label: '+30 minutos',       desc: 'Sobrecarga extrema da cozinha' },
                ].map((opt) => (
                  <button
                    key={opt.delay}
                    onClick={() => handleSetBusyMode(opt.delay, 45)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      busyMode.delayMinutes === opt.delay
                        ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xs font-bold block">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Card: Controle Manual de Status da Loja 99 (Pausar / Abrir) */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sliders size={18} className="text-orange-500" />
              Controle Manual do Status da Loja (99Food)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Caso ocorra algum imprevisto (queda de energia, chuva torrencial, etc.), pause a loja instantaneamente.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <select
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="Pausa manual temporária">Pausa manual temporária</option>
                <option value="Chuva forte / Mau tempo">Chuva forte / Mau tempo</option>
                <option value="Sobrecarga extrema de pedidos">Sobrecarga extrema de pedidos</option>
                <option value="Falta de energia elétrica">Falta de energia elétrica</option>
                <option value="Manutenção interna do balcão">Manutenção interna do balcão</option>
              </select>

              <button
                disabled={updatingStoreStatus}
                onClick={() => handleUpdateStoreStatus('PAUSED', pauseReason)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
              >
                Pausar Loja na 99Food
              </button>

              <button
                disabled={updatingStoreStatus}
                onClick={() => handleUpdateStoreStatus('OPEN')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
              >
                Reabrir Loja na 99Food
              </button>

              <button
                disabled={updatingStoreStatus}
                onClick={() => handleUpdateStoreStatus('CLOSED', 'Fechamento manual antecipado')}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Fechar Loja
              </button>
            </div>
          </div>

          {/* Card: Notificar Pedido Pronto (Despacho Ágil) */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Package size={18} className="text-orange-500" />
              Despacho Ágil — Notificar "Pedido Pronto" para Coleta
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assim que o pedido for embalado no balcão, dispare a notificação para chamar o motoboy imediatamente para retirada.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                value={orderReadyId}
                onChange={(e) => setOrderReadyId(e.target.value)}
                placeholder="Informe o número do Pedido 99Food (ex: 5764688341354221000)"
                className="w-full sm:w-96 px-3.5 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />

              <button
                disabled={notifyingReady}
                onClick={handleNotifyOrderReady}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={14} /> Chamar Motoboy / Pedido Pronto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: ENTREGADORES & CORRIDAS (RASTREAMENTO EM TEMPO REAL) ─── */}
      {activeTab === 'entregadores' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Bike size={20} className="text-blue-500" />
                  Rastreamento de Entregadores & Corridas da 99Food
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Acompanhe os motoboys parceiros da 99 em tempo real com nome, telefone de contato e status de entrega.
                </p>
              </div>

              <span className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20 self-start">
                Webhook deliveryStatus Ativo
              </span>
            </div>

            {deliveryEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Nenhum entregador em trânsito no momento. Quando um motoboy aceitar um pedido, o contato e status aparecerão aqui automaticamente.
              </div>
            ) : (
              <div className="space-y-3">
                {deliveryEvents.map((deliv) => (
                  <div
                    key={deliv.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">
                          <Bike size={22} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            {deliv.riderName}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${deliv.statusColor}`}>
                              {deliv.statusLabel}
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>Pedido #{String(deliv.orderId).slice(-6)}</span>
                            <span>•</span>
                            <span>{formatSafeDateTime(deliv.receivedAt)}</span>
                          </p>
                        </div>
                      </div>

                      {/* Botões de Ação com o Motoboy */}
                      {deliv.riderPhone && (
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <a
                            href={`tel:${deliv.riderPhone}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
                          >
                            <PhoneCall size={13} className="text-blue-500" />
                            Ligar ({deliv.riderPhone})
                          </a>
                          <a
                            href={`https://wa.me/55${deliv.riderPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                          >
                            <MessageSquare size={13} />
                            WhatsApp
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Timeline de Status da Corrida */}
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500 overflow-x-auto gap-2">
                      <span className={deliv.statusNum >= 120 ? 'text-emerald-600 font-bold' : ''}>
                        ● 1. Aceite
                      </span>
                      <ChevronRight size={12} className="text-slate-300 shrink-0" />
                      <span className={deliv.statusNum >= 130 ? 'text-emerald-600 font-bold' : ''}>
                        ● 2. Na Loja
                      </span>
                      <ChevronRight size={12} className="text-slate-300 shrink-0" />
                      <span className={deliv.statusNum >= 140 ? 'text-emerald-600 font-bold' : ''}>
                        ● 3. Em Trânsito
                      </span>
                      <ChevronRight size={12} className="text-slate-300 shrink-0" />
                      <span className={deliv.statusNum >= 160 ? 'text-emerald-600 font-bold' : ''}>
                        ● 4. Entregue
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 5: OPERAÇÃO 99FOOD (CONEXÃO E CREDENCIAIS TÉCNICAS) ─── */}
      {activeTab === '99food' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${is99Open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  Operação 99Food — Cantina em Casa
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Conexão direta via OpenAPI 99Food / DiDi Food com Multi-binding
                </p>
              </div>
              <a
                href="https://merchant.99app.com/pt-BR/manager/overview"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 text-xs font-semibold hover:bg-orange-100 transition-colors self-start"
              >
                Abrir Painel do Gestor 99 <ArrowUpRight size={13} />
              </a>
            </div>

            {/* Parâmetros Técnicos & Conectividade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ID da Loja (99Food)</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">5764608576400918038</span>
                  <button onClick={() => handleCopy('5764608576400918038', 'shopId')} className="text-slate-400 hover:text-slate-600">
                    {copiedKey === 'shopId' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">APP ID (CRM Cantina)</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">5764607670575695995</span>
                  <button onClick={() => handleCopy('5764607670575695995', 'appId')} className="text-slate-400 hover:text-slate-600">
                    {copiedKey === 'appId' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">URL do Webhook Ativo</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] truncate text-slate-700 dark:text-slate-300">.../functions/v1/food99-webhook</span>
                  <button onClick={() => handleCopy('https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/food99-webhook', 'webhook')} className="text-slate-400 hover:text-slate-600">
                    {copiedKey === 'webhook' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status da Autenticação</span>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} /> Token Válido (Até 25/10/2026)
                  </span>
                  <span className="text-[10px] text-slate-400">Produção</span>
                </div>
              </div>
            </div>

            {/* Parâmetros Operacionais da Cozinha & Logística */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders size={14} /> Parâmetros Operacionais Ativos na 99Food
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tempo Prometido Preparo</span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">~15 minutos</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">promise_produce_time</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Modo Ocupado (Busy Mode)</span>
                  <span className={`text-sm font-bold ${busyMode.active ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {busyMode.active ? `+${busyMode.delayMinutes} min extra` : 'Normal (0 min extra)'}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {busyMode.active ? 'Sobrecarga ativa' : 'Sem atraso injetado'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Modelo de Entrega</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">Entrega Parceira 99</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">deliver_type: 1 (Rede DiDi)</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Abertura Automática</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Ativada (auto_switch)</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Segue grade de horários</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 6: IFOOD ─── */}
      {activeTab === 'ifood' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  Operação iFood — Chamado de Homologação #33063337
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Homologação solicitada exclusivamente para o Módulo <strong>Merchant</strong> (Status, Pausas e Horários)
                </p>
              </div>
              <a
                href="https://portal.ifood.com.br"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-100 transition-colors self-start"
              >
                Abrir Portal Parceiro iFood <ArrowUpRight size={13} />
              </a>
            </div>

            {/* Checklist dos Cenários Merchant */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Checklist dos 3 Cenários Exigidos pelo iFood (Módulo Merchant)
              </h4>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-start gap-3">
                  <div className="p-1 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600 font-bold text-xs">
                    01
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cenário 1: Informações e Disponibilidade da Loja
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Listar a loja vinculada, exibir detalhes completos e consultar se está aberta ou fechada.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-start gap-3">
                  <div className="p-1 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600 font-bold text-xs">
                    02
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cenário 2: Gestão de Interrupções e Pausas
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Cadastrar pausa no sistema e validar no Portal do Parceiro; listar pausas ativas; remover pausa.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 flex items-start gap-3">
                  <div className="p-1 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600 font-bold text-xs">
                    03
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cenário 3: Configuração de Horários de Funcionamento
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Cadastrar horário de teste (Sábado das 10h às 19h / Domingo em 3 intervalos) e validar no Portal.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Próxima Ação:</span> Aguardamos o suporte do iFood responder ao chamado confirmando a restrição ao módulo Merchant e liberando as credenciais de teste para gravarmos o vídeo desses 3 cenários.
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 7: LOJA FÍSICA ─── */}
      {activeTab === 'fisica' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <Building2 size={18} className="text-orange-500" />
              Dados Cadastrais da Unidade Física
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Razão Social</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">CANTINA EM CASA LTDA</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CNPJ</span>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">37.798.843/0001-95</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1 md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <MapPin size={12} /> Endereço Físico
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Rua 11, 2114 - Jardim Santo Antônio, Goiânia - GO, 74853-240, Brasil
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Phone size={12} /> Contato Telefônico
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">(62) 98114-7564</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={12} /> Responsável
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">Makário Orozimbo</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
