import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, X, Pencil, Trash2, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client } from '../types'

interface CobrancaRecord {
  id: number
  crm_client_id: string | null
  cliente_nome: string
  tipo: 'NOTA' | 'BOLETO'
  empresa: 'CANTINA' | 'LUMAR'
  data_emissao: string | null
  valor: number
  situacao: 'EM ABERTO' | 'PAGO' | 'PROTESTO'
  data_pagamento: string | null
  observacao: string | null
  created_at: string
}

const SITUACAO_COLORS: Record<string, string> = {
  'EM ABERTO': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200',
  'PAGO':      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200',
  'PROTESTO':  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200',
}

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function CobrancaPage() {
  const [records,       setRecords]       = useState<CobrancaRecord[]>([])
  const [clients,       setClients]       = useState<Pick<Client, 'id' | 'nome'>[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [editingRecord, setEditingRecord] = useState<CobrancaRecord | null>(null)
  const [situacaoFilter, setSituacaoFilter] = useState<string>('EM ABERTO')
  const [empresaFilter,  setEmpresaFilter]  = useState<string>('TODOS')
  const [search,         setSearch]         = useState('')

  async function loadData() {
    setLoading(true)
    const [{ data: recs }, { data: cls }] = await Promise.all([
      supabase.from('cobranca').select('*').order('data_emissao', { ascending: false }),
      supabase.from('crm_clients').select('id, nome').order('nome'),
    ])
    setRecords((recs ?? []) as CobrancaRecord[])
    setClients((cls ?? []) as Pick<Client, 'id' | 'nome'>[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  async function deleteRecord(id: number) {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('cobranca').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  const filtered = useMemo(() => records.filter(r => {
    if (situacaoFilter !== 'TODOS' && r.situacao !== situacaoFilter) return false
    if (empresaFilter  !== 'TODOS' && r.empresa  !== empresaFilter)  return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!r.cliente_nome.toLowerCase().includes(q)) return false
    }
    return true
  }), [records, situacaoFilter, empresaFilter, search])

  const totalAberto    = useMemo(() => records.filter(r => r.situacao === 'EM ABERTO').reduce((s, r) => s + r.valor, 0), [records])
  const totalProtesto  = useMemo(() => records.filter(r => r.situacao === 'PROTESTO').reduce((s, r) => s + r.valor, 0), [records])
  const filteredAberto = useMemo(() => filtered.filter(r => r.situacao === 'EM ABERTO').reduce((s, r) => s + r.valor, 0), [filtered])

  function openNew() { setEditingRecord(null); setShowModal(true) }
  function openEdit(r: CobrancaRecord) { setEditingRecord(r); setShowModal(true) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <FileText size={22} className="text-orange-500" />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Cobrança</h1>
            <p className="text-xs text-slate-400">Controle de notas e boletos a receber</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Novo Lançamento
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total em Aberto</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmtCurrency(totalAberto)}</p>
          <p className="text-[10px] text-slate-400">{records.filter(r => r.situacao === 'EM ABERTO').length} lançamentos</p>
        </div>
        <div className="card p-3.5">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Em Protesto</p>
          <p className="text-xl font-bold text-red-600 dark:text-red-400">{fmtCurrency(totalProtesto)}</p>
          <p className="text-[10px] text-slate-400">{records.filter(r => r.situacao === 'PROTESTO').length} lançamentos</p>
        </div>
        <div className="card p-3.5 col-span-2 lg:col-span-1">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Filtro atual — em aberto</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{fmtCurrency(filteredAberto)}</p>
          <p className="text-[10px] text-slate-400">{filtered.filter(r => r.situacao === 'EM ABERTO').length} lançamentos</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {(['TODOS', 'EM ABERTO', 'PAGO', 'PROTESTO'] as const).map(s => (
            <button key={s} onClick={() => setSituacaoFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                situacaoFilter === s
                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}>
              {s === 'TODOS' ? 'Todas' : s}
            </button>
          ))}
          <select
            value={empresaFilter}
            onChange={e => setEmpresaFilter(e.target.value)}
            className="input w-auto text-xs"
          >
            <option value="TODOS">Todas empresas</option>
            <option value="CANTINA">CANTINA</option>
            <option value="LUMAR">LUMAR</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-20" />
          <p>Nenhum lançamento encontrado</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-left">
                  <th className="px-3 py-2.5 font-semibold">Cliente</th>
                  <th className="px-3 py-2.5 font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 font-semibold">Empresa</th>
                  <th className="px-3 py-2.5 font-semibold">Emissão</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                  <th className="px-3 py-2.5 font-semibold">Situação</th>
                  <th className="px-3 py-2.5 font-semibold">Pgto</th>
                  <th className="px-3 py-2.5 font-semibold">Obs</th>
                  <th className="px-3 py-2.5 w-14"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${r.situacao === 'EM ABERTO' ? 'bg-amber-50/30 dark:bg-amber-900/5' : r.situacao === 'PROTESTO' ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100 max-w-[200px] truncate" title={r.cliente_nome}>{r.cliente_nome}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.tipo}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.empresa === 'CANTINA' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                        {r.empresa}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(r.data_emissao)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmtCurrency(r.valor)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SITUACAO_COLORS[r.situacao] ?? ''}`}>
                        {r.situacao}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{fmtDate(r.data_pagamento)}</td>
                    <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate" title={r.observacao ?? ''}>{r.observacao ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-orange-500 transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteRecord(r.id)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400">
            {filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}
            {filteredAberto > 0 && ` · ${fmtCurrency(filteredAberto)} em aberto`}
          </div>
        </div>
      )}

      {showModal && (
        <CobrancaModal
          record={editingRecord}
          clients={clients}
          onClose={() => { setShowModal(false); setEditingRecord(null) }}
          onSaved={loadData}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CobrancaModalProps {
  record: CobrancaRecord | null
  clients: Pick<Client, 'id' | 'nome'>[]
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  crm_client_id: string
  cliente_nome: string
  tipo: 'NOTA' | 'BOLETO'
  empresa: 'CANTINA' | 'LUMAR'
  data_emissao: string
  valor: string
  situacao: 'EM ABERTO' | 'PAGO' | 'PROTESTO'
  data_pagamento: string
  observacao: string
}

const EMPTY_FORM: FormState = {
  crm_client_id: '',
  cliente_nome: '',
  tipo: 'NOTA',
  empresa: 'CANTINA',
  data_emissao: new Date().toISOString().slice(0, 10),
  valor: '',
  situacao: 'EM ABERTO',
  data_pagamento: '',
  observacao: '',
}

function CobrancaModal({ record, clients, onClose, onSaved }: CobrancaModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    record
      ? {
          crm_client_id:  record.crm_client_id ?? '',
          cliente_nome:   record.cliente_nome,
          tipo:           record.tipo,
          empresa:        record.empresa,
          data_emissao:   record.data_emissao ?? new Date().toISOString().slice(0, 10),
          valor:          String(record.valor),
          situacao:       record.situacao,
          data_pagamento: record.data_pagamento ?? '',
          observacao:     record.observacao ?? '',
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)

  function f<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleClientSelect(clientId: string) {
    const client = clients.find(c => c.id === clientId)
    setForm(prev => ({
      ...prev,
      crm_client_id: clientId,
      cliente_nome:  client?.nome ?? prev.cliente_nome,
    }))
  }

  async function handleSave() {
    if (!form.cliente_nome.trim()) return
    setSaving(true)
    const payload = {
      crm_client_id:  form.crm_client_id || null,
      cliente_nome:   form.cliente_nome.trim(),
      tipo:           form.tipo,
      empresa:        form.empresa,
      data_emissao:   form.data_emissao || null,
      valor:          parseFloat(form.valor) || 0,
      situacao:       form.situacao,
      data_pagamento: form.data_pagamento || null,
      observacao:     form.observacao.trim() || null,
      updated_at:     new Date().toISOString(),
    }
    if (record) {
      await supabase.from('cobranca').update(payload).eq('id', record.id)
    } else {
      await supabase.from('cobranca').insert(payload)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">
            {record ? 'Editar Lançamento' : 'Novo Lançamento'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Cliente */}
          <div>
            <label className="label">Cliente (Clientes Atacado)</label>
            <select
              value={form.crm_client_id}
              onChange={e => handleClientSelect(e.target.value)}
              className="input"
            >
              <option value="">— selecionar cliente —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {!form.crm_client_id && (
              <input
                className="input mt-2"
                placeholder="Ou digitar nome manualmente..."
                value={form.cliente_nome}
                onChange={e => f('cliente_nome', e.target.value)}
              />
            )}
          </div>

          {/* Tipo + Empresa */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select value={form.tipo} onChange={e => f('tipo', e.target.value as 'NOTA' | 'BOLETO')} className="input">
                <option value="NOTA">NOTA</option>
                <option value="BOLETO">BOLETO</option>
              </select>
            </div>
            <div>
              <label className="label">Empresa</label>
              <select value={form.empresa} onChange={e => f('empresa', e.target.value as 'CANTINA' | 'LUMAR')} className="input">
                <option value="CANTINA">CANTINA</option>
                <option value="LUMAR">LUMAR</option>
              </select>
            </div>
          </div>

          {/* Situação */}
          <div>
            <label className="label">Situação</label>
            <select value={form.situacao} onChange={e => f('situacao', e.target.value as 'EM ABERTO' | 'PAGO' | 'PROTESTO')} className="input">
              <option value="EM ABERTO">EM ABERTO</option>
              <option value="PAGO">PAGO</option>
              <option value="PROTESTO">PROTESTO</option>
            </select>
          </div>

          {/* Data emissão + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data de emissão</label>
              <input
                type="date"
                value={form.data_emissao}
                onChange={e => f('data_emissao', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={e => f('valor', e.target.value)}
                className="input"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Data pagamento — só mostra se não for EM ABERTO */}
          {form.situacao !== 'EM ABERTO' && (
            <div>
              <label className="label">Data de pagamento</label>
              <input
                type="date"
                value={form.data_pagamento}
                onChange={e => f('data_pagamento', e.target.value)}
                className="input"
              />
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="label">Observação</label>
            <input
              value={form.observacao}
              onChange={e => f('observacao', e.target.value)}
              className="input"
              placeholder="Ex.: UMA NOTA PELA OUTRA, CARTÓRIO..."
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-2 justify-end sticky bottom-0 bg-white dark:bg-slate-800">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.cliente_nome.trim()}
            className="btn-primary"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
