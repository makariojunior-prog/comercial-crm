import { useEffect, useState, useRef } from 'react'
import { Radio, Wifi, WifiOff, RefreshCw, MapPin, Gauge } from 'lucide-react'
import { fetchPositions, loadCredentials } from '../lib/velotrack'
import type { VelotrackPosition } from '../types'

const REFRESH_MS = 60_000

export default function TrackingWidget() {
  const [positions, setPositions] = useState<VelotrackPosition[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState(false)
  const [hasCreds, setHasCreds] = useState(() => !!loadCredentials())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(true)

  async function load() {
    if (!activeRef.current) return
    setLoading(true)
    setError(false)
    try {
      const data = await fetchPositions()
      if (!activeRef.current) return
      setPositions(Array.isArray(data) ? data : [])
      setLastUpdate(new Date())
    } catch {
      if (activeRef.current) setError(true)
    } finally {
      if (activeRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    activeRef.current = true
    if (!hasCreds) return
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => {
      activeRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [hasCreds])

  if (!hasCreds) return null
  if (!loading && positions.length === 0 && !error) return null

  const moving  = positions.filter(p => p.connected && p.offline_hours <= 1)
  const stopped = positions.filter(p => !p.connected && p.offline_hours <= 1)
  const offline = positions.filter(p => p.offline_hours > 1)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio size={15} className="text-green-500" />
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Rastreamento</span>
          {positions.length > 0 && (
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full px-1.5 py-0.5 font-bold">
              {positions.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-[10px] text-slate-400">
              {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={load} disabled={loading} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="#/logistica" className="text-xs text-orange-500 hover:underline font-medium">Ver tudo →</a>
        </div>
      </div>

      {/* Totais */}
      {positions.length > 0 && (
        <div className="flex gap-2 mb-3">
          {moving.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-900/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-bold text-green-700 dark:text-green-300">{moving.length} em rota</span>
            </div>
          )}
          {stopped.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{stopped.length} parado{stopped.length > 1 ? 's' : ''}</span>
            </div>
          )}
          {offline.length > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20">
              <WifiOff size={11} className="text-red-500" />
              <span className="text-[11px] font-bold text-red-600 dark:text-red-400">{offline.length} offline</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 text-center py-2">Falha ao buscar posições. Verifique a conexão.</p>
      )}

      {loading && positions.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">Buscando posições...</p>
      )}

      <div className="space-y-1.5">
        {positions.map(p => {
          const isMoving  = p.connected && p.offline_hours <= 1
          const isOffline = p.offline_hours > 1
          const lat = parseFloat(p.latitude)
          const lng = parseFloat(p.longitude)
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
          const speed = (p as any).speed as number | undefined
          const time = p.command_date
            ? new Date(p.command_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : null

          return (
            <div key={p.iddevice}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">

              {/* Status dot */}
              <div className={`shrink-0 w-2 h-2 rounded-full ${
                isOffline ? 'bg-red-400' : isMoving ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
              }`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {p.description || p.vehicle_code}
                  </span>
                  {p.driver && (
                    <span className="text-slate-400 dark:text-slate-500 truncate">· {p.driver}</span>
                  )}
                </div>
                {p.address && (
                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-0.5 mt-0.5">
                    <MapPin size={9} className="shrink-0" />
                    {p.address}
                  </p>
                )}
              </div>

              {/* Right side */}
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                {speed != null && speed > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    <Gauge size={9} /> {speed} km/h
                  </span>
                )}
                {isOffline ? (
                  <span className="text-[10px] text-red-400 font-bold flex items-center gap-0.5">
                    <WifiOff size={9} /> {p.offline_hours}h
                  </span>
                ) : (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-orange-500 hover:underline flex items-center gap-0.5 font-medium">
                    <Wifi size={9} /> {time ?? 'ver'}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
