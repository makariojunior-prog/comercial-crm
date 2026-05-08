import { useState, useEffect } from 'react'
import { Plus, Search, Filter, User, Phone, MapPin, MoreVertical, Edit2, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client } from '../types'
import ClientModal from '../components/ClientModal'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [search, setSearch] = useState('')

  async function loadClients() {
    setLoading(true)
    const { data, error } = await supabase
      .from('crm_clients')
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      console.error('Error loading clients:', error)
    } else {
      setClients(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

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
    c.setor?.toLowerCase().includes(search.toLowerCase())
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

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            className="input pl-10" 
            placeholder="Buscar por nome, telefone ou setor..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary px-3">
          <Filter size={18} />
        </button>
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
            <div key={client.id} className={`card p-4 transition-all hover:shadow-md group ${!client.ativo ? 'opacity-60 bg-slate-50' : 'bg-white'}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-800 truncate">{client.nome}</h3>
                    {!client.ativo && (
                      <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full uppercase font-bold">Inativo</span>
                    )}
                  </div>
                  
                  <div className="space-y-1.5">
                    {client.telefone && (
                      <button 
                        onClick={() => openWhatsApp(client.telefone!)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-green-600 transition-colors"
                      >
                        <Phone size={12} /> {client.telefone}
                        <ExternalLink size={10} />
                      </button>
                    )}
                    {client.setor && (
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin size={12} /> {client.setor}
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {client.empresa && (
                        <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full border border-orange-100">
                          {client.empresa.toUpperCase()}
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-slate-400">
                        {client.pedidos_count} pedidos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => { setEditingClient(client); setShowModal(true) }}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => deleteClient(client.id)}
                    className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              {client.observacao && (
                <p className="text-xs text-slate-400 mt-3 italic line-clamp-1 border-t border-slate-50 pt-2">
                  "{client.observacao}"
                </p>
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
