import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, RefreshCw, ShieldCheck, AlertCircle, KeyRound, User, Users, Briefcase, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ALL_MODULES } from '../contexts/AuthContext'
import type { CrmUser, UserRole } from '../contexts/AuthContext'
import type { Staff, Role } from '../types'

// ─── User Modal ───────────────────────────────────────────────────────────────

interface UserModalProps {
  editUser: CrmUser | null
  onClose: () => void
  onSaved: () => void
  sessionToken: string
}

function UserModal({ editUser, onClose, onSaved, sessionToken }: UserModalProps) {
  const [nome,        setNome]        = useState(editUser?.nome  ?? '')
  const [email,       setEmail]       = useState(editUser?.email ?? '')
  const [password,    setPassword]    = useState('')
  const [isAdmin,     setIsAdmin]     = useState(editUser?.role === 'admin')
  const [permissions, setPermissions] = useState<string[]>(
    editUser?.permissions?.length ? editUser.permissions : ALL_MODULES.map(m => m.id)
  )
  const [ativo,  setAtivo]  = useState(editUser?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  async function callFn(body: object) {
    const res = await fetch(`${supabaseUrl}/functions/v1/crm-create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido')
    return json
  }

  function togglePerm(id: string) {
    setPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')
    if (!editUser && (!email.trim() || !password.trim())) return setError('E-mail e senha são obrigatórios')
    setSaving(true)
    setError(null)
    try {
      const role: UserRole = isAdmin ? 'admin' : 'vendedor'
      if (editUser) {
        await callFn({ action: 'update', userId: editUser.id, nome: nome.trim(), role, ativo })
        if (password.trim()) await callFn({ action: 'reset_password', userId: editUser.id, password: password.trim() })
        await supabase.from('crm_users').update({ permissions: isAdmin ? [] : permissions }).eq('id', editUser.id)
      } else {
        const result = await callFn({ action: 'create', email: email.trim(), password: password.trim(), nome: nome.trim(), role })
        if (result?.userId) {
          await supabase.from('crm_users').update({ permissions: isAdmin ? [] : permissions }).eq('id', result.userId)
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <User size={16} /> {editUser ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" autoFocus />
          </div>

          {!editUser && (
            <div>
              <label className="label">E-mail</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" />
            </div>
          )}

          <div>
            <label className="label">{editUser ? 'Nova Senha (opcional)' : 'Senha'}</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {/* Admin toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-200">
            <div>
              <p className="text-sm font-bold text-purple-800">Administrador</p>
              <p className="text-xs text-purple-600">Acesso total — gerencia usuários e todos os módulos</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAdmin(v => !v)}
              className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${isAdmin ? 'bg-purple-500' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isAdmin ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Module permissions */}
          {!isAdmin && (
            <div>
              <label className="label">Módulos com acesso</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(mod => {
                  const on = permissions.includes(mod.id)
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => togglePerm(mod.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                        on
                          ? 'bg-orange-50 border-orange-300 text-orange-700'
                          : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'bg-orange-500 border-orange-500' : 'border-slate-300'}`}>
                        {on && <span className="text-white text-[8px] font-black">✓</span>}
                      </span>
                      {mod.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setPermissions(ALL_MODULES.map(m => m.id))} className="text-xs text-orange-600 hover:underline">Marcar todos</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => setPermissions([])} className="text-xs text-slate-500 hover:underline">Desmarcar todos</button>
              </div>
            </div>
          )}

          {editUser && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 accent-orange-500" />
              Usuário ativo
            </label>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : editUser ? 'Salvar' : 'Criar Usuário'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Role Modal ───────────────────────────────────────────────────────────────

function RoleModal({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const [name,   setName]   = useState(role?.name   ?? '')
  const [active, setActive] = useState(role?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return setError('Nome é obrigatório')
    setSaving(true)
    setError(null)
    try {
      if (role) {
        const { error: e } = await supabase.from('crm_roles').update({ name: name.trim(), active }).eq('id', role.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('crm_roles').insert({ name: name.trim(), active })
        if (e) throw e
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Briefcase size={16} /> {role ? 'Editar Função' : 'Nova Função'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">Nome da Função</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promotor, Motorista..." autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Função ativa
          </label>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : role ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Staff Modal ──────────────────────────────────────────────────────────────

function StaffModal({ staff, roles, users, onClose, onSaved }: {
  staff: Staff | null; roles: Role[]; users: CrmUser[]
  onClose: () => void; onSaved: () => void
}) {
  const [name,   setName]   = useState(staff?.name    ?? '')
  const [phone,  setPhone]  = useState(staff?.phone   ?? '')
  const [roleId, setRoleId] = useState(staff?.role_id ?? '')
  const [userId, setUserId] = useState(staff?.user_id ?? '')
  const [active, setActive] = useState(staff?.active  ?? true)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function save() {
    if (!name.trim()) return setError('Nome é obrigatório')
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name:    name.trim(),
        phone:   phone.trim() || null,
        role_id: roleId || null,
        user_id: userId || null,
        active,
      }
      if (staff) {
        const { error: e } = await supabase.from('crm_staff').update(payload).eq('id', staff.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('crm_staff').insert(payload)
        if (e) throw e
      }
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={16} /> {staff ? 'Editar Membro' : 'Novo Membro'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xl leading-none">&times;</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" autoFocus />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <label className="label">Função</label>
            <select className="input" value={roleId} onChange={e => setRoleId(e.target.value)}>
              <option value="">— Sem função —</option>
              {roles.filter(r => r.active).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label flex items-center gap-1.5"><Link2 size={12} /> Vínculo com usuário do CRM</label>
            <select className="input" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">— Sem vínculo —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">Vincule para associar eventos e promotoria ao login do colaborador</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            Membro ativo
          </label>
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : staff ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'usuarios' | 'equipe' | 'funcoes'

export default function GestaoUsuarios() {
  const { session, isAdmin } = useAuth()

  const [tab,       setTab]       = useState<Tab>('usuarios')
  const [users,     setUsers]     = useState<CrmUser[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [roles,     setRoles]     = useState<Role[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editUser,  setEditUser]  = useState<CrmUser | null | undefined>(undefined)
  const [editStaff, setEditStaff] = useState<Staff  | null | undefined>(undefined)
  const [editRole,  setEditRole]  = useState<Role   | null | undefined>(undefined)

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    const [uRes, sRes, rRes] = await Promise.all([
      supabase.from('crm_users').select('*').order('nome'),
      supabase.from('crm_staff').select('*, role:crm_roles(name)').order('name'),
      supabase.from('crm_roles').select('*').order('name'),
    ])
    if (uRes.error) { setLoadError(uRes.error.message); setLoading(false); return }
    setUsers((uRes.data ?? []) as CrmUser[])
    setStaffList((sRes.data ?? []).map((s: any) => ({ ...s, role_name: s.role?.name })) as Staff[])
    setRoles((rRes.data ?? []) as Role[])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) loadAll() }, [isAdmin])

  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  async function deleteUser(u: CrmUser) {
    if (!confirm(`Excluir o usuário "${u.nome}" permanentemente?`)) return
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/crm-create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: 'delete', userId: u.id }),
      })
      if (res.ok) {
        setUsers(prev => prev.filter(x => x.id !== u.id))
      } else {
        const body = await res.json().catch(() => ({}))
        alert('Erro ao excluir usuário: ' + (body?.error ?? res.statusText))
      }
    } catch (err: any) {
      alert('Erro ao excluir usuário: ' + (err?.message ?? 'falha de rede'))
    }
  }

  async function deleteStaff(id: string) {
    if (!confirm('Excluir este membro?')) return
    await supabase.from('crm_staff').delete().eq('id', id)
    setStaffList(prev => prev.filter(s => s.id !== id))
  }

  async function deleteRole(id: string) {
    if (!confirm('Excluir esta função?')) return
    await supabase.from('crm_roles').delete().eq('id', id)
    setRoles(prev => prev.filter(r => r.id !== id))
  }

  const TABS: { id: Tab; label: string; Icon: any }[] = [
    { id: 'usuarios', label: `Usuários (${users.length})`,      Icon: ShieldCheck },
    { id: 'equipe',   label: `Equipe (${staffList.length})`,    Icon: Users       },
    { id: 'funcoes',  label: `Funções (${roles.length})`,       Icon: Briefcase   },
  ]

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={20} className="text-purple-600" /> Usuários & Equipe
          </h1>
          <p className="text-xs text-slate-400">Gerencie acessos, equipe operacional e funções</p>
        </div>
        <button onClick={loadAll} className="btn-ghost p-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {loadError}
          <button onClick={loadAll} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* ── Usuários ── */}
      {tab === 'usuarios' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditUser(null)} className="btn-primary">
              <Plus size={16} /> Usuário
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">Nenhum usuário encontrado</div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-50">
              {users.map(u => (
                <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${!u.ativo ? 'opacity-50' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User size={16} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">
                      {u.nome || '(sem nome)'}
                      {!u.ativo && <span className="ml-2 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">inativo</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{u.email}</p>
                  </div>
                  {u.role === 'admin' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">Admin</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {(u.permissions ?? []).length} módulos
                    </span>
                  )}
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditUser(u)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setEditUser(u)} className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600" title="Redefinir senha">
                      <KeyRound size={14} />
                    </button>
                    <button onClick={() => deleteUser(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Equipe ── */}
      {tab === 'equipe' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditStaff(null)} className="btn-primary">
              <Plus size={16} /> Membro
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
          ) : staffList.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">Nenhum membro cadastrado</div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-50">
              {staffList.map(s => {
                const linkedUser = users.find(u => u.id === s.user_id)
                return (
                  <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${!s.active ? 'opacity-50' : ''}`}>
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <Users size={16} className="text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">
                        {s.name}
                        {!s.active && <span className="ml-2 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">inativo</span>}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.role_name && (
                          <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">{s.role_name}</span>
                        )}
                        {linkedUser && (
                          <span className="text-[10px] text-blue-600 flex items-center gap-0.5">
                            <Link2 size={9} /> {linkedUser.nome}
                          </span>
                        )}
                        {s.phone && <span className="text-[10px] text-slate-400">{s.phone}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditStaff(s)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteStaff(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Funções ── */}
      {tab === 'funcoes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditRole(null)} className="btn-primary">
              <Plus size={16} /> Função
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">Carregando...</div>
          ) : roles.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">Nenhuma função cadastrada</div>
          ) : (
            <div className="card overflow-hidden divide-y divide-slate-50">
              {roles.map(r => (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${!r.active ? 'opacity-50' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                    <Briefcase size={16} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{r.name}</p>
                    {!r.active && <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">inativa</span>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditRole(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteRole(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {editUser !== undefined && (
        <UserModal
          editUser={editUser}
          onClose={() => setEditUser(undefined)}
          onSaved={loadAll}
          sessionToken={session?.access_token ?? ''}
        />
      )}
      {editStaff !== undefined && (
        <StaffModal
          staff={editStaff}
          roles={roles}
          users={users}
          onClose={() => setEditStaff(undefined)}
          onSaved={loadAll}
        />
      )}
      {editRole !== undefined && (
        <RoleModal
          role={editRole}
          onClose={() => setEditRole(undefined)}
          onSaved={loadAll}
        />
      )}
    </div>
  )
}
