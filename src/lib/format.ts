export function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

export function fmtDatetime(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

/** Gera URL do WhatsApp ou null se o número for inválido (< 10 dígitos) */
export function whatsappUrl(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  const digits = telefone.replace(/\D/g, '')
  if (digits.length < 10) return null
  return `https://wa.me/55${digits}`
}

/** Remove acentos, espaços e caracteres especiais — usado para normalizar headers CSV */
export function normalizeKey(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function parseValor(v: string): number {
  if (!v) return 0
  const clean = v.replace(/[^\d,.]/g, '').replace(',', '.')
  return parseFloat(clean) || 0
}
