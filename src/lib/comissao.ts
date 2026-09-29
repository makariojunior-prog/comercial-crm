export function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDateSimple(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.substring(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function getYears() {
  const now = new Date().getFullYear()
  const years: number[] = []
  for (let y = 2024; y <= now + 1; y++) years.push(y)
  return years
}
