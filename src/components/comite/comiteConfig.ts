/** Visitas e negócios só entram no comitê semanal a partir desta data (segunda-feira 12/10/2026). */
export const CORTE_COMITE = '2026-10-12'

export interface PeriodoComite {
  ini: string // yyyy-MM-dd
  fim: string // yyyy-MM-dd
}

/** Limita o início do período à data de corte. */
export const iniEfetivo = (ini: string) => (ini < CORTE_COMITE ? CORTE_COMITE : ini)

/** Variação percentual textual em relação ao período anterior ("—" quando não há base). */
export function variacao(atual: number, anterior: number): { texto: string; sobe: boolean | null } {
  if (!anterior) return { texto: atual ? 'novo' : '—', sobe: null }
  const pct = ((atual - anterior) / anterior) * 100
  if (Math.abs(pct) < 0.05) return { texto: '0%', sobe: null }
  return { texto: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, sobe: pct > 0 }
}
