import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, RefreshCw, ShieldCheck, AlertCircle, KeyRound, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { CrmUser, UserRole } from '../contexts/AuthContext'

const ROLE_LABELS: Record<UserRole, string> = {
  admin:    'Admin',
  vendedor: 'Vendedor',
  leitura:  'Leitura',
}

const ROLE_COLORS: Record<UserRole, string> = {
  admin:    'bg-purple-100 text-purple-700',
  vendedor: 'bg-blue-100 text-blue-700',
  leitura:  'bg-slate-100 text-slate-600',
}

interface UserModalProps {
  editUser: CrmUser | null
  onClose: () => void
  onSaved: () => void
  sessionToken: string
}

function UserModal({ editUser, onClose, onSaved, sessionToken }: UserModalProps) {
  const [nome,     setNome]     = useState(editUser?.nome     ?? '')
  const [email,    setEmail]    = useState(editUser?.email    ?? '')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<UserRole>(editUser?.role ?? 'vendedor')
  const [ativo,    setAtivo]    = useState(editUser?.ativo    ?? true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  async function callFn(body: object) {
    const res = await fetch(`${supabaseUrl}/functions/v1/crm-create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido')
    return json
  }

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')
    if (!editUser && (!email.trim() || !password.trim())) return setError('E-mail e senha são obrigatórios')
    setSaving(true)
    setError(null)
    try {
      if (editUser) {
        await callFn({ action: 'update', userId: editUser.id, nome: nome.trim(), role, ativo })
        if (password.trim()) {
          await callFn({ action: 'reset_password', userId: editUser.id, password: password.trim() })
        }
      } else {
        await callFn({ action: 'create', email: email.trim(), password: password.trim(), nome: nome.trim(), role })
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
      <div className="relative bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <User size={16} /> {editUser ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
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

          <div>
            <label className="label">Perfil de Acesso</label>
            <div className="flex gap-2">
              {(['vendedor', 'leitura', 'admin'] as UserRole[]).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-purple-50 border-purple-300 text-purple-700 border-2'
                        : r === 'vendedor'
                          ? 'bg-blue-50 border-blue-300 text-blue-700 border-2'
                          : 'bg-slate-100 border-slate-300 text-slate-700 border-2'
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {role === 'admin' && 'Acesso total — gerencia usuários e todos os dados.'}
              {role === 'vendedor' && 'Cria e edita negócios, visitas e consulta preços.'}
              {role === 'leitura' && 'Somente visualização — não pode criar nem editar.'}
            </p>
          </div>

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

export default function GestaoUsuarios() {
  const { session, isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/negocios" replace />
  const [users,     setUsers]     = useState<CrmUser[]>([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editUser,  setEditUser]  = useState<CrmUser | null | undefined>(undefined)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('crm_users')
      .select('*')
      .order('nome', { ascending: true })
    if (error) { setLoadError(error.message); setLoading(false); return }
    setUsers(data as CrmUser[] ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  async function deleteUser(u: CrmUser) {
    if (!confirm(`Excluir o usuário "${u.nome}" permanentemente?`)) return
    const res = await fetch(`${supabaseUrl}/functions/v1/crm-create-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'delete', userId: u.id }),
    })
    if (res.ok) setUsers(prev => prev.filter(x => x.id !== u.id))
    else alert('Erro ao excluir usuário')
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={20} className="text-purple-600" /> Gestão de Usuários
          </h1>
          <p className="text-xs text-slate-400">Controle quem acessa o CRM e com qual permissão</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditUser(null)} className="btn-primary">
            <Plus size={16} /> Usuário
          </button>
        </div>
      </div>

      {/* Legenda de perfis */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {(['admin', 'vendedor', 'leitura'] as UserRole[]).map(r => (
          <div key={r} className="card p-3">
            <span className={`inline-block px-2 py-0.5 rounded-full font-medium text-xs ${ROLE_COLORS[r]}`}>{ROLE_LABELS[r]}</span>
            <p className="text-slate-500 mt-1 leading-snug">
              {r === 'admin'    && 'Acesso total, gerencia usuários'}
              {r === 'vendedor' && 'Cria/edita negócios e visitas'}
              {r === 'leitura'  && 'Somente visualização'}
            </p>
          </div>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {loadError}
          <button onClick={load} className="ml-auto text-xs underline">Tentar novamente</button>
        </div>
      )}

      {/* Lista */}
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
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[u.role]}`}>
                {ROLE_LABELS[u.role]}
              </span>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => setEditUser(u)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setEditUser(u)}
                  className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600"
                  title="Redefinir senha"
                >
                  <KeyRound size={14} />
                </button>
                <button
                  onClick={() => deleteUser(u)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editUser !== undefined && (
        <UserModal
          editUser={editUser}
          onClose={() => setEditUser(undefined)}
          onSaved={load}
          sessionToken={session?.access_token ?? ''}
        />
      )}
    </div>
  )
}
