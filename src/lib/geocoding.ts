import { supabase } from './supabase'
import type { VarejoPedido } from '../types'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1100 // 1 req/sec (rate limit: nominatim allows 1 req/sec)

interface GeocodingResult {
  lat: number
  lng: number
}

/**
 * Chama Nominatim para geocodificar um endereço.
 * Rate limit: 1 request/segundo. O Nominatim aguenta esse throughput.
 */
export async function geocodeAddress(
  address: string,
  bairro: string | null,
  cidade: string = 'São Paulo'
): Promise<GeocodingResult | null> {
  if (!address || !address.trim()) return null

  try {
    const query = [address, bairro, cidade]
      .filter(Boolean)
      .join(', ')
      .trim()

    const response = await fetch(
      `${NOMINATIM_BASE}?${new URLSearchParams({
        q: query,
        format: 'json',
        countrycodes: 'br',
        limit: '1',
      })}`,
      {
        headers: {
          'User-Agent': 'comercial-crm-logistica', // Required by Nominatim
        },
      }
    )

    if (!response.ok) return null

    const results = (await response.json()) as any[]
    if (Array.isArray(results) && results.length > 0) {
      const { lat, lon } = results[0]
      return { lat: parseFloat(lat), lng: parseFloat(lon) }
    }
  } catch (error) {
    console.warn(`Geocoding failed for "${address}"`, error)
  }

  return null
}

/**
 * Geocodifica lotes de pedidos sem coords.
 * Respeita rate limit de 1 req/seg.
 */
export async function geocodePendingPedidos(pedidos: VarejoPedido[]): Promise<void> {
  const pending = pedidos.filter((p) => !p.lat || !p.lng)
  if (pending.length === 0) return

  console.log(`🌍 Geocodificando ${pending.length} pedidos...`)

  for (let i = 0; i < pending.length; i++) {
    const pedido = pending[i]
    if (i > 0) await sleep(RATE_LIMIT_MS) // Aguarda entre requisições

    const coords = await geocodeAddress(pedido.endereco_completo || '', pedido.bairro)
    if (!coords) continue

    try {
      await supabase
        .from('varejo_pedidos')
        .update({
          lat: coords.lat,
          lng: coords.lng,
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', pedido.id)
    } catch (error) {
      console.error(`Erro ao salvar coords para pedido ${pedido.id}`, error)
    }
  }

  console.log(`✅ Geocodificação concluída`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
