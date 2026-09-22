# Logística — Mapa de Entregas e Rastreamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover a integração de rastreamento de frota (Velotrack) para uma edge function autenticada usando os secrets `VT_USER`/`VT_PASS` já cadastrados (corrigindo a causa raiz do card quebrado e removendo credenciais hardcoded do bundle do cliente), corrigir a contagem inconsistente de veículos entre o Dashboard e a Logística, e desativar a aba "Mapa de Entregas".

**Architecture:** Uma edge function nova (`velotrack-positions`) autentica com a Velotrack no servidor e devolve a mesma lista de posições que o frontend já consumia. `src/lib/velotrack.ts` vira um cliente fino que só chama essa function. `TrackingWidget.tsx` e a `TrackingTab` dentro de `LogisticaPage.tsx` passam a usar a mesma regra de categorização (mutuamente exclusiva). A aba `mapa` é removida da navegação da Logística sem apagar `MapaEntregasTab.tsx`.

**Tech Stack:** React + TypeScript + Vite, Supabase JS client + Edge Functions (Deno), Tailwind.

**Nota sobre verificação:** este repositório não tem framework de testes configurado. Os passos de verificação usam `npx tsc -b tsconfig.app.json`, `npm run build`, deploy via MCP do Supabase e teste manual/curl.

---

### Task 1: Criar a edge function `velotrack-positions`

**Files:**
- Create: `supabase/functions/velotrack-positions/index.ts`

- [ ] **Step 1: Criar o arquivo da function**

```ts
// velotrack-positions — proxy autenticado para a API da Velotrack (rastreamento
// de frota). Credenciais ficam só no servidor (secrets VT_USER/VT_PASS), nunca
// no bundle do navegador. Autentica do zero a cada chamada (sem cache de sessão)
// para evitar o bug de sessão expirada que existia no cliente antigo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = 'https://track.velotrack.com.br/api/index.php';
const VT_USER = Deno.env.get('VT_USER') ?? '';
const VT_PASS = Deno.env.get('VT_PASS') ?? '';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// Implementação compacta de MD5 (RFC 1321) — mesma usada anteriormente no
// cliente (src/lib/velotrack.ts), só que agora roda no servidor.
function md5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return ((((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff)) >>> 0;
  }
  function rol(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t);

  function strToUint8(s: string): Uint8Array {
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) { bytes.push(192 | (c >> 6)); bytes.push(128 | (c & 63)); }
      else { bytes.push(224 | (c >> 12)); bytes.push(128 | ((c >> 6) & 63)); bytes.push(128 | (c & 63)); }
    }
    return new Uint8Array(bytes);
  }

  const bytes = strToUint8(str);
  const len = bytes.length;
  const words: number[] = new Array(Math.ceil((len + 9) / 64) * 16).fill(0);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[words.length - 2] = len * 8;

  let [a, b, c, d] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476];

  for (let i = 0; i < words.length; i += 16) {
    const [A, B, C, D] = [a, b, c, d];
    const w = words.slice(i, i + 16);
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
    a = safeAdd(a, A); b = safeAdd(b, B); c = safeAdd(c, C); d = safeAdd(d, D);
  }

  return [a, b, c, d].map(n =>
    Array.from({ length: 4 }, (_, i) => ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')).join('')
  ).join('');
}

interface VelotrackSession { uid: string; browser: string; idcustomer: number; }

async function authenticate(): Promise<VelotrackSession> {
  const ts = Math.floor(Date.now() / 1000);
  const ua = 'CRM-Comercial/1.0';
  const descUid = md5(`${VT_USER}:${md5(VT_PASS)}:${ts}`);

  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ desc_uid: descUid, desc_useragent: ua, desc_data: String(ts) }),
  });
  if (!res.ok) throw new Error(`Login Velotrack falhou: ${res.status}`);
  const data = await res.json();
  return { uid: data.desc_uid_retorno, browser: ua, idcustomer: data.idcustomer };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!VT_USER || !VT_PASS) {
      return new Response(JSON.stringify({ error: 'VT_USER/VT_PASS não configurados nos secrets do projeto' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const session = await authenticate();
    const res = await fetch(`${BASE}/mobile/${session.idcustomer}/positionv2`, {
      headers: { uid: session.uid, browser: session.browser },
    });
    if (!res.ok) throw new Error(`Erro ao buscar posições: ${res.status}`);
    const positions = await res.json();

    return new Response(JSON.stringify(positions), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('velotrack-positions:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/velotrack-positions/index.ts
git commit -m "$(cat <<'EOF'
feat: edge function velotrack-positions (proxy autenticado da Velotrack)

Credenciais (VT_USER/VT_PASS) ficam só nos secrets do servidor. Autentica
do zero a cada chamada, sem cache de sessão — evita o bug de sessão
expirada travando o card por até 3h.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(O deploy real desta function é feito na Task 5, junto com a verificação.)

---

### Task 2: `src/lib/velotrack.ts` vira cliente fino

**Files:**
- Modify: `src/lib/velotrack.ts` (reescrita completa)

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```ts
import { supabase } from './supabase'
import type { VelotrackPosition } from '../types'

export async function fetchPositions(): Promise<VelotrackPosition[]> {
  const { data, error } = await supabase.functions.invoke('velotrack-positions')
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}
```

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: vai falhar aqui, porque `TrackingWidget.tsx` e `LogisticaPage.tsx`
ainda importam `loadCredentials`/`saveCredentials`/`clearCredentials`, que
não existem mais neste arquivo. Isso é esperado — as Tasks 3 e 4 corrigem
esses imports. Não faça commit ainda; siga direto para a Task 3.

---

### Task 3: `src/components/TrackingWidget.tsx`

**Files:**
- Modify: `src/components/TrackingWidget.tsx`

- [ ] **Step 1: Remover o import de `loadCredentials`**

De:

```tsx
import { fetchPositions, loadCredentials } from '../lib/velotrack'
```

Para:

```tsx
import { fetchPositions } from '../lib/velotrack'
```

- [ ] **Step 2: Remover o estado `hasCreds` e simplificar o `useEffect`**

De:

```tsx
  const [hasCreds, setHasCreds] = useState(() => !!loadCredentials())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(true)
```

Para:

```tsx
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRef = useRef(true)
```

De:

```tsx
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
```

Para:

```tsx
  useEffect(() => {
    activeRef.current = true
    load()
    timerRef.current = setInterval(load, REFRESH_MS)
    return () => {
      activeRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  if (!loading && positions.length === 0 && !error) return null
```

Nenhuma outra parte do arquivo muda — a categorização `moving`/`stopped`/
`offline` aqui já está correta.

- [ ] **Step 3: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: ainda falha por causa de `LogisticaPage.tsx` (Task 4 resolve).
`TrackingWidget.tsx` em si não deve mais aparecer na lista de erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/velotrack.ts src/components/TrackingWidget.tsx
git commit -m "$(cat <<'EOF'
refactor: TrackingWidget e velotrack.ts usam a edge function autenticada

velotrack.ts vira um cliente fino que só chama velotrack-positions via
supabase.functions.invoke. Remove MD5, credenciais hardcoded e todo uso
de localStorage do lado do cliente. TrackingWidget remove o gate
hasCreds (sempre era true na prática — código morto).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `src/pages/LogisticaPage.tsx` — remove Mapa de Entregas e corrige Rastreamento

**Files:**
- Modify: `src/pages/LogisticaPage.tsx`

- [ ] **Step 1: Atualizar o import de `velotrack`**

De:

```tsx
import { fetchPositions, loadCredentials, saveCredentials, clearCredentials } from '../lib/velotrack'
```

Para:

```tsx
import { fetchPositions } from '../lib/velotrack'
```

- [ ] **Step 2: Remover `MapaEntregasTab` do import e do union type `Tab`**

De:

```tsx
import MapaEntregasTab from '../components/MapaEntregasTab'
```

Remover esta linha inteira.

De:

```tsx
type Tab = 'veiculos' | 'motoristas' | 'rastreamento' | 'romaneio' | 'rotas' | 'mapa' | 'custos' | 'conciliacao' | 'config_ocorrencias'
```

Para:

```tsx
type Tab = 'veiculos' | 'motoristas' | 'rastreamento' | 'romaneio' | 'rotas' | 'custos' | 'conciliacao' | 'config_ocorrencias'
```

- [ ] **Step 3: Substituir toda a função `TrackingTab`**

Localizar a função `TrackingTab` (começa em `function TrackingTab() {`,
logo depois do comentário `// ─── Rastreamento ─────`) e substituir
inteiramente por:

```tsx
function TrackingTab() {
  const [positions, setPositions] = useState<VelotrackPosition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError(null)
    try {
      const data = await fetchPositions()
      setPositions(Array.isArray(data) ? data : [])
    } catch (e: any) {
      const msg = e.message ?? 'Erro desconhecido'
      if (msg.toLowerCase().includes('cors') || msg.toLowerCase().includes('failed to fetch')) {
        setError('Erro de CORS: a API Velotrack bloqueou a requisição do navegador. Contate o suporte para configurar um proxy.')
      } else {
        setError(msg)
      }
    } finally { setLoading(false) }
  }

  const moving  = positions.filter(p => p.connected && p.offline_hours <= 1)
  const stopped = positions.filter(p => !p.connected && p.offline_hours <= 1)
  const offline = positions.filter(p => p.offline_hours > 1)

  return (
    <div className="space-y-4">
      {/* Header com stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-bold text-green-700 dark:text-green-300">{moving.length} em movimento</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{stopped.length} parados</span>
          </div>
          {offline.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <WifiOff size={12} className="text-red-500" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">{offline.length} offline</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {positions.length === 0 && !loading && !error && (
        <div className="card p-8 text-center text-slate-400">Nenhum veículo rastreado encontrado.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {positions.map(p => {
          const isMoving = p.connected && p.offline_hours <= 1
          const isOffline = p.offline_hours > 1
          const lat = parseFloat(p.latitude)
          const lng = parseFloat(p.longitude)
          const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`

          return (
            <div key={p.iddevice}
              className={`card p-4 border-l-4 ${isOffline ? 'border-l-red-400' : isMoving ? 'border-l-green-400' : 'border-l-slate-300'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{p.description || p.vehicle_code}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{p.vehicle_code}</p>
                </div>
                <div className="flex items-center gap-1">
                  {isOffline
                    ? <WifiOff size={14} className="text-red-400" />
                    : isMoving
                    ? <Wifi size={14} className="text-green-500" />
                    : <Wifi size={14} className="text-slate-400" />
                  }
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isOffline ? 'bg-red-100 text-red-600' : isMoving ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isOffline ? 'Offline' : isMoving ? 'Em rota' : 'Parado'}
                  </span>
                </div>
              </div>

              {p.driver && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">
                  <span className="font-medium">Motorista:</span> {p.driver}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span className="flex items-center gap-1">
                  <Gauge size={11} />
                  {typeof (p as any).speed === 'number' ? `${(p as any).speed} km/h` : '—'}
                </span>
                {p.odometer > 0 && (
                  <span>{Math.round(p.odometer / 1000)} mil km</span>
                )}
                {p.offline_hours > 0 && (
                  <span>{p.offline_hours}h atrás</span>
                )}
              </div>

              {p.address && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 line-clamp-2">
                  <MapPin size={10} className="shrink-0 mt-0.5" />
                  {p.address}
                </p>
              )}

              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {p.command_date ? new Date(p.command_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-orange-500 hover:underline font-medium">
                  <ExternalLink size={10} /> Ver no mapa
                </a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

Isso remove: o estado de credenciais (`creds`, `showConfig`), as funções
`saveCreds`/`resetCreds`, a tela de formulário de login/senha, e os
botões "Configurar credenciais" / "Restaurar credencial padrão". A
categorização `moving`/`stopped`/`offline` e o badge `isMoving` de cada
card passam a considerar `offline_hours <= 1`, ficando consistentes com
`TrackingWidget.tsx` e entre si (mutuamente exclusivas).

- [ ] **Step 4: Remover a entrada `mapa` do array `TABS`**

De:

```tsx
  const TABS = [
    { id: 'romaneio'     as Tab, label: 'Romaneio',          icon: FileText,    count: null },
    { id: 'conciliacao'  as Tab, label: 'Conciliação',       icon: ClipboardCheck, count: null },
    { id: 'rotas'        as Tab, label: 'Rotas de Entrega',  icon: Truck,       count: null },
    { id: 'mapa'         as Tab, label: 'Mapa de Entregas',  icon: MapPin,      count: null },
    { id: 'rastreamento' as Tab, label: 'Rastreamento',      icon: Radio,       count: null },
```

Para:

```tsx
  const TABS = [
    { id: 'romaneio'     as Tab, label: 'Romaneio',          icon: FileText,    count: null },
    { id: 'conciliacao'  as Tab, label: 'Conciliação',       icon: ClipboardCheck, count: null },
    { id: 'rotas'        as Tab, label: 'Rotas de Entrega',  icon: Truck,       count: null },
    { id: 'rastreamento' as Tab, label: 'Rastreamento',      icon: Radio,       count: null },
```

- [ ] **Step 5: Remover `mapa` da condição da barra de busca**

De:

```tsx
      {tab !== 'rastreamento' && tab !== 'romaneio' && tab !== 'rotas' && tab !== 'mapa' && tab !== 'custos' && (
```

Para:

```tsx
      {tab !== 'rastreamento' && tab !== 'romaneio' && tab !== 'rotas' && tab !== 'custos' && (
```

- [ ] **Step 6: Remover o branch de renderização `tab === 'mapa'`**

De:

```tsx
      ) : tab === 'mapa' ? (
        <MapaEntregasTab />
      ) : tab === 'custos' ? (
```

Para:

```tsx
      ) : tab === 'custos' ? (
```

- [ ] **Step 7: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/pages/LogisticaPage.tsx
git commit -m "$(cat <<'EOF'
feat(logistica): desativa Mapa de Entregas e corrige aba Rastreamento

Mapa de Entregas sai da lista de abas (sem cron/polling associado,
componente MapaEntregasTab.tsx preservado). Rastreamento perde a tela
de credenciais manuais (agora geridas via secret no servidor) e corrige
a contagem moving/stopped/offline para ficar mutuamente exclusiva,
igual ao card do Dashboard.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Deploy e verificação

**Files:** nenhum (deploy + checagem)

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 2: Deploy da function `velotrack-positions`**

Usar as ferramentas MCP do Supabase (mesmo fluxo já usado nas fases
anteriores desta sessão): `deploy_edge_function` com `project_id
taicaxtjtikdajmhtsxc`, `name: velotrack-positions`, `verify_jwt: true`,
conteúdo igual ao arquivo local criado na Task 1.

- [ ] **Step 3: Confirmar que os secrets `VT_USER`/`VT_PASS` existem no projeto**

Não é possível ler o valor dos secrets via MCP (por design), mas dá pra
confirmar indiretamente: chamar a function deployada autenticado e
verificar que ela não retorna o erro "VT_USER/VT_PASS não configurados".
Se retornar esse erro, avisar o usuário que os secrets precisam ser
conferidos no painel do Supabase (Project Settings → Edge Functions →
Secrets), já que a screenshot mostrada indica que eles foram cadastrados,
mas o nome exato (maiúsculas/minúsculas) importa para `Deno.env.get`.

- [ ] **Step 4: Testar a function via curl (com token de usuário autenticado)**

Não é possível obter um token de sessão real sem credenciais de usuário
neste ambiente. Se possível, pedir para o usuário testar logado no app
(a call acontece automaticamente ao abrir Logística → Rastreamento ou o
card do Dashboard). Caso contrário, documentar como pendência de
verificação manual — igual ao que já aconteceu nas fases anteriores desta
sessão.

- [ ] **Step 5: Checklist manual no preview (quando houver login disponível)**

1. Dashboard: card "Rastreamento" carrega posições sem erro.
2. Logística → Rastreamento: carrega sem mostrar tela de credenciais;
   soma de "em movimento" + "parados" + "offline" bate com o total de
   cards exibidos.
3. Logística: aba "Mapa de Entregas" não aparece mais na lista de abas.
4. Comparar os números do card do Dashboard com os da aba Rastreamento da
   Logística para os mesmos veículos — devem bater.
