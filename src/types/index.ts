export type DealStatus = 'NOVO' | 'EM ANDAMENTO' | 'SUCESSO' | 'DESISTIU' | 'CANCELADO'
export type DealPriority = 'BAIXA' | 'MÉDIA' | 'ALTA'

export type DealOrigem = 'NOVO' | 'INCREMENTAL'

export interface Deal {
  id: string
  start_date: string | null
  client_name: string
  contact_name: string | null
  contact_phone: string | null
  deal_type: string | null
  responsible: string | null
  responsaveis: string[] | null
  interest: string | null
  last_contact_date: string | null
  status: DealStatus | null
  priority: DealPriority | null
  follow_up: string | null
  end_date: string | null
  potential_notes: string | null
  created_at: string
  origem_negocio: DealOrigem | null
  client_id: string | null
}

export interface Visit {
  id: string
  visit_date: string | null
  visit_type: string | null
  client_name: string
  contact_name: string | null
  contact_phone: string | null
  responsible: string | null
  responsaveis: string[] | null
  local: string | null
  demand: string | null
  report: string | null
  priority: string | null
  status: string | null
  photo_urls: string[] | null
  has_amostra: boolean | null
  created_at: string
}

export function getResponsaveis(r: { responsible: string | null; responsaveis: string[] | null }): string {
  const arr = r.responsaveis?.filter(Boolean) ?? []
  if (arr.length > 0) return arr.join(', ')
  return r.responsible ?? ''
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
  categoria: string | null
  assignees?: { user_id: string; user_nome: string }[]
}

export interface TaskComment {
  id: string
  created_at: string
  task_id: string
  author_id: string | null
  content: string
  author?: { nome: string }
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

export type ClientStatus = 'ATIVO' | 'PERDENDO' | 'PERDIDO'

export interface Client {
  id: string
  created_at: string
  nome: string
  telefone: string | null
  cnpj_cpf: string | null
  rota: string | null
  route_id: string | null
  setor: string | null
  pgto: string | null
  localizacao: string | null
  observacoes: string | null
  dia_entrega: string | null
  mensagem: string | null
  bonificacao: string | null
  restricao: string | null
  tipo: string | null
  carteira: string | null
  manutencao: string | null
  frequencia: string | null
  /** Espelho gerado pelo módulo Comodato a partir das alocações ativas. */
  comodato: string | null
  /** Texto livre original, preservado na migração para o módulo Comodato. */
  comodato_legado: string | null
  /** Soma dos bens em comodato, gerada pelo módulo. */
  valor: string | null
  /** Valor em texto livre original, preservado na migração. */
  comodato_valor_legado: string | null
  data_planilha: string | null
  observacao_extra: string | null
  status: ClientStatus
  pedidos_count: number
  // Positivação (comissão de captação atacado)
  indicador: string | null
  positivado: boolean
  positivado_em: string | null
  comissao_status: string | null
  comissao_valor: number | null
  comissao_pago_em: string | null
}

// Tipos de crm_clients.tipo considerados clientes de Revenda (módulo Revenda)
export const REVENDA_TIPOS = ['CANTINA REVENDA', 'LUMAR / CANTINA', 'LUMAR REVENDA'] as const

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
  role_id: string | null
  user_id: string | null
  phone: string | null
  active: boolean
  role_name?: string
  user_email?: string
}

export interface Role {
  id: string
  name: string
  active: boolean
}

export type { CrmUser, UserRole } from '../contexts/AuthContext'

// ─── Logística ─────────────────────────────────────────────────
export type VehicleTipo = 'Carro' | 'Van' | 'Moto' | 'Caminhão' | 'Utilitário' | 'Outro'
export type VehicleCombustivel = 'Gasolina' | 'Etanol' | 'Flex' | 'Diesel' | 'Elétrico' | 'GNV'
export type CnhCategoria = 'A' | 'B' | 'AB' | 'C' | 'D' | 'E' | 'ACC'
export type DocExpiryStatus = 'ok' | 'warning' | 'danger' | 'expired'

export interface Driver {
  id: string
  nome: string
  telefone: string | null
  cpf: string | null
  cnh_numero: string | null
  cnh_categoria: CnhCategoria | null
  cnh_vencimento: string | null
  ativo: boolean
  created_at: string
}

export interface Vehicle {
  id: string
  empresa: 'lumar' | 'cantina'
  apelido: string
  tipo: VehicleTipo | null
  marca_modelo: string | null
  ano: number | null
  placa: string | null
  cor: string | null
  combustivel: VehicleCombustivel | null
  tanque_litros: number | null
  driver_id: string | null
  driver?: Driver | null
  venc_seguro: string | null
  seguradora: string | null
  contato_seguradora: string | null
  venc_ipva: string | null
  documentacao: string | null
  km_atual: number | null
  proxima_revisao_km: number | null
  tem_rastreamento: boolean
  velotrack_device_id: number | null
  ativo: boolean
  created_at: string
}

export interface VelotrackPosition {
  iddevice: number
  vehicle_code: string
  latitude: string
  longitude: string
  description: string
  driver: string
  command_date: string
  connected: boolean
  odometer: number
  address: string
  offline_hours: number
  interest_point: string
  map_icon: string
}

export function docExpiryStatus(dateStr: string | null): DocExpiryStatus | null {
  if (!dateStr) return null
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (days < 0)  return 'expired'
  if (days <= 14) return 'danger'
  if (days <= 60) return 'warning'
  return 'ok'
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

// ─── Varejo ────────────────────────────────────────────────────
export interface VarejoPedido {
  id: string
  num_pedido: string
  data_entrega: string | null        // A – data de entrega (null = não definida)
  status_icon: string                // B – ⚠️ 🛵 ✅ ❌
  marcador: string | null            // C – ⭕️
  cliente: string | null             // E
  bairro: string | null              // F
  origem: string                     // M – CARDAPIO WEB / IFOOD / 99FOOD
  valor_liquido: number | null       // O
  frete: number | null               // P
  qtd_pedidos_cliente: number        // Q
  telefone: string | null            // R
  endereco_completo: string | null   // T
  complemento: string | null         // U
  ponto_referencia: string | null    // reference do endereço de entrega
  // Atendente
  turno: string | null               // G – MANHÃ / TARDE
  restricao: string | null           // J – restrição/obs de entrega
  flag_restricao: string | null      // L – ⚠️ / ✅
  atendente: string | null           // N
  data_entrega_definida: boolean
  // Logística
  sugestao_rota: string | null       // H – auto (Apps Script)
  rota_definida: string | null       // I – logística define
  entregador: string | null          // K
  empresa: string | null             // CANTINA / LUMAR
  // Agendamento
  order_timing: string | null        // 'immediate' | 'scheduled'
  scheduled_start: string | null     // ISO datetime do agendamento
  // Geolocalização
  lat: number | null                 // latitude (Nominatim geocoding)
  lng: number | null                 // longitude (Nominatim geocoding)
  geocoded_at: string | null         // data do geocoding
  geocode_failed_at: string | null   // data da última falha de geocoding
  // Meta
  created_at: string
  updated_at: string
  source: string
  order_type: string | null          // 'delivery' | 'takeout' | 'onsite' | 'closed_table'
  veiculo: string | null
  ocorrencia: string | null
  cardapio_order_id: string | null
}

export const TURNOS = ['MANHÃ', 'TARDE'] as const
export const EMPRESAS_ROTA = ['CANTINA', 'LUMAR'] as const

export const VEHICLE_TIPOS: VehicleTipo[] = ['Carro', 'Van', 'Moto', 'Caminhão', 'Utilitário', 'Outro']
export const VEHICLE_COMBUSTIVEIS: VehicleCombustivel[] = ['Gasolina', 'Etanol', 'Flex', 'Diesel', 'Elétrico', 'GNV']
export const CNH_CATEGORIAS: CnhCategoria[] = ['A', 'B', 'AB', 'C', 'D', 'E', 'ACC']

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

// ─── Routes ────────────────────────────────────────────────────
export interface Route {
  id: string
  name: string
  description: string | null
  responsible_id: string | null
  days_of_week: string[]
  frequency: string
  is_active: boolean
  created_at: string
  updated_at: string
  responsible?: { nome: string }
  clients_count?: number
}

export interface RouteClient {
  id: string
  route_id: string
  client_id: string
  visit_order: number
  observations: string | null
  created_at: string
  client?: { id: string; nome: string; telefone: string | null; setor: string | null }
}

export type RouteExecutionStatus = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
export type RouteClientCheckStatus = 'PENDENTE' | 'VISITADO' | 'PULADO'

export interface RouteExecution {
  id: string
  route_id: string
  executor_id: string | null
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  status: RouteExecutionStatus
  notes: string | null
  created_at: string
  route?: { name: string }
  executor?: { nome: string }
  checks?: RouteClientCheck[]
}

export interface RouteClientCheck {
  id: string
  execution_id: string
  route_client_id: string
  client_id: string | null
  client_name: string | null
  checked_at: string | null
  report: string | null
  demand: string | null
  priority: string
  status: RouteClientCheckStatus
  visit_id: string | null
  created_at: string
}

export const ROUTE_DAYS = [
  { id: 'seg', label: 'Seg' },
  { id: 'ter', label: 'Ter' },
  { id: 'qua', label: 'Qua' },
  { id: 'qui', label: 'Qui' },
  { id: 'sex', label: 'Sex' },
  { id: 'sab', label: 'Sáb' },
] as const

export const ROUTE_FREQUENCIES = [
  { id: 'semanal', label: 'Semanal' },
  { id: 'quinzenal', label: 'Quinzenal' },
  { id: 'mensal', label: 'Mensal' },
] as const

// ─── Notes ─────────────────────────────────────────────────────
export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'slate' | 'red'

export interface Note {
  id: string
  author_id: string | null
  title: string | null
  content: string
  color: NoteColor
  is_pinned: boolean
  created_at: string
  updated_at: string
  author?: { nome: string }
  mentions?: NoteMention[]
}

export interface NoteMention {
  id: string
  note_id: string
  user_id: string
  is_read: boolean
  created_at: string
  user?: { nome: string }
}

export const NOTE_COLORS: Record<NoteColor, { bg: string; border: string; dot: string; label: string }> = {
  yellow: { bg: 'bg-yellow-50',  border: 'border-yellow-300', dot: 'bg-yellow-400',  label: 'Amarelo' },
  green:  { bg: 'bg-green-50',   border: 'border-green-300',  dot: 'bg-green-500',   label: 'Verde'   },
  blue:   { bg: 'bg-blue-50',    border: 'border-blue-300',   dot: 'bg-blue-500',    label: 'Azul'    },
  pink:   { bg: 'bg-pink-50',    border: 'border-pink-300',   dot: 'bg-pink-400',    label: 'Rosa'    },
  purple: { bg: 'bg-purple-50',  border: 'border-purple-300', dot: 'bg-purple-500',  label: 'Roxo'    },
  slate:  { bg: 'bg-slate-50',   border: 'border-slate-300',  dot: 'bg-slate-400',   label: 'Cinza'   },
  red:    { bg: 'bg-red-50',     border: 'border-red-300',    dot: 'bg-red-500',     label: 'Vermelho' },
}

// ─── Pós-Venda Varejo ──────────────────────────────────────────
export interface PosVendaCliente {
  telefone: string
  nome: string | null
  ult_compra: string
  ult_interacao: string | null
  dias_pos_compra: number
  dias_sem_contato: number
  n_pedidos: number
  prioridade: 1 | 2 | 3
}

export interface PosVendaInteracao {
  id: string
  created_at: string
  telefone: string
  nome: string | null
  data_interacao: string
  observacao: string
  usuario_id: string | null
  usuario_nome: string | null
  tipo: 1 | 2 | 3
}

// ─── Comentários Redes Sociais ─────────────────────────────────
export interface CrmSocialComment {
  id: string
  created_at: string
  received_at: string
  platform: string
  account: string
  comment_id: string | null
  comment_type: string
  username: string | null
  nome: string | null
  mensagem: string
  post_link: string | null
  post_caption: string | null
  media_id: string | null
  status: 'NOVO' | 'RESPONDIDO' | 'IGNORADO'
  resposta: string | null
  respondido_por: string | null
  respondido_em: string | null
  categoria: string | null
  resumo_ia: string | null
  sugestao_resposta: string | null
  alerta_enviado: boolean
}

// ─── Módulo Atacado (Lumar) ────────────────────────────────────
export interface AtacadoCliente {
  id: number
  cliente: string
  cnpj_cpf: string | null
  telefone: string | null
  rota: string | null
  setor: string | null
  pgto_padrao: string | null
  turno: string | null
  localizacao: string | null
  observacoes: string | null
  dias_entrega: string[]
  enviar_mensagem: boolean
  bonificacao: string | null
  restricao: string | null
  tipo: string
  carteira: string | null
  status: string
  frequencia: string | null
  comodato: string | null
  comodato_valor: number | null
  comodato_data: string | null
  comodato_obs: string | null
  created_at: string
  updated_at: string
}

export interface CrmClientLink {
  id: string
  nome: string
  rota: string | null
  pgto: string | null
  setor: string | null
  restricao: string | null
  observacoes: string | null
  telefone: string | null
  turno: string | null
}

export interface AtacadoPedido {
  id: number
  id_venda: number
  numero_pedido: number | null
  cliente_id: number | null
  crm_client_id: string | null
  cliente_nome: string | null
  valor: number
  turno: string | null
  entregador: string | null
  veiculo: string | null
  tipo: string
  ocorrencia: string | null
  data_emissao: string | null
  atualizacao: string
  data_entrega: string | null
  recebimento: string | null
  conferencia: string | null
  ignorado: boolean
  pgto: string[] | null
  observacoes: string | null
  created_at: string
  updated_at: string
  cliente?: AtacadoCliente | null
  crm_client?: CrmClientLink | null
}

export interface AtacadoContatoLog {
  id: number
  cliente_id: number
  data_contato: string
  tipo: string
  atendente: string | null
  feito: boolean
  feito_em: string | null
  resultado: string | null
  observacoes: string | null
  created_at: string
}

// ─── Automação de Mensagens ────────────────────────────────────
export interface AutomacaoConfig {
  id: string
  nome: string
  ativo: boolean
  hora_envio: string
  mensagem_template: string
  msgs_por_lote: number
  pausa_entre_msgs_ms: number
  pausa_min_ms: number
  pausa_max_ms: number
  limite_diario: number
  numero_whatsapp: string | null
  updated_at: string | null
  updated_by: string | null
}

export interface AutomacaoFeriado {
  id: string
  data: string
  descricao: string | null
  created_at: string
}

export interface AutomacaoFilaItem {
  id: string
  automacao: string
  data_exec: string
  cliente_nome: string
  telefone: string
  mensagem: string | null
  status: 'pendente' | 'enviado' | 'erro' | 'pulado'
  erro: string | null
  tentativas: number
  processed_at: string | null
  created_at: string
}

export interface AutomacaoLog {
  id: string
  automacao: string
  data_exec: string | null
  cliente_nome: string | null
  telefone: string | null
  mensagem: string | null
  status: string
  erro: string | null
  created_at: string
}

// ─── Agenda ────────────────────────────────────────────────────
export interface AgendaCompromisso {
  id: string
  titulo: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  tipo: string
  status: 'AGENDADO' | 'REALIZADO' | 'CANCELADO'
  descricao: string | null
  local: string | null
  cliente_nome: string | null
  responsavel: string | null
  responsaveis: string[]
  visit_id: string | null
  criado_por: string | null
  criado_por_id: string | null
  aprovacao_status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'SUGERIDO' | null
  aprovacao_nota: string | null
  aprovacao_sugestao_data: string | null
  aprovacao_sugestao_hora: string | null
  aprovado_por: string | null
  created_at: string
  updated_at: string
  crm_event_id: string | null
  deal_id: string | null
}

// ─── Conversas WhatsApp ────────────────────────────────────────
export interface CrmConversation {
  id: string
  created_at: string
  received_at: string
  conexao: 'CANTINA' | 'LUMAR' | 'LUMAR_NOVOS'
  nome: string | null
  telefone: string | null
  texto: string
  msg_type: string | null
  msg_id: string | null
  contact_id: string | null
  rota_origem: string | null
  status_ia: string | null
  categoria: string | null
  resumo: string | null
  confianca: string | null
  alerta_enviado: boolean
  visto: boolean
  archived: boolean
}

// ─── Conciliação Financeira (Romaneio) ─────────────────────────
export interface TipoOcorrencia {
  id: string
  nome: string
  emoji: string
  cor: string
  ativo: boolean
  ordem: number
  created_at: string
}

export interface ConciliacaoMetodoPagamento {
  tipo: 'Pix' | 'Dinheiro' | 'Cartão' | 'Boleto' | 'Bonificação'
  valor: number
}

export interface RomaneioConciliacao {
  id: string
  empresa: 'LUMAR' | 'CANTINA'
  pedido_ref: string
  pedido_uid: string
  cliente_nome: string | null
  numero_pedido: string | null
  data_entrega: string | null
  entregador: string | null
  valor_pedido: number
  status: 'pendente' | 'finalizado'
  data_conciliacao: string | null
  usuario_conciliacao_id: string | null
  usuario_conciliacao_nome: string | null
  metodos_pagamento: ConciliacaoMetodoPagamento[]
  valor_recebido: number
  divergencia: number
  tipo_ocorrencia_id: string | null
  tipo_ocorrencia?: TipoOcorrencia | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

// ─── Módulo Comodato ───────────────────────────────────────────
// Ver docs/BENCHMARK_COMODATO.md para o racional do modelo.

export const COMODATO_CATEGORIAS = [
  'FREEZER', 'ARMARIO', 'FORNO', 'EXPOSITOR', 'ESTUFA', 'BALCAO', 'VITRINE',
  'GELADEIRA', 'MASSEIRA', 'CILINDRO', 'FRITADEIRA', 'MICROONDAS', 'OUTROS',
] as const
export type ComodatoCategoria = typeof COMODATO_CATEGORIAS[number]

export type ComodatoSituacao   = 'disponivel' | 'reservado' | 'em_comodato' | 'manutencao' | 'baixado'
export type ComodatoEstado     = 'novo' | 'bom' | 'regular' | 'ruim' | 'inservivel'
export type ComodatoContratoStatus = 'rascunho' | 'pendente_assinatura' | 'vigente' | 'encerrado' | 'cancelado'
export type ComodatoAlocacaoStatus = 'ativa' | 'devolvida' | 'cancelada'
export type ComodatoManutTipo   = 'preventiva' | 'corretiva' | 'instalacao' | 'retirada' | 'higienizacao' | 'conferencia'
export type ComodatoManutStatus = 'aberta' | 'agendada' | 'em_andamento' | 'concluida' | 'cancelada'
export type ComodatoPrioridade  = 'baixa' | 'media' | 'alta' | 'urgente'

export interface ComodatoModelo {
  id: string
  nome: string
  categoria: ComodatoCategoria
  marca: string | null
  modelo: string | null
  capacidade: string | null
  valor_referencia: number | null
  manutencao_intervalo_meses: number | null
  foto_url: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface ComodatoEquipamento {
  id: string
  codigo_patrimonio: string
  modelo_id: string | null
  numero_serie: string | null
  empresa: 'lumar' | 'cantina'
  situacao: ComodatoSituacao
  estado_conservacao: ComodatoEstado
  client_id: string | null
  alocacao_id: string | null
  local_atual: string | null
  valor_aquisicao: number | null
  data_aquisicao: string | null
  nota_fiscal_compra: string | null
  fornecedor: string | null
  manutencao_intervalo_meses: number | null
  ultima_manutencao: string | null
  proxima_manutencao: string | null
  ultima_conferencia: string | null
  foto_url: string | null
  observacoes: string | null
  origem: 'manual' | 'legado' | 'importacao'
  revisar: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

/** comodato_equipamentos_view — unidade + modelo + cliente + contrato + alertas */
export interface ComodatoEquipamentoView extends ComodatoEquipamento {
  modelo_nome: string | null
  categoria: ComodatoCategoria | null
  marca: string | null
  capacidade: string | null
  modelo_valor_referencia: number | null
  valor_efetivo: number | null
  client_nome: string | null
  client_rota: string | null
  client_status: ClientStatus | null
  data_entrega: string | null
  contrato_id: string | null
  contrato_status: ComodatoContratoStatus | null
  contrato_assinado: boolean | null
  contrato_data_fim: string | null
  dias_em_comodato: number | null
  dias_parado: number | null
  manutencao_vencida: boolean
  manutencao_proxima: boolean
  sem_contrato: boolean
  contrato_nao_assinado: boolean
  os_abertas: number
}

export interface ComodatoContrato {
  id: string
  numero: string | null
  client_id: string
  empresa: 'lumar' | 'cantina'
  status: ComodatoContratoStatus
  contrato_assinado: boolean
  data_assinatura: string | null
  data_inicio: string | null
  prazo_meses: number | null
  data_fim: string | null
  renovacao_automatica: boolean
  contrapartida: string | null
  volume_minimo: string | null
  responsavel_manutencao: 'comodante' | 'comodatario' | 'compartilhado'
  responsavel_interno: string | null
  contato_cliente: string | null
  arquivo_url: string | null
  testemunhas: string | null
  valor_total_bens: number | null
  observacoes: string | null
  origem: 'manual' | 'legado' | 'importacao'
  created_at: string
  updated_at: string
  client?: { id: string; nome: string; rota: string | null; status: ClientStatus } | null
}

export interface ComodatoAlocacao {
  id: string
  equipamento_id: string
  contrato_id: string | null
  /** Aditivo sob o qual entrou no contrato; null = contrato original. */
  aditivo_id: string | null
  client_id: string
  status: ComodatoAlocacaoStatus
  data_entrega: string
  data_prevista_retirada: string | null
  data_retirada: string | null
  estado_entrega: string | null
  estado_devolucao: string | null
  nf_remessa: string | null
  nf_retorno: string | null
  responsavel_entrega: string | null
  recebido_por: string | null
  motivo_retirada: string | null
  observacoes: string | null
  origem: 'manual' | 'legado' | 'importacao'
  created_at: string
  updated_at: string
}

export type ComodatoAditivoTipo =
  'inclusao_equipamento' | 'retirada_equipamento' | 'prorrogacao' | 'alteracao_condicoes' | 'outros'

export interface ComodatoAditivo {
  id: string
  contrato_id: string
  numero: string | null
  tipo: ComodatoAditivoTipo
  data_aditivo: string
  descricao: string | null
  assinado: boolean
  data_assinatura: string | null
  arquivo_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Alocação com equipamento e aditivo embutidos — usada na aba de itens do contrato. */
export interface ComodatoContratoItem extends ComodatoAlocacao {
  equipamento: {
    id: string
    codigo_patrimonio: string
    numero_serie: string | null
    modelo: { nome: string; categoria: ComodatoCategoria } | null
  } | null
}

export type ComodatoAuditoriaOperacao = 'INSERT' | 'UPDATE' | 'DELETE'

export interface ComodatoAuditoria {
  id: number
  ocorrido_em: string
  tabela: string
  registro_id: string | null
  operacao: ComodatoAuditoriaOperacao
  resumo: string | null
  usuario_id: string | null
  usuario_nome: string | null
  usuario_email: string | null
  contrato_id: string | null
  equipamento_id: string | null
  client_id: string | null
  campos_alterados: string[] | null
  dados_antigos: Record<string, unknown> | null
  dados_novos: Record<string, unknown> | null
}

export interface ComodatoManutencao {
  id: string
  equipamento_id: string
  alocacao_id: string | null
  client_id: string | null
  tipo: ComodatoManutTipo
  status: ComodatoManutStatus
  prioridade: ComodatoPrioridade
  descricao: string
  solucao: string | null
  data_abertura: string
  data_agendada: string | null
  data_conclusao: string | null
  custo: number | null
  tecnico: string | null
  fornecedor: string | null
  aberto_por: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  equipamento?: { codigo_patrimonio: string; modelo_id: string | null } | null
  client?: { nome: string } | null
}

/** comodato_resumo_cliente — uma linha por cliente que detém equipamento hoje */
export interface ComodatoResumoCliente {
  client_id: string
  client_nome: string
  client_rota: string | null
  client_status: ClientStatus
  qtd_equipamentos: number
  valor_total: number
  primeira_entrega: string | null
  tem_contrato_assinado: boolean | null
  contrato_data_fim: string | null
  itens_sem_contrato: number
  itens_a_revisar: number
}

export const COMODATO_SITUACAO_LABELS: Record<ComodatoSituacao, string> = {
  disponivel:  'Disponível',
  reservado:   'Reservado',
  em_comodato: 'Em comodato',
  manutencao:  'Em manutenção',
  baixado:     'Baixado',
}

export const COMODATO_ESTADO_LABELS: Record<ComodatoEstado, string> = {
  novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível',
}

export const COMODATO_CONTRATO_LABELS: Record<ComodatoContratoStatus, string> = {
  rascunho:            'Rascunho',
  pendente_assinatura: 'Pendente de assinatura',
  vigente:             'Vigente',
  encerrado:           'Encerrado',
  cancelado:           'Cancelado',
}

export const COMODATO_ADITIVO_TIPO_LABELS: Record<ComodatoAditivoTipo, string> = {
  inclusao_equipamento: 'Inclusão de equipamento',
  retirada_equipamento: 'Retirada de equipamento',
  prorrogacao:          'Prorrogação',
  alteracao_condicoes:  'Alteração de condições',
  outros:               'Outros',
}

export const COMODATO_AUDITORIA_TABELA_LABELS: Record<string, string> = {
  comodato_contratos:         'Contrato',
  comodato_contrato_aditivos: 'Aditivo',
  comodato_alocacoes:         'Vínculo / alocação',
  comodato_equipamentos:      'Equipamento',
  comodato_modelos:           'Modelo (catálogo)',
  comodato_manutencoes:       'Manutenção',
}

export const COMODATO_MANUT_TIPO_LABELS: Record<ComodatoManutTipo, string> = {
  preventiva: 'Preventiva', corretiva: 'Corretiva', instalacao: 'Instalação',
  retirada: 'Retirada', higienizacao: 'Higienização', conferencia: 'Conferência',
}

export const COMODATO_MANUT_STATUS_LABELS: Record<ComodatoManutStatus, string> = {
  aberta: 'Aberta', agendada: 'Agendada', em_andamento: 'Em andamento',
  concluida: 'Concluída', cancelada: 'Cancelada',
}

export const COMODATO_PRIORIDADE_LABELS: Record<ComodatoPrioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente',
}

/** Contrato vencendo nos próximos 60 dias ou já vencido */
export function comodatoContratoAlerta(dataFim: string | null | undefined): 'vencido' | 'vencendo' | null {
  if (!dataFim) return null
  const dias = daysUntil(dataFim)
  if (dias === null) return null
  if (dias < 0) return 'vencido'
  if (dias <= 60) return 'vencendo'
  return null
}
