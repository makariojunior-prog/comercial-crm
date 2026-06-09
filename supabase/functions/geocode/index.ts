import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Proxy de geocodificação Nominatim — elimina CORS no GitHub Pages.
// Recebe POST JSON: { address: string, bairro?: string, cidade?: string }
// Retorna JSON: { lat: number | null, lng: number | null }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1000 // Nominatim exige max 1 req/seg
const TIMEOUT_MS = 5000

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

// Throttle interno (por worker): garante intervalo mínimo entre chamadas ao Nominatim
let lastRequestAt = 0

async function throttle(): Promise<void> {
  const now = Date.now()
  const wait = lastRequestAt + RATE_LIMIT_MS - now
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  lastRequestAt = Date.now()
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: JSON_HEADERS,
    })
  }

  try {
    const { address, bairro, cidade } = await req.json()

    if (!address || typeof address !== 'string' || !address.trim()) {
      return new Response(
        JSON.stringify({ lat: null, lng: null, error: 'address required' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const query = [address, bairro, cidade || 'São Paulo']
      .filter(Boolean)
      .join(', ')
      .trim()

    await throttle()

    const response = await fetch(
      `${NOMINATIM_URL}?${new URLSearchParams({
        q: query,
        format: 'json',
        countrycodes: 'br',
        limit: '1',
      })}`,
      {
        headers: { 'User-Agent': 'comercial-crm-geocoder' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    )

    if (!response.ok) {
      console.warn(`Nominatim respondeu ${response.status} para "${query}"`)
      return new Response(JSON.stringify({ lat: null, lng: null }), {
        status: 200,
        headers: JSON_HEADERS,
      })
    }

    const results = await response.json()
    if (Array.isArray(results) && results.length > 0) {
      const { lat, lon } = results[0]
      const parsed = { lat: parseFloat(lat), lng: parseFloat(lon) }
      console.log(`Geocoded "${query}" -> ${parsed.lat}, ${parsed.lng}`)
      return new Response(JSON.stringify(parsed), { headers: JSON_HEADERS })
    }

    return new Response(JSON.stringify({ lat: null, lng: null }), {
      headers: JSON_HEADERS,
    })
  } catch (error) {
    console.error('Geocoding error:', error)
    return new Response(JSON.stringify({ lat: null, lng: null }), {
      status: 200,
      headers: JSON_HEADERS,
    })
  }
})
