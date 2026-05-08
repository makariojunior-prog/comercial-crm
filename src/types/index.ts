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
  contact_name: string | null
  contact_phone: string | null
  responsible: string | null
  demand: string | null
  report: string | null
  priority: string | null
  status: string | null
  photo_urls: string[] | null
  created_at: string
}

export interface TaskPriorityInfo {
  id: TaskPriority
  label: string
  color: string
  bg: string
}

export type TaskPriority = 'URGENTE_IMPORTANTE' | 'IMPORTANTE_NAO_URGENTE' | 'URGENTE_NAO_IMPORTANTE' | 'NAO_URGENTE_NAO_IMPORTANTE'
export type TaskStatus = 'PENDENTE' | 'CONCLUIDA'

export interface Task {
  id: string
  created_at: string
  title: string
  description: string | null
  deadline: string | null
  priority: TaskPriority
  status: TaskStatus
  creator_id: string
  assignees?: { user_id: string; user_nome: string }[]
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

export interface PriceItem {
  id: string
  empresa: 'lumar' | 'cantina'
  nome: string
  custo: number | null
  preco_lumar: number | null
  preco_varejo: number | null
  preco_revenda: number | null
  pf: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  created_at: string
  nome: string
  telefone: string | null
  setor: string | null
  empresa: string | null
  origem: string | null
  observacao: string | null
  atendente: string | null
  pedidos_count: number
  ativo: boolean
}

export type EventStatus = 'AGENDADO' | 'REALIZADO' | 'CANCELADO'

export interface Event {
  id: string
  created_at: string
  client_id: string | null
  title: string
  event_type: string
  event_date: string
  status: EventStatus
  notes: string | null
  client_nome?: string
  materials?: EventMaterial[]
  staff?: { staff_id: string; staff_name: string }[]
}

export interface EventMaterial {
  id: string
  event_id: string
  item_name: string
  quantity: number
  is_provided: boolean
}

export interface Staff {
  id: string
  name: string
  role: string
  phone: string | null
  active: boolean
}

export type { CrmUser, UserRole } from '../contexts/AuthContext'

export const DEAL_TYPES = ['CANTINA REVENDA', 'LUMAR', 'LUMAR / CANTINA'] as const
export const RESPONSAVEIS = ['MAKÁRIO', 'TIAGO', 'BRUNA', 'MAKÁRIO/TIAGO', 'MARCO'] as const
export const STATUS_ORDER: DealStatus[] = ['NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO']
export const VISIT_TYPES = ['Prospecção', 'Acompanhamento', 'Entrega', 'Reunião', 'Degustação', 'Outro'] as const
export const VISIT_STATUS = ['Realizada', 'Agendada', 'Cancelada'] as const

export const TASK_PRIORITIES: Record<TaskPriority, TaskPriorityInfo> = {
  URGENTE_IMPORTANTE: { id: 'URGENTE_IMPORTANTE', label: 'Urgente & Importante', color: 'text-red-700', bg: 'bg-red-50 border-red-100' },
  IMPORTANTE_NAO_URGENTE: { id: 'IMPORTANTE_NAO_URGENTE', label: 'Importante (Não Urgente)', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' },
  URGENTE_NAO_IMPORTANTE: { id: 'URGENTE_NAO_IMPORTANTE', label: 'Urgente (Não Importante)', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' },
  NAO_URGENTE_NAO_IMPORTANTE: { id: 'NAO_URGENTE_NAO_IMPORTANTE', label: 'Não Urgente & Não Importante', color: 'text-slate-600', bg: 'bg-slate-50 border-slate-100' },
}
