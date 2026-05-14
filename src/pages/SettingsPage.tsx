import { useMemo, type ReactNode } from 'react'
import { Settings, Sun, Moon, Monitor, GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, LayoutDashboard, PanelLeft, RotateCcw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import type { ModuleId } from '../contexts/AuthContext'
import { ALL_MODULES } from '../contexts/AuthContext'
import { usePreferences, DEFAULT_DASHBOARD_WIDGETS, DASHBOARD_WIDGET_LABELS } from '../contexts/PreferencesContext'

export default function SettingsPage() {
  const { isAdmin, canAccess } = useAuth()
  const { theme, toggle } = useTheme()
  const { prefs, updateNavOrder, updateDashboardWidgets, resetNavOrder, resetDashboardWidgets } = usePreferences()

  // ─── Nav order ──────────────────────────────────────────────────

  const accessibleModules = ALL_MODULES.filter(m => canAccess(m.id as ModuleId))

  const orderedModules = useMemo(() => {
    const order = prefs.navOrder
    if (!order.length) return [...accessibleModules]
    return [...accessibleModules].sort((a, b) => {
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
  }, [accessibleModules, prefs.navOrder])

  function moveModule(index: number, dir: -1 | 1) {
    const next = [...orderedModules]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    updateNavOrder(next.map(m => m.id))
  }

  // ─── Dashboard widgets ───────────────────────────────────────────

  const settingsWidgets = useMemo(() => {
    const saved = prefs.dashboardWidgets
    if (!saved.length) return DEFAULT_DASHBOARD_WIDGETS
    const savedIds = new Set(saved.map(w => w.id))
    const extra = DEFAULT_DASHBOARD_WIDGETS.filter(w => !savedIds.has(w.id))
    return [...saved, ...extra]
  }, [prefs.dashboardWidgets])

  function moveWidget(index: number, dir: -1 | 1) {
    const next = [...settingsWidgets]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    updateDashboardWidgets(next)
  }

  function toggleWidget(id: string) {
    updateDashboardWidgets(settingsWidgets.map(w =>
      w.id === id ? { ...w, visible: !w.visible } : w
    ))
  }

  const navIsDefault = prefs.navOrder.length === 0
  const dashIsDefault = JSON.stringify(settingsWidgets) === JSON.stringify(DEFAULT_DASHBOARD_WIDGETS)

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings size={20} className="text-slate-400" /> Configurações
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Preferências pessoais do sistema</p>
      </div>

      {/* ─── Aparência ──────────────────────────────────────────── */}
      <Section icon={<Monitor size={16} className="text-orange-500" />} title="Aparência">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Escolha o tema da interface. A preferência é salva no seu navegador.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <ThemeCard
            active={theme === 'light'}
            onClick={() => theme !== 'light' && toggle()}
            icon={<Sun size={22} className="text-amber-500" />}
            label="Claro"
            preview={
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                <div className="bg-slate-800 h-4" />
                <div className="p-2 space-y-1.5">
                  <div className="bg-white rounded h-2.5 w-full border border-slate-200" />
                  <div className="bg-white rounded h-2.5 w-3/4 border border-slate-200" />
                  <div className="bg-orange-100 rounded h-2.5 w-1/2" />
                </div>
              </div>
            }
          />
          <ThemeCard
            active={theme === 'dark'}
            onClick={() => theme !== 'dark' && toggle()}
            icon={<Moon size={22} className="text-indigo-400" />}
            label="Escuro"
            preview={
              <div className="mt-2 rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                <div className="bg-slate-800 h-4" />
                <div className="p-2 space-y-1.5">
                  <div className="bg-slate-700 rounded h-2.5 w-full border border-slate-600" />
                  <div className="bg-slate-700 rounded h-2.5 w-3/4 border border-slate-600" />
                  <div className="bg-orange-900/50 rounded h-2.5 w-1/2" />
                </div>
              </div>
            }
          />
        </div>
      </Section>

      {/* ─── Barra lateral ──────────────────────────────────────── */}
      <Section
        icon={<PanelLeft size={16} className="text-orange-500" />}
        title="Barra Lateral"
        action={
          !navIsDefault && (
            <button onClick={resetNavOrder}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-orange-500 transition-colors">
              <RotateCcw size={11} /> Restaurar padrão
            </button>
          )
        }
      >
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Arraste ou use as setas para definir a ordem dos módulos no menu.
        </p>
        <div className="space-y-1.5">
          {orderedModules.map((mod, i) => (
            <div key={mod.id}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
              <GripVertical size={14} className="text-slate-300 dark:text-slate-500 shrink-0" />
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{mod.label}</span>
              <div className="flex gap-0.5">
                <button
                  onClick={() => moveModule(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-25 text-slate-500 dark:text-slate-400 transition-colors"
                  title="Mover para cima"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  onClick={() => moveModule(i, 1)}
                  disabled={i === orderedModules.length - 1}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-25 text-slate-500 dark:text-slate-400 transition-colors"
                  title="Mover para baixo"
                >
                  <ChevronDown size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Configurações e Usuários ficam sempre no final do menu.
        </p>
      </Section>

      {/* ─── Dashboard ──────────────────────────────────────────── */}
      <Section
        icon={<LayoutDashboard size={16} className="text-orange-500" />}
        title="Widgets do Dashboard"
        action={
          !dashIsDefault && (
            <button onClick={resetDashboardWidgets}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-orange-500 transition-colors">
              <RotateCcw size={11} /> Restaurar padrão
            </button>
          )
        }
      >
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Mostre ou oculte seções e defina a ordem de exibição no Dashboard.
        </p>
        <div className="space-y-1.5">
          {settingsWidgets.map((widget, i) => (
            <div key={widget.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                widget.visible
                  ? 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'
                  : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700 opacity-60'
              }`}>
              <button
                onClick={() => toggleWidget(widget.id)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0"
                title={widget.visible ? 'Ocultar do dashboard' : 'Mostrar no dashboard'}
              >
                {widget.visible
                  ? <Eye size={15} className="text-green-500" />
                  : <EyeOff size={15} className="text-slate-400" />
                }
              </button>
              <GripVertical size={14} className="text-slate-300 dark:text-slate-500 shrink-0" />
              <span className={`flex-1 text-sm font-medium ${
                widget.visible ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 line-through'
              }`}>
                {DASHBOARD_WIDGET_LABELS[widget.id] ?? widget.id}
              </span>
              <div className="flex gap-0.5">
                <button
                  onClick={() => moveWidget(i, -1)}
                  disabled={i === 0}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-25 text-slate-500 dark:text-slate-400 transition-colors"
                  title="Mover para cima"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  onClick={() => moveWidget(i, 1)}
                  disabled={i === settingsWidgets.length - 1}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-25 text-slate-500 dark:text-slate-400 transition-colors"
                  title="Mover para baixo"
                >
                  <ChevronDown size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Clique no ícone de olho para mostrar ou ocultar uma seção.
        </p>
      </Section>

      {/* ─── Admin note ─────────────────────────────────────────── */}
      {isAdmin && (
        <div className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700">
          Como administrador, você pode gerenciar usuários e permissões em{' '}
          <a href="#/usuarios" className="text-orange-500 hover:underline font-medium">Usuários</a>.
        </div>
      )}
    </div>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────

function Section({ icon, title, action, children }: {
  icon: ReactNode
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ThemeCard({ active, onClick, icon, label, preview }: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  preview: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition-all ${
        active
          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className={`font-bold text-sm ${active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300'}`}>
          {label}
        </span>
        {active && (
          <span className="ml-auto w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current">
              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      {preview}
    </button>
  )
}
