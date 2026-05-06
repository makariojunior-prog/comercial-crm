import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, MapPin, Sparkles } from 'lucide-react'
import logoUrl from '../assets/logo.svg'

const navItems = [
  { to: '/negocios', icon: LayoutDashboard, label: 'Negócios' },
  { to: '/registro', icon: ClipboardList, label: 'Registro' },
  { to: '/visitas', icon: MapPin, label: 'Visitas' },
  { to: '/briefing', icon: Sparkles, label: 'Briefing IA' },
]

export default function Layout() {
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
        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">v2.0 · 2026</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden bg-slate-800 text-white px-4 py-3 flex items-center gap-2.5">
          <img src={logoUrl} alt="Cantina" className="w-7 h-7 shrink-0" style={{ filter: 'invert(1)' }} />
          <p className="font-bold text-sm">CRM Comercial · Cantina Lumar</p>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav — mobile */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-50">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-orange-500' : 'text-slate-500'
                }`
              }
            >
              <Icon size={20} />
              <span className="text-[10px] mt-0.5">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
