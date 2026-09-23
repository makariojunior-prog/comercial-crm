import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ClientOption {
  id: string
  nome: string
}

interface Props {
  clientId: string | null
  search: string
  onChange: (clientId: string | null, search: string) => void
  placeholder?: string
}

export default function ClientSearchInput({ clientId, search, onChange, placeholder }: Props) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    supabase.from('crm_clients').select('id, nome').eq('status', 'ATIVO').order('nome')
      .then(({ data }) => { if (data) setClients(data as ClientOption[]) })
  }, [])

  const filtered = clients.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative">
      <input
        className="input pr-8"
        value={search}
        onChange={e => onChange(null, e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder ?? 'Buscar cliente pelo nome...'}
      />
      {search && (
        <button
          type="button"
          onClick={() => onChange(null, '')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      )}
      {showDropdown && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          <button
            type="button"
            onMouseDown={() => onChange(null, '')}
            className="w-full text-left px-3 py-2 text-xs text-slate-400 italic hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700"
          >
            (Sem cliente vinculado)
          </button>
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => onChange(c.id, c.nome)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                clientId === c.id
                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 font-bold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-orange-900/10'
              }`}
            >
              {c.nome}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-slate-400 italic">
              Nenhum cliente encontrado para "{search}"
            </p>
          )}
        </div>
      )}
      {clientId && (
        <p className="text-[10px] text-green-600 dark:text-green-400 font-medium mt-1">Cliente vinculado</p>
      )}
    </div>
  )
}
