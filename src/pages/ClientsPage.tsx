import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, User, Phone, MapPin, Edit2, Trash2, ExternalLink, MessageCircle, Briefcase, Wrench, LayoutGrid, List, RefreshCw, CloudDownload, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client, ClientStatus } from '../types'
import ClientModal from '../components/ClientModal'

const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/15ygrVoRh7cd8iVWn0eBXpEz-jBVsOa4jxemmmva2rnA/export?format=csv&gid=338699841'

function normalizeKey(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const COLUMN_MAP: Record<string, keyof Omit<Client, 'id' | 'created_at' | 'status' | 'pedidos_count'>> = {
  nome: 'nome', name: 'nome',
  telefone: 'telefone', fone: 'telefone', celular: 'telefone', phone: 'telefone',
  cnpj: 'cnpj_cpf', cpf: 'cnpj_cpf', cnpjcpf: 'cnpj_cpf',
  rota: 'rota',
  setor: 'setor', bairro: 'setor',
  pgto: 'pgto', pagamento: 'pgto', formapagamento: 'pgto', formadepagamento: 'pgto',
  localizacao: 'localizacao', endereco: 'localizacao', local: 'localizacao',
  observacoes: 'observacoes', obs: 'observacoes', observacao: 'observacoes',
  diaentrega: 'dia_entrega', entrega: 'dia_entrega',
  mensagem: 'mensagem', whatsapp: 'mensagem', wa: 'mensagem',
  bonificacao: 'bonificacao', bonif: 'bonificacao',
  restricao: 'restricao',
  tipo: 'tipo',
  carteira: 'carteira',
  manutencao: 'manutencao',
  frequencia: 'frequencia',
  comodato: 'comodato',
  valor: 'valor',
  observacaoextra: 'observacao_extra',
}

function parseCSV(text: string): Record<string, string>[] {
  // RFC 4180-ish parser that handles quoted fields with embedded commas, newlines and "" escapes
  const rows: string[][] = []
  let cur = ''
  let row: string[] = []
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\r') { /* ignore */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else cur += ch
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row) }
  const nonEmpty = rows.filter(r => r.some(c => c.trim().length > 0))
  if (nonEmpty.length < 2) return []
  const headers = nonEmpty[0].map(h => h.trim())
  return nonEmpty.slice(1).map(vals => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
    return obj
  })
}

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
  const [clients,       setClients]       = useState<Client[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState<ClientStatus | 'TODOS'>('ATIVO')
  const [viewMode,      setViewMode]      = useState<'cards' | 'list'>('list')
  const [syncing,       setSyncing]       = useState(false)
  const [syncMsg,       setSyncMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function syncFromSheets() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch(SHEETS_CSV_URL)
      if (!res.ok) throw new Error(`Erro ao acessar a planilha (${res.status}). Verifique se ela está pública.`)
      const text = await res.text()
      const rows = parseCSV(text)
      if (rows.length === 0) throw new Error('Nenhuma linha encontrada no CSV.')

      // Build existing clients map: normalizedName → id
      const { data: existing } = await supabase.from('crm_clients').select('id, nome')
      const nameMap = new Map<string, string>(
        (existing ?? []).map((c: any) => [normalizeKey(c.nome), c.id])
      )

      const toInsert: any[] = []
      const toUpdate: { id: string; data: any }[] = []

      for (const row of rows) {
        const mapped: any = {}
        for (const [rawKey, rawVal] of Object.entries(row)) {
          const field = COLUMN_MAP[normalizeKey(rawKey)]
          if (field && rawVal) mapped[field] = rawVal
        }
        if (!mapped.nome) continue
        const existingId = nameMap.get(normalizeKey(mapped.nome))
        if (existingId) {
          toUpdate.push({ id: existingId, data: mapped })
        } else {
          toInsert.push({ ...mapped, status: 'ATIVO' })
        }
      }

      let inserted = 0, updated = 0
      if (toInsert.length > 0) {
        const { error } = await supabase.from('crm_clients').insert(toInsert)
        if (error) throw error
        inserted = toInsert.length
      }
      // Run updates in parallel batches of 10 to avoid overwhelming the API
      const BATCH = 10
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const slice = toUpdate.slice(i, i + BATCH)
        await Promise.all(slice.map(({ id, data }) =>
          supabase.from('crm_clients').update(data).eq('id', id)
        ))
      }
      updated = toUpdate.length

      setSyncMsg({ type: 'ok', text: `Sincronização concluída: ${inserted} novos, ${updated} atualizados.` })
      loadClients()
    } catch (err: any) {
      setSyncMsg({ type: 'err', text: err?.message ?? 'Erro desconhecido na sincronização.' })
    }
    setSyncing(false)
  }

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

  const filteredClients = useMemo(() => clients.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.setor?.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj_cpf?.includes(search)
  ), [clients, search])

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
            <User className="text-orange-500" /> Clientes Atacado
          </h1>
          <p className="text-sm text-slate-500">Base de dados unificada de clientes Lumar e Cantina</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setViewMode(v => v === 'cards' ? 'list' : 'cards')}
            className="btn-secondary px-3"
            title={viewMode === 'cards' ? 'Ver como tabela' : 'Ver como cards'}
          >
            {viewMode === 'cards' ? <List size={18} /> : <LayoutGrid size={18} />}
          </button>
          <button
            onClick={syncFromSheets}
            disabled={syncing}
            className="btn-secondary"
            title="Sincronizar com planilha CLIENTES LUMAR"
          >
            {syncing ? <RefreshCw size={16} className="animate-spin" /> : <CloudDownload size={16} />}
            <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sync Planilha'}</span>
          </button>
          <button
            onClick={() => { setEditingClient(null); setShowModal(true) }}
            className="btn-primary"
          >
            <Plus size={18} /> Novo Cliente
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
          syncMsg.type === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {syncMsg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {syncMsg.text}
          <button onClick={() => setSyncMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

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
      ) : viewMode === 'list' ? (
        /* ── TABLE VIEW ── */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Tipo / Carteira</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Setor / Rota</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hidden xl:table-cell">Manutenção</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClients.map(client => (
                  <tr key={client.id} className={`group hover:bg-slate-50 transition-colors ${client.status === 'PERDIDO' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 shrink-0">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border ${STATUS_COLORS[client.status]}`}>
                        {STATUS_LABELS[client.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate max-w-[200px]" title={client.nome}>{client.nome}</p>
                        {client.observacoes && (
                          <p className="text-[10px] text-slate-400 italic truncate max-w-[200px]">{client.observacoes}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {client.tipo && (
                          <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-100">{client.tipo}</span>
                        )}
                        {client.carteira && (
                          <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100">{client.carteira}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                      {client.setor && <span>{client.setor}</span>}
                      {client.rota && <span className="text-slate-400"> · {client.rota}</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {client.telefone ? (
                        <button
                          onClick={() => openWhatsApp(client.telefone!)}
                          className="flex items-center gap-1 text-xs text-slate-600 hover:text-green-600 transition-colors"
                        >
                          <Phone size={11} /> {client.telefone}
                        </button>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-xs text-slate-500">
                      {client.manutencao && client.manutencao !== 'INATIVO' ? (
                        <span className="flex items-center gap-1"><Wrench size={10} /> {client.manutencao}</span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingClient(client); setShowModal(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deleteClient(client.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
            {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''} encontrado{filteredClients.length !== 1 ? 's' : ''}
          </div>
        </div>
      ) : (
        /* ── CARDS VIEW ── */
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
