import { useState, useEffect } from 'react'
import { Settings, Users, Plus, Trash2, RefreshCw, UserCheck, ShieldCheck, Briefcase, Edit2, X, Save, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import type { Staff, Role, CrmUser } from '../types'

export default function SettingsPage() {
  const { isAdmin } = useAuth()

  const [staff, setStaff]         = useState<Staff[]>([])
  const [roles, setRoles]         = useState<Role[]>([])
  const [users, setUsers]         = useState<CrmUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<'staff' | 'roles'>('staff')

  // Novo colaborador
  const [newName, setNewName]     = useState('')
  const [newRoleId, setNewRoleId] = useState('')
  const [newUserId, setNewUserId] = useState('')
  const [newPhone, setNewPhone]   = useState('')

  // Edição inline de colaborador
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [editName, setEditName]             = useState('')
  const [editRoleId, setEditRoleId]         = useState('')
  const [editUserId, setEditUserId]         = useState('')
  const [editPhone, setEditPhone]           = useState('')

  // Novo cargo
  const [newRoleName, setNewRoleName] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  if (!isAdmin) return <Navigate to="/negocios" replace />

  async function loadData() {
    setLoading(true)
    const { data: sData } = await supabase
      .from('crm_staff')
      .select('*, role:crm_roles(name), user:crm_users(email)')
      .order('name')
    const { data: rData } = await supabase.from('crm_roles').select('*').eq('active', true).order('name')
    const { data: uData } = await supabase.from('crm_users').select('*').eq('ativo', true).order('nome')

    if (sData) setStaff(sData.map((s: any) => ({ ...s, role_name: s.role?.name, user_email: s.user?.email })))
    if (rData) setRoles(rData)
    if (uData) setUsers(uData as CrmUser[])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── Adicionar colaborador ────────────────────────────
  async function addStaff() {
    if (!newName.trim() || !newRoleId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('crm_staff').insert({
      name:    newName.trim(),
      role_id: newRoleId,
      user_id: newUserId || null,
      phone:   newPhone.trim() || null,
      active:  true,
    })
    if (!err) {
      setNewName(''); setNewPhone(''); setNewRoleId(''); setNewUserId('')
      loadData()
    } else {
      setError(err.message)
    }
    setSaving(false)
  }

  // ── Iniciar edição ───────────────────────────────────
  function startEdit(s: Staff) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditRoleId(s.role_id ?? '')
    setEditUserId(s.user_id ?? '')
    setEditPhone(s.phone ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  // ── Salvar edição ────────────────────────────────────
  async function saveEdit(id: string) {
    if (!editName.trim() || !editRoleId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('crm_staff').update({
      name:    editName.trim(),
      role_id: editRoleId,
      user_id: editUserId || null,
      phone:   editPhone.trim() || null,
    }).eq('id', id)
    if (!err) {
      setEditingId(null)
      loadData()
    } else {
      setError(err.message)
    }
    setSaving(false)
  }

  async function toggleStaffActive(id: string, current: boolean) {
    await supabase.from('crm_staff').update({ active: !current }).eq('id', id)
    loadData()
  }

  async function deleteStaff(id: string) {
    if (!confirm('Excluir este colaborador permanentemente?')) return
    await supabase.from('crm_staff').delete().eq('id', id)
    if (editingId === id) setEditingId(null)
    loadData()
  }

  // ── Cargos ───────────────────────────────────────────
  async function addRole() {
    if (!newRoleName.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('crm_roles').insert({ name: newRoleName.trim(), active: true })
    if (!err) { setNewRoleName(''); loadData() } else { setError(err.message) }
    setSaving(false)
  }

  async function deleteRole(id: string) {
    if (!confirm('Excluir esta função? Colaboradores vinculados perderão a referência.')) return
    await supabase.from('crm_roles').delete().eq('id', id)
    loadData()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-slate-400" /> Configurações
        </h1>
        <p className="text-sm text-slate-500">Gestão de equipe, funções e vínculos de acesso</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-xs text-red-700">
          <span className="shrink-0">⚠</span> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      <div className="flex border-b border-slate-200">
        <button onClick={() => setActiveTab('staff')} className={`px-6 py-3 text-sm font-bold flex items-center gap-2 ${activeTab === 'staff' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400'}`}>
          <Users size={16} /> Equipe Operacional
        </button>
        <button onClick={() => setActiveTab('roles')} className={`px-6 py-3 text-sm font-bold flex items-center gap-2 ${activeTab === 'roles' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400'}`}>
          <Briefcase size={16} /> Funções (Cargos)
        </button>
      </div>

      {/* ── Aba Equipe ─────────────────────────────────── */}
      {activeTab === 'staff' && (
        <div className="space-y-6">

          {/* Form novo colaborador */}
          <div className="card p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-orange-500" /> Cadastrar Novo Colaborador
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Nome Completo</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: João da Silva" />
              </div>
              <div>
                <label className="label text-xs">Função</label>
                <select className="input" value={newRoleId} onChange={e => setNewRoleId(e.target.value)}>
                  <option value="">Selecione uma função...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Vincular a Usuário do Sistema (Opcional)</label>
                <select className="input" value={newUserId} onChange={e => setNewUserId(e.target.value)}>
                  <option value="">Nenhum vínculo...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}
                </select>
                <p className="text-[10px] text-slate-400 mt-1 italic">Permite que o usuário veja as próprias tarefas.</p>
              </div>
              <div>
                <label className="label text-xs">WhatsApp / Telefone</label>
                <input className="input" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(62) 9..." />
              </div>
            </div>
            <button onClick={addStaff} disabled={saving || !newName.trim() || !newRoleId} className="btn-primary mt-6 w-full sm:w-auto">
              {saving ? 'Cadastrando...' : 'Salvar Colaborador'}
            </button>
          </div>

          {/* Lista de colaboradores */}
          <div className="card overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                Equipe ({staff.length})
              </h3>
              <button onClick={loadData} className="text-slate-400 hover:text-orange-500 transition-colors">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {staff.map(s => (
                <div key={s.id}>
                  {/* Linha normal */}
                  <div className={`flex items-center gap-4 px-4 py-3 transition-colors ${editingId === s.id ? 'bg-orange-50' : ''} ${!s.active ? 'opacity-50' : ''}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 text-slate-500 shrink-0 font-bold text-sm">
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">
                        {s.role_name ?? '(sem função)'} {s.phone && `· ${s.phone}`}
                      </p>
                      {s.user_email && (
                        <p className="text-[10px] text-orange-500 font-bold flex items-center gap-1 mt-0.5">
                          <UserCheck size={10} /> {s.user_email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleStaffActive(s.id, s.active)}
                        className={`text-[10px] font-black uppercase px-2 py-1 rounded-full transition-colors ${s.active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                      >
                        {s.active ? 'Ativo' : 'Inativo'}
                      </button>
                      <button
                        onClick={() => editingId === s.id ? cancelEdit() : startEdit(s)}
                        className={`p-2 rounded-lg transition-colors ${editingId === s.id ? 'bg-orange-100 text-orange-500' : 'text-slate-300 hover:text-orange-500 hover:bg-orange-50'}`}
                        title={editingId === s.id ? 'Cancelar edição' : 'Editar'}
                      >
                        {editingId === s.id ? <X size={15} /> : <Edit2 size={15} />}
                      </button>
                      <button
                        onClick={() => deleteStaff(s.id)}
                        className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Painel de edição inline */}
                  {editingId === s.id && (
                    <div className="px-4 pb-4 pt-1 bg-orange-50 border-t border-orange-100">
                      <p className="text-[10px] font-black text-orange-500 uppercase tracking-wider mb-3">
                        Editando: {s.name}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="label text-xs">Nome Completo</label>
                          <input
                            className="input bg-white"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Nome..."
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Função</label>
                          <select className="input bg-white" value={editRoleId} onChange={e => setEditRoleId(e.target.value)}>
                            <option value="">Selecione...</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Usuário do Sistema</label>
                          <select className="input bg-white" value={editUserId} onChange={e => setEditUserId(e.target.value)}>
                            <option value="">Nenhum vínculo</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">WhatsApp / Telefone</label>
                          <input
                            className="input bg-white"
                            value={editPhone}
                            onChange={e => setEditPhone(e.target.value)}
                            placeholder="(62) 9..."
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => saveEdit(s.id)}
                          disabled={saving || !editName.trim() || !editRoleId}
                          className="btn-primary py-2 px-4 text-sm gap-1.5"
                        >
                          <Save size={14} /> {saving ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                        <button onClick={cancelEdit} className="btn-secondary py-2 px-4 text-sm">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {staff.length === 0 && !loading && (
                <p className="p-8 text-center text-slate-400 text-sm italic">Nenhum colaborador cadastrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Aba Cargos ─────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-orange-500" /> Nova Função / Cargo
            </h2>
            <div className="flex gap-2">
              <input
                className="input"
                value={newRoleName}
                onChange={e => setNewRoleName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRole()}
                placeholder="Ex: Motorista, Promotor, Vendedor..."
              />
              <button onClick={addRole} disabled={saving || !newRoleName.trim()} className="btn-primary shrink-0">
                {saving ? '...' : 'Adicionar'}
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Funções Cadastradas ({roles.length})</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {roles.map(r => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{r.name}</span>
                  <button onClick={() => deleteRole(r.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {roles.length === 0 && <p className="p-8 text-center text-slate-400 text-sm italic">Nenhuma função cadastrada.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
