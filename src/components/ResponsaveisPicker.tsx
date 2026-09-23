import { Check } from 'lucide-react'

interface Props {
  options: string[]
  selected: string[]
  onToggle: (name: string) => void
  disabled?: boolean
}

export default function ResponsaveisPicker({ options, selected, onToggle, disabled }: Props) {
  if (options.length === 0) {
    return <p className="text-xs text-slate-400 italic">Carregando equipe…</p>
  }

  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700">
      {options.map(name => {
        const sel = selected.includes(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => !disabled && onToggle(name)}
            disabled={disabled}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs text-left transition-colors ${
              sel
                ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 font-semibold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <span>{name}</span>
            {sel && <Check size={14} className="shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
