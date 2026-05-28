import type { VelotrackPosition } from '../types'

const BASE = 'https://track.velotrack.com.br/api/index.php'
const LS_CREDS = 'crm_velotrack_creds'
const LS_SESSION = 'crm_velotrack_session'

export interface VelotrackCredentials {
  login: string
  password: string
}

interface VelotrackSession {
  uid: string
  browser: string
  idcustomer: number
  iduser: number
  expiresAt: number
}

// Compact MD5 implementation (RFC 1321)
function md5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    return ((((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff)) >>> 0
  }
  function rol(n: number, c: number) { return (n << c) | (n >>> (32 - c)) }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t)
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t)
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t)
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t)

  function strToUint8(s: string): Uint8Array {
    const bytes: number[] = []
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c < 128) bytes.push(c)
      else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)) }
      else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)) }
    }
    return new Uint8Array(bytes)
  }

  const bytes = strToUint8(str)
  const len = bytes.length
  const words: number[] = new Array(Math.ceil((len + 9) / 64) * 16).fill(0)
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8)
  words[len >> 2] |= 0x80 << ((len % 4) * 8)
  words[words.length - 2] = len * 8

  let [a, b, c, d] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476]

  for (let i = 0; i < words.length; i += 16) {
    const [A, B, C, D] = [a, b, c, d]
    const w = words.slice(i, i + 16)
    a=ff(a,b,c,d,w[0],7,-680876936);d=ff(d,a,b,c,w[1],12,-389564586);c=ff(c,d,a,b,w[2],17,606105819);b=ff(b,c,d,a,w[3],22,-1044525330)
    a=ff(a,b,c,d,w[4],7,-176418897);d=ff(d,a,b,c,w[5],12,1200080426);c=ff(c,d,a,b,w[6],17,-1473231341);b=ff(b,c,d,a,w[7],22,-45705983)
    a=ff(a,b,c,d,w[8],7,1770035416);d=ff(d,a,b,c,w[9],12,-1958414417);c=ff(c,d,a,b,w[10],17,-42063);b=ff(b,c,d,a,w[11],22,-1990404162)
    a=ff(a,b,c,d,w[12],7,1804603682);d=ff(d,a,b,c,w[13],12,-40341101);c=ff(c,d,a,b,w[14],17,-1502002290);b=ff(b,c,d,a,w[15],22,1236535329)
    a=gg(a,b,c,d,w[1],5,-165796510);d=gg(d,a,b,c,w[6],9,-1069501632);c=gg(c,d,a,b,w[11],14,643717713);b=gg(b,c,d,a,w[0],20,-373897302)
    a=gg(a,b,c,d,w[5],5,-701558691);d=gg(d,a,b,c,w[10],9,38016083);c=gg(c,d,a,b,w[15],14,-660478335);b=gg(b,c,d,a,w[4],20,-405537848)
    a=gg(a,b,c,d,w[9],5,568446438);d=gg(d,a,b,c,w[14],9,-1019803690);c=gg(c,d,a,b,w[3],14,-187363961);b=gg(b,c,d,a,w[8],20,1163531501)
    a=gg(a,b,c,d,w[13],5,-1444681467);d=gg(d,a,b,c,w[2],9,-51403784);c=gg(c,d,a,b,w[7],14,1735328473);b=gg(b,c,d,a,w[12],20,-1926607734)
    a=hh(a,b,c,d,w[5],4,-378558);d=hh(d,a,b,c,w[8],11,-2022574463);c=hh(c,d,a,b,w[11],16,1839030562);b=hh(b,c,d,a,w[14],23,-35309556)
    a=hh(a,b,c,d,w[1],4,-1530992060);d=hh(d,a,b,c,w[4],11,1272893353);c=hh(c,d,a,b,w[7],16,-155497632);b=hh(b,c,d,a,w[10],23,-1094730640)
    a=hh(a,b,c,d,w[13],4,681279174);d=hh(d,a,b,c,w[0],11,-358537222);c=hh(c,d,a,b,w[3],16,-722521979);b=hh(b,c,d,a,w[6],23,76029189)
    a=hh(a,b,c,d,w[9],4,-640364487);d=hh(d,a,b,c,w[12],11,-421815835);c=hh(c,d,a,b,w[15],16,530742520);b=hh(b,c,d,a,w[2],23,-995338651)
    a=ii(a,b,c,d,w[0],6,-198630844);d=ii(d,a,b,c,w[7],10,1126891415);c=ii(c,d,a,b,w[14],15,-1416354905);b=ii(b,c,d,a,w[5],21,-57434055)
    a=ii(a,b,c,d,w[12],6,1700485571);d=ii(d,a,b,c,w[3],10,-1894986606);c=ii(c,d,a,b,w[10],15,-1051523);b=ii(b,c,d,a,w[1],21,-2054922799)
    a=ii(a,b,c,d,w[8],6,1873313359);d=ii(d,a,b,c,w[15],10,-30611744);c=ii(c,d,a,b,w[6],15,-1560198380);b=ii(b,c,d,a,w[13],21,1309151649)
    a=ii(a,b,c,d,w[4],6,-145523070);d=ii(d,a,b,c,w[11],10,-1120210379);c=ii(c,d,a,b,w[2],15,718787259);b=ii(b,c,d,a,w[9],21,-343485551)
    a = safeAdd(a, A); b = safeAdd(b, B); c = safeAdd(c, C); d = safeAdd(d, D)
  }

  return [a, b, c, d].map(n =>
    Array.from({ length: 4 }, (_, i) => ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('')
  ).join('')
}

// Credencial compartilhada padrão — usada quando nenhuma credencial personalizada está salva
const DEFAULT_CREDS: VelotrackCredentials = {
  login: 'integracao@gmail.com',
  password: '!Cantina26012019',
}

export function saveCredentials(creds: VelotrackCredentials) {
  localStorage.setItem(LS_CREDS, JSON.stringify(creds))
  localStorage.removeItem(LS_SESSION)
}

export function loadCredentials(): VelotrackCredentials {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_CREDS) || 'null')
    return saved ?? DEFAULT_CREDS
  } catch { return DEFAULT_CREDS }
}

export function clearCredentials() {
  localStorage.removeItem(LS_CREDS)
  localStorage.removeItem(LS_SESSION)
}

function loadSession(): VelotrackSession | null {
  try {
    const s: VelotrackSession = JSON.parse(localStorage.getItem(LS_SESSION) || 'null')
    if (s && s.expiresAt > Date.now()) return s
    return null
  } catch { return null }
}

async function authenticate(creds: VelotrackCredentials): Promise<VelotrackSession> {
  const ts = Math.floor(Date.now() / 1000) // Unix timestamp in seconds
  const ua = 'CRM-Comercial/1.0'
  const descUid = md5(`${creds.login}:${md5(creds.password)}:${ts}`)

  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desc_uid: descUid, desc_useragent: ua, desc_data: String(ts) }),
  })
  if (!res.ok) throw new Error(`Login Velotrack falhou: ${res.status}`)
  const data = await res.json()

  const session: VelotrackSession = {
    uid: data.desc_uid_retorno,
    browser: ua,
    idcustomer: data.idcustomer,
    iduser: data.iduser,
    expiresAt: Date.now() + 3 * 60 * 60 * 1000, // 3h
  }
  localStorage.setItem(LS_SESSION, JSON.stringify(session))
  return session
}

async function getSession(): Promise<VelotrackSession> {
  const cached = loadSession()
  if (cached) return cached
  const creds = loadCredentials()
  if (!creds) throw new Error('Credenciais Velotrack não configuradas')
  return authenticate(creds)
}

export async function fetchPositions(): Promise<VelotrackPosition[]> {
  const session = await getSession()
  const res = await fetch(`${BASE}/mobile/${session.idcustomer}/positionv2`, {
    headers: { uid: session.uid, browser: session.browser },
  })
  if (!res.ok) throw new Error(`Erro ao buscar posições: ${res.status}`)
  return res.json()
}
