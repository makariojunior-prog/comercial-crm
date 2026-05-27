import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

export interface DashboardWidget {
  id: string
  visible: boolean
}

export interface UserPreferences {
  navOrder: string[]
  dashboardWidgets: DashboardWidget[]
}

export const DASHBOARD_WIDGET_LABELS: Record<string, string> = {
  tarefas_eventos:     'Tarefas & Eventos',  // legado — mantido para migração
  tarefas:             'Tarefas',
  eventos:             'Eventos',
  visitas_negocios:    'Visitas & Negócios', // legado — mantido para migração
  visitas:             'Visitas Recentes',
  negocios:            'Negócios Ativos',
  notas:               'Notas',
  conversas_alertas:   'Alertas de Conversas',
  social_comentarios:  'Comentários Instagram',
  frota:               'Alertas de Frota & Rastreamento',
  varejo_fila:         'Fila Varejo',
  posvendas:           'Pós-Venda Pendentes',
  resumo_pedidos:      'Resumo do Dia (Varejo + Atacado)',
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'conversas_alertas',  visible: true },  // sempre primeiro
  { id: 'tarefas',            visible: true },
  { id: 'eventos',            visible: true },
  { id: 'visitas',            visible: true },
  { id: 'negocios',           visible: true },
  { id: 'notas',              visible: true },
  { id: 'social_comentarios', visible: true },
  { id: 'frota',              visible: true },
  { id: 'varejo_fila',        visible: true },
  { id: 'posvendas',          visible: true },
  { id: 'resumo_pedidos',     visible: true },
]

const DEFAULT_PREFS: UserPreferences = {
  navOrder: [],
  dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS,
}

function storageKey(userId: string) {
  return `crm_prefs_${userId}`
}

function loadPrefs(userId: string): UserPreferences {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    let widgets = parsed.dashboardWidgets ?? DEFAULT_DASHBOARD_WIDGETS
    // Migra tarefas_eventos → tarefas + eventos separados
    const hasLegacyTE = widgets.some(w => w.id === 'tarefas_eventos')
    const hasSplitTE  = widgets.some(w => w.id === 'tarefas' || w.id === 'eventos')
    if (hasLegacyTE && !hasSplitTE) {
      widgets = widgets.flatMap(w =>
        w.id === 'tarefas_eventos'
          ? [{ id: 'tarefas', visible: w.visible }, { id: 'eventos', visible: w.visible }]
          : [w]
      )
    }
    // Migra visitas_negocios → visitas + negocios separados
    const hasLegacyVN = widgets.some(w => w.id === 'visitas_negocios')
    const hasSplitVN  = widgets.some(w => w.id === 'visitas' || w.id === 'negocios')
    if (hasLegacyVN && !hasSplitVN) {
      widgets = widgets.flatMap(w =>
        w.id === 'visitas_negocios'
          ? [{ id: 'visitas', visible: w.visible }, { id: 'negocios', visible: w.visible }]
          : [w]
      )
    }
    return { navOrder: parsed.navOrder ?? [], dashboardWidgets: widgets }
  } catch {
    return DEFAULT_PREFS
  }
}

interface PreferencesContextValue {
  prefs: UserPreferences
  updateNavOrder: (order: string[]) => void
  updateDashboardWidgets: (widgets: DashboardWidget[]) => void
  resetNavOrder: () => void
  resetDashboardWidgets: () => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const userId = profile?.id ?? ''

  const [prefs, setPrefs] = useState<UserPreferences>(() =>
    userId ? loadPrefs(userId) : DEFAULT_PREFS
  )

  useEffect(() => {
    setPrefs(userId ? loadPrefs(userId) : DEFAULT_PREFS)
  }, [userId])

  const updateNavOrder = useCallback((navOrder: string[]) => {
    setPrefs(prev => {
      const next = { ...prev, navOrder }
      if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])

  const updateDashboardWidgets = useCallback((dashboardWidgets: DashboardWidget[]) => {
    setPrefs(prev => {
      const next = { ...prev, dashboardWidgets }
      if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])

  const resetNavOrder = useCallback(() => {
    setPrefs(prev => {
      const next = { ...prev, navOrder: [] }
      if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])

  const resetDashboardWidgets = useCallback(() => {
    setPrefs(prev => {
      const next = { ...prev, dashboardWidgets: DEFAULT_DASHBOARD_WIDGETS }
      if (userId) localStorage.setItem(storageKey(userId), JSON.stringify(next))
      return next
    })
  }, [userId])

  return (
    <PreferencesContext.Provider value={{ prefs, updateNavOrder, updateDashboardWidgets, resetNavOrder, resetDashboardWidgets }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider')
  return ctx
}
