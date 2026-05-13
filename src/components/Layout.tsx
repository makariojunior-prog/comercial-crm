import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, MapPin, Sparkles, DollarSign, ShieldCheck, LogOut, CheckCircle2, Users, Calendar, Settings, Route, StickyNote } from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import { useAuth } from '../contexts/AuthContext'
import type { ModuleId } from '../contexts/AuthContext'

const NAV_ITEMS: { to: string; icon: any; label: string; module: ModuleId | 'admin' }[] = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard',      module: 'dashboard'  },
  { to: '/negocios',      icon: ClipboardList,   label: 'Negócios',       module: 'negocios'   },
  { to: '/visitas',       icon: MapPin,          label: 'Visitas',        module: 'visitas'    },
  { to: '/tarefas',       icon: CheckCircle2,    label: 'Tarefas',        module: 'tarefas'    },
  { to: '/clientes',      icon: Users,           label: 'Clientes',       module: 'clientes'   },
  { to: '/rotas',         icon: Route,           label: 'Rotas',          module: 'rotas'      },
  { to: '/notas',         icon: StickyNote,      label: 'Notas',          module: 'notas'      },
  { to: '/promotoria',    icon: Calendar,        label: 'Promotoria',     module: 'promotoria' },
  { to: '/tabelas',       icon: DollarSign,      label: 'Tabelas',        module: 'tabelas'    },
  { to: '/briefing',      icon: Sparkles,        label: 'Briefing IA',    module: 'briefing'   },
  { to: '/usuarios',      icon: ShieldCheck,     label: 'Usuários',       module: 'admin'      },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações',  module: 'admin'      },
]

export default function Layout() {
  const { profile, isAdmin, canAccess, signOut } = useAuth()

  const navItems = NAV_ITEMS.filter(item => {
    if (item.module === 'admin') return isAdmin
    return canAccess(item.module as ModuleId)
  })

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-56 bg-slate-800 text-white shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700">
          <img src={logoUrl} alt="Cantina" className="w-8 h-8 shrink-0" style={{ filter: 'invert(1)' }} />
          <div>
            <p className="font-bold text-sm leading-tight">CRM Comercial</p>
            <p className="text-xs text-slate-400">Cantina · Lumar</p>
          </div>
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1">
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

        {/* Usuário logado + sair */}
        <div className="px-4 py-3 border-t border-slate-700 space-y-2">
          {profile && (
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{profile.nome || profile.email}</p>
              <p className="text-[10px] text-slate-400 capitalize">{profile.role}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
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
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-50 overflow-x-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-shrink-0 flex flex-col items-center py-2 px-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-orange-500' : 'text-slate-500'
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
