import { useState, useEffect } from 'react'
import {
  Store, CheckCircle2, AlertTriangle, Clock, RefreshCw, ExternalLink,
  MapPin, Phone, Building2, ShieldCheck, Radio, Calendar,
  Activity, ArrowUpRight, Copy, Check
} from 'lucide-react'
import { useDeliveryStatus } from '../hooks/useDeliveryStatus'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface WebhookLog {
  id: string
  canal: string
  event_type: string
  received_at: string
  payload: any
}

export default function LojaPage() {
  const { status99, statusIfood, hasAlert, loading, refetch } = useDeliveryStatus()
  const [activeTab, setActiveTab] = useState<'geral' | '99food' | 'ifood' | 'fisica'>('geral')
  const [refreshing, setRefreshing] = useState(false)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const loadLogs = async () => {
    setLoadingLogs(true)
    try {
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
              {hasAlert && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white animate-pulse">
                  Atenção no Delivery
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gestão da Loja Física e Monitoramento Operacional de Delivery (99Food & iFood)
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
          { id: 'geral',   label: 'Visão Geral',         icon: Activity },
          { id: '99food',  label: 'Operação 99Food',      icon: Radio    },
          { id: 'ifood',   label: 'Operação iFood',       icon: Clock    },
          { id: 'fisica',  label: 'Dados da Loja Física', icon: Building2 },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 -mb-px ${
                isActive
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800/60'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={15} />
              {tab.label}
              {tab.id === '99food' && is99Open && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* ─── TAB 1: VISÃO GERAL ─── */}
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
                <p className="flex justify-between">
                  <span>Multi-binding:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Ativo (Cardápio Web + CRM)</span>
                </p>
                <p className="flex justify-between">
                  <span>Webhooks Realtime:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Conectado</span>
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('99food')}
                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold"
                >
                  Ver detalhes da 99 →
                </button>
                <a
                  href="https://merchant.99app.com/pt-BR/manager/overview"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
                >
                  Portal 99 <ExternalLink size={11} />
                </a>
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

          {/* Webhook Activity Feed */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-orange-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Eventos Recentes de Delivery (Webhooks em Tempo Real)
                </h3>
              </div>
              <span className="text-xs text-slate-400">Últimos eventos capturados</span>
            </div>

            {loadingLogs ? (
              <div className="py-6 text-center text-xs text-slate-400">Carregando eventos...</div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum evento registrado ainda. Quando a 99Food ou o iFood enviarem alterações de status, eles aparecerão aqui.
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.canal === '99FOOD'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                      }`}>
                        {log.canal}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {log.event_type}
                      </span>
                      {log.payload?.data?.bindStatus && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          (Vínculo confirmado com sucesso)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {format(new Date(log.received_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: 99FOOD ─── */}
      {activeTab === '99food' && (
        <div className="space-y-6">
          {/* Status & Credenciais Card */}
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
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

            {/* Parâmetros Técnicos */}
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

            {/* Horários sincronizados da 99 */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar size={14} /> Horários de Funcionamento (Configurados na 99Food)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { dia: 'Segunda',  hora: '07:30 às 18:15' },
                  { dia: 'Terça',    hora: '07:30 às 18:10' },
                  { dia: 'Quarta',   hora: '07:30 às 18:15' },
                  { dia: 'Quinta',   hora: '07:30 às 18:15' },
                  { dia: 'Sexta',    hora: '07:30 às 18:15' },
                  { dia: 'Sábado',   hora: '08:00 às 12:15' },
                ].map((h) => (
                  <div key={h.dia} className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/20 text-center">
                    <span className="text-[10px] font-bold text-slate-500 block">{h.dia}</span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{h.hora}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: IFOOD ─── */}
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

      {/* ─── TAB 4: LOJA FÍSICA ─── */}
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
