import { useEffect, useState, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Search, Truck, Users, Radio, Settings, AlertTriangle, CheckCircle, MapPin, Gauge, Wifi, WifiOff, ExternalLink, FileText, DollarSign, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Vehicle, Driver } from '../types'
import { docExpiryStatus, daysUntil } from '../types'
import VehicleModal from '../components/VehicleModal'
import DriverModal from '../components/DriverModal'
import RomaneioTab from '../components/RomaneioTab'
import RotasEntregaTab from '../components/RotasEntregaTab'
import CustosTab from '../components/CustosTab'
import ConciliacaoTab from '../components/ConciliacaoTab'
import TiposOcorrenciaConfig from '../components/TiposOcorrenciaConfig'
import MapaEntregasTab from '../components/MapaEntregasTab'
import { fetchPositions, loadCredentials, saveCredentials, clearCredentials } from '../lib/velotrack'
import type { VelotrackPosition } from '../types'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'veiculos' | 'motoristas' | 'rastreamento' | 'romaneio' | 'rotas' | 'mapa' | 'custos' | 'conciliacao' | 'config_ocorrencias'

// ─── Helpers ─────────────────────────────────────────────────────

const STATUS_OP_LABELS: Record<string, string> = {
  ativo: 'Ativo', manutencao: 'Em manutenção', parado: 'Parado', inativo: 'Inativo'
}
const STATUS_OP_COLORS: Record<string, string> = {
  ativo:      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  manutencao: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  parado:     'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  inativo:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

function ExpiryBadge({ date, label }: { date: string | null; label: string }) {
  const st = docExpiryStatus(date)
  if (!st || st === 'ok') return null
  const days = daysUntil(date) ?? 0
  const styles = {
    expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    danger:  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  }[st]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${styles}`}>
      <AlertTriangle size={9} />
      {label} {days < 0 ? `venc. ${Math.abs(days)}d` : `${days}d`}
    </span>
  )
}

function CnhBadge({ date }: { date: string | null }) {
  const st = docExpiryStatus(date)
  if (!st || st === 'ok') return null
  const days = daysUntil(date) ?? 0
  const styles = {
    expired: 'bg-red-100 text-red-700', danger: 'bg-orange-100 text-orange-700', warning: 'bg-amber-100 text-amber-700',
  }[st] ?? ''
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${styles}`}>CNH {days < 0 ? 'venc.' : `${days}d`}</span>
}

// ─── Rastreamento ─────────────────────────────────────────────────

function TrackingTab() {
  const [creds, setCreds] = useState({ login: '', password: '' })
  const [positions, setPositions] = useState<VelotrackPosition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const data = await fetchPositions()
      setPositions(Array.isArray(data) ? data : [])
    } catch (e: any) {
      const msg = e.message ?? 'Erro desconhecido'
      if (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('failed to fetch')) {
        setError('Erro de CORS: a API Velotrack bloqueou a requisição do navegador. Contate o suporte para configurar um proxy.')
      } else {
        setError(msg)
      }
    } finally { setLoading(false) }
  }

  function saveCreds() {
    if (!creds.login || !creds.password) return
    saveCredentials(creds)
    setShowConfig(false)
    load()
  }

  function resetCreds() {
    clearCredentials()
    setPositions([])
    load()
  }

  const moving  = positions.filter(p => p.connected)
  const stopped = positions.filter(p => !p.connected)
  const offline = positions.filter(p => p.offline_hours > 1)

  if (showConfig) return (
    <div className="max-w-md mx-auto mt-8">
      <div className="card p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mx-auto">
          <Radio size={28} className="text-orange-500" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Credenciais Velotrack</h3>
          <p className="text-sm text-slate-500 mt-1">Preencha apenas para usar uma conta diferente da padrão.</p>
        </div>
        <div className="space-y-3 text-left">
          <div>
            <label className="label">Login (usuário)</label>
            <input className="input" value={creds.login} onChange={e => setCreds(p => ({ ...p, login: e.target.value }))} placeholder="login@cantina.com.br" />
          </div>
          <div>
            <label className="label">Senha</label>
            <input type="password" className="input" value={creds.password} onChange={e => setCreds(p => ({ ...p, password: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(false)} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={saveCreds} disabled={!creds.login || !creds.password} className="btn-primary flex-1">
            Salvar e Reconectar
          </button>
        </div>
        <button onClick={() => { resetCreds(); setShowConfig(false) }} className="text-xs text-slate-400 hover:text-slate-600 underline">
          Restaurar credencial padrão
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header com stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-green-700 dark:text-green-300">{moving.length} em movimento</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{stopped.length} parados</span>
          </div>
          {offline.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <WifiOff size={12} className="text-red-500" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">{offline.length} offline</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(true)} className="btn-ghost p-2" title="Configurar credenciais">
            <Settings size={16} />
          </button>
          <button onClick={resetCreds} className="btn-ghost p-2 text-red-400" title="Restaurar credencial padrão">
            <WifiOff size={16} />
          </button>
          <button onClick={load} disabled={loading} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {positions.length === 0 && !loading && !error && (
        <div className="card p-8 text-center text-slate-400">Nenhum veículo rastreado encontrado.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {positions.map(p => {
          const isMoving = p.connected
          const isOffline = p.offline_hours > 1
          const lat = parseFloat(p.latitude)
          const lng = parseFloat(p.longitude)
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`

          return (
            <div key={p.iddevice}
              className={`card p-4 border-l-4 ${isOffline ? 'border-l-red-400' : isMoving ? 'border-l-green-400' : 'border-l-slate-300'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{p.description || p.vehicle_code}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{p.vehicle_code}</p>
                </div>
                <div className="flex items-center gap-1">
                  {isOffline
                    ? <WifiOff size={14} className="text-red-400" />
                    : isMoving
                    ? <Wifi size={14} className="text-green-500" />
                    : <Wifi size={14} className="text-slate-400" />
                  }
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isOffline ? 'bg-red-100 text-red-600' : isMoving ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isOffline ? 'Offline' : isMoving ? 'Em rota' : 'Parado'}
                  </span>
                </div>
              </div>

              {p.driver && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                  <span className="font-medium">Motorista:</span> {p.driver}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span className="flex items-center gap-1">
                  <Gauge size={11} />
                  {typeof (p as any).speed === 'number' ? `${(p as any).speed} km/h` : '—'}
                </span>
                {p.odometer > 0 && (
                  <span>{Math.round(p.odometer / 1000)} mil km</span>
                )}
                {p.offline_hours > 0 && (
                  <span>{p.offline_hours}h atrás</span>
                )}
              </div>

              {p.address && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 line-clamp-2">
                  <MapPin size={10} className="shrink-0 mt-0.5" />
                  {p.address}
                </p>
              )}

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {p.command_date ? new Date(p.command_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-orange-500 hover:underline font-medium">
                  <ExternalLink size={10} /> Ver no mapa
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────

export default function LogisticaPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('romaneio')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editVehicle, setEditVehicle] = useState<Vehicle | null | undefined>(undefined)
  const [editDriver, setEditDriver] = useState<Driver | null | undefined>(undefined)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: vData }, { data: dData }] = await Promise.all([
      supabase.from('crm_vehicles').select('*, driver:crm_drivers(id,nome,cnh_vencimento,cnh_categoria)').order('apelido'),
      supabase.from('crm_drivers').select('*').order('nome'),
    ])
    setVehicles((vData as Vehicle[]) ?? [])
    setDrivers((dData as Driver[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteVehicle(id: string) {
    if (!confirm('Excluir este veículo?')) return
    await supabase.from('crm_vehicles').delete().eq('id', id)
    setVehicles(vs => vs.filter(v => v.id !== id))
  }

  async function deleteDriver(id: string) {
    if (!confirm('Excluir este motorista?')) return
    await supabase.from('crm_drivers').delete().eq('id', id)
    setDrivers(ds => ds.filter(d => d.id !== id))
  }

  const filteredVehicles = useMemo(() => {
    const q = search.toLowerCase()
    return vehicles.filter(v => {
      if (!showInactive && !v.ativo) return false
      return !q || v.apelido.toLowerCase().includes(q) || (v.placa ?? '').toLowerCase().includes(q) || (v.marca_modelo ?? '').toLowerCase().includes(q)
    })
  }, [vehicles, search, showInactive])

  const filteredDrivers = useMemo(() => {
    const q = search.toLowerCase()
    return drivers.filter(d => {
      if (!showInactive && !d.ativo) return false
      return !q || d.nome.toLowerCase().includes(q) || (d.cpf ?? '').includes(q)
    })
  }, [drivers, search, showInactive])

  const alertCount = useMemo(() => {
    let n = 0
    for (const v of vehicles) {
      if (!v.ativo) continue
      const checks = [v.venc_seguro, v.venc_ipva, (v as any).crlv_vencimento]
      for (const d of checks) {
        const s = docExpiryStatus(d)
        if (s && s !== 'ok') n++
      }
    }
    for (const d of drivers) {
      if (!d.ativo) continue
      const s = docExpiryStatus(d.cnh_vencimento)
      if (s && s !== 'ok') n++
    }
    return n
  }, [vehicles, drivers])

  const TABS = [
    { id: 'romaneio'     as Tab, label: 'Romaneio',          icon: FileText,    count: null },
    { id: 'conciliacao'  as Tab, label: 'Conciliação',       icon: ClipboardCheck, count: null },
    { id: 'rotas'        as Tab, label: 'Rotas de Entrega',  icon: Navigation,  count: null },
    { id: 'mapa'         as Tab, label: 'Mapa de Entregas',  icon: MapPin,      count: null },
    { id: 'rastreamento' as Tab, label: 'Rastreamento',      icon: Radio,       count: null },
    { id: 'veiculos'     as Tab, label: 'Veículos',          icon: Truck,       count: vehicles.filter(v => v.ativo).length },
    { id: 'motoristas'   as Tab, label: 'Motoristas',        icon: Users,       count: drivers.filter(d => d.ativo).length },
    { id: 'custos'       as Tab, label: 'Custos',            icon: DollarSign,  count: null },
    ...(isAdmin ? [{ id: 'config_ocorrencias' as Tab, label: 'Ocorrências', icon: Settings, count: null }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Logística</h1>
          {alertCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-bold">
              <AlertTriangle size={11} /> {alertCount} alerta{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {tab !== 'rotas' && (
            <button onClick={load} className="btn-ghost p-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          {tab === 'veiculos' && (
            <button onClick={() => setEditVehicle(null)} className="btn-primary">
              <Plus size={16} /> <span className="hidden sm:inline">Veículo</span>
            </button>
          )}
          {tab === 'motoristas' && (
            <button onClick={() => setEditDriver(null)} className="btn-primary">
              <Plus size={16} /> <span className="hidden sm:inline">Motorista</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
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

      {/* Search (veiculos/motoristas) */}
      {tab !== 'rastreamento' && tab !== 'romaneio' && tab !== 'rotas' && tab !== 'mapa' && tab !== 'custos' && (
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder={tab === 'veiculos' ? 'Buscar por apelido, placa ou modelo...' : 'Buscar por nome ou CPF...'} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setShowInactive(p => !p)} className={`btn-ghost text-xs py-2 px-3 whitespace-nowrap ${showInactive ? 'text-orange-500' : ''}`}>
            {showInactive ? 'Ocultar inativos' : 'Ver inativos'}
          </button>
        </div>
      )}

      {/* Content */}
      {tab === 'romaneio' ? (
        <RomaneioTab />
      ) : tab === 'conciliacao' ? (
        <ConciliacaoTab
          date={new Date().toISOString().split('T')[0]}
          drivers={drivers}
        />
      ) : tab === 'config_ocorrencias' ? (
        <TiposOcorrenciaConfig />
      ) : tab === 'rotas' ? (
        <RotasEntregaTab />
      ) : tab === 'mapa' ? (
        <MapaEntregasTab />
      ) : tab === 'custos' ? (
        <CustosTab
          vehicles={vehicles}
          drivers={drivers}
          onVehiclesChanged={load}
        />
      ) : loading ? (
        <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
      ) : tab === 'rastreamento' ? (
        <TrackingTab />
      ) : tab === 'veiculos' ? (
        <VehiclesList
          vehicles={filteredVehicles}
          onEdit={v => setEditVehicle(v)}
          onDelete={deleteVehicle}
        />
      ) : (
        <DriversList
          drivers={filteredDrivers}
          onEdit={d => setEditDriver(d)}
          onDelete={deleteDriver}
        />
      )}

      {/* Modals */}
      {editVehicle !== undefined && (
        <VehicleModal vehicle={editVehicle} onClose={() => setEditVehicle(undefined)} onSaved={load} />
      )}
      {editDriver !== undefined && (
        <DriverModal driver={editDriver} onClose={() => setEditDriver(undefined)} onSaved={load} />
      )}
    </div>
  )
}

// ─── Vehicles list ────────────────────────────────────────────────

function VehiclesList({ vehicles, onEdit, onDelete }: {
  vehicles: Vehicle[]
  onEdit: (v: Vehicle) => void
  onDelete: (id: string) => void
}) {
  if (vehicles.length === 0) return (
    <div className="card p-8 text-center text-slate-400">Nenhum veículo encontrado. Cadastre o primeiro!</div>
  )

  return (
    <div className="space-y-2">
      {vehicles.map(v => {
        const statusOp = (v as any).status_operacional ?? 'ativo'
        const hasAlerts = [v.venc_seguro, v.venc_ipva, (v as any).crlv_vencimento]
          .some(d => { const s = docExpiryStatus(d); return s && s !== 'ok' })

        return (
          <div key={v.id} className={`card overflow-hidden ${!v.ativo ? 'opacity-60' : ''}`}>
            <div className="px-4 py-3 flex items-start gap-3">
              <div className={`mt-0.5 p-2 rounded-xl ${
                statusOp === 'ativo' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
              }`}>
                <Truck size={16} className={statusOp === 'ativo' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{v.apelido}</span>
                  {v.placa && <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">{v.placa}</span>}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_OP_COLORS[statusOp]}`}>{STATUS_OP_LABELS[statusOp]}</span>
                  {v.empresa === 'lumar' ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold">Lumar</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold">Cantina</span>
                  )}
                  {v.tem_rastreamento && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-bold flex items-center gap-0.5">
                      <Radio size={8} /> GPS
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                  {v.marca_modelo && <span className="mr-3">{v.marca_modelo}{v.ano ? ` · ${v.ano}` : ''}</span>}
                  {(v.driver as any)?.nome && <span className="mr-3">👤 {(v.driver as any).nome}</span>}
                  {(v as any).km_atual && <span className="mr-3">🔢 {Number((v as any).km_atual).toLocaleString('pt-BR')} km</span>}
                </div>

                {hasAlerts && (
                  <div className="flex gap-1.5 flex-wrap mt-1.5">
                    <ExpiryBadge date={v.venc_seguro} label="Seguro" />
                    <ExpiryBadge date={v.venc_ipva} label="IPVA" />
                    <ExpiryBadge date={(v as any).crlv_vencimento} label="CRLV" />
                  </div>
                )}
              </div>

              <div className="flex gap-1 shrink-0">
                <button onClick={() => onEdit(v)} className="btn-ghost p-2 text-slate-500">
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDelete(v.id)} className="btn-ghost p-2 text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Drivers list ─────────────────────────────────────────────────

function DriversList({ drivers, onEdit, onDelete }: {
  drivers: Driver[]
  onEdit: (d: Driver) => void
  onDelete: (id: string) => void
}) {
  if (drivers.length === 0) return (
    <div className="card p-8 text-center text-slate-400">Nenhum motorista encontrado. Cadastre o primeiro!</div>
  )

  return (
    <div className="space-y-2">
      {drivers.map(d => (
        <div key={d.id} className={`card px-4 py-3 flex items-center gap-3 ${!d.ativo ? 'opacity-60' : ''}`}>
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700">
            <Users size={15} className="text-slate-500 dark:text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{d.nome}</span>
              {d.ativo ? (
                <span className="flex items-center gap-0.5 text-[10px] text-green-700 dark:text-green-400 font-bold">
                  <CheckCircle size={9} /> Ativo
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-bold">Inativo</span>
              )}
              <CnhBadge date={d.cnh_vencimento} />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-3">
              {d.telefone && <span>📱 {d.telefone}</span>}
              {d.cnh_categoria && <span>🪪 CNH {d.cnh_categoria}</span>}
              {d.cnh_vencimento && <span>vence {new Date(d.cnh_vencimento + 'T00:00').toLocaleDateString('pt-BR')}</span>}
              {(d as any).cnh_pontuacao != null && <span>🔴 {(d as any).cnh_pontuacao} pts</span>}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => onEdit(d)} className="btn-ghost p-2 text-slate-500"><Pencil size={14} /></button>
            <button onClick={() => onDelete(d.id)} className="btn-ghost p-2 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
