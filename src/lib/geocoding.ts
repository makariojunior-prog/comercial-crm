import { supabase } from './supabase'
import type { VarejoPedido } from '../types'

const RATE_LIMIT_MS = 1100

interface GeocodingResult {
  lat: number
  lng: number
}

export async function geocodeAddress(
  address: string,
  bairro: string | null,
  cidade?: string
): Promise<GeocodingResult | null> {
  if (!address || !address.trim()) return null
  return geocodeViaEdgeFunction(address, bairro, cidade)
}

/**
 * Chamada à Edge Function do Supabase para geocodificação.
 * Evita CORS issues e rate limits via servidor confiável.
 */
async function geocodeViaEdgeFunction(
  address: string,
  bairro: string | null,
  cidade?: string
): Promise<GeocodingResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('geocode', {
      body: { address, bairro, cidade },
    })

    if (error) {
      console.warn(`⚠️ Edge Function error for "${address}":`, error)
      return null
    }

    if (data?.lat && data?.lng) {
      // precision: 'endereco' | 'rua' | 'bairro' (bairro = centróide aproximado)
      console.log(
        `✅ Geocoded: ${address} → ${data.lat}, ${data.lng}` +
          (data.precision ? ` [${data.precision}: "${data.query}"]` : '')
      )
      return { lat: data.lat, lng: data.lng }
    }

    console.warn(`❌ No results for "${address}"`)
    return null
  } catch (error) {
    console.warn(`Geocoding error for "${address}":`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Geocodifica lotes de pedidos sem coords.
 * Respeita rate limit de 1 req/seg.
 */
export async function geocodePendingPedidos(pedidos: VarejoPedido[]): Promise<void> {
  const pending = pedidos.filter((p) => !p.lat || !p.lng)
  if (pending.length === 0) return

  console.log(`🌍 Iniciando geocodificação de ${pending.length} pedidos...`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < pending.length; i++) {
    const pedido = pending[i]
    if (i > 0) await sleep(RATE_LIMIT_MS)

    const coords = await geocodeAddress(pedido.endereco_completo || '', pedido.bairro)
    if (!coords) {
      failCount++
      console.warn(`⚠️ Falha ao geocodificar: ${pedido.cliente} (${pedido.endereco_completo})`)

      try {
        await supabase
          .from('varejo_pedidos')
          .update({
            geocode_failed_at: new Date().toISOString(),
          })
          .eq('id', pedido.id)
      } catch (e) {
        console.error(`❌ Erro ao marcar falha: ${pedido.id}`)
      }
      continue
    }

    try {
      const { error } = await supabase
        .from('varejo_pedidos')
        .update({
          lat: coords.lat,
          lng: coords.lng,
          geocoded_at: new Date().toISOString(),
          geocode_failed_at: null,
        })
        .eq('id', pedido.id)

      if (error) {
        console.error(`❌ Erro ao salvar coords para ${pedido.num_pedido}:`, error)
        failCount++
      } else {
        successCount++
        console.log(`✅ ${pedido.num_pedido}: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`)
      }
    } catch (error) {
      console.error(`❌ Exceção ao salvar ${pedido.id}:`, error)
      failCount++
    }
  }

  console.log(`✅ Geocodificação concluída: ${successCount} ✓, ${failCount} ✗`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
