import { useState, useEffect } from 'react'
import { Plus, Search, User, Phone, MapPin, Edit2, Trash2, ExternalLink, MessageCircle, Briefcase, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client, ClientStatus } from '../types'
import ClientModal from '../components/ClientModal'

const STATUS_LABELS: Record<ClientStatus, string> = {
  ATIVO: 'Ativo',
  PERDENDO: 'Perdendo',
  PERDIDO: 'Perdido',
}

const STATUS_COLORS: Record<ClientStatus, string> = {
  ATIVO: 'bg-green-100 text-green-700 border-green-200',
  PERDENDO: 'bg-amber-100 text-amber-700 border-amber-200',
  PERDIDO: 'bg-red-100 text-red-700 border-red-200',
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'TODOS'>('ATIVO')

  async function loadClients() {
    setLoading(true)
    let query = supabase.from('crm_clients').select('*').order('nome', { ascending: true })
    
    if (statusFilter !== 'TODOS') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error loading clients:', error)
    } else {
      setClients(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [statusFilter])

  async function deleteClient(id: string) {
    if (!confirm('Excluir este cliente permanentemente?')) return
    const { error } = await supabase.from('crm_clients').delete().eq('id', id)
    if (!error) {
      setClients(prev => prev.filter(c => c.id !== id))
    }
  }

  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.setor?.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj_cpf?.includes(search)
  )

  const openWhatsApp = (phone: string) => {
    const clean = phone.replace(/\D/g, '')
    const url = `https://wa.me/${clean.startsWith('55') ? clean : '55' + clean}`
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <User className="text-orange-500" /> Clientes
          </h1>
          <p className="text-sm text-slate-500">Base de dados unificada de clientes Lumar e Cantina</p>
        </div>
        <button 
          onClick={() => { setEditingClient(null); setShowModal(true) }} 
          className="btn-primary"
        >
          <Plus size={18} /> Novo Cliente
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            className="input pl-10" 
            placeholder="Buscar por nome, telefone, CPF ou setor..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 shrink-0">
          {(['TODOS', 'ATIVO', 'PERDENDO', 'PERDIDO'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                statusFilter === s 
                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s === 'TODOS' ? 'Todos' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando clientes...</div>
      ) : filteredClients.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <User size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClients.map(client => (
            <div key={client.id} className={`card p-4 transition-all hover:shadow-md group flex flex-col justify-between ${client.status === 'PERDIDO' ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-bold text-slate-800 truncate text-sm" title={client.nome}>{client.nome}</h3>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${STATUS_COLORS[client.status]}`}>
                      {STATUS_LABELS[client.status]}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    {client.telefone && (
                      <button
                        onClick={() => openWhatsApp(client.telefone!)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-green-600 transition-colors"
                      >
                        <Phone size={12} className="shrink-0" /> {client.telefone}
                        <ExternalLink size={10} />
                      </button>
                    )}
                    {client.setor && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                        <MapPin size={12} className="shrink-0" /> {client.setor} {client.rota && `· ${client.rota}`}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      {client.tipo && (
                        <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                          {client.tipo}
                        </span>
                      )}
                      {client.carteira && (
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                          <Briefcase size={9} /> {client.carteira}
                        </span>
                      )}
                      {client.manutencao && client.manutencao !== 'INATIVO' && (
                        <span className="text-[10px] font-medium bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-100 flex items-center gap-1">
                          <Wrench size={9} /> {client.manutencao}
                        </span>
                      )}
                      {client.mensagem === 'SIM' && (
                        <span className="text-[10px] font-medium text-green-600 flex items-center gap-0.5">
                          <MessageCircle size={10} /> WA
                        </span>
                      )}
                    </div>
                    {client.pgto && (
                      <p className="text-[10px] font-medium text-slate-400 truncate">{client.pgto}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setEditingClient(client); setShowModal(true) }}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => deleteClient(client.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              {(client.observacoes || client.dia_entrega) && (
                <div className="mt-3 pt-2 border-t border-slate-50 space-y-1">
                  {client.dia_entrega && (
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                      Entrega: {client.dia_entrega}
                    </p>
                  )}
                  {client.observacoes && (
                    <p className="text-[11px] text-slate-400 italic line-clamp-2 leading-relaxed">
                      "{client.observacoes}"
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showModal || editingClient) && (
        <ClientModal 
          client={editingClient} 
          onClose={() => { setShowModal(false); setEditingClient(null) }} 
          onSaved={loadClients} 
        />
      )}
    </div>
  )
}
