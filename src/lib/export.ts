import * as XLSX from 'xlsx'
import type { Deal, Visit, PriceItem } from '../types'

export function exportDeals(deals: Deal[]) {
  const rows = deals.map(d => ({
    'Data Início': d.start_date ?? '',
    'Cliente': d.client_name,
    'Contato': d.contact_name ?? '',
    'Telefone': d.contact_phone ?? '',
    'Tipo': d.deal_type ?? '',
    'Responsável': d.responsible ?? '',
    'Interesse': d.interest ?? '',
    'Último Contato': d.last_contact_date ?? '',
    'Status': d.status ?? '',
    'Prioridade': d.priority ?? '',
    'Acompanhamento': d.follow_up ?? '',
    'Data Fim': d.end_date ?? '',
    'Potencial não atendido': d.potential_notes ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Negócios')
  XLSX.writeFile(wb, `CRM_Negocios_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export function exportPriceItems(items: PriceItem[], empresa: 'lumar' | 'cantina', modoTabela = false) {
  const fmt = (v: number | null) => v != null ? v : ''
  const mg  = (p: number | null, c: number | null) =>
    p && c ? +((p - c) / p * 100).toFixed(1) : ''

  const rows = items.map(it => {
    const base: Record<string, string | number | boolean> = { 'Produto': it.nome }
    if (!modoTabela) base['Custo (R$)'] = fmt(it.custo)
    if (empresa === 'lumar') {
      base['Preço Lumar (R$/kg)'] = fmt(it.preco_lumar)
      if (!modoTabela) base['Margem %'] = mg(it.preco_lumar, it.custo)
    } else {
      base['Preço Varejo (R$/pct)']  = fmt(it.preco_varejo)
      base['Preço Revenda (R$/pct)'] = fmt(it.preco_revenda)
      if (!modoTabela) {
        base['Mg. Varejo %']  = mg(it.preco_varejo,  it.custo)
        base['Mg. Revenda %'] = mg(it.preco_revenda, it.custo)
      }
    }
    base['PF']    = it.pf ? 'Sim' : ''
    base['Ativo'] = it.ativo ? 'Sim' : 'Não'
    return base
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  const sheetName = empresa === 'lumar' ? 'Lumar' : 'Cantina em Casa'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const suffix = modoTabela ? '_tabela_comercial' : '_completa'
  XLSX.writeFile(wb, `Precos_${sheetName}${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`)
}

export function exportVisits(visits: Visit[]) {
  const rows = visits.map(v => ({
    'Data': v.visit_date ?? '',
    'Tipo': v.visit_type ?? '',
    'Cliente': v.client_name,
    'Responsável': v.responsible ?? '',
    'Demanda': v.demand ?? '',
    'Relatório': v.report ?? '',
    'Prioridade': v.priority ?? '',
    'Status': v.status ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Visitas')
  XLSX.writeFile(wb, `CRM_Visitas_${new Date().toISOString().split('T')[0]}.xlsx`)
}
