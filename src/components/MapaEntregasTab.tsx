import 'leaflet/dist/leaflet.css'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { MapPin, ExternalLink, AlertCircle, ChevronLeft, ChevronRight, RotateCcw, Calendar, Clock, Home } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

const GOIANIA_CENTER: [number, number] = [-15.7939, -48.0865]
const CANTINA_LOCATION: [number, number] = [-15.8214, -48.0623]
const CANTINA_ADDRESS = 'Rua 11, 91 - Jardim Santo Antonio, Goiânia - GO, 74853-240'
import { supabase } from '../lib/supabase'
import { geocodePendingPedidos } from '../lib/geocoding'
import type { VarejoPedido } from '../types'
import { format, addDays, startOfDay, endOfDay } from 'date-fns'
import { pt as ptBR } from 'date-fns/locale'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

type StatusFilter = '⚠️' | '🛵' | '✅'
type ViewMode = 'data' | 'fila'

const STATUS_COLORS: Record<StatusFilter, string> = {
  '⚠️': '#f59e0b', // âmbar - pendente
  '🛵': '#3b82f6', // azul - em rota
  '✅': '#10b981', // verde - entregue
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  '⚠️': 'Pendente',
  '🛵': 'Em rota',
  '✅': 'Entregue',
}

function createStatusIcon(status: string) {
  const color = STATUS_COLORS[status as StatusFilter] || '#999999'
  return L.divIcon({
    className: 'mapa-marker',
    html: `<div style="
      background: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function createCantinasIcon() {
  return L.divIcon({
    className: 'cantina-marker',
    html: `<div style="
      background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5), 0 0 0 2px #8b5cf6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 20px;
      line-height: 1;
    ">🏠</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })
}

export default function MapaEntregasTab() {
  const [pedidos, setPedidos] = useState<VarejoPedido[]>([])
  const [filaPedidos, setFilaPedidos] = useState<VarejoPedido[]>([])
  const [loading, setLoading] = useState(false)
  const [geocodingPending, setGeoencodingPending] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('data')
  const [turnoFilter, setTurnoFilter] = useState<string[]>(['MANHÃ', 'TARDE', 'NOITE'])
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>(['⚠️', '🛵'])
  const [showEntregues, setShowEntregues] = useState(false)
  const [mapDarkMode, setMapDarkMode] = useState(true)
  const [geocodeAttempted, setGeocodeAttempted] = useState(false)

  const loadPedidos = useCallback(async () => {
    setLoading(true)
    try {
      const start = startOfDay(selectedDate).toISOString().split('T')[0]
      const end = endOfDay(selectedDate).toISOString().split('T')[0]

      const campos = 'id, num_pedido, cliente, bairro, endereco_completo, complemento, turno, status_icon, entregador, lat, lng, geocoded_at, empresa, data_entrega, telefone, frete, order_type, geocode_failed_at'

      // Query separadas: uma com empresa = CANTINA, outra com empresa = NULL
      let queryCantina = supabase
        .from('varejo_pedidos')
        .select(campos)
        .eq('empresa', 'CANTINA')
        .gte('data_entrega', start)
        .lte('data_entrega', end)
        .neq('status_icon', '❌')
        .not('endereco_completo', 'is', null)
        .order('data_entrega', { ascending: true })

      let queryNull = supabase
        .from('varejo_pedidos')
        .select(campos)
        .is('empresa', null)
        .gte('data_entrega', start)
        .lte('data_entrega', end)
        .neq('status_icon', '❌')
        .not('endereco_completo', 'is', null)
        .order('data_entrega', { ascending: true })

      let queryFila = supabase
        .from('varejo_pedidos')
        .select(campos)
        .or(`empresa.eq.CANTINA,empresa.is.null`)
        .is('data_entrega', null)
        .neq('status_icon', '❌')
        .not('endereco_completo', 'is', null)
        .order('created_at', { ascending: false })

      const [{ data: dataCantina, error: err1 }, { data: dataNull, error: err1b }, { data: dataFila, error: err2 }] = await Promise.all([
        queryCantina,
        queryNull,
        queryFila,
      ])

      if (err1) console.error('Cantina query error:', err1)
      if (err1b) console.error('Null empresa query error:', err1b)
      if (err2) console.error('Fila query error:', err2)

      const typed = [...((dataCantina || []) as VarejoPedido[]), ...((dataNull || []) as VarejoPedido[])]
      const filaTyped = (dataFila || []) as VarejoPedido[]

      console.log(`📦 Carregados ${typed.length} pedidos para ${start} | 🚫 ${filaTyped.length} em fila`)
      if (typed.length > 0) console.log('📋 Pedidos com data:', typed.map(p => ({ num_pedido: p.num_pedido, cliente: p.cliente, status: p.status_icon, data_entrega: p.data_entrega })))
      if (filaTyped.length > 0) console.log('⏰ Pedidos em fila:', filaTyped.map(p => ({ num_pedido: p.num_pedido, cliente: p.cliente, status: p.status_icon, data_entrega: p.data_entrega })))

      const pedido10880Data = typed.find(p => p.num_pedido === '10880')
      const pedido10880Fila = filaTyped.find(p => p.num_pedido === '10880')
      if (pedido10880Data) console.log('🔍 #10880 encontrado em DATA:', pedido10880Data)
      if (pedido10880Fila) console.log('🔍 #10880 encontrado em FILA:', pedido10880Fila)
      if (!pedido10880Data && !pedido10880Fila) console.warn('❌ #10880 NÃO ENCONTRADO em nenhuma query!')

      setPedidos(typed)
      setFilaPedidos(filaTyped)

      if (!geocodeAttempted) {
        const toGeocode = [...typed, ...filaTyped]
          .filter((p) => (!p.lat || !p.lng) && !p.geocode_failed_at)

        if (toGeocode.length > 0) {
          console.log(`🌍 Geocodificando ${toGeocode.length} pedidos sem falha anterior...`)
          setGeoencodingPending(true)
          setGeocodeAttempted(true)
          try {
            await geocodePendingPedidos(toGeocode)
            setTimeout(() => setGeocodeAttempted(false), 3000)
          } finally {
            setGeoencodingPending(false)
          }
        }
      }
    } catch (error) {
      console.error('❌ Erro ao carregar pedidos:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, geocodeAttempted])

  useEffect(() => {
    loadPedidos()
  }, [loadPedidos])

  const filteredPedidos = useMemo(() => {
    const source = viewMode === 'fila' ? filaPedidos : pedidos
    const filtered = source.filter((p) => {
      if (turnoFilter.length > 0 && !turnoFilter.includes(p.turno || '')) return false
      if (statusFilter.length > 0 && !statusFilter.includes(p.status_icon as StatusFilter)) return false
      return true
    })
    console.log(`🔍 Filtrados: ${filtered.length}/${source.length} | Turnos: ${turnoFilter} | Status: ${statusFilter} | Mostrar entregues: ${showEntregues}`)
    return filtered
  }, [pedidos, filaPedidos, viewMode, turnoFilter, statusFilter, showEntregues])

  const mapCenter: [number, number] = useMemo(() => {
    const withCoords = filteredPedidos.filter((p) => p.lat && p.lng)
    if (withCoords.length === 0) return GOIANIA_CENTER
    const avgLat = withCoords.reduce((sum, p) => sum + (p.lat || 0), 0) / withCoords.length
    const avgLng = withCoords.reduce((sum, p) => sum + (p.lng || 0), 0) / withCoords.length
    return [avgLat, avgLng]
  }, [filteredPedidos])

  // Date navigation
  const dateChips = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 1))
  }, [])

  const toggleTurno = (turno: string) => {
    setTurnoFilter((prev) =>
      prev.includes(turno) ? prev.filter((t) => t !== turno) : [...prev, turno]
    )
  }

  const toggleStatus = (status: StatusFilter) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  return (
    <div className="flex h-[calc(100vh-200px)] gap-4 w-full">
      {/* Left Panel: Filters + List */}
      <div className="w-1/2 flex flex-col gap-3 overflow-hidden border-r border-slate-200">
        {/* Filter Bar - Consolidated */}
        <div className="bg-white p-3 border-b border-slate-200 rounded-lg space-y-2">
          {/* Visualizar (Data/Fila) */}
          <div className="flex gap-2 items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 w-16">Visualizar</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setViewMode('data')}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded font-medium transition ${
                  viewMode === 'data'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Calendar size={13} />
                Data: {pedidos.length}
              </button>
              <button
                onClick={() => setViewMode('fila')}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded font-medium transition ${
                  viewMode === 'fila'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Clock size={13} />
                Fila: {filaPedidos.length}
              </button>
            </div>
          </div>

          {/* Turnos */}
          <div className="flex gap-2 items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 w-16">Turnos</span>
            <div className="flex gap-1.5">
              {['MANHÃ', 'TARDE', 'NOITE'].map((turno) => (
                <button
                  key={turno}
                  onClick={() => toggleTurno(turno)}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                    turnoFilter.includes(turno)
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                  title={turno}
                >
                  {turno.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Status (incluindo Entregues) */}
          <div className="flex gap-2 items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 w-16">Status</span>
            <div className="flex gap-1.5">
              {(['⚠️', '🛵', '✅'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`text-xs px-3 py-1.5 rounded font-medium transition ${
                    statusFilter.includes(status)
                      ? 'text-white shadow-md'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                  style={{
                    backgroundColor: statusFilter.includes(status)
                      ? STATUS_COLORS[status]
                      : undefined,
                  }}
                  title={`${status} ${STATUS_LABELS[status]}`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Chips - only show if not viewing queue */}
        {viewMode === 'data' && (
        <div className="flex items-center gap-2 px-3 overflow-x-auto scroll-smooth whitespace-nowrap pb-2">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            className="btn btn-xs btn-ghost"
          >
            <ChevronLeft size={16} />
          </button>

          {dateChips.map((date) => {
            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
            const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')
            const dayOfWeekAbbr = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][date.getDay()]
            const dateStr = format(date, 'dd/MM')
            return (
              <button
                key={format(date, 'yyyy-MM-dd')}
                onClick={() => setSelectedDate(date)}
                className={`px-3 py-1 rounded text-sm font-medium transition whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : isToday
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {isToday
                  ? 'HOJE'
                  : `${dayOfWeekAbbr} ${dateStr}`}
              </button>
            )
          })}

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="btn btn-xs btn-ghost"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        )}

        {/* Refresh Button */}
        <div className="px-3">
          <button
            onClick={() => loadPedidos()}
            disabled={loading || geocodingPending}
            className="btn btn-sm btn-outline w-full gap-2"
          >
            <RotateCcw size={16} />
            {geocodingPending
              ? 'Geocodificando...'
              : loading
                ? 'Carregando...'
                : 'Atualizar'}
          </button>
        </div>

        {/* Pedidos List */}
        <div className="flex-1 overflow-y-auto px-3">
          {filteredPedidos.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Nenhum pedido encontrado</p>
              <p className="text-xs text-slate-400 mt-1">
                {viewMode === 'fila'
                  ? filaPedidos.length === 0
                    ? 'Nenhum pedido em fila'
                    : 'Verifique os filtros selecionados'
                  : pedidos.length === 0
                    ? 'Nenhum pedido de entrega para esta data'
                    : 'Verifique os filtros selecionados'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPedidos.map((pedido) => (
                <button
                  key={pedido.id}
                  onClick={() => setSelectedPedidoId(pedido.id)}
                  className={`w-full text-left p-2 rounded border-2 transition ${
                    selectedPedidoId === pedido.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="text-lg flex-shrink-0"
                      title={STATUS_LABELS[pedido.status_icon as StatusFilter]}
                    >
                      {pedido.status_icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {pedido.cliente || 'Cliente desconhecido'}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {!pedido.lat || !pedido.lng ? (
                          <span className="text-orange-600 dark:text-orange-400">📍 Sem localização</span>
                        ) : (
                          pedido.endereco_completo
                        )}
                      </p>
                      <div className="flex gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>{pedido.turno}</span>
                        {pedido.entregador && <span>•</span>}
                        {pedido.entregador && <span>{pedido.entregador}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Map */}
      <div className="w-1/2 rounded-lg overflow-hidden border border-slate-200 flex flex-col relative">
        {/* Map Theme Toggle */}
        <button
          onClick={() => setMapDarkMode(!mapDarkMode)}
          className="absolute top-3 right-3 z-[1000] bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 rounded shadow-lg transition text-sm font-medium"
          title="Alternar tema do mapa"
        >
          {mapDarkMode ? '☀️' : '🌙'}
        </button>

        {filteredPedidos.filter((p) => p.lat && p.lng).length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-500">
            <div className="text-center">
              <MapPin size={48} className="mx-auto mb-2 opacity-30" />
              <p>Nenhum pedido com localização</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={14}
            className="flex-1"
            key={`${format(selectedDate, 'yyyy-MM-dd')}-${viewMode}-${mapDarkMode}`}
          >
            <TileLayer
              url={mapDarkMode
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/positron/{z}/{x}/{y}{r}.png"
              }
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/attributions">CARTO</a>'
              maxZoom={20}
            />
            {/* Marcador fixo da Cantina como referência */}
            <Marker
              position={CANTINA_LOCATION}
              icon={createCantinasIcon()}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold text-purple-700">🏠 Cantina (Referência)</p>
                  <p className="text-slate-600 mt-1">{CANTINA_ADDRESS}</p>
                </div>
              </Popup>
            </Marker>
            {filteredPedidos.map(
              (pedido) =>
                pedido.lat &&
                pedido.lng && (
                  <Marker
                    key={pedido.id}
                    position={[pedido.lat, pedido.lng]}
                    icon={createStatusIcon(pedido.status_icon)}
                    eventHandlers={{
                      click: () => setSelectedPedidoId(pedido.id),
                    }}
                  >
                    <Popup>
                      <div className="w-56 text-sm">
                        <p className="font-bold text-slate-900 mb-1">{pedido.cliente}</p>
                        <p className="text-slate-700 mb-2">{pedido.endereco_completo}</p>

                        {pedido.complemento && (
                          <p className="text-xs text-slate-600 mb-2">Compl: {pedido.complemento}</p>
                        )}

                        <div className="space-y-1 text-xs text-slate-600 mb-3 border-t border-b py-2">
                          <div>
                            <span className="font-semibold">Bairro:</span> {pedido.bairro || '-'}
                          </div>
                          <div>
                            <span className="font-semibold">Turno:</span> {pedido.turno || '-'}
                          </div>
                          <div>
                            <span className="font-semibold">Status:</span>{' '}
                            {STATUS_LABELS[pedido.status_icon as StatusFilter]}
                          </div>
                          {pedido.entregador && (
                            <div>
                              <span className="font-semibold">Entregador:</span> {pedido.entregador}
                            </div>
                          )}
                        </div>

                        <a
                          href={`https://www.google.com/maps?q=${pedido.lat},${pedido.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-xs btn-outline w-full gap-1"
                        >
                          <ExternalLink size={12} />
                          Google Maps
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                )
            )}
          </MapContainer>
        )}
      </div>
    </div>
  )
}
