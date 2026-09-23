# Logística — Desativar Mapa de Entregas e corrigir Rastreamento (Fase 5)

Data: 2026-09-22
Status: aprovado para implementação

## Contexto

Duas frentes dentro do módulo Logística:

1. **Mapa de Entregas** (aba `mapa` em `LogisticaPage.tsx`, componente
   `MapaEntregasTab.tsx`): desativar, seguindo o mesmo padrão das fases
   anteriores (código preservado, só desconectado da navegação).
2. **Rastreamento** (aba `rastreamento` em `LogisticaPage.tsx` +
   `TrackingWidget.tsx` no dashboard): card com "problemas". Investigação
   encontrou a causa raiz e problemas relacionados — detalhados abaixo.

### Investigação: Mapa de Entregas

Roda 100% sob demanda: busca `varejo_pedidos` ao montar/trocar de data/
clicar em atualizar, e chama a edge function `geocode` só para pedidos sem
`lat`/`lng`. **Não há cron, polling (`setInterval`) nem assinatura
realtime** ligados a essa aba — confirmado por busca no código. A function
`geocode` não é chamada de nenhum outro lugar do app. Desativar a aba é
suficiente; não há "consumo" adicional para pausar.

### Investigação: Rastreamento

O card usa uma integração com a **Velotrack** (SaaS de rastreamento de
frota, terceiro completamente separado do Mapa de Entregas — não
compartilham dados nem código). O cliente (`src/lib/velotrack.ts`) fazia
login direto do navegador usando credenciais **hardcoded em texto puro no
código-fonte** (login/senha reais, indo pro bundle JS público do site,
visível no DevTools de qualquer visitante).

O usuário já iniciou a remediação: trocou a senha da conta Velotrack e
cadastrou as credenciais novas como secrets no Supabase (`VT_USER`,
`VT_PASS`), na expectativa de que passassem a ser usadas no backend. Como o
código ainda usa a credencial antiga hardcoded no cliente, a troca de senha
quebrou a autenticação — essa é a causa mais provável do "problema no card"
relatado (falha ao buscar posições).

Além disso, a investigação encontrou bugs de consistência independentes da
causa raiz acima:

- **Contagem duplicada na aba Rastreamento da Logística**: `moving` conta
  todo mundo com `connected=true` (sem checar `offline_hours`), enquanto
  `offline` conta todo mundo com `offline_hours > 1` — um veículo pode
  cair nas duas listas ao mesmo tempo, fazendo a soma dos cards não bater
  com o total. O card do Dashboard (`TrackingWidget.tsx`) já usa a lógica
  certa (categorias mutuamente exclusivas: `moving = connected &&
  offline_hours <= 1`, `stopped = !connected && offline_hours <= 1`,
  `offline = offline_hours > 1`), mas o badge de cada veículo individual
  nessa mesma tela usa só `connected`, inconsistente com o resumo.
- **Sem recuperação de sessão expirada**: sessão Velotrack cacheada em
  `localStorage` por 3h; se o servidor invalidar antes, o app insiste com a
  sessão morta até o TTL vencer, ao invés de logar de novo na hora.

## Decisões confirmadas com o usuário

1. Mover a chamada à Velotrack para uma edge function nova, autenticada
   com os secrets `VT_USER`/`VT_PASS` já cadastrados no Supabase — resolve
   a causa raiz (credencial desatualizada) e a exposição de segurança ao
   mesmo tempo.
2. Remover a tela de "credenciais personalizadas" (login/senha digitados no
   navegador, salvos em `localStorage`) da aba Rastreamento da Logística —
   não faz mais sentido com credenciais geridas como secret no servidor.

## Design técnico

### 1. Nova edge function `velotrack-positions`

Novo arquivo `supabase/functions/velotrack-positions/index.ts`:

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

Deploy com `verify_jwt: true` — só usuário autenticado no CRM (qualquer
sessão válida do Supabase Auth) pode chamar; não é um webhook público.

### 2. `src/lib/velotrack.ts` — vira um cliente fino

Todo o arquivo é substituído por:

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

`supabase.functions.invoke` já anexa o token de sessão do usuário logado
automaticamente (necessário porque a function é `verify_jwt: true`). MD5,
`DEFAULT_CREDS`, `saveCredentials`/`loadCredentials`/`clearCredentials` e
todo o uso de `localStorage` são removidos — não existe mais credencial
nenhuma no lado do cliente.

### 3. `src/components/TrackingWidget.tsx`

- Remove o import de `loadCredentials` (só `fetchPositions` continua).
- Remove o estado `hasCreds` e o `useState(() => !!loadCredentials())`.
- Remove o guard `if (!hasCreds) return null` e a dependência `[hasCreds]`
  do `useEffect` (passa a ser `[]`, carregando sempre ao montar).
- Nenhuma outra lógica muda — a categorização `moving`/`stopped`/`offline`
  aqui já está correta (mutuamente exclusiva) e serve de referência para o
  conserto na Logística.

### 4. `src/pages/LogisticaPage.tsx`

**Remover Mapa de Entregas:**
- Tirar `'mapa'` do union type `Tab`.
- Remover a linha do `TABS` array com `id: 'mapa'`.
- Remover o branch `tab === 'mapa' ? <MapaEntregasTab /> : ...` do switch de
  conteúdo.
- Remover `tab !== 'mapa'` da condição que mostra a barra de busca (a
  condição fica só com os tabs restantes que não usam busca: `rastreamento`,
  `romaneio`, `rotas`, `custos`).
- Remover o import `import MapaEntregasTab from '../components/MapaEntregasTab'`.
- `MapaEntregasTab.tsx` e `src/lib/geocoding.ts` não são apagados.

**Corrigir `TrackingTab` (aba Rastreamento):**
- Import: trocar `import { fetchPositions, loadCredentials, saveCredentials, clearCredentials } from '../lib/velotrack'` por `import { fetchPositions } from '../lib/velotrack'`.
- Remover todo o estado/fluxo de credenciais: `creds`, `showConfig`,
  `saveCreds()`, `resetCreds()`, o bloco `if (showConfig) return (...)` com
  o formulário de login/senha, e os botões "Configurar credenciais" /
  "Restaurar credencial padrão" no cabeçalho da aba.
- Corrigir a categorização para ficar mutuamente exclusiva, igual ao
  `TrackingWidget`:
  ```tsx
  const moving  = positions.filter(p => p.connected && p.offline_hours <= 1)
  const stopped = positions.filter(p => !p.connected && p.offline_hours <= 1)
  const offline = positions.filter(p => p.offline_hours > 1)
  ```
- Corrigir o badge de cada card de veículo na lista (hoje `isMoving =
  p.connected`) para `isMoving = p.connected && p.offline_hours <= 1`,
  consistente com os totais do cabeçalho.

## O que NÃO muda nesta spec

- Nenhuma tabela de dados é apagada; `crm_vehicles.velotrack_device_id`
  continua existindo (não é usado hoje para cruzar com a resposta da
  Velotrack — fora de escopo, não é um bug introduzido por esta mudança).
- `MapaEntregasTab.tsx`, `geocoding.ts` e a function `geocode` continuam
  intactos, só desconectados da navegação.
- Nenhuma mudança nas tabelas `crm_vehicles`/`crm_drivers` ou na aba
  Veículos/Motoristas/Custos/Romaneio/Rotas/Conciliação da Logística.

## Verificação

- `npx tsc -b tsconfig.app.json` sem erros.
- Deploy da function `velotrack-positions` e teste via `curl` (autenticado)
  confirmando que devolve a lista de posições sem erro 401/500/502.
- Verificação manual no preview: abrir Logística → Rastreamento, confirmar
  que carrega posições sem a tela de credenciais; conferir que a soma de
  "em movimento" + "parados" + "offline" bate com o total de veículos
  listados. Abrir o Dashboard e conferir que o card Rastreamento também
  carrega e os números batem com os da aba Logística para os mesmos
  veículos. Abrir Logística → confirmar que a aba "Mapa de Entregas" não
  existe mais na lista de abas.
