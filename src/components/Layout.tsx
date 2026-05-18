import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, MapPin, Sparkles, DollarSign, ShieldCheck, LogOut, CheckCircle2, Users, Calendar, Settings, Route, StickyNote, Gift, Calculator, Truck, ShoppingBag, MessageSquare, Instagram, Package2, Store } from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import { useAuth } from '../contexts/AuthContext'
import type { ModuleId } from '../contexts/AuthContext'
import { usePreferences } from '../contexts/PreferencesContext'

const NAV_ITEMS: { to: string; icon: any; label: string; module: ModuleId | 'admin' | 'personal' }[] = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard',      module: 'dashboard'  },
  { to: '/negocios',      icon: ClipboardList,   label: 'Negócios',       module: 'negocios'   },
  { to: '/visitas',       icon: MapPin,          label: 'Visitas',        module: 'visitas'    },
  { to: '/tarefas',       icon: CheckCircle2,    label: 'Tarefas',        module: 'tarefas'    },
  { to: '/clientes',      icon: Users,           label: 'Cli. Atacado',  module: 'clientes'   },
  { to: '/rotas',         icon: Route,           label: 'Rotas Comerciais', module: 'rotas'   },
  { to: '/notas',         icon: StickyNote,      label: 'Notas',          module: 'notas'      },
  { to: '/promotoria',    icon: Calendar,        label: 'Promotoria',     module: 'promotoria' },
  { to: '/tabelas',       icon: DollarSign,      label: 'Tabelas',        module: 'tabelas'    },
  { to: '/amostras',      icon: Gift,            label: 'Amostras',       module: 'amostras'   },
  { to: '/simulador',     icon: Calculator,      label: 'Simular',        module: 'simulador'  },
  { to: '/varejo',        icon: ShoppingBag,     label: 'Varejo',         module: 'varejo'     },
  { to: '/conversas',     icon: MessageSquare,   label: 'Conversas',      module: 'conversas'  },
  { to: '/social',        icon: Instagram,       label: 'Social',         module: 'social'     },
  { to: '/atacado',          icon: Package2, label: 'Atacado',       module: 'atacado'         },
  { to: '/clientes-varejo', icon: Store,    label: 'Cli. Varejo',   module: 'varejo_clientes' },
  { to: '/logistica',        icon: Truck,    label: 'Logística',     module: 'logistica'       },
  { to: '/briefing',      icon: Sparkles,        label: 'IA',             module: 'briefing'   },
  { to: '/usuarios',      icon: ShieldCheck,     label: 'Usuários',       module: 'admin'      },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações',  module: 'personal'   },
]

export default function Layout() {
  const { profile, isAdmin, canAccess, signOut } = useAuth()
  const { prefs } = usePreferences()

  const accessibleItems = NAV_ITEMS.filter(item => {
    if (item.module === 'admin') return isAdmin
    if (item.module === 'personal') return true
    return canAccess(item.module as ModuleId)
  })

  // Split module items (reorderable) from fixed items (admin/personal, always at end)
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
    : moduleItems

  const navItems = [...sortedModuleItems, ...specialItems]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-800 text-white shrink-0">
        <div className="px-5 pt-5 pb-3 border-b border-slate-700">
          <div className="flex items-center gap-2.5 mb-3">
            <img src={logoUrl} alt="Cantina" className="w-8 h-8 shrink-0" style={{ filter: 'invert(1)' }} />
            <div>
              <p className="font-bold text-sm leading-tight">CRM Comercial</p>
              <p className="text-xs text-slate-400">Cantina · Lumar</p>
            </div>
          </div>
          {/* Usuário logado + sair */}
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
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden bg-slate-800 text-white px-4 py-3 flex items-center gap-2.5">
          <img src={logoUrl} alt="Cantina" className="w-7 h-7 shrink-0" style={{ filter: 'invert(1)' }} />
          <p className="font-bold text-sm flex-1">CRM Comercial · Cantina Lumar</p>
          <button onClick={signOut} className="text-slate-400 hover:text-white p-1">
            <LogOut size={16} />
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav — mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex z-50 overflow-x-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-shrink-0 flex flex-col items-center py-2 px-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-orange-500' : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon size={20} />
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
