# Agenda — Responsáveis por Usuários Ativos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No modal de compromisso da Agenda, trocar a fonte do campo "Responsáveis" de `crm_staff` (cadastro geral de colaboradores) para `crm_users` (contas ativas no CRM Comercial), e trocar a apresentação de chips que quebram linha por uma lista vertical de checkboxes com rolagem.

**Architecture:** Mudança contida a um único arquivo, `src/pages/AgendaPage.tsx` — troca de query (uma linha de `useEffect`) e troca de markup (um bloco JSX dentro de `AppointmentModal`). Nenhuma migration, nenhum novo componente, nenhuma mudança de formato de dados salvos.

**Tech Stack:** React + TypeScript + Vite, Supabase JS client, Tailwind.

**Nota sobre verificação:** este repositório não tem framework de testes configurado. Os passos de verificação usam `npx tsc -b tsconfig.app.json` (typecheck; `vite.config.ts` tem um erro de tipo pré-existente e não relacionado — não é bloqueante) e checagem manual no preview do navegador.

---

### Task 1: Trocar a fonte de dados de `staffOptions`

**Files:**
- Modify: `src/pages/AgendaPage.tsx:46-49`

- [ ] **Step 1: Trocar a query de `crm_staff` para `crm_users`**

Em `src/pages/AgendaPage.tsx`, localizar o `useEffect` que popula `staffOptions` (linhas 46-49):

De:

```tsx
  useEffect(() => {
    supabase.from('crm_staff').select('name').eq('active', true).order('name')
      .then(({ data }) => { if (data) setStaffOptions(data.map((s: any) => s.name)) })
  }, [])
```

Para:

```tsx
  useEffect(() => {
    supabase.from('crm_users').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setStaffOptions(data.map((u: any) => u.nome)) })
  }, [])
```

Nenhuma outra linha do arquivo precisa mudar por causa disso — `staffOptions` continua sendo `string[]`, e é usado tanto no `<select>` de filtro do topo da página (linhas ~138-145) quanto no `AppointmentModal` (via prop), ambos agnósticos à origem dos dados.

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "$(cat <<'EOF'
fix(agenda): campo Responsáveis usa usuários ativos do app, não staff geral

crm_staff é um cadastro amplo de colaboradores usado em vários módulos
e não refletia de forma confiável quem está ativo. Troca pra crm_users
(ativo=true) — só aparece quem realmente tem conta no CRM Comercial.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Trocar chips por lista de checkboxes

**Files:**
- Modify: `src/pages/AgendaPage.tsx:621-650` (números de linha podem ter mudado 1-2 linhas após o Task 1; localizar pelo conteúdo, não pelo número exato)

- [ ] **Step 1: Substituir o bloco de chips pelo bloco de lista**

Em `src/pages/AgendaPage.tsx`, dentro de `AppointmentModal`, localizar o bloco do campo Responsáveis:

De:

```tsx
          <div>
            <label className="label flex items-center gap-1"><Users size={12} /> Responsáveis</label>
            {staffOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Carregando equipe…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {staffOptions.map(name => {
                  const sel = responsaveis.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => !hasVisitReport && toggleResp(name)}
                      disabled={hasVisitReport}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                        sel
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600'
                      } disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  )
                })}
              </div>
            )}
            {responsaveis.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">{responsaveis.join(', ')}</p>
            )}
          </div>
```

Para:

```tsx
          <div>
            <label className="label flex items-center gap-1"><Users size={12} /> Responsáveis</label>
            {staffOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Carregando equipe…</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700">
                {staffOptions.map(name => {
                  const sel = responsaveis.includes(name)
                  return (
                    <label
                      key={name}
                      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${
                        hasVisitReport ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => !hasVisitReport && toggleResp(name)}
                        disabled={hasVisitReport}
                        className="w-3.5 h-3.5 accent-orange-500"
                      />
                      {name}
                    </label>
                  )
                })}
              </div>
            )}
            {responsaveis.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">{responsaveis.join(', ')}</p>
            )}
          </div>
```

Mudanças: o contêiner vira uma lista vertical (`max-h-40 overflow-y-auto`, borda, divisórias entre linhas) em vez de `flex flex-wrap`; cada opção vira um `<label>` com `<input type="checkbox">` em vez de um `<button>` com fundo colorido. A função `toggleResp(name)` e o estado `responsaveis` não mudam — só a apresentação. O resumo (`responsaveis.join(', ')`) abaixo continua igual.

- [ ] **Step 2: Rodar o typecheck**

```bash
npx tsc -b tsconfig.app.json
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "$(cat <<'EOF'
feat(agenda): lista de checkboxes para Responsáveis em vez de chips

Chips com flex-wrap ocupavam muita altura de tela com várias pessoas.
Lista vertical com rolagem (max-h-40) é mais compacta. Continua
multi-seleção livre — mesma função toggleResp de antes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Verificação final

**Files:** nenhum (só checagem)

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Esperado: passa sem erros (o erro de `vite.config.ts`/`@types/node`, se aparecer, é pré-existente e não relacionado a esta mudança).

- [ ] **Step 2: Checklist manual no preview**

1. Abrir Agenda, clicar em "+ Novo compromisso" (ou equivalente).
2. Conferir que a lista de Responsáveis mostra usuários com conta ativa no CRM (comparar com a lista em Gestão de Usuários) — colaboradores sem conta no app ou inativos não devem aparecer.
3. Conferir que a lista tem altura máxima com rolagem (não estica a tela) quando há várias opções.
4. Selecionar 2-3 pessoas marcando os checkboxes, confirmar que o resumo abaixo da lista atualiza corretamente.
5. Salvar o compromisso, reabrir para edição, confirmar que os responsáveis salvos aparecem marcados.
6. Abrir um compromisso já convertido em relatório de visita (`hasVisitReport`) e confirmar que a lista fica desabilitada (não clicável), igual ao comportamento anterior.
