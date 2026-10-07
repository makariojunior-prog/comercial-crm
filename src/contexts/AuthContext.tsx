import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'vendedor' | 'leitura'

export const ALL_MODULES = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'negocios',   label: 'Negócios' },
  { id: 'visitas',    label: 'Visitas' },
  { id: 'tarefas',    label: 'Tarefas' },
  { id: 'clientes',   label: 'Clientes Atacado' },
  { id: 'rotas',      label: 'Rotas' },
  { id: 'notas',      label: 'Notas' },
  { id: 'promotoria', label: 'Promotoria' },
  { id: 'tabelas',    label: 'Tabelas de Preço' },
  { id: 'logistica',  label: 'Logística' },
  { id: 'varejo',     label: 'Varejo' },
  { id: 'conversas',  label: 'Automações' },
  { id: 'social',     label: 'Redes Sociais' },
  { id: 'atacado',         label: 'Atacado' },
  { id: 'varejo_clientes', label: 'Clientes Varejo' },
  { id: 'cobranca',        label: 'Cobrança' },
  { id: 'comissao',        label: 'Comissões' },
  { id: 'revenda',         label: 'Revenda' },
  { id: 'agenda',          label: 'Agenda' },
  { id: 'comodato',        label: 'Comodato' },
  { id: 'loja',            label: 'Loja' },
] as const


export type ModuleId = typeof ALL_MODULES[number]['id']

export interface CrmUser {
  id: string
  nome: string
  email: string
  role: UserRole
  ativo: boolean
  permissions: string[]
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: CrmUser | null
  role: UserRole | null
  loading: boolean
  isAdmin: boolean
  canEdit: boolean
  canAccess: (module: ModuleId) => boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// O perfil só é relido no refoco da aba depois deste tempo (permissões alteradas por um admin
// continuam chegando sem recarregar a página, mas sem uma consulta a cada troca de aba).
const PERFIL_VALIDO_MS = 10 * 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<CrmUser | null>(null)
  const [loading, setLoading]   = useState(true)
  // Quem tem o perfil carregado e quando — para não reler a cada evento de auth
  const perfil = useRef<{ userId: string; em: number } | null>(null)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('crm_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error('Erro ao carregar perfil:', error.message)
      setProfile(null)
      return
    }
    perfil.current = { userId, em: Date.now() }
    setProfile((data as CrmUser) ?? null)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      setSession(session)
      if (session?.user) loadProfile(session.user.id).finally(() => active && setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setSession(session)
      if (session?.user) {
        // O supabase-js reemite SIGNED_IN toda vez que a aba volta ao foco e TOKEN_REFRESHED a cada
        // renovação do token. Mesma pessoa, perfil recente: nada a reler.
        const p = perfil.current
        const mesmaPessoa = p?.userId === session.user.id
        const recente = p !== null && Date.now() - p.em < PERFIL_VALIDO_MS
        if (mesmaPessoa && recente && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) return
        loadProfile(session.user.id).finally(() => active && setLoading(false))
      } else {
        perfil.current = null
        setProfile(null)
        setLoading(false)
      }
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  // Mantém a mesma referência enquanto for a mesma pessoa: a sessão é renovada com frequência e
  // `user` entra nas dependências de vários efeitos que recarregam dados.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const user = useMemo(() => session?.user ?? null, [session?.user?.id])

  const role    = profile?.role ?? null
  const isAdmin = role === 'admin'
  const canEdit = role === 'admin' || role === 'vendedor'

  function canAccess(module: ModuleId): boolean {
    if (isAdmin) return true
    const perms = profile?.permissions ?? []
    return perms.includes(module)
  }

  return (
    <AuthContext.Provider value={{
      session, user, profile, role, loading, isAdmin, canEdit, canAccess,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
