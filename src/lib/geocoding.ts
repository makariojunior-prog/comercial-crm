import { supabase } from './supabase'
import type { VarejoPedido } from '../types'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1100 // 1 req/sec (rate limit: nominatim allows 1 req/sec)

interface GeocodingResult {
  lat: number
  lng: number
}

/**
 * Geocodifica um endereço via Nominatim com CORS proxy.
 * Evita bloqueio de CORS no GitHub Pages.
 * Rate limit: 1 request/segundo (respeitado pelo chamador).
 */
export async function geocodeAddress(
  address: string,
  bairro: string | null,
  cidade: string = 'São Paulo'
): Promise<GeocodingResult | null> {
  if (!address || !address.trim()) return null
  return geocodeViaNominatim(address, bairro, cidade)
}

/**
 * Chamada ao Nominatim via CORS proxy público.
 * Evita bloqueio CORS no GitHub Pages.
 * Rate limit: 1 request/segundo respeitado pelo chamador.
 */
async function geocodeViaNominatim(
  address: string,
  bairro: string | null,
  cidade: string
): Promise<GeocodingResult | null> {
  try {
    const query = [address, bairro, cidade]
      .filter(Boolean)
      .join(', ')
      .trim()

    const nominatimUrl = `${NOMINATIM_BASE}?${new URLSearchParams({
      q: query,
      format: 'json',
      countrycodes: 'br',
      limit: '1',
    }).toString()}`

    // Use public CORS proxy to avoid GitHub Pages CORS blocking
    // Note: corsproxy.io works for browser requests (blocked for Node.js/server requests)
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(nominatimUrl)}`

    const response = await fetch(corsProxyUrl, {
      headers: {
        'User-Agent': 'comercial-crm-logistica',
      },
    })

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

  console.log(`🌍 Iniciando geocodificação de ${pending.length} pedidos...`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < pending.length; i++) {
    const pedido = pending[i]
    if (i > 0) await sleep(RATE_LIMIT_MS) // Aguarda entre requisições

    const coords = await geocodeAddress(pedido.endereco_completo || '', pedido.bairro)
    if (!coords) {
      failCount++
      console.warn(
        `⚠️ Falha ao geocodificar: ${pedido.cliente} (${pedido.endereco_completo})`
      )
      continue
    }

    try {
      const { error } = await supabase
        .from('varejo_pedidos')
        .update({
          lat: coords.lat,
          lng: coords.lng,
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', pedido.id)

      if (error) {
        console.error(`❌ Erro ao salvar coords para ${pedido.num_pedido}:`, error)
        failCount++
      } else {
        successCount++
        console.log(
          `✅ ${pedido.num_pedido}: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
        )
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
