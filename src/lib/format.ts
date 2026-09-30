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

/**
 * Normaliza um telefone brasileiro para o formato internacional do WhatsApp
 * (55 + DDD + número), ou null se não for um número válido.
 *
 * O código do país é obrigatório no wa.me: sem o 55, o começo do número é lido como código
 * de outro país (DDD 62 vira Indonésia, 64 Nova Zelândia, 66 Tailândia...) e o link abre
 * o chat errado ou dá "número inválido".
 */
export function normalizeBrPhone(telefone: string | null | undefined): string | null {
  if (!telefone) return null
  let d = telefone.replace(/\D/g, '').replace(/^0+/, '')
  // Já com código do país (55 + DDD + 8/9 dígitos). Com 10/11 dígitos o 55 é o DDD do RS.
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11) return null
  // Celular com 9 dígitos sempre começa com 9
  if (d.length === 11 && d[2] !== '9') return null
  return `55${d}`
}

/**
 * ID do contato no WhatsApp (o que vai no wa.me). O WhatsApp registra celulares de DDD
 * fora da faixa 11–28 SEM o nono dígito: 55 62 9 8105-7897 é a conta 55 62 8105-7897.
 * Com o 9, o WhatsApp Web/Desktop responde "o número não está no WhatsApp". Confirmado
 * nos contatos do Digisac: 529 clientes da Recompra casam sem o 9 e só 16 com o 9.
 */
export function whatsappId(telefone: string | null | undefined): string | null {
  const n = normalizeBrPhone(telefone)
  if (!n) return null
  const ddd = Number(n.slice(2, 4))
  if (n.length === 13 && ddd > 28) return n.slice(0, 4) + n.slice(5)
  return n
}

/** Gera URL do WhatsApp ou null se o número for inválido */
export function whatsappUrl(telefone: string | null | undefined): string | null {
  const id = whatsappId(telefone)
  return id ? `https://wa.me/${id}` : null
}

/** Remove acentos, espaços e caracteres especiais — usado para normalizar headers CSV */
export function normalizeKey(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

export function parseValor(v: string): number {
  if (!v) return 0
  const stripped = v.replace(/[^\d,.]/g, '')
  if (!stripped) return 0
  // BR format "1.410,50": dot=thousands separator, comma=decimal separator
  if (stripped.includes(',') && stripped.includes('.')) {
    return parseFloat(stripped.replace(/\./g, '').replace(',', '.')) || 0
  }
  // Only comma "267,50": comma is decimal
  if (stripped.includes(',')) return parseFloat(stripped.replace(',', '.')) || 0
  // Only dot "1410.50" or no separator "1410": already numeric
  return parseFloat(stripped) || 0
}
