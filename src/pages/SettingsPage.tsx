import { Settings, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

type ThemeOption = 'light' | 'dark'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const { theme, toggle } = useTheme()

  if (!isAdmin) return <Navigate to="/negocios" replace />

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Settings size={20} className="text-slate-400" /> Configurações
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Preferências do sistema</p>
      </div>

      {/* Tema */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Monitor size={16} className="text-orange-500" />
          <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Aparência</h2>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Escolha o tema da interface. A preferência é salva no seu navegador.
        </p>

        <div className="grid grid-cols-2 gap-3">
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
      </div>
    </div>
  )
}

function ThemeCard({
  active, onClick, icon, label, preview,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  preview: React.ReactNode
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
