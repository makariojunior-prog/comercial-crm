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
  potential_notes: string | null
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
  photo_urls: string[] | null
  created_at: string
}

export interface DealHistory {
  id: string
  deal_id: string
  client_name: string
  status_before: string | null
  status_after: string | null
  follow_up: string | null
  last_contact_date: string | null
  updated_at: string
  updated_by: string | null
}

export interface BriefingResult {
  alertas_urgentes: string
  visitas_resumo: string
  pipeline_resumo: string
  proximas_acoes: string
  insight_estrategico: string
}

export interface Briefing {
  id: string
  generated_at: string
  week_ref: string | null
  alerts_urgent: string | null
  visits_summary: string | null
  pipeline_summary: string | null
  next_actions: string | null
  strategic_insight: string | null
  deals_count: number | null
  visits_count: number | null
  model_used: string | null
  full_json: BriefingResult | null
}

export const DEAL_TYPES = ['CANTINA REVENDA', 'LUMAR', 'LUMAR / CANTINA'] as const
export const RESPONSAVEIS = ['MAKÁRIO', 'TIAGO', 'BRUNA', 'MAKÁRIO/TIAGO', 'MARCO'] as const
export const STATUS_ORDER: DealStatus[] = ['NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO']
export const VISIT_TYPES = ['Prospecção', 'Acompanhamento', 'Entrega', 'Reunião', 'Degustação', 'Outro'] as const
export const VISIT_STATUS = ['Realizada', 'Agendada', 'Cancelada'] as const
