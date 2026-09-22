import { supabase } from './supabase'
import type { VelotrackPosition } from '../types'

export async function fetchPositions(): Promise<VelotrackPosition[]> {
  const { data, error } = await supabase.functions.invoke('velotrack-positions')
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return Array.isArray(data) ? data : []
}
