import { useMemo, useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  /** Nomes do catálogo de produtos (crm_price_items) */
  options: string[]
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Lista de produtos levados como amostra: escolhe do catálogo ou digita livremente
 * (Enter, vírgula ou o botão "Adicionar"). Itens duplicados são ignorados.
 */
export default function AmostraProdutosInput({ value, onChange, options }: Props) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)

  const jaTem = (nome: string) => value.some(v => norm(v) === norm(nome))

  const sugestoes = useMemo(() => {
    const q = norm(draft)
    return options
      .filter(o => !value.some(v => norm(v) === norm(o)))
      .filter(o => !q || norm(o).includes(q))
      .slice(0, 8)
  }, [draft, options, value])

  function add(nome: string) {
    const limpo = nome.trim()
    if (!limpo) return
    if (!jaTem(limpo)) onChange([...value, limpo])
    setDraft('')
  }

  const textoLivreNovo = draft.trim() !== '' && !jaTem(draft) && !options.some(o => norm(o) === norm(draft))

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(p => (
            <span
              key={p}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
            >
              {p}
              <button
                type="button"
                onClick={() => onChange(value.filter(v => v !== p))}
                className="p-0.5 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800/50"
                aria-label={`Remover ${p}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={draft}
            placeholder="Buscar no catálogo ou digitar o produto..."
            onChange={e => { setDraft(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => { setOpen(false); add(draft) }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                add(draft)
              }
            }}
          />
          <button
            type="button"
            onClick={() => add(draft)}
            disabled={!draft.trim()}
            className="px-3 rounded-xl border border-orange-400 text-orange-600 dark:text-orange-400 disabled:opacity-40 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
            aria-label="Adicionar produto"
          >
            <Plus size={18} />
          </button>
        </div>

        {open && (sugestoes.length > 0 || textoLivreNovo) && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-52 overflow-y-auto">
            {sugestoes.map(o => (
              <button
                key={o}
                type="button"
                onMouseDown={e => { e.preventDefault(); add(o) }}
                className="w-full text-left px-3 py-2 text-sm text-slate-800 dark:text-slate-100 border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                {o}
              </button>
            ))}
            {textoLivreNovo && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); add(draft) }}
                className="w-full text-left px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                Adicionar “{draft.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
