export type DealStatus = 'NOVO' | 'EM ANDAMENTO' | 'SUCESSO' | 'DESISTIU' | 'CANCELADO'
export type DealPriority = 'BAIXA' | 'MÉDIA' | 'ALTA'

export interface Deal {
  id: string
  start_date: string | null
  client_name: string
  contact_name: string | null
  contact_phone: string | null
  deal_type: string | null
  responsible: string | null
  interest: string | null
  last_contact_date: string | null
  status: DealStatus | null
  priority: DealPriority | null
  follow_up: string | null
  end_date: string | null
  created_at: string
}

export interface Visit {
  id: string
  visit_date: string | null
  visit_type: string | null
  client_name: string
  responsible: string | null
  demand: string | null
  report: string | null
  priority: string | null
  status: string | null
  created_at: string
}

export const DEAL_TYPES = ['CANTINA REVENDA', 'LUMAR', 'LUMAR / CANTINA'] as const
export const RESPONSAVEIS = ['MAKÁRIO', 'TIAGO', 'BRUNA', 'MAKÁRIO/TIAGO', 'MARCO'] as const
export const STATUS_ORDER: DealStatus[] = ['NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO']
export const VISIT_TYPES = ['Prospecção', 'Acompanhamento', 'Entrega', 'Reunião', 'Degustação', 'Outro'] as const
export const VISIT_STATUS = ['Realizada', 'Agendada', 'Cancelada'] as const
