# Desativação de Módulos (Fase 1-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desativar/reduzir escopo dos módulos Amostras, IA (Briefing), Simular e Conversas (mantendo só o envio automático de WhatsApp, renomeado "Automações"), e restringir custos/margens de Tabelas a Administrador em nível de banco — mantendo todo o código e dados existentes intactos para retomada futura.

**Architecture:** Mudanças de frontend (menu, rotas, permissões, UI) reversíveis via remoção de referências, sem apagar arquivos de página. Duas migrations novas no Supabase: uma adiciona coluna de exibição (`numero_whatsapp`) e limpa um widget órfão; outra cria a primeira função de checagem de role no banco (`crm_get_my_role()`) e uma view somente-leitura que mascara o campo `custo` para não-administradores. Um edge function (`digisac-webhook`) passa a responder de forma neutra logo na entrada, desligando o consumo de IA/gravação sem depender do painel externo do Digisac.

**Tech Stack:** React + TypeScript + Vite, React Router (`HashRouter`), Supabase (Postgres + RLS + Edge Functions/Deno), Tailwind.

**Nota sobre verificação:** este repositório não tem framework de testes configurado (`package.json` só tem `dev`/`build`/`preview`/`deploy`, nenhum arquivo `*.test.*`/`*.spec.*` existe). Por isso, os passos de verificação usam `npm run build` (que roda `tsc -b`, então erros de tipo quebram o build) e checagem manual no preview do navegador, em vez de testes automatizados — é o padrão já usado neste projeto.

---

## Antes de começar

- [ ] **Passo 0: Confirmar branch**

```bash
git branch --show-current
```

Esperado: `feat/desativar-modulos-fase1-3` (já criada e com a spec commitada). Se não estiver nela, faça `git checkout feat/desativar-modulos-fase1-3`.

---

### Task 1: Remover Amostras, Simular e IA (Briefing) do menu, rotas e permissões

**Files:**
- Modify: `src/components/Layout.tsx:21-47`
- Modify: `src/App.tsx:57-89`
- Modify: `src/contexts/AuthContext.tsx:7-31`

- [ ] **Step 1: Remover as 3 entradas de `NAV_ITEMS` em `Layout.tsx`**

Em `src/components/Layout.tsx`, substituir o bloco `NAV_ITEMS` (linhas 21-47) por:

```tsx
const NAV_ITEMS: { to: string; icon: any; label: string; module: ModuleId | 'admin' | 'personal' }[] = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard',        module: 'dashboard'       },
  { to: '/negocios',       icon: ClipboardList,   label: 'Negócios',         module: 'negocios'        },
  { to: '/visitas',        icon: MapPin,          label: 'Visitas',          module: 'visitas'         },
  { to: '/tarefas',        icon: CheckCircle2,    label: 'Tarefas',          module: 'tarefas'         },
  { to: '/clientes',       icon: Users,           label: 'Cli. Atacado',     module: 'clientes'        },
  { to: '/rotas',          icon: Route,           label: 'Rotas Comerciais', module: 'rotas'           },
  { to: '/notas',          icon: StickyNote,      label: 'Notas',            module: 'notas'           },
  { to: '/promotoria',     icon: Calendar,        label: 'Promotoria',       module: 'promotoria'      },
  { to: '/tabelas',        icon: DollarSign,      label: 'Tabelas',          module: 'tabelas'         },
  { to: '/varejo',         icon: ShoppingBag,     label: 'Varejo',           module: 'varejo'          },
  { to: '/conversas',      icon: MessageSquare,   label: 'Automações',       module: 'conversas'       },
  { to: '/social',         icon: Instagram,       label: 'Social',           module: 'social'          },
  { to: '/atacado',        icon: Package2,        label: 'Atacado',          module: 'atacado'         },
  { to: '/clientes-varejo',icon: Store,           label: 'Cli. Varejo',      module: 'varejo_clientes' },
  { to: '/cobranca',       icon: Banknote,        label: 'Cobrança',         module: 'cobranca'        },
  { to: '/comissao',       icon: TrendingUp,      label: 'Comissões',        module: 'comissao'        },
  { to: '/revenda',        icon: Building2,       label: 'Revenda',          module: 'revenda'         },
  { to: '/agenda',         icon: CalendarDays,    label: 'Agenda',           module: 'agenda'          },
  { to: '/comodato',       icon: PackageOpen,     label: 'Comodato',         module: 'comodato'        },
  { to: '/logistica',      icon: Truck,           label: 'Logística',        module: 'logistica'       },
  { to: '/usuarios',       icon: ShieldCheck,     label: 'Usuários',         module: 'admin'           },
  { to: '/configuracoes',  icon: Settings,        label: 'Configurações',    module: 'personal'        },
]
```

Isso remove as linhas de `amostras`, `simulador` e `briefing`, e renomeia o label de `conversas` para "Automações" (o `module`/rota internos continuam `conversas`).

O import de ícones no topo do arquivo (`Sparkles`, `Gift`, `Calculator`) fica sem uso após esta mudança — remova-os do bloco de import em `src/components/Layout.tsx:3-9`:

```tsx
import {
  LayoutDashboard, ClipboardList, MapPin, DollarSign, ShieldCheck, LogOut,
  CheckCircle2, Users, Calendar, Settings, Route, StickyNote, Truck,
  ShoppingBag, MessageSquare, Instagram, Package2, Store, Banknote, TrendingUp,
  Building2, CalendarDays, PanelLeft, PanelBottom, Search, ChevronsLeft, ChevronsRight,
  PackageOpen, LayoutGrid,
} from 'lucide-react'
```

- [ ] **Step 2: Remover as 3 rotas em `App.tsx` e adicionar redirecionamento coringa**

Em `src/App.tsx`, dentro do bloco de rotas (linhas 57-89), remover as linhas:

```tsx
                <Route path="/amostras"      element={<SolicitarAmostras />} />
```
```tsx
                <Route path="/simulador"     element={<SimularVendas />} />
```
```tsx
                <Route path="/briefing"      element={<BriefingBI />} />
```

E adicionar, como última rota dentro do `<Route element={<Layout />}>` (depois de `/agenda`):

```tsx
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
```

O resultado final do bloco de rotas fica:

```tsx
            <Route element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"     element={<DashboardNegocios />} />
                <Route path="/negocios"      element={<RegistroNegocios />} />
                <Route path="/registro"      element={<Navigate to="/negocios" replace />} />
                <Route path="/visitas"       element={<DashboardVisitas />} />
                <Route path="/tarefas"       element={<TasksPage />} />
                <Route path="/clientes"      element={<ClientsPage />} />
                <Route path="/rotas"         element={<RoutesPage />} />
                <Route path="/notas"         element={<NotesPage />} />
                <Route path="/promotoria"    element={<EventsPage />} />
                <Route path="/tabelas"       element={<TabelasPreco />} />
                <Route path="/usuarios"      element={<GestaoUsuarios />} />
                <Route path="/configuracoes" element={<SettingsPage />} />
                <Route path="/logistica"     element={<LogisticaPage />} />
                <Route path="/varejo"        element={<VarejoPage />} />
                <Route path="/conversas"     element={<ConversacoesPage />} />
                <Route path="/social"        element={<SocialPage />} />
                <Route path="/atacado"       element={<DashboardAtacado />} />
                <Route path="/clientes-varejo" element={<ClientesVarejo />} />
                <Route path="/cobranca"        element={<CobrancaPage />} />
                <Route path="/comissao"        element={<ComissaoPage />} />
                <Route path="/revenda"         element={<RevendaPage />} />
                <Route path="/agenda"          element={<AgendaPage />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
```

Também remover os 3 lazy imports que ficam sem uso, em `src/App.tsx` (topo do arquivo, junto aos outros `const X = lazy(() => import('./pages/X'))`). As linhas reais (confira o espaçamento de alinhamento exato no arquivo antes de apagar) são:

```tsx
const BriefingBI         = lazy(() => import('./pages/BriefingBI'))
```
```tsx
const SolicitarAmostras  = lazy(() => import('./pages/SolicitarAmostras'))
const SimularVendas      = lazy(() => import('./pages/SimularVendas'))
```

- [ ] **Step 3: Remover as 3 entradas de `ALL_MODULES` em `AuthContext.tsx` e renomear o label de Conversas**

Em `src/contexts/AuthContext.tsx`, substituir o bloco `ALL_MODULES` (linhas 7-31) por:

```tsx
export const ALL_MODULES = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'negocios',   label: 'Negócios' },
  { id: 'visitas',    label: 'Visitas' },
  { id: 'tarefas',    label: 'Tarefas' },
  { id: 'clientes',   label: 'Clientes Atacado' },
  { id: 'rotas',      label: 'Rotas' },
  { id: 'notas',      label: 'Notas' },
  { id: 'promotoria', label: 'Promotoria' },
  { id: 'tabelas',    label: 'Tabelas de Preço' },
  { id: 'logistica',  label: 'Logística' },
  { id: 'varejo',     label: 'Varejo' },
  { id: 'conversas',  label: 'Automações' },
  { id: 'social',     label: 'Redes Sociais' },
  { id: 'atacado',         label: 'Atacado' },
  { id: 'varejo_clientes', label: 'Clientes Varejo' },
  { id: 'cobranca',        label: 'Cobrança' },
  { id: 'comissao',        label: 'Comissões' },
  { id: 'revenda',         label: 'Revenda' },
  { id: 'agenda',          label: 'Agenda' },
  { id: 'comodato',        label: 'Comodato' },
] as const
```

Isso remove `amostras`, `simulador` e `briefing` de `ALL_MODULES` (e portanto do grid de permissões em `GestaoUsuarios.tsx`, que é 100% derivado desta constante — nenhuma mudança necessária lá) e renomeia o label de `conversas`.

- [ ] **Step 4: Rodar o build para checar tipos**

```bash
npm run build
```

Esperado: build passa sem erros. Se aparecer erro de import não usado ou de tipo `ModuleId` incompatível em algum outro arquivo, anote o arquivo:linha e corrija antes de prosseguir (não deve haver, pois nenhum outro arquivo referenciava `amostras`/`simulador`/`briefing` como `ModuleId` fora de `Layout.tsx`/`AuthContext.tsx`/`App.tsx`, conforme investigação prévia).

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout.tsx src/App.tsx src/contexts/AuthContext.tsx
git commit -m "$(cat <<'EOF'
feat: desativar módulos Amostras, Simular e IA (Briefing)

Remove menu, rota e permissão dos três módulos. Rota coringa redireciona
para /dashboard, então acessar a URL direta também deixa de funcionar.
Código das páginas permanece intacto para retomada futura.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Conversas → Automações (remover aba de monitoramento)

**Files:**
- Modify: `src/pages/ConversacoesPage.tsx` (reescrita completa, arquivo bem menor)

- [ ] **Step 1: Substituir todo o conteúdo de `ConversacoesPage.tsx`**

```tsx
import { MessageSquare } from 'lucide-react'
import AutomacaoTab from './AutomacaoTab'

export default function ConversacoesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MessageSquare size={20} className="text-orange-500" />
          Automações
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Envio automático de mensagens — Whatsapp</p>
      </div>
      <AutomacaoTab />
    </div>
  )
}
```

Isso remove: o seletor de abas (`vista`), toda a UI de monitoramento (conexão tabs, filtros de categoria, busca, lista agrupada por dia, `ConversaCard`, `ConversaHistoricoModal`), a assinatura realtime de `crm_conversations` e o botão de reprocessar erros de IA. Nenhum outro arquivo é apagado (`ConversaHistoricoModal.tsx` continua no repo, só sem chamador).

- [ ] **Step 2: Rodar o build**

```bash
npm run build
```

Esperado: passa sem erros (nenhum outro arquivo importa `ConversacoesPage`'s named exports internos — só o default export, que continua existindo).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ConversacoesPage.tsx
git commit -m "$(cat <<'EOF'
feat: simplificar Conversas para Automações (remove monitoramento)

A tela deixa de ter abas: o conteúdo agora é direto a função de envio
automático de Whatsapp (AutomacaoTab). Monitoramento de conversas fica
fora da UI; será redesenhado no futuro.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Desligar o webhook de monitoramento (Digisac) e o card do dashboard

**Files:**
- Modify: `supabase/functions/digisac-webhook/index.ts:123-124`
- Modify: `src/pages/DashboardNegocios.tsx` (import na linha 17, case na linha 150-151, lógica de pin nas linhas 74-85)
- Modify: `src/contexts/PreferencesContext.tsx:17-46`

- [ ] **Step 1: Fazer o webhook responder de forma neutra, sem processar nada**

Em `supabase/functions/digisac-webhook/index.ts`, alterar o início do handler (linha 123-124):

De:

```ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
```

Para:

```ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  // Monitoramento de conversas desativado (fase 2 da desativação de módulos,
  // 2026-09-22) — desliga o consumo de créditos de IA e a gravação em
  // crm_conversations sem depender de reconfiguração no painel do Digisac.
  // Será redesenhado; toda a lógica abaixo permanece intacta e sem uso.
  return new Response('disabled', { status: 200 });

  try {
```

O restante do arquivo (classificação por IA, inserts em `crm_conversations`, alertas internos) fica inalterado, só inacessível.

- [ ] **Step 2: Verificar que o handler compila (checagem de sintaxe local)**

```bash
cd supabase/functions/digisac-webhook && deno check index.ts; cd ../../..
```

Esperado: sem erros de sintaxe. Se `deno` não estiver instalado localmente, pule este passo — a validação real acontece no deploy (fora do escopo deste plano; avise o usuário que o deploy da function é manual, via `supabase functions deploy digisac-webhook` ou o fluxo de CI já usado pelo projeto).

- [ ] **Step 3: Remover o widget de alertas de Conversas do dashboard**

Em `src/contexts/PreferencesContext.tsx`, remover a linha `conversas_alertas` de `DASHBOARD_WIDGET_LABELS` (linha 25) e de `DEFAULT_DASHBOARD_WIDGETS` (linha 35):

```tsx
export const DASHBOARD_WIDGET_LABELS: Record<string, string> = {
  tarefas_eventos:     'Tarefas & Eventos',  // legado — mantido para migração
  tarefas:             'Tarefas',
  eventos:             'Eventos',
  visitas_negocios:    'Visitas & Negócios', // legado — mantido para migração
  visitas:             'Visitas Recentes',
  negocios:            'Negócios Ativos',
  notas:               'Notas',
  social_comentarios:  'Comentários Instagram',
  frota:               'Alertas de Frota & Rastreamento',
  varejo_fila:         'Fila Varejo',
  posvendas:           'Pós-Venda Pendentes',
  resumo_pedidos:      'Resumo do Dia (Varejo + Atacado)',
  agenda_widget:       'Agenda',
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'tarefas',            visible: true },
  { id: 'agenda_widget',      visible: true },
  { id: 'visitas',            visible: true },
  { id: 'negocios',           visible: true },
  { id: 'notas',              visible: true },
  { id: 'social_comentarios', visible: true },
  { id: 'frota',              visible: true },
  { id: 'varejo_fila',        visible: true },
  { id: 'posvendas',          visible: true },
  { id: 'resumo_pedidos',     visible: true },
]
```

- [ ] **Step 4: Remover o import e o caso de renderização em `DashboardNegocios.tsx`**

Remover a linha de import (`src/pages/DashboardNegocios.tsx:17`):

```tsx
import ConversacoesAlertasWidget from '../components/ConversacoesAlertasWidget'
```

Remover o `case` de renderização (`src/pages/DashboardNegocios.tsx:150-151`):

```tsx
      case 'conversas_alertas':
        return <div className="card p-5"><ConversacoesAlertasWidget /></div>
```

Simplificar a lógica de ordenação que fixava esse widget em primeiro lugar (`src/pages/DashboardNegocios.tsx:74-85`), de:

```tsx
  // Merge saved prefs with defaults (in case new widgets were added)
  // conversas_alertas is always pinned first regardless of saved order
  const orderedWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    const all = [...saved, ...extra].filter(w => w.visible)
    const conversas = all.find(w => w.id === 'conversas_alertas')
    const rest = all.filter(w => w.id !== 'conversas_alertas')
    return conversas ? [conversas, ...rest] : all
  }, [prefs.dashboardWidgets])
```

Para:

```tsx
  // Merge saved prefs with defaults (in case new widgets were added)
  const orderedWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    return [...saved, ...extra].filter(w => w.visible)
  }, [prefs.dashboardWidgets])
```

`ConversacoesAlertasWidget.tsx` não é apagado — só desconectado.

- [ ] **Step 5: Rodar o build**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/digisac-webhook/index.ts src/pages/DashboardNegocios.tsx src/contexts/PreferencesContext.tsx
git commit -m "$(cat <<'EOF'
feat: desligar monitoramento de conversas (webhook + card do dashboard)

O webhook do Digisac passa a responder sem processar nada, cortando o
consumo de créditos de IA (Anthropic/Gemini) e a gravação em
crm_conversations a partir do próximo deploy. O card "Alertas de
Conversas" some do dashboard e da lista de widgets configuráveis. A
lógica original fica intacta no código, só inacessível.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Número de WhatsApp em Automações + migration de `automacao_config`

**Files:**
- Create: `supabase/migrations/20260922120000_automacao_config_numero_whatsapp.sql`
- Modify: `src/types/index.ts:596-609`
- Modify: `src/pages/AutomacaoTab.tsx`

- [ ] **Step 1: Criar a migration**

```sql
-- Adiciona campo de exibição do número de WhatsApp usado pela automação de
-- envio (Lumar). O valor não vem de nenhuma API do Digisac — é só texto
-- informativo, preenchido manualmente por um Administrador na tela de
-- Automações, para os colaboradores saberem qual número está em uso.
alter table public.automacao_config
  add column if not exists numero_whatsapp text;

-- Limpeza: o widget "Alertas de Conversas" foi removido do dashboard
-- (fase 2 da desativação de módulos). Remove a fixação (se existir) para
-- não deixar uma linha órfã apontando pra um widget que não é mais
-- renderizado.
delete from public.dashboard_fixed_widgets where widget_id = 'conversas_alertas';
```

Salve em `supabase/migrations/20260922120000_automacao_config_numero_whatsapp.sql`.

- [ ] **Step 2: Aplicar a migration no banco**

```bash
supabase db push
```

Esperado: migration aplicada sem erro. Se o CLI não estiver logado/linkado neste ambiente, aplique manualmente pelo SQL Editor do Supabase Studio colando o conteúdo do arquivo, e avise o usuário que isso foi feito fora do fluxo normal de `supabase db push`.

- [ ] **Step 3: Adicionar o campo ao tipo `AutomacaoConfig`**

Em `src/types/index.ts`, alterar (linhas 596-609):

De:

```ts
export interface AutomacaoConfig {
  id: string
  nome: string
  ativo: boolean
  hora_envio: string
  mensagem_template: string
  msgs_por_lote: number
  pausa_entre_msgs_ms: number
  pausa_min_ms: number
  pausa_max_ms: number
  limite_diario: number
  updated_at: string | null
  updated_by: string | null
}
```

Para:

```ts
export interface AutomacaoConfig {
  id: string
  nome: string
  ativo: boolean
  hora_envio: string
  mensagem_template: string
  msgs_por_lote: number
  pausa_entre_msgs_ms: number
  pausa_min_ms: number
  pausa_max_ms: number
  limite_diario: number
  numero_whatsapp: string | null
  updated_at: string | null
  updated_by: string | null
}
```

- [ ] **Step 4: Exibir o número no cabeçalho (visível para todos) e editar no painel de Configurações (admin)**

Em `src/pages/AutomacaoTab.tsx`, alterar o bloco de título dentro do card de status (linhas 333-338):

De:

```tsx
            <div>
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Automação Lumar</p>
              <p className="text-[11px] text-slate-400">
                Envio diário às {config.hora_envio.slice(0, 5)} · seg a sex
              </p>
            </div>
```

Para:

```tsx
            <div>
              <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Automação Lumar — Whatsapp</p>
              <p className="text-[11px] text-slate-400">
                Envio diário às {config.hora_envio.slice(0, 5)} · seg a sex
                {config.numero_whatsapp ? ` · ${config.numero_whatsapp}` : ''}
              </p>
            </div>
```

No painel de Configurações (`src/pages/AutomacaoTab.tsx:557-588`), adicionar um campo para o número antes do grid de 3 colunas existente. De:

```tsx
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Hora de envio</label>
```

Para:

```tsx
            <div>
              <label className="label">Número do WhatsApp (exibido para os usuários)</label>
              <input
                type="text"
                value={config.numero_whatsapp ?? ''}
                onChange={e => isAdmin && setConfig({ ...config, numero_whatsapp: e.target.value })}
                className="input"
                placeholder="(62) 90000-0000"
                disabled={!isAdmin}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Hora de envio</label>
```

- [ ] **Step 5: Incluir `numero_whatsapp` no salvamento**

Em `src/pages/AutomacaoTab.tsx`, na função `salvarConfig` (linhas 175-193), adicionar o campo ao `update`:

De:

```tsx
    const { error } = await supabase.from('automacao_config').update({
      hora_envio: config.hora_envio,
      mensagem_template: config.mensagem_template,
      limite_diario: config.limite_diario,
      msgs_por_lote: config.msgs_por_lote,
      pausa_entre_msgs_ms: config.pausa_entre_msgs_ms,
      pausa_min_ms: config.pausa_min_ms,
      pausa_max_ms: config.pausa_max_ms,
      updated_at: new Date().toISOString(),
      updated_by: profile?.nome ?? profile?.email ?? null,
    }).eq('id', config.id)
```

Para:

```tsx
    const { error } = await supabase.from('automacao_config').update({
      hora_envio: config.hora_envio,
      mensagem_template: config.mensagem_template,
      limite_diario: config.limite_diario,
      msgs_por_lote: config.msgs_por_lote,
      pausa_entre_msgs_ms: config.pausa_entre_msgs_ms,
      pausa_min_ms: config.pausa_min_ms,
      pausa_max_ms: config.pausa_max_ms,
      numero_whatsapp: config.numero_whatsapp,
      updated_at: new Date().toISOString(),
      updated_by: profile?.nome ?? profile?.email ?? null,
    }).eq('id', config.id)
```

- [ ] **Step 6: Rodar o build**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 7: Verificação manual no preview**

Abrir o preview, entrar em Automações logado como Administrador: expandir "Configurações", digitar um número no campo novo, clicar "Salvar configurações", confirmar a mensagem "✓ Configurações salvas" e que o número aparece no cabeçalho do card de status. Recarregar a página e confirmar que o número persiste (foi salvo no banco).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260922120000_automacao_config_numero_whatsapp.sql src/types/index.ts src/pages/AutomacaoTab.tsx
git commit -m "$(cat <<'EOF'
feat: número de WhatsApp editável na tela de Automações

Novo campo numero_whatsapp em automacao_config, editável só por
Administrador, exibido no cabeçalho da tela para todos os usuários com
acesso ao módulo. Migration também limpa a fixação órfã do widget de
Conversas removido do dashboard.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migration — `crm_get_my_role()` e view segura de preços

**Files:**
- Create: `supabase/migrations/20260922120100_crm_price_items_admin_only_cost.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Primeira função de checagem de role no banco deste projeto (proposta em
-- 20260703120000_harden_rls.sql, comentário final). Reutilizável por outras
-- policies/views no futuro, alinhado com ALL_MODULES do AuthContext.
create or replace function public.crm_get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.crm_users where id = auth.uid()
$$;

-- View somente-leitura de crm_price_items que mascara o campo `custo` para
-- quem não é Administrador. Como toda margem exibida no frontend é
-- calculada a partir de custo + preço (não existem colunas de margem na
-- tabela), ocultar custo já oculta as margens automaticamente.
-- security_invoker = true faz a view respeitar a RLS da tabela base.
create or replace view public.crm_price_items_view
with (security_invoker = true) as
select
  id,
  empresa,
  nome,
  case when public.crm_get_my_role() = 'admin' then custo else null end as custo,
  preco_lumar,
  preco_varejo,
  preco_revenda,
  pf,
  ativo,
  created_at,
  updated_at
from public.crm_price_items;

-- A view é só leitura: escrita continua indo direto pra crm_price_items
-- (RLS da tabela base já cobre isso). Revoga qualquer escrita acidental na
-- view, seguindo o mesmo cuidado do fix recente em crm_posvendas.
revoke insert, update, delete, truncate on public.crm_price_items_view from anon, authenticated;
grant select on public.crm_price_items_view to authenticated;
```

Salve em `supabase/migrations/20260922120100_crm_price_items_admin_only_cost.sql`.

- [ ] **Step 2: Aplicar a migration no banco**

```bash
supabase db push
```

Esperado: migration aplicada sem erro. Mesma ressalva do Task 4/Step 2 se o CLI não estiver disponível neste ambiente.

- [ ] **Step 3: Verificar manualmente no Supabase Studio**

Rodar no SQL Editor, logado como um usuário não-admin (ou simulando via `set local role`), ou simplesmente conferir a definição:

```sql
select public.crm_get_my_role();
select * from public.crm_price_items_view limit 3;
```

Esperado: a função retorna o role do usuário atual da sessão do Studio (geralmente `service_role`, que não é `'admin'` — então `custo` deve vir `null` nessa consulta via Studio, o que é o comportamento esperado de fora do app). A validação real com um usuário `admin`/`vendedor` de fato será feita no preview do app (Task 6).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260922120100_crm_price_items_admin_only_cost.sql
git commit -m "$(cat <<'EOF'
feat: restringir custo/margem de Tabelas a Administrador (nível banco)

Cria crm_get_my_role() (primeira função de checagem de role no banco
deste projeto) e a view crm_price_items_view, que mascara o campo custo
para quem não é admin. RLS geral do projeto continua aberta — esta
migration só protege este campo específico.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `TabelasPreco.tsx` — ler da view, travar toggle e remover botão de atualizar

**Files:**
- Modify: `src/pages/TabelasPreco.tsx`

- [ ] **Step 1: Ler de `crm_price_items_view` em vez de `crm_price_items`**

Em `src/pages/TabelasPreco.tsx`, na função `load` (linhas 38-48):

De:

```tsx
  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('crm_price_items')
      .select('*')
      .order('nome', { ascending: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setItems(data as PriceItem[] ?? [])
    setLoading(false)
  }
```

Para:

```tsx
  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('crm_price_items_view')
      .select('*')
      .order('nome', { ascending: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setItems(data as PriceItem[] ?? [])
    setLoading(false)
  }
```

(`deleteItem` continua usando `crm_price_items` — a tabela base — pois a view não aceita escrita.)

- [ ] **Step 2: Importar `useAuth` e travar o toggle "Modo Tabela" para não-admin**

Adicionar o import no topo do arquivo (`src/pages/TabelasPreco.tsx:1-6`):

De:

```tsx
import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, RefreshCw, Eye, EyeOff, AlertCircle, Download, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportPriceItems } from '../lib/export'
import type { PriceItem } from '../types'
import PriceItemModal from '../components/PriceItemModal'
```

Para:

```tsx
import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Eye, EyeOff, AlertCircle, Download, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportPriceItems } from '../lib/export'
import type { PriceItem } from '../types'
import PriceItemModal from '../components/PriceItemModal'
import { useAuth } from '../contexts/AuthContext'
```

(`RefreshCw` sai da lista de ícones porque o botão de atualizar é removido no Step 4.)

No corpo do componente, logo após a declaração de estados (`src/pages/TabelasPreco.tsx:29-36`), adicionar `isAdmin` e forçar `modoTabela` para não-admin:

De:

```tsx
export default function TabelasPreco() {
  const [items, setItems]       = useState<PriceItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [empresa, setEmpresa]   = useState<Empresa>('lumar')
  const [search, setSearch]     = useState('')
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [modoTabela, setModoTabela] = useState(false)
  const [editItem, setEditItem] = useState<PriceItem | null | undefined>(undefined)
```

Para:

```tsx
export default function TabelasPreco() {
  const { isAdmin } = useAuth()
  const [items, setItems]       = useState<PriceItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [empresa, setEmpresa]   = useState<Empresa>('lumar')
  const [search, setSearch]     = useState('')
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [modoTabelaAdmin, setModoTabelaAdmin] = useState(false)
  const [editItem, setEditItem] = useState<PriceItem | null | undefined>(undefined)

  const modoTabela = isAdmin ? modoTabelaAdmin : true
```

(Renomeei o estado para `modoTabelaAdmin` e derivei `modoTabela` — não-admin sempre vê `true`, ou seja, sempre oculto, sem depender de nenhum toggle. Todos os outros usos de `modoTabela` no arquivo continuam funcionando sem alteração, já que o nome derivado é o mesmo.)

- [ ] **Step 3: Esconder o botão de alternância para não-admin**

No cabeçalho (linhas 82-100), trocar:

De:

```tsx
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setModoTabela(m => !m)}
            className={`btn text-xs py-1.5 ${modoTabela ? 'btn-primary' : 'btn-secondary'}`}
            title="Modo Tabela — visualização para cliente"
          >
            {modoTabela ? <EyeOff size={14} /> : <Eye size={14} />}
            {modoTabela ? 'Ver custos' : 'Modo Tabela'}
          </button>
          <button onClick={() => { try { exportPriceItems(filtered, empresa, modoTabela) } catch { alert('Erro ao exportar') } }} className="btn-secondary text-xs py-1.5">
            <Download size={14} /> Excel
          </button>
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditItem(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Produto</span>
          </button>
        </div>
```

Para:

```tsx
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <button
              onClick={() => setModoTabelaAdmin(m => !m)}
              className={`btn text-xs py-1.5 ${modoTabela ? 'btn-primary' : 'btn-secondary'}`}
              title="Modo Tabela — visualização para cliente"
            >
              {modoTabela ? <EyeOff size={14} /> : <Eye size={14} />}
              {modoTabela ? 'Ver custos' : 'Modo Tabela'}
            </button>
          )}
          <button onClick={() => { try { exportPriceItems(filtered, empresa, modoTabela) } catch { alert('Erro ao exportar') } }} className="btn-secondary text-xs py-1.5">
            <Download size={14} /> Excel
          </button>
          <button onClick={() => setEditItem(null)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Produto</span>
          </button>
        </div>
```

(O botão de atualizar/recarregar — `onClick={load}` com o ícone `RefreshCw` — foi removido, conforme combinado.)

- [ ] **Step 4: Rodar o build**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TabelasPreco.tsx
git commit -m "$(cat <<'EOF'
feat: Tabelas lê custo mascarado da view e trava Modo Tabela p/ não-admin

Lê de crm_price_items_view (custo mascarado no banco para não-admin).
Não-administrador não vê mais o toggle "Modo Tabela" — fica sempre
travado em oculto. Remove o botão de atualizar/recarregar do cabeçalho.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `PriceItemModal.tsx` — campo Custo restrito a Administrador

**Files:**
- Modify: `src/components/PriceItemModal.tsx`

- [ ] **Step 1: Importar `useAuth`**

De:

```tsx
import { useState, useCallback } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PriceItem } from '../types'
import { useEscKey } from '../hooks/useEscKey'
```

Para:

```tsx
import { useState, useCallback } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PriceItem } from '../types'
import { useEscKey } from '../hooks/useEscKey'
import { useAuth } from '../contexts/AuthContext'
```

- [ ] **Step 2: Ler `isAdmin` no componente**

De:

```tsx
export default function PriceItemModal({ item, defaultEmpresa = 'lumar', onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
```

Para:

```tsx
export default function PriceItemModal({ item, defaultEmpresa = 'lumar', onClose, onSaved }: Props) {
  const { isAdmin } = useAuth()
  useEscKey(useCallback(onClose, [onClose]))
```

- [ ] **Step 3: Omitir `custo` do payload para não-admin (evita apagar o valor salvo)**

Este é o ponto crítico: como um não-admin nunca vê/edita o campo `custo`, o payload de salvamento **não pode incluir a chave `custo`** quando `!isAdmin` — caso contrário, toda edição feita por um não-admin (ex.: mudar só o preço ou ativar/desativar) apagaria o custo já cadastrado (ficaria `null`, já que o campo nunca foi preenchido no formulário dele).

Em `src/components/PriceItemModal.tsx`, na função `save` (linhas 53-77):

De:

```tsx
  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      empresa: form.empresa,
      nome: form.nome.trim(),
      custo: toNum(form.custo),
      preco_lumar:   form.empresa === 'lumar'   ? toNum(form.preco_lumar) : null,
      preco_varejo:  form.empresa === 'cantina' ? toNum(form.preco_varejo) : null,
      preco_revenda: form.empresa === 'cantina' ? toNum(form.preco_revenda) : null,
      pf: form.pf,
      ativo: form.ativo,
    }

    const { error: err } = item
      ? await supabase.from('crm_price_items').update(payload).eq('id', item.id)
      : await supabase.from('crm_price_items').insert(payload)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }
```

Para:

```tsx
  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    setError(null)

    const payload: Record<string, unknown> = {
      empresa: form.empresa,
      nome: form.nome.trim(),
      preco_lumar:   form.empresa === 'lumar'   ? toNum(form.preco_lumar) : null,
      preco_varejo:  form.empresa === 'cantina' ? toNum(form.preco_varejo) : null,
      preco_revenda: form.empresa === 'cantina' ? toNum(form.preco_revenda) : null,
      pf: form.pf,
      ativo: form.ativo,
    }
    // Não-admin nunca vê/edita custo — omitir a chave preserva o valor já
    // salvo em vez de sobrescrever com null.
    if (isAdmin) payload.custo = toNum(form.custo)

    const { error: err } = item
      ? await supabase.from('crm_price_items').update(payload).eq('id', item.id)
      : await supabase.from('crm_price_items').insert(payload)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }
```

(Para um produto novo criado por não-admin, `custo` simplesmente fica `null`/default no banco até um admin editar depois — comportamento aceito, coerente com "campo não existe pra quem não é admin".)

- [ ] **Step 4: Esconder o campo Custo do formulário para não-admin**

Em `src/components/PriceItemModal.tsx`, no bloco do campo Custo (linhas 116-120):

De:

```tsx
            {/* Custo */}
            <div>
              <label className="label">Custo (R$)</label>
              <input type="number" step="0.01" className="input" value={form.custo} onChange={e => set('custo', e.target.value)} placeholder="0,00" />
            </div>
```

Para:

```tsx
            {/* Custo — visível só para Administrador */}
            {isAdmin && (
              <div>
                <label className="label">Custo (R$)</label>
                <input type="number" step="0.01" className="input" value={form.custo} onChange={e => set('custo', e.target.value)} placeholder="0,00" />
              </div>
            )}
```

- [ ] **Step 5: Rodar o build**

```bash
npm run build
```

Esperado: passa sem erros.

- [ ] **Step 6: Verificação manual no preview**

Logado como Administrador: abrir Tabelas, confirmar toggle "Modo Tabela" funciona, editar um produto existente e confirmar que o campo Custo aparece com o valor certo, salvar e conferir que o custo não mudou (se não alterado) ou mudou como esperado (se alterado).

Logado como não-admin (usuário com `role = 'vendedor'` ou `'leitura'`, permissão `tabelas` concedida): abrir Tabelas, confirmar que não existe botão "Modo Tabela"/"Ver custos", que as colunas Custo e Margem não aparecem na tabela, que o rodapé de margem média não aparece, e que ao editar um produto o campo Custo não existe no formulário. Editar algo (ex.: nome) e salvar; depois logar como admin e confirmar que o custo do produto **não foi apagado**.

- [ ] **Step 7: Commit**

```bash
git add src/components/PriceItemModal.tsx
git commit -m "$(cat <<'EOF'
feat: campo Custo do cadastro de produto restrito a Administrador

Não-admin não vê nem edita o campo Custo. O payload de salvamento omite
a chave `custo` para não-admin, evitando sobrescrever com null um valor
já cadastrado por um admin.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Verificação final

**Files:** nenhum (só checagem)

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: passa sem erros, do início ao fim.

- [ ] **Step 2: Checklist manual no preview (`npm run dev`, ou o preview do harness)**

1. Deslogado→logado como qualquer usuário: menu lateral não mostra mais "Amostras", "Simular" nem "IA"; mostra "Automações" no lugar de "Conversas".
2. Navegar manualmente para `/amostras`, `/simulador`, `/briefing`: cada uma redireciona para `/dashboard`.
3. Abrir "Automações": não há abas, a tela abre direto na função de envio, com "Whatsapp" no título e (se já preenchido por um admin) o número aparecendo no cabeçalho.
4. Dashboard: card "Alertas de Conversas" não aparece mais; em Configurações → widgets fixos (admin), "Alertas de Conversas" não aparece mais na lista de opções.
5. Tabelas como admin: toggle funciona, custo/margem visíveis/ocultos conforme o toggle, campo Custo editável no modal.
6. Tabelas como não-admin: custo/margem sempre ocultos, sem toggle, sem botão de atualizar, campo Custo ausente no modal, e uma edição salva sem apagar o custo existente.

- [ ] **Step 3: Registrar no usuário que o deploy da edge function precisa acontecer**

Avisar explicitamente: a mudança do Task 3 (webhook neutro) só entra em vigor depois de `supabase functions deploy digisac-webhook` (ou o pipeline de deploy já usado pelo projeto) — só editar o arquivo local não desliga o consumo em produção.

---

## Resumo do que fica pendente para o usuário (fora deste plano)

- Rodar `supabase db push` (ou aplicar as 2 migrations manualmente) e `supabase functions deploy digisac-webhook` no ambiente real, se este plano for executado sem acesso à CLI conectada ao projeto Supabase de produção.
- Preencher o número de WhatsApp em Automações (campo fica vazio até então).
- Abrir PR de `feat/desativar-modulos-fase1-3` para `main` quando a verificação manual estiver completa.
