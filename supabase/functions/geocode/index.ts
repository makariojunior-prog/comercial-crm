import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Proxy de geocodificação — elimina CORS no GitHub Pages.
// Recebe POST JSON: { address: string, bairro?: string, cidade?: string }
// Retorna JSON: { lat, lng, query?, precision?, provider? } (lat/lng null em falha, status 200)
//
// Provedores: Photon (primário — Nominatim bloqueia IPs compartilhados do Supabase)
// com bias de localização para a Cantina, e Nominatim como fallback.
//
// Estratégia em cascata (máx. 4 queries, cada uma tenta Photon → Nominatim):
//   1. Endereço limpo (sem "0"/"S/N") + bairro/cidade se ainda não presentes
//   2. Endereço sem número da casa (números fora do OSM são causa comum de falha)
//   3. Apenas rua + cidade (centro aproximado da rua)
//   4. Apenas bairro + cidade (centróide do bairro — precision: 'bairro')
//
// IMPORTANTE: o endereco_completo do Cardápio Web JÁ contém cidade/UF
// ("Rua X, 99 - Bairro, Goiânia - GO"). Nesse caso nada é anexado.
// A cidade padrão é Goiânia (a Cantina fica em Goiânia-GO, nunca São Paulo).
// Resultados fora da região metropolitana de Goiânia são descartados.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHOTON_URL = 'https://photon.komoot.io/api/'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1000 // cortesia: max ~1 req/seg aos provedores
const TIMEOUT_MS = 10000 // 5s era curto para horários de pico
const DEFAULT_CITY = 'Goiânia - GO'
const MAX_ATTEMPTS = 4

// Bias de localização (Cantina — Jardim Santo Antônio, Goiânia)
const BIAS_LAT = -16.7323
const BIAS_LNG = -49.2535

// Sanidade: descarta resultados fora da região metropolitana de Goiânia (±~1°)
const BBOX = { latMin: -17.8, latMax: -15.7, lngMin: -50.4, lngMax: -48.2 }

function inBbox(lat: number, lng: number): boolean {
  return lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax
}

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

// Comparação sem acentos/caixa — "Goiânia" ≈ "goiania"
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// Remove números de casa inválidos que confundem o Nominatim: "0", "00", "S/N", "Sn", "s/nº"
function stripInvalidNumber(addr: string): string {
  return addr
    .replace(/,\s*(?:0+|s\/?n[ºo°]?)\s*(?=-|,)/gi, ',')
    .replace(/,\s*(?:0+|s\/?n[ºo°]?)\s*$/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*-/g, ' -')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Remove o número da casa (válido) para o fallback nº 2
function stripHouseNumber(addr: string): string {
  return addr
    .replace(/,\s*\d+\s*[a-zA-Z]?\s*(?=-|,)/, ',')
    .replace(/,\s*-/g, ' -')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

interface Candidate {
  query: string
  precision: 'endereco' | 'rua' | 'bairro'
}

function buildQueries(
  rawAddress: string,
  bairro?: string | null,
  cidade?: string | null
): Candidate[] {
  const addr = stripInvalidNumber(rawAddress.replace(/\s{2,}/g, ' ').trim())
  const nAddr = normalize(addr)

  // Endereço já contém cidade/UF? (ex.: termina em "Goiânia - GO")
  const hasCityUF = /-\s*[A-Za-z]{2}\s*$/.test(addr)
  const hasCidade = cidade ? nAddr.includes(normalize(cidade)) : false
  const cityPart = hasCityUF || hasCidade ? '' : (cidade?.trim() || DEFAULT_CITY)
  const bairroPart = bairro && !nAddr.includes(normalize(bairro)) ? bairro.trim() : ''

  // Cidade a usar nos fallbacks curtos: extraída do próprio endereço quando presente
  const cityForFallback = hasCityUF
    ? addr.split(',').slice(-1)[0].trim()
    : cidade?.trim() || DEFAULT_CITY

  const candidates: Candidate[] = []
  const push = (query: string, precision: Candidate['precision']) => {
    const clean = query.replace(/\s{2,}/g, ' ').trim()
    if (clean && !candidates.some((c) => c.query === clean)) {
      candidates.push({ query: clean, precision })
    }
  }

  // 1. Endereço completo limpo
  push([addr, bairroPart, cityPart].filter(Boolean).join(', '), 'endereco')

  // 2. Sem número da casa
  const noNumber = stripHouseNumber(addr)
  if (noNumber !== addr) {
    push([noNumber, bairroPart, cityPart].filter(Boolean).join(', '), 'rua')
  }

  // 3. Apenas rua + cidade
  const street = rawAddress.split(',')[0].trim()
  push([street, cityForFallback].filter(Boolean).join(', '), 'rua')

  // 4. Apenas bairro + cidade (centróide — melhor que "sem localização")
  if (bairro && bairro.trim()) {
    push([bairro.trim(), cityForFallback].filter(Boolean).join(', '), 'bairro')
  }

  return candidates.slice(0, MAX_ATTEMPTS)
}

interface GeoResult {
  lat: number
  lng: number
  provider: 'photon' | 'nominatim'
}

// Photon (komoot) — primário: OSM-based, aceita chamadas server-side,
// suporta bias de localização. Retorna GeoJSON ([lng, lat]).
async function searchPhoton(query: string): Promise<GeoResult | null> {
  await throttle()
  try {
    const response = await fetch(
      `${PHOTON_URL}?${new URLSearchParams({
        q: query,
        limit: '3',
        lat: String(BIAS_LAT),
        lon: String(BIAS_LNG),
      })}`,
      {
        headers: { 'User-Agent': 'comercial-crm-geocoder' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    )

    if (!response.ok) {
      console.warn(`[geocode] Photon HTTP ${response.status} para "${query}"`)
      return null
    }

    const data = await response.json()
    const features = Array.isArray(data?.features) ? data.features : []
    for (const f of features) {
      if (f?.properties?.countrycode !== 'BR') continue
      const [lng, lat] = f?.geometry?.coordinates ?? []
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (!inBbox(lat, lng)) {
        console.warn(`[geocode] Photon fora da região para "${query}": ${lat}, ${lng}`)
        continue
      }
      console.log(`[geocode] ✓ photon "${query}" -> ${lat}, ${lng} (${f.properties?.name ?? ''}, ${f.properties?.city ?? ''})`)
      return { lat, lng, provider: 'photon' }
    }

    console.warn(`[geocode] ✗ photon sem resultados para "${query}"`)
    return null
  } catch (error) {
    console.warn(
      `[geocode] ✗ photon erro/timeout para "${query}":`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

// Nominatim — fallback (bloqueia IPs compartilhados do Supabase com frequência)
async function searchNominatim(query: string): Promise<GeoResult | null> {
  await throttle()
  try {
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
      console.warn(`[geocode] Nominatim HTTP ${response.status} para "${query}"`)
      return null
    }

    const results = await response.json()
    if (Array.isArray(results) && results.length > 0) {
      const { lat, lon, display_name } = results[0]
      const parsed = { lat: parseFloat(lat), lng: parseFloat(lon) }
      if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null
      if (!inBbox(parsed.lat, parsed.lng)) {
        console.warn(`[geocode] Nominatim fora da região para "${query}": ${display_name}`)
        return null
      }
      console.log(`[geocode] ✓ nominatim "${query}" -> ${parsed.lat}, ${parsed.lng} (${display_name})`)
      return { ...parsed, provider: 'nominatim' }
    }

    console.warn(`[geocode] ✗ nominatim sem resultados para "${query}"`)
    return null
  } catch (error) {
    // Timeout/erro de rede em uma tentativa NÃO aborta a cascata
    console.warn(
      `[geocode] ✗ nominatim erro/timeout para "${query}":`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

async function geocodeQuery(query: string): Promise<GeoResult | null> {
  return (await searchPhoton(query)) ?? (await searchNominatim(query))
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

    const candidates = buildQueries(address, bairro, cidade)
    console.log(
      `[geocode] Endereço: "${address}" | bairro: "${bairro ?? ''}" | cidade: "${cidade ?? ''}" | ${candidates.length} tentativas`
    )

    for (const { query, precision } of candidates) {
      const result = await geocodeQuery(query)
      if (result) {
        return new Response(
          JSON.stringify({ ...result, query, precision }),
          { headers: JSON_HEADERS }
        )
      }
    }

    console.warn(`[geocode] FALHA TOTAL após ${candidates.length} tentativas: "${address}"`)
    return new Response(JSON.stringify({ lat: null, lng: null }), {
      headers: JSON_HEADERS,
    })
  } catch (error) {
    console.error('[geocode] Erro:', error)
    return new Response(JSON.stringify({ lat: null, lng: null }), {
      status: 200,
      headers: JSON_HEADERS,
    })
  }
})
