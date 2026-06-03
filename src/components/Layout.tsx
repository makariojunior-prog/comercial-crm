import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, MapPin, Sparkles, DollarSign, ShieldCheck, LogOut,
  CheckCircle2, Users, Calendar, Settings, Route, StickyNote, Gift, Calculator, Truck,
  ShoppingBag, MessageSquare, Instagram, Package2, Store, Banknote, TrendingUp,
  Building2, CalendarDays, PanelLeft, PanelBottom, Search, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import { useAuth } from '../contexts/AuthContext'
import type { ModuleId } from '../contexts/AuthContext'
import { usePreferences } from '../contexts/PreferencesContext'
import GlobalSearch from './GlobalSearch'

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
  { to: '/amostras',       icon: Gift,            label: 'Amostras',         module: 'amostras'        },
  { to: '/simulador',      icon: Calculator,      label: 'Simular',          module: 'simulador'       },
  { to: '/varejo',         icon: ShoppingBag,     label: 'Varejo',           module: 'varejo'          },
  { to: '/conversas',      icon: MessageSquare,   label: 'Conversas',        module: 'conversas'       },
  { to: '/social',         icon: Instagram,       label: 'Social',           module: 'social'          },
  { to: '/atacado',        icon: Package2,        label: 'Atacado',          module: 'atacado'         },
  { to: '/clientes-varejo',icon: Store,           label: 'Cli. Varejo',      module: 'varejo_clientes' },
  { to: '/cobranca',       icon: Banknote,        label: 'Cobrança',         module: 'cobranca'        },
  { to: '/comissao',       icon: TrendingUp,      label: 'Comissões',        module: 'comissao'        },
  { to: '/revenda',        icon: Building2,       label: 'Revenda',          module: 'revenda'         },
  { to: '/agenda',         icon: CalendarDays,    label: 'Agenda',           module: 'agenda'          },
  { to: '/logistica',      icon: Truck,           label: 'Logística',        module: 'logistica'       },
  { to: '/briefing',       icon: Sparkles,        label: 'IA',               module: 'briefing'        },
  { to: '/usuarios',       icon: ShieldCheck,     label: 'Usuários',         module: 'admin'           },
  { to: '/configuracoes',  icon: Settings,        label: 'Configurações',    module: 'personal'        },
]

export default function Layout() {
  const { profile, isAdmin, canAccess, signOut } = useAuth()
  const { prefs, updateSidebarMode } = usePreferences()
  const sidebarMode = prefs.sidebarMode
  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl+K / Cmd+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const accessibleItems = NAV_ITEMS.filter(item => {
    if (item.module === 'admin') return isAdmin
    if (item.module === 'personal') return true
    return canAccess(item.module as ModuleId)
  })

  const moduleItems  = accessibleItems.filter(i => i.module !== 'admin' && i.module !== 'personal')
  const specialItems = accessibleItems.filter(i => i.module === 'admin' || i.module === 'personal')

  const sortedModuleItems = prefs.navOrder.length
    ? [...moduleItems].sort((a, b) => {
        const ai = prefs.navOrder.indexOf(a.module as string)
        const bi = prefs.navOrder.indexOf(b.module as string)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : [...moduleItems].sort((a, b) => {
        if (a.module === 'dashboard') return -1
        if (b.module === 'dashboard') return 1
        return a.label.localeCompare(b.label, 'pt-BR')
      })

  const navItems = [...sortedModuleItems, ...specialItems]

  const isIconsMode  = sidebarMode === 'icons'
  const isBottomMode = sidebarMode === 'bottom'
  const isFullMode   = sidebarMode === 'full'

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── Desktop sidebar (full / icons mode) ── */}
      {!isBottomMode && (
        <aside className={`hidden lg:flex flex-col ${isIconsMode ? 'w-14' : 'w-56'} bg-slate-800 text-white shrink-0`}>

          {/* Sidebar header */}
          <div className={`${isIconsMode ? 'flex flex-col items-center gap-2 px-2 pt-4 pb-3' : 'px-5 pt-5 pb-3'} border-b border-slate-700`}>
            {isIconsMode ? (
              <img src={logoUrl} alt="Cantina" className="w-7 h-7" style={{ filter: 'invert(1)' }} />
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-3">
                  <img src={logoUrl} alt="Cantina" className="w-8 h-8 shrink-0" style={{ filter: 'invert(1)' }} />
                  <div>
                    <p className="font-bold text-sm leading-tight">CRM Comercial</p>
                    <p className="text-xs text-slate-400">Cantina · Lumar</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {profile && (
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white truncate">{profile.nome || profile.email}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{profile.role}</p>
                    </div>
                  )}
                  <button
                    onClick={signOut}
                    title="Sair"
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    <LogOut size={14} /> Sair
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {navItems.map(({ to, icon: Icon, label }) =>
              isIconsMode ? (
                <div key={to} className="group relative">
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center justify-center p-2.5 rounded-lg transition-colors ${
                        isActive ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={18} />
                  </NavLink>
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    {label}
                  </span>
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              )
            )}
          </nav>

          {/* Sidebar footer — mode toggles */}
          <div className={`border-t border-slate-700 ${isIconsMode ? 'flex flex-col gap-0.5 p-1.5' : 'flex items-center justify-end gap-1 p-2'}`}>
            {isIconsMode ? (
              <>
                <button
                  onClick={() => updateSidebarMode('full')}
                  title="Expandir sidebar"
                  className="group relative flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <ChevronsRight size={16} />
                  <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    Expandir
                  </span>
                </button>
                <button
                  onClick={() => updateSidebarMode('bottom')}
                  title="Mover para baixo"
                  className="group relative flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <PanelBottom size={16} />
                  <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    Barra inferior
                  </span>
                </button>
                <button
                  onClick={signOut}
                  title="Sair"
                  className="group relative flex items-center justify-center p-2.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <LogOut size={16} />
                  <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    Sair
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => updateSidebarMode('icons')}
                  title="Colapsar sidebar"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={() => updateSidebarMode('bottom')}
                  title="Mover para baixo"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  <PanelBottom size={16} />
                </button>
              </>
            )}
          </div>
        </aside>
      )}

      {/* ── Main content column ── */}
      <div className="flex-1 flex flex-col min-h-screen">

        {/* Mobile header */}
        <header className="lg:hidden bg-slate-800 text-white px-4 py-3 flex items-center gap-2.5">
          <img src={logoUrl} alt="Cantina" className="w-7 h-7 shrink-0" style={{ filter: 'invert(1)' }} />
          <p className="font-bold text-sm flex-1">CRM Comercial · Cantina Lumar</p>
          <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-white p-1 transition-colors">
            <Search size={16} />
          </button>
          <button onClick={signOut} className="text-slate-400 hover:text-white p-1 transition-colors">
            <LogOut size={16} />
          </button>
        </header>

        {/* Desktop header — bottom mode only */}
        {isBottomMode && (
          <header className="hidden lg:flex items-center gap-4 px-5 py-3 bg-white dark:bg-slate-800 shrink-0 border-b border-slate-200 dark:border-slate-700/60">
            <img src={logoUrl} alt="Cantina" className="w-7 h-7 shrink-0 opacity-80" />
            <p className="font-bold text-sm text-slate-700 dark:text-slate-200 shrink-0">CRM Comercial</p>
            {/* Central search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex flex-1 items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/50 hover:border-orange-300 dark:hover:border-orange-600/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-left max-w-2xl mx-auto"
            >
              <Search size={16} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-400 select-none">Buscar clientes, pedidos, negócios, visitas...</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-600 text-slate-400 border border-slate-200 dark:border-slate-500 shrink-0">⌃K</kbd>
            </button>
            {profile && (
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="text-right hidden xl:block">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{profile.nome || profile.email}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{profile.role}</p>
                </div>
                <button onClick={signOut} title="Sair"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                  <LogOut size={14} /> <span className="hidden xl:inline">Sair</span>
                </button>
              </div>
            )}
          </header>
        )}

        {/* Desktop top bar — full/icons mode (replaces fixed button) */}
        {!isBottomMode && (
          <header className="hidden lg:flex items-center gap-4 px-5 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/60 shrink-0">
            {/* Search bar — central and prominent */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex flex-1 items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600/50 hover:border-orange-300 dark:hover:border-orange-600/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-left max-w-2xl"
            >
              <Search size={16} className="text-slate-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-400 select-none">
                Buscar clientes, pedidos, negócios, visitas...
              </span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-600 text-slate-400 dark:text-slate-400 border border-slate-200 dark:border-slate-500 shrink-0">
                ⌃K
              </kbd>
            </button>

            {/* User info + logout */}
            {profile && (
              <div className="flex items-center gap-2.5 shrink-0 ml-auto">
                <div className="text-right hidden xl:block">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{profile.nome || profile.email}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{profile.role}</p>
                </div>
                <button
                  onClick={signOut}
                  title="Sair"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <LogOut size={14} /> <span className="hidden xl:inline">Sair</span>
                </button>
              </div>
            )}
          </header>
        )}

        {/* Page content */}
        <main className={`flex-1 p-4 lg:p-6 pb-24 ${isBottomMode ? 'lg:pb-24' : 'lg:pb-6'}`}>
          <Outlet />
        </main>

        {/* Bottom nav — mobile always; desktop only in bottom mode */}
        <nav className={`${isBottomMode ? '' : 'lg:hidden'} fixed bottom-0 left-0 right-0 z-50 flex overflow-x-auto border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800`}>
          {/* Restore sidebar button — desktop, bottom mode */}
          {isBottomMode && (
            <button
              onClick={() => updateSidebarMode('full')}
              title="Restaurar sidebar"
              className="hidden lg:flex shrink-0 flex-col items-center justify-center border-r border-slate-200 px-3 py-2 text-slate-400 transition-colors hover:text-orange-500 dark:border-slate-700 dark:text-slate-500 dark:hover:text-orange-400"
            >
              <PanelLeft size={18} />
              <span className="mt-0.5 whitespace-nowrap text-[9px]">Sidebar</span>
            </button>
          )}

          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex shrink-0 flex-col items-center px-2 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-orange-500' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon size={20} />
              <span className="mt-0.5 whitespace-nowrap text-[10px]">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
