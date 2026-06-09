import { useState, useEffect, useMemo } from 'react'
import { Store, Plus, Search, Phone, MapPin, Edit2, Trash2, X, Check, RefreshCw, Info, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ClientHistoryModal from '../components/ClientHistoryModal'
import { useSearchParams } from 'react-router-dom'

interface VarejoCliente {
  id: string
  nome: string
  telefone: string | null
  endereco: string | null
  bairro: string | null
  cidade: string
  canal_origem: string | null
  qtd_pedidos: number
  valor_total: number
  ultimo_pedido: string | null
  status: string
  observacoes: string | null
  created_at: string
  updated_at: string
}

type FormData = Omit<VarejoCliente, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: FormData = {
  nome: '',
  telefone: '',
  endereco: '',
  bairro: '',
  cidade: 'São Paulo',
  canal_origem: '',
  qtd_pedidos: 0,
  valor_total: 0,
  ultimo_pedido: null,
  status: 'ATIVO',
  observacoes: '',
}

const CANAIS = ['WhatsApp', 'Instagram', 'iFood', '99Food', 'Ifood', 'Indicação', 'Presencial', 'Outro']
const STATUS_OPTIONS = ['ATIVO', 'INATIVO', 'VIP']

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR')
}

export default function ClientesVarejo() {
  const { canEdit } = useAuth()
  const [clientes, setClientes] = useState<VarejoCliente[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [sortBy, setSortBy]     = useState<'nome' | 'ultimo_pedido'>('nome')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState<VarejoCliente | null>(null)
  const [form, setForm]         = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)
  const [historyClient, setHistoryClient] = useState<VarejoCliente | null>(null)

  async function load() {
    setLoading(true)
    const PAGE = 1000
    let all: VarejoCliente[] = []
    let page = 0
    while (true) {
      const { data } = await supabase
        .from('varejo_clientes')
        .select('*')
        .order(sortBy === 'ultimo_pedido' ? 'ultimo_pedido' : 'nome', {
          ascending: sortBy === 'ultimo_pedido' ? false : true,
        })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (!data || data.length === 0) break
      all = [...all, ...(data as VarejoCliente[])]
      if (data.length < PAGE) break
      page++
    }
    setClientes(all)
    setLoading(false)
  }

  useEffect(() => { load() }, [sortBy])

  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const openId = searchParams.get('openId')
    if (!openId) return
    setSearchParams({}, { replace: true })
    supabase.from('varejo_clientes').select('*').eq('id', openId).single()
      .then(({ data }) => { if (data) openEdit(data as VarejoCliente) })
  }, [])

  const filtered = useMemo(() => {
    let list = clientes
    if (filterStatus !== 'todos') list = list.filter(c => c.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.nome.toLowerCase().includes(q) ||
        c.telefone?.includes(q) ||
        c.bairro?.toLowerCase().includes(q) ||
        c.canal_origem?.toLowerCase().includes(q),
      )
    }
    return list
  }, [clientes, search, filterStatus])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(c: VarejoCliente) {
    setEditing(c)
    setForm({
      nome: c.nome,
      telefone: c.telefone ?? '',
      endereco: c.endereco ?? '',
      bairro: c.bairro ?? '',
      cidade: c.cidade,
      canal_origem: c.canal_origem ?? '',
      qtd_pedidos: c.qtd_pedidos,
      valor_total: c.valor_total,
      ultimo_pedido: c.ultimo_pedido,
      status: c.status,
      observacoes: c.observacoes ?? '',
    })
    setModalOpen(true)
  }

  async function save() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      telefone:     form.telefone?.trim() || null,
      endereco:     form.endereco?.trim() || null,
      bairro:       form.bairro?.trim() || null,
      canal_origem: form.canal_origem?.trim() || null,
      observacoes:  form.observacoes?.trim() || null,
      updated_at:   new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('varejo_clientes').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('varejo_clientes').insert(payload)
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function confirmDelete() {
    if (!deleteId) return
    await supabase.from('varejo_clientes').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  async function syncClientes() {
    setSyncing(true)
    setSyncMsg(null)
    const { data, error } = await supabase.rpc('sync_varejo_clientes')
    if (error) {
      setSyncMsg('Erro ao sincronizar: ' + error.message)
    } else {
      setSyncMsg(`Base sincronizada — ${(data as { total: number }).total} clientes no total`)
      load()
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 5000)
  }

  function set(k: keyof FormData, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Store size={22} className="text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Clientes Varejo</h1>
            <p className="text-xs text-slate-400">{clientes.length} clientes cadastrados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={syncClientes}
            disabled={syncing}
            title="Atualizar base com dados dos pedidos"
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync pedidos'}
          </button>
          {canEdit && (
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={16} /> Novo cliente
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, bairro..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none"
        >
          <option value="todos">Todos</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'nome' | 'ultimo_pedido')}
          className="text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none"
        >
          <option value="nome">Ordenar: Nome A-Z</option>
          <option value="ultimo_pedido">Ordenar: Último pedido (↓)</option>
        </select>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: 'Total', value: clientes.length, color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
          { label: 'Ativos', value: clientes.filter(c => c.status === 'ATIVO').length, color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
          { label: 'VIP', value: clientes.filter(c => c.status === 'VIP').length, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
          { label: 'Inativos', value: clientes.filter(c => c.status === 'INATIVO').length, color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
        ].map(chip => (
          <span key={chip.label} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${chip.color}`}>
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <p className="text-xs text-center text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          {syncMsg}
        </p>
      )}

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700">
        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
          <Info size={11} /> Critérios de status:
        </span>
        <span className="flex items-center gap-1">
          <span className="font-bold text-amber-600 dark:text-amber-400">VIP</span>
          <span className="text-slate-400 dark:text-slate-500">— 5 ou mais pedidos realizados</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="font-bold text-green-600 dark:text-green-400">ATIVO</span>
          <span className="text-slate-400 dark:text-slate-500">— pedido nos últimos 90 dias</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="font-bold text-red-500 dark:text-red-400">INATIVO</span>
          <span className="text-slate-400 dark:text-slate-500">— sem pedidos há mais de 90 dias</span>
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <Store size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}</p>
          {!search && canEdit && (
            <button onClick={openNew} className="mt-3 text-xs text-orange-500 hover:underline">
              + Cadastrar primeiro cliente
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left text-xs">
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Bairro</th>
                  <th className="px-4 py-3 font-semibold">Canal</th>
                  <th className="px-4 py-3 font-semibold text-right">Pedidos</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold">Último</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  {canEdit && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[180px]">{c.nome}</p>
                      {c.observacoes && (
                        <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{c.observacoes}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {c.telefone ? (
                        <a
                          href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-600 dark:text-green-400 hover:underline"
                        >
                          <Phone size={11} /> {c.telefone}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {c.bairro ? (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="shrink-0" /> {c.bairro}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.canal_origem ? (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                          {c.canal_origem}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 dark:text-slate-300">{c.qtd_pedidos}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400 whitespace-nowrap">
                      {fmtCurrency(c.valor_total)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{fmtDate(c.ultimo_pedido)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.status === 'VIP'     ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                        c.status === 'INATIVO' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      }`}>{c.status}</span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setHistoryClient(c)} className="p-1 text-slate-400 hover:text-teal-500 transition-colors" title="Histórico">
                            <History size={14} />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => setDeleteId(c.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-800 dark:text-slate-100">
                {editing ? 'Editar cliente' : 'Novo cliente varejo'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <Field label="Nome *">
                  <input value={form.nome} onChange={e => set('nome', e.target.value)} className="input" placeholder="Nome completo" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Telefone">
                    <input value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value)} className="input" placeholder="(11) 9 0000-0000" />
                  </Field>
                  <Field label="Canal de origem">
                    <select value={form.canal_origem ?? ''} onChange={e => set('canal_origem', e.target.value)} className="input">
                      <option value="">— selecione —</option>
                      {CANAIS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Endereço">
                  <input value={form.endereco ?? ''} onChange={e => set('endereco', e.target.value)} className="input" placeholder="Rua, número" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bairro">
                    <input value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} className="input" placeholder="Bairro" />
                  </Field>
                  <Field label="Cidade">
                    <input value={form.cidade} onChange={e => set('cidade', e.target.value)} className="input" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Qtd pedidos">
                    <input type="number" min={0} value={form.qtd_pedidos} onChange={e => set('qtd_pedidos', parseInt(e.target.value) || 0)} className="input" />
                  </Field>
                  <Field label="Valor total (R$)">
                    <input type="number" min={0} step={0.01} value={form.valor_total} onChange={e => set('valor_total', parseFloat(e.target.value) || 0)} className="input" />
                  </Field>
                  <Field label="Último pedido">
                    <input type="date" value={form.ultimo_pedido ?? ''} onChange={e => set('ultimo_pedido', e.target.value || null)} className="input" />
                  </Field>
                </div>
                <Field label="Status">
                  <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Observações">
                  <textarea value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} rows={2} className="input resize-none" placeholder="Preferências, restrições, notas..." />
                </Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !form.nome.trim()} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                <Check size={14} /> {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Excluir cliente?</p>
            <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {historyClient && (
        <ClientHistoryModal
          clientId={historyClient.id}
          clienteName={historyClient.nome}
          onClose={() => setHistoryClient(null)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
