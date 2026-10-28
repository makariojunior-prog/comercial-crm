import { format, parseISO, differenceInCalendarDays, addMonths, startOfMonth } from 'date-fns'
import { supabase } from '../lib/supabase'
import { CATEGORIAS, type CustoCategoria, type FrotaManutencao } from './CustosTab'

export type Grupo = 'combustivel' | 'manutencao' | 'fixos' | 'outros'
export const GRUPOS: Grupo[] = ['combustivel', 'manutencao', 'fixos', 'outros']
export const GRUPO_LABEL: Record<Grupo, string> = {
  combustivel: 'Combustível', manutencao: 'Manutenção', fixos: 'Fixos', outros: 'Outros',
}

const FIXOS = new Set<CustoCategoria>(['prestacao', 'seguro', 'ipva', 'rastreamento'])

export function grupoDe(c: CustoCategoria): Grupo {
  if (c === 'combustivel') return 'combustivel'
  if (CATEGORIAS[c]?.isMaint) return 'manutencao'
  if (FIXOS.has(c)) return 'fixos'
  return 'outros'
}

export interface Gasto {
  id: string
  data: string
  ordem: string
  categoria: CustoCategoria
  grupo: Grupo
  valor: number
  km: number | null
  litros: number | null
  descricao: string | null
  observacoes: string | null
  motorista: string | null
  origem: 'crm' | 'financeiro'
}

export interface OcorrenciaVeiculo {
  id: string
  data: string
  ordem: string
  descricao: string
  gravidade: 'baixa' | 'media' | 'alta'
  status: 'aberta' | 'resolvida'
  resolucao: string | null
  prejuizo: number | null
  tipo: string | null
  emoji: string | null
  cliente: string | null
  motorista: string | null
}

export interface Leitura {
  data: string
  ordem: string
  km: number
  fonte: 'gasto' | 'odometro' | 'cadastro'
}

export interface Salto { de: Leitura; para: Leitura; diff: number; dias: number }
export interface Descartada { leitura: Leitura; motivo: string }

export interface PontoKm { data: string; km: number; registrado: number }

export interface Mes {
  chave: string // yyyy-MM
  porGrupo: Record<Grupo, number>
  total: number
  km: number
  combustivelAtribuido: number
  litrosAtribuidos: number
  litrosCompletos: boolean
}

export interface DadosVeiculo {
  gastos: Gasto[]
  ocorrencias: OcorrenciaVeiculo[]
  manutencoes: FrotaManutencao[]
  pontos: PontoKm[]
  saltos: Salto[]
  descartadas: Descartada[]
  kmAtual: number | null
  meses: Mes[]
  corte: string | null
}

/** Acima disso entre duas leituras, o trecho é tratado como erro de digitação ou troca de hodômetro. */
const MAX_KM_DIA = 1000

const dias = (a: string, b: string) => Math.max(1, differenceInCalendarDays(parseISO(b), parseISO(a)))
const coerente = (a: Leitura, b: Leitura) => {
  const d = b.km - a.km
  return d >= 0 && d <= MAX_KM_DIA * dias(a.data, b.data)
}
const chaveOrdem = (x: { data: string; ordem: string }) => `${x.data}|${x.ordem}`
// No mesmo dia vale o km, não a hora de criação: muito lançamento é digitado em lote e fora de ordem.
const cmpLeitura = (a: { data: string; km: number }, b: { data: string; km: number }) =>
  a.data < b.data ? -1 : a.data > b.data ? 1 : a.km - b.km
export const chaveMes = (data: string) => data.slice(0, 7)

const MAX_BLOCO = 6

/**
 * Remove zeros e blocos curtos de leituras fora da sequência (ex.: 59.525 entre 5.769 e 6.341,
 * ou várias leituras digitadas sem o primeiro dígito). Saltos que não fecham ficam como saltos.
 */
function limpar(brutas: Leitura[]): { mantidas: Leitura[]; descartadas: Descartada[] } {
  const descartadas: Descartada[] = []
  const s = brutas.filter(l => {
    if (l.km > 0) return true
    descartadas.push({ leitura: l, motivo: 'km zerado' })
    return false
  })
  const fora = (l: Leitura) => descartadas.push({ leitura: l, motivo: 'fora da sequência' })
  const mantidas: Leitura[] = []
  let i = 0
  while (i < s.length) {
    const p = s[i]
    const prev = mantidas[mantidas.length - 1]
    if (prev && !coerente(prev, p)) {
      // Opção A: as próximas k leituras é que estão erradas (a sequência retoma depois delas).
      let bloco = 0
      for (let j = i; j < Math.min(s.length - 1, i + MAX_BLOCO); j++) {
        if (coerente(prev, s[j + 1])) { bloco = j - i + 1; break }
      }
      // Opção B: a leitura anterior é que estava errada (pico isolado, ou a primeira de todas).
      const prev2 = mantidas[mantidas.length - 2]
      const anteriorErrada = prev2 ? coerente(prev2, p) : i + 1 < s.length && coerente(p, s[i + 1])
      if (anteriorErrada && (bloco === 0 || bloco > 1)) {
        fora(mantidas.pop()!)
        continue
      }
      if (bloco > 0) {
        for (let k = i; k < i + bloco; k++) fora(s[k])
        i += bloco
        continue
      }
    }
    mantidas.push(p)
    i++
  }
  descartadas.sort((a, b) => cmpLeitura(a.leitura, b.leitura))
  return { mantidas, descartadas }
}

export async function carregarVidaVeiculo(vehicleId: string, kmCadastro: number | null): Promise<DadosVeiculo> {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const { data: corteRaw } = await supabase.rpc('crm_frota_corte')
  const corte = corteRaw && (corteRaw as string) < '9999' ? (corteRaw as string) : null

  // Até o corte vale frota_custos; do corte em diante o gasto vem do Financeiro (só leitura).
  let legadoQ = supabase.from('frota_custos')
    .select('id,categoria,descricao,valor,km_odometro,litros,data_gasto,observacoes,created_at,driver:crm_drivers(nome)')
    .eq('vehicle_id', vehicleId).lte('data_gasto', hoje)
  if (corte) legadoQ = legadoQ.lt('data_gasto', corte)

  const [legado, fin, odo, man, oco] = await Promise.all([
    legadoQ,
    corte && hoje >= corte ? supabase.rpc('crm_frota_gastos', { p_de: corte, p_ate: hoje }) : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from('frota_odometro_registros').select('km,data,created_at').eq('vehicle_id', vehicleId),
    supabase.from('frota_manutencoes').select('*').eq('vehicle_id', vehicleId).eq('ativo', true),
    supabase.from('log_ocorrencias')
      .select('id,data,created_at,descricao,gravidade,status,resolucao,prejuizo,cliente_nome,tipo:tipos_ocorrencia(nome,emoji),driver:crm_drivers(nome)')
      .eq('vehicle_id', vehicleId),
  ])
  const erro = legado.error || fin.error || odo.error || man.error || oco.error
  if (erro) throw new Error(erro.message)

  const cat = (c: string) => (c in CATEGORIAS ? c : 'outros') as CustoCategoria
  const gastos: Gasto[] = [
    ...(legado.data ?? []).map((g: any) => ({
      id: g.id, data: g.data_gasto, ordem: g.created_at ?? '', categoria: cat(g.categoria), grupo: grupoDe(cat(g.categoria)),
      valor: Number(g.valor), km: g.km_odometro, litros: g.litros != null ? Number(g.litros) : null,
      descricao: g.descricao, observacoes: g.observacoes, motorista: g.driver?.nome ?? null, origem: 'crm' as const,
    })),
    ...((fin.data ?? []) as any[]).filter(g => g.vehicle_id === vehicleId).map(g => ({
      id: g.id, data: g.data_gasto, ordem: '', categoria: cat(g.categoria), grupo: grupoDe(cat(g.categoria)),
      valor: Number(g.valor), km: g.km_odometro, litros: g.litros != null ? Number(g.litros) : null,
      descricao: g.descricao, observacoes: g.observacoes, motorista: null, origem: 'financeiro' as const,
    })),
  ].sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))

  const ocorrencias: OcorrenciaVeiculo[] = ((oco.data ?? []) as any[]).map(o => ({
    id: o.id, data: o.data, ordem: o.created_at ?? '', descricao: o.descricao, gravidade: o.gravidade, status: o.status,
    resolucao: o.resolucao, prejuizo: o.prejuizo != null ? Number(o.prejuizo) : null,
    tipo: o.tipo?.nome ?? null, emoji: o.tipo?.emoji ?? null, cliente: o.cliente_nome, motorista: o.driver?.nome ?? null,
  })).sort((a, b) => chaveOrdem(a).localeCompare(chaveOrdem(b)))

  const brutas: Leitura[] = [
    ...gastos.filter(g => g.km != null).map(g => ({ data: g.data, ordem: g.ordem, km: g.km!, fonte: 'gasto' as const })),
    ...(odo.data ?? []).map((o: any) => ({ data: o.data, ordem: o.created_at ?? '', km: o.km, fonte: 'odometro' as const })),
  ].sort(cmpLeitura)

  const { mantidas, descartadas } = limpar(brutas)
  const ultima = mantidas[mantidas.length - 1]
  if (kmCadastro && kmCadastro > 0 && (!ultima || kmCadastro > ultima.km)) {
    mantidas.push({ data: hoje, ordem: 'zzz', km: kmCadastro, fonte: 'cadastro' })
  }

  const saltos: Salto[] = []
  const validos: boolean[] = [] // validos[i] = trecho mantidas[i] → mantidas[i+1] é coerente
  for (let i = 0; i + 1 < mantidas.length; i++) {
    const ok = coerente(mantidas[i], mantidas[i + 1])
    validos.push(ok)
    if (!ok) saltos.push({ de: mantidas[i], para: mantidas[i + 1], diff: mantidas[i + 1].km - mantidas[i].km, dias: dias(mantidas[i].data, mantidas[i + 1].data) })
  }

  // Hodômetro reconstruído: ancora na leitura mais recente e desconta só os trechos coerentes,
  // assim leituras de outra escala (parcial, hodômetro trocado) não viram picos no gráfico.
  const pontos: PontoKm[] = []
  if (mantidas.length) {
    let km = mantidas[mantidas.length - 1].km
    pontos.unshift({ data: mantidas[mantidas.length - 1].data, km, registrado: km })
    for (let i = mantidas.length - 2; i >= 0; i--) {
      if (validos[i]) km -= mantidas[i + 1].km - mantidas[i].km
      pontos.unshift({ data: mantidas[i].data, km, registrado: mantidas[i].km })
    }
  }

  // Meses do primeiro registro até hoje.
  const primeiro = [gastos[0]?.data, mantidas[0]?.data, ocorrencias[0]?.data].filter(Boolean).sort()[0]
  const meses = new Map<string, Mes>()
  if (primeiro) {
    for (let d = startOfMonth(parseISO(primeiro)); format(d, 'yyyy-MM') <= hoje.slice(0, 7); d = addMonths(d, 1)) {
      const chave = format(d, 'yyyy-MM')
      meses.set(chave, {
        chave, porGrupo: { combustivel: 0, manutencao: 0, fixos: 0, outros: 0 }, total: 0, km: 0,
        combustivelAtribuido: 0, litrosAtribuidos: 0, litrosCompletos: true,
      })
    }
  }
  for (const g of gastos) {
    const m = meses.get(chaveMes(g.data))
    if (!m) continue
    m.porGrupo[g.grupo] += g.valor
    m.total += g.valor
  }
  for (let i = 0; i < validos.length; i++) {
    if (!validos[i]) continue
    const m = meses.get(chaveMes(mantidas[i + 1].data))
    if (m) m.km += mantidas[i + 1].km - mantidas[i].km
  }
  // Combustível comprado entre duas leituras abastece aquele trecho; trechos incoerentes ficam de fora.
  // Abastecimento sem km conta a partir da última leitura do dia.
  const posComb = (g: Gasto) => ({ data: g.data, km: g.km ?? Number.MAX_SAFE_INTEGER })
  const combustiveis = gastos.filter(g => g.grupo === 'combustivel').sort((a, b) => cmpLeitura(posComb(a), posComb(b)))
  let idx = -1
  for (const g of combustiveis) {
    while (idx + 1 < mantidas.length && cmpLeitura(mantidas[idx + 1], posComb(g)) <= 0) idx++
    if (idx < 0 || idx + 1 >= mantidas.length || !validos[idx]) continue
    const m = meses.get(chaveMes(mantidas[idx + 1].data))
    if (!m) continue
    m.combustivelAtribuido += g.valor
    if (g.litros && g.litros > 0) m.litrosAtribuidos += g.litros
    else m.litrosCompletos = false
  }

  return {
    gastos, ocorrencias, manutencoes: (man.data ?? []) as FrotaManutencao[], pontos, saltos, descartadas,
    kmAtual: pontos.length ? pontos[pontos.length - 1].km : kmCadastro, meses: [...meses.values()], corte,
  }
}

/** Km do hodômetro reconstruído numa data (interpolação linear entre leituras). */
export function kmNaData(pontos: PontoKm[], data: string): number | null {
  if (!pontos.length) return null
  if (data <= pontos[0].data) return pontos[0].km
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i]
    if (data <= b.data) {
      const total = differenceInCalendarDays(parseISO(b.data), parseISO(a.data))
      if (total <= 0) return b.km
      return a.km + (b.km - a.km) * (differenceInCalendarDays(parseISO(data), parseISO(a.data)) / total)
    }
  }
  return pontos[pontos.length - 1].km
}
