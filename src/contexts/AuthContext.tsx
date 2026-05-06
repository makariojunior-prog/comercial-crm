import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRole = 'admin' | 'vendedor' | 'leitura'

export interface CrmUser {
  id: string
  nome: string
  email: string
  role: UserRole
  ativo: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: CrmUser | null
  role: UserRole | null
  loading: boolean
  isAdmin: boolean
  canEdit: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null)
  const [profile, setProfile]   = useState<CrmUser | null>(null)
  const [loading, setLoading]   = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('crm_users')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data as CrmUser ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
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

  const role    = profile?.role ?? null
  const isAdmin = role === 'admin'
  const canEdit = role === 'admin' || role === 'vendedor'

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, profile, role, loading, isAdmin, canEdit,
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
