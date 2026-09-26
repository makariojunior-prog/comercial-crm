import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { LojaDeliveryStatus } from '../types'

export function useDeliveryStatus() {
  const [statuses, setStatuses] = useState<LojaDeliveryStatus[]>([])
  const [loading, setLoading] = useState(true)

  const fetchStatuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('lojas_delivery_status')
        .select('*')
        .order('canal', { ascending: true })

      if (!error && data) {
        setStatuses(data as LojaDeliveryStatus[])
      }
    } catch (err) {
      console.error('Erro ao buscar status dos deliveries:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatuses()

    // Inscreve no Supabase Realtime para updates instantâneos
    const channel = supabase
      .channel('delivery_status_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lojas_delivery_status' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newRow = payload.new as LojaDeliveryStatus
            setStatuses((prev) => {
              const idx = prev.findIndex((s) => s.canal === newRow.canal)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = newRow
                return next
              }
              return [...prev, newRow]
            })
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { canal?: string }
            if (oldRow?.canal) {
              setStatuses((prev) => prev.filter((s) => s.canal !== oldRow.canal))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchStatuses])

  const status99 = statuses.find((s) => s.canal === '99FOOD') ?? null
  const statusIfood = statuses.find((s) => s.canal === 'IFOOD') ?? null
  const hasAlert = statuses.some((s) => s.alerta_ativo || (s.canal === '99FOOD' && s.status !== 'OPEN'))

  return {
    statuses,
    status99,
    statusIfood,
    hasAlert,
    loading,
    refetch: fetchStatuses,
  }
}
