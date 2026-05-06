import * as XLSX from 'xlsx'
import type { Deal, Visit } from '../types'

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
