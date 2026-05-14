import { useEffect, useState } from 'react'
import { AlertTriangle, Car, ShieldCheck, FileText, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { docExpiryStatus, daysUntil } from '../types'

interface AlertItem {
  vehicleId: string
  apelido: string
  placa: string | null
  type: 'seguro' | 'ipva' | 'crlv' | 'cnh'
  label: string
  date: string
  days: number
}

const TYPE_ICONS = {
  seguro: ShieldCheck,
  ipva:   CreditCard,
  crlv:   FileText,
  cnh:    Car,
}

const STATUS_STYLES = {
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  danger:  'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
}

export default function VehicleAlertsWidget() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: vehicles } = await supabase
        .from('crm_vehicles')
        .select('id, apelido, placa, venc_seguro, venc_ipva, crlv_vencimento, ativo')
        .eq('ativo', true)

      const { data: drivers } = await supabase
        .from('crm_drivers')
        .select('id, nome, cnh_vencimento, ativo')
        .eq('ativo', true)
        .not('cnh_vencimento', 'is', null)

      const items: AlertItem[] = []

      for (const v of vehicles ?? []) {
        const checks: { type: AlertItem['type']; label: string; date: string | null }[] = [
          { type: 'seguro', label: 'Seguro',   date: v.venc_seguro },
          { type: 'ipva',   label: 'IPVA',     date: v.venc_ipva },
          { type: 'crlv',   label: 'CRLV',     date: v.crlv_vencimento },
        ]
        for (const c of checks) {
          const st = docExpiryStatus(c.date)
          if (st === 'expired' || st === 'danger' || st === 'warning') {
            items.push({
              vehicleId: v.id, apelido: v.apelido, placa: v.placa,
              type: c.type, label: c.label, date: c.date!,
              days: daysUntil(c.date) ?? 0,
            })
          }
        }
      }

      for (const d of drivers ?? []) {
        const st = docExpiryStatus(d.cnh_vencimento)
        if (st === 'expired' || st === 'danger' || st === 'warning') {
          items.push({
            vehicleId: d.id, apelido: d.nome, placa: null,
            type: 'cnh', label: 'CNH', date: d.cnh_vencimento!,
            days: daysUntil(d.cnh_vencimento) ?? 0,
          })
        }
      }

      items.sort((a, b) => a.days - b.days)
      setAlerts(items)
      setLoading(false)
    }
    load()
  }, [])

  if (loading || alerts.length === 0) return null

  const expired = alerts.filter(a => a.days < 0)
  const urgent  = alerts.filter(a => a.days >= 0 && a.days <= 14)
  const warn    = alerts.filter(a => a.days > 14)

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-500" />
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Alertas de Frota</span>
          <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{alerts.length}</span>
        </div>
        <a href="#/logistica" className="text-xs text-orange-500 hover:underline font-medium">Ver frota →</a>
      </div>

      <div className="space-y-1.5">
        {alerts.slice(0, 6).map((a, i) => {
          const Icon = TYPE_ICONS[a.type]
          const st = docExpiryStatus(a.date)!
          const styles = STATUS_STYLES[st as keyof typeof STATUS_STYLES] || STATUS_STYLES.warning
          return (
            <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs ${styles}`}>
              <Icon size={13} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold">{a.apelido}</span>
                {a.placa && <span className="ml-1 opacity-75">· {a.placa}</span>}
                <span className="ml-1">— {a.label}</span>
              </div>
              <span className="shrink-0 font-bold">
                {a.days < 0 ? `Vencido há ${Math.abs(a.days)}d` : a.days === 0 ? 'Vence hoje!' : `${a.days}d`}
              </span>
            </div>
          )
        })}
        {alerts.length > 6 && (
          <p className="text-xs text-slate-400 text-center pt-1">+{alerts.length - 6} alertas adicionais na frota</p>
        )}
      </div>

      {expired.length > 0 && (
        <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
          ⚠️ {expired.length} documento{expired.length > 1 ? 's' : ''} vencido{expired.length > 1 ? 's' : ''} — atenção à circulação dos veículos!
        </div>
      )}
    </div>
  )
}
