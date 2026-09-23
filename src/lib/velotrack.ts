import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { VelotrackPosition } from '../types'

export async function fetchPositions(): Promise<VelotrackPosition[]> {
  const { data, error } = await supabase.functions.invoke('velotrack-positions')
  if (error) {
    // invoke() lança antes de ler o corpo em respostas não-2xx, então a
    // mensagem específica que a function devolve (secrets faltando, login
    // Velotrack falhou, etc.) fica só em error.context — sem isso, o
    // usuário só vê "Edge Function returned a non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string } | null = null
      try { body = await error.context.json() } catch { /* corpo não era JSON — cai no throw genérico abaixo */ }
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}
