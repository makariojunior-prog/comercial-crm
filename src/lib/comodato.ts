import { supabase } from './supabase'
import type {
  ComodatoSituacao, ComodatoManutStatus, ComodatoPrioridade,
  ComodatoContratoStatus, ComodatoEstado,
} from '../types'

// ─── Paleta por estado ────────────────────────────────────────────

export const SITUACAO_COLORS: Record<ComodatoSituacao, string> = {
  disponivel:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  reservado:   'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  em_comodato: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  manutencao:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  baixado:     'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
}

export const ESTADO_COLORS: Record<ComodatoEstado, string> = {
  novo:       'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  bom:        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  regular:    'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  ruim:       'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  inservivel: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

export const CONTRATO_COLORS: Record<ComodatoContratoStatus, string> = {
  rascunho:            'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  pendente_assinatura: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  vigente:             'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  encerrado:           'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  cancelado:           'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

export const MANUT_STATUS_COLORS: Record<ComodatoManutStatus, string> = {
  aberta:       'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  agendada:     'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  em_andamento: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  concluida:    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  cancelada:    'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
}

export const PRIORIDADE_COLORS: Record<ComodatoPrioridade, string> = {
  baixa:   'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  media:   'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  alta:    'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  urgente: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
}

export const CATEGORIA_LABELS: Record<string, string> = {
  FREEZER: 'Freezer', ARMARIO: 'Armário', FORNO: 'Forno', EXPOSITOR: 'Expositor',
  ESTUFA: 'Estufa', BALCAO: 'Balcão', VITRINE: 'Vitrine', GELADEIRA: 'Geladeira',
  MASSEIRA: 'Masseira', CILINDRO: 'Cilindro', FRITADEIRA: 'Fritadeira',
  MICROONDAS: 'Micro-ondas', OUTROS: 'Outros',
}

// ─── Operações de domínio ─────────────────────────────────────────
//
// A trilha de custódia (comodato_alocacoes) é append-only: devolver NÃO
// apaga a linha, encerra-a. As triggers do banco cuidam de atualizar a
// situação do equipamento e o espelho de texto em crm_clients.comodato.

export interface AlocarParams {
  equipamentoId: string
  clientId: string
  contratoId?: string | null
  dataEntrega: string
  estadoEntrega?: string | null
  nfRemessa?: string | null
  responsavelEntrega?: string | null
  recebidoPor?: string | null
  observacoes?: string | null
}

export async function alocarEquipamento(p: AlocarParams) {
  const { error } = await supabase.from('comodato_alocacoes').insert({
    equipamento_id: p.equipamentoId,
    client_id:      p.clientId,
    contrato_id:    p.contratoId || null,
    status:         'ativa',
    data_entrega:   p.dataEntrega,
    estado_entrega: p.estadoEntrega || null,
    nf_remessa:     p.nfRemessa || null,
    responsavel_entrega: p.responsavelEntrega || null,
    recebido_por:   p.recebidoPor || null,
    observacoes:    p.observacoes || null,
  })
  if (error) throw error
}

export interface DevolverParams {
  alocacaoId: string
  dataRetirada: string
  estadoDevolucao?: string | null
  nfRetorno?: string | null
  motivoRetirada?: string | null
  observacoes?: string | null
  /** estado de conservação a gravar na unidade após o retorno */
  novoEstadoConservacao?: string | null
  equipamentoId?: string
}

export async function devolverEquipamento(p: DevolverParams) {
  const { error } = await supabase.from('comodato_alocacoes').update({
    status:           'devolvida',
    data_retirada:    p.dataRetirada,
    estado_devolucao: p.estadoDevolucao || null,
    nf_retorno:       p.nfRetorno || null,
    motivo_retirada:  p.motivoRetirada || null,
    observacoes:      p.observacoes || null,
  }).eq('id', p.alocacaoId)
  if (error) throw error

  if (p.novoEstadoConservacao && p.equipamentoId) {
    const { error: e2 } = await supabase.from('comodato_equipamentos')
      .update({ estado_conservacao: p.novoEstadoConservacao })
      .eq('id', p.equipamentoId)
    if (e2) throw e2
  }
}

/** Contrato vigente do cliente, se houver — usado ao alocar direto do cadastro. */
export async function contratoVigenteDoCliente(clientId: string): Promise<string | null> {
  const { data } = await supabase
    .from('comodato_contratos')
    .select('id')
    .eq('client_id', clientId)
    .in('status', ['vigente', 'pendente_assinatura'])
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0]?.id ?? null
}
