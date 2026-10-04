import { supabase } from './supabase'

export type IfoodAcao =
  | 'merchants' | 'detalhes' | 'status'
  | 'pausas' | 'pausar' | 'reabrir'
  | 'horarios' | 'definir-horarios'

export interface IfoodResposta<T = unknown> {
  ok: boolean
  status: number
  action: string
  resultado?: T
  erro?: string
  detalhe?: unknown
}

/** Chama a Edge Function ifood-merchant (módulo Merchant do iFood) com a sessão do usuário. */
export async function chamarIfoodMerchant<T = unknown>(
  action: IfoodAcao,
  params: Record<string, unknown> = {},
): Promise<IfoodResposta<T>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, status: 401, action, erro: 'Sessão expirada — entre novamente.' }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ifood-merchant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...params }),
  })
  const corpo = await res.json().catch(() => ({}))
  return { ok: res.ok && corpo.ok !== false, status: res.status, action, ...corpo }
}
