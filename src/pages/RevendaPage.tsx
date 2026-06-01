import { useState, useEffect, useMemo } from 'react'
import { Search, Building2, Phone, MapPin, Edit2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client, ClientStatus } from '../types'
import ClientModal from '../components/ClientModal'

const STATUS_LABELS: Record<ClientStatus, string> = {
  ATIVO: 'Ativo',
  PERDENDO: 'Perdendo',
  PERDIDO: 'Perdido',
}

const STATUS_COLORS: Record<ClientStatus, string> = {
  ATIVO:    'bg-green-100 text-green-700 border-green-200',
  PERDENDO: 'bg-amber-100 text-amber-700 border-amber-200',
  PERDIDO:  'bg-red-100 text-red-700 border-red-200',
}

const CARTEIRAS = ['TODOS', 'MAKÁRIO', 'TIAGO', 'BRUNA', 'MARCO'] as const

export default function RevendaPage() {
  const [clients,       setClients]       = useState<Client[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<ClientStatus | 'TODOS'>('TODOS')
  const [carteiraFilter, setCarteiraFilter] = useState<string>('TODOS')
  const [expandedId,    setExpandedId]    = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('crm_clients')
      .select('*')
      .in('tipo', ['CANTINA REVENDA', 'LUMAR/CANTINA'])
      .order('nome', { ascending: true })
    setClients((data ?? []) as Client[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => clients.filter(c => {
    if (statusFilter !== 'TODOS' && c.status !== statusFilter) return false
    if (carteiraFilter !== 'TODOS' && (c.carteira ?? '').toUpperCase() !== carteiraFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.nome.toLowerCase().includes(q) ||
      (c.telefone ?? '').includes(q) ||
      (c.setor ?? '').toLowerCase().includes(q) ||
      (c.rota ?? '').toLowerCase().includes(q) ||
      (c.cnpj_cpf ?? '').includes(q)
    )
  }), [clients, search, statusFilter, carteiraFilter])

  const openWhatsApp = (phone: string) => {
    const clean = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${clean.startsWith('55') ? clean : '55' + clean}`, '_blank')
  }

  const counts = useMemo(() => ({
    ATIVO:    clients.filter(c => c.status === 'ATIVO').length,
    PERDENDO: clients.filter(c => c.status === 'PERDENDO').length,
    PERDIDO:  clients.filter(c => c.status === 'PERDIDO').length,
  }), [clients])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Building2 className="text-orange-500" size={24} /> Revenda
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cantina Revenda + Lumar/Cantina — {loading ? '...' : `${clients.length} cadastrados`}
        </p>
      </div>

      {/* Resumo status */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          {(['ATIVO', 'PERDENDO', 'PERDIDO'] as ClientStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(prev => prev === s ? 'TODOS' : s)}
              className={`rounded-xl border p-3 text-center transition-all ${
                statusFilter === s
                  ? STATUS_COLORS[s] + ' border-current shadow-sm scale-[1.02]'
                  : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600 hover:border-slate-200'
              }`}
            >
              <p className="text-2xl font-bold">{counts[s]}</p>
              <p className="text-xs font-medium mt-0.5">{STATUS_LABELS[s]}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, telefone, setor, rota..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {/* Status */}
          {(['TODOS', 'ATIVO', 'PERDENDO', 'PERDIDO'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                statusFilter === s
                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              {s === 'TODOS' ? 'Todos' : STATUS_LABELS[s as ClientStatus]}
            </button>
          ))}
          {/* Carteira */}
          <select
            value={carteiraFilter}
            onChange={e => setCarteiraFilter(e.target.value)}
            className="input py-1.5 text-xs font-semibold pr-8"
          >
            {CARTEIRAS.map(c => (
              <option key={c} value={c}>{c === 'TODOS' ? 'Todas as carteiras' : c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resultado */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum cliente encontrado</p>
          {search && <p className="text-sm mt-1">Tente outro termo de busca</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-medium">{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.map(c => {
            const isExpanded = expandedId === c.id
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden"
              >
                {/* Row principal */}
                <div className="flex items-center gap-3 p-3">
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    c.status === 'ATIVO' ? 'bg-green-400' :
                    c.status === 'PERDENDO' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">
                        {c.nome}
                      </p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                      {c.tipo === 'LUMAR/CANTINA' && (
                        <span className="text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800">
                          LUMAR
                        </span>
                      )}
                      {c.carteira && (
                        <span className="text-[10px] font-bold bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full border border-orange-100 dark:border-orange-800">
                          {c.carteira}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {c.setor && (
                        <span className="flex items-center gap-1">
                          <MapPin size={10} /> {c.setor}
                        </span>
                      )}
                      {c.rota && <span className="font-medium text-slate-600 dark:text-slate-300">{c.rota}</span>}
                      {c.pgto && <span>{c.pgto}</span>}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 shrink-0">
                    {c.telefone && (
                      <button
                        onClick={() => openWhatsApp(c.telefone!)}
                        className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                        title="WhatsApp"
                      >
                        <MessageCircle size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingClient(c); setShowModal(true) }}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title="Editar"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expansão com detalhes */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {c.telefone && (
                      <div>
                        <p className="text-slate-400 mb-0.5">Telefone</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1">
                          <Phone size={10} /> {c.telefone}
                        </p>
                      </div>
                    )}
                    {c.cnpj_cpf && (
                      <div>
                        <p className="text-slate-400 mb-0.5">CNPJ / CPF</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.cnpj_cpf}</p>
                      </div>
                    )}
                    {c.localizacao && (
                      <div>
                        <p className="text-slate-400 mb-0.5">Localização</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.localizacao}</p>
                      </div>
                    )}
                    {c.dia_entrega && (
                      <div>
                        <p className="text-slate-400 mb-0.5">Dia de Entrega</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.dia_entrega}</p>
                      </div>
                    )}
                    {c.frequencia && (
                      <div>
                        <p className="text-slate-400 mb-0.5">Frequência</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.frequencia}</p>
                      </div>
                    )}
                    {c.manutencao && (
                      <div>
                        <p className="text-slate-400 mb-0.5">Manutenção</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.manutencao}</p>
                      </div>
                    )}
                    {c.restricao && (
                      <div className="col-span-2 md:col-span-3">
                        <p className="text-slate-400 mb-0.5">Restrição</p>
                        <p className="font-medium text-amber-700 dark:text-amber-400">{c.restricao}</p>
                      </div>
                    )}
                    {c.observacoes && (
                      <div className="col-span-2 md:col-span-3">
                        <p className="text-slate-400 mb-0.5">Observações</p>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{c.observacoes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <ClientModal
          client={editingClient}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
