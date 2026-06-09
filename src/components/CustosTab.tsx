import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, RefreshCw, Pencil, Trash2, AlertTriangle, CheckCircle2,
  ChevronDown, X, Fuel, Wrench, DollarSign, TrendingUp, BarChart3,
  Calendar, Car, ChevronRight,
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subDays, parseISO, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Vehicle, Driver } from '../types'

// ─── Types ────────────────────────────────────────────────────────────

export type CustoCategoria =
  | 'combustivel' | 'troca_oleo' | 'pneu' | 'revisao' | 'filtro'
  | 'freios' | 'correia' | 'alinhamento' | 'seguro' | 'ipva'
  | 'multa' | 'lavagem' | 'manutencao' | 'rastreamento' | 'outros'

export interface FrotaCusto {
  id: string
  vehicle_id: string
  driver_id: string | null
  categoria: CustoCategoria
  descricao: string | null
  valor: number
  km_odometro: number | null
  litros: number | null
  preco_litro: number | null
  data_gasto: string
  observacoes: string | null
  recorrente: boolean
  tipo_recorrencia: 'mensal' | 'trimestral' | 'semestral' | 'anual' | null
  proxima_data_recorrencia: string | null
  data_inicio_recorrencia: string | null
  data_fim_recorrencia: string | null
  recorrencia_indefinida: boolean
  custo_recorrente_id: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  vehicle?: { id: string; apelido: string; placa: string | null } | null
  driver?: { id: string; nome: string } | null
}

export interface FrotaManutencao {
  id: string
  vehicle_id: string
  tipo: string
  nome: string
  intervalo_km: number | null
  ultimo_km_realizado: number | null
  proxima_km: number | null
  intervalo_dias: number | null
  ultima_data: string | null
  proxima_data: string | null
  observacoes: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  vehicle?: { id: string; apelido: string; placa: string | null; km_atual: number | null } | null
}

// ─── Constants ────────────────────────────────────────────────────────

const CATEGORIAS: Record<CustoCategoria, { label: string; emoji: string; isMaint: boolean }> = {
  combustivel: { label: 'Combustível',         emoji: '⛽', isMaint: false },
  troca_oleo:  { label: 'Troca de Óleo',       emoji: '🛢️', isMaint: true  },
  pneu:        { label: 'Pneu',                emoji: '🔘', isMaint: true  },
  revisao:     { label: 'Revisão Geral',        emoji: '🔧', isMaint: true  },
  filtro:      { label: 'Filtros',              emoji: '🌬️', isMaint: true  },
  freios:      { label: 'Freios',               emoji: '🔴', isMaint: true  },
  correia:     { label: 'Correia Dentada',      emoji: '⚙️', isMaint: true  },
  alinhamento: { label: 'Alinhamento/Balanç.',  emoji: '🎯', isMaint: true  },
  seguro:      { label: 'Seguro',               emoji: '🛡️', isMaint: false },
  ipva:        { label: 'IPVA / Licenciamento', emoji: '📋', isMaint: false },
  multa:       { label: 'Multa',                emoji: '⚠️', isMaint: false },
  lavagem:     { label: 'Lavagem',              emoji: '🚿', isMaint: false },
  manutencao:  { label: 'Manutenção Geral',     emoji: '🔩', isMaint: true  },
  rastreamento: { label: 'Rastreamento GPS',    emoji: '📡', isMaint: false },
  outros:      { label: 'Outros',               emoji: '📦', isMaint: false },
}

const MANUTENCAO_TIPOS = [
  { tipo: 'troca_oleo',  nome: 'Troca de Óleo',        intervalo_km: 10000, intervalo_dias: 180 },
  { tipo: 'filtro_ar',   nome: 'Filtro de Ar',          intervalo_km: 15000, intervalo_dias: null },
  { tipo: 'filtro_comb', nome: 'Filtro de Combustível', intervalo_km: 30000, intervalo_dias: null },
  { tipo: 'velas',       nome: 'Velas de Ignição',      intervalo_km: 30000, intervalo_dias: null },
  { tipo: 'pneu',        nome: 'Revisão de Pneus',      intervalo_km: 10000, intervalo_dias: null },
  { tipo: 'alinhamento', nome: 'Alinhamento/Balanceamento', intervalo_km: 10000, intervalo_dias: null },
  { tipo: 'revisao',     nome: 'Revisão Geral',         intervalo_km: 20000, intervalo_dias: 365  },
  { tipo: 'freios',      nome: 'Freios',                intervalo_km: 40000, intervalo_dias: null },
  { tipo: 'correia',     nome: 'Correia Dentada',       intervalo_km: 60000, intervalo_dias: null },
  { tipo: 'custom',      nome: 'Personalizado',         intervalo_km: null,  intervalo_dias: null },
]

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

// ─── Maintenance status ────────────────────────────────────────────────

function maintStatus(m: FrotaManutencao): 'ok' | 'warning' | 'danger' | 'overdue' {
  const kmAtual = m.vehicle?.km_atual ?? null
  let byKm: 'ok' | 'warning' | 'danger' | 'overdue' = 'ok'
  let byDate: 'ok' | 'warning' | 'danger' | 'overdue' = 'ok'

  if (m.proxima_km != null && kmAtual != null) {
    const rem = m.proxima_km - kmAtual
    if (rem < 0) byKm = 'overdue'
    else if (rem < 500) byKm = 'danger'
    else if (rem < 2000) byKm = 'warning'
  }
  if (m.proxima_data) {
    const days = differenceInDays(parseISO(m.proxima_data), new Date())
    if (days < 0) byDate = 'overdue'
    else if (days < 7) byDate = 'danger'
    else if (days < 30) byDate = 'warning'
  }

  const order: Record<string, number> = { ok: 0, warning: 1, danger: 2, overdue: 3 }
  return order[byKm] >= order[byDate] ? byKm : byDate
}

const MAINT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ok:      { bg: 'bg-green-50 dark:bg-green-900/20',   text: 'text-green-700 dark:text-green-400',   label: 'Em dia' },
  warning: { bg: 'bg-amber-50 dark:bg-amber-900/20',   text: 'text-amber-700 dark:text-amber-400',   label: 'Atenção' },
  danger:  { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', label: 'Urgente' },
  overdue: { bg: 'bg-red-50 dark:bg-red-900/20',       text: 'text-red-700 dark:text-red-400',       label: 'Vencida' },
}

// ─── Period helpers ────────────────────────────────────────────────────

type Periodo = 'semana' | 'mes' | 'trimestre' | 'ano'

function periodoRange(p: Periodo, selectedMonth?: Date): { from: string; to: string } {
  const today = selectedMonth || new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (p === 'semana')    return { from: fmt(startOfWeek(today, { weekStartsOn: 1 })), to: fmt(endOfWeek(today, { weekStartsOn: 1 })) }
  if (p === 'mes')       return { from: fmt(startOfMonth(today)), to: fmt(endOfMonth(today)) }
  if (p === 'trimestre') return { from: fmt(subDays(today, 90)), to: fmt(today) }
  return { from: fmt(startOfYear(today)), to: fmt(endOfYear(today)) }
}

// ─── CustoModal ────────────────────────────────────────────────────────

interface CustoModalProps {
  custo: FrotaCusto | null
  vehicles: Vehicle[]
  drivers: Driver[]
  onClose: () => void
  onSaved: () => void
}

function CustoModal({ custo, vehicles, drivers, onClose, onSaved }: CustoModalProps) {
  const isEdit = !!custo
  const [form, setForm] = useState({
    vehicle_id:  custo?.vehicle_id ?? '',
    driver_id:   custo?.driver_id ?? '',
    categoria:   (custo?.categoria ?? 'combustivel') as CustoCategoria,
    descricao:   custo?.descricao ?? '',
    valor:       custo?.valor?.toString() ?? '',
    km_odometro: custo?.km_odometro?.toString() ?? '',
    litros:      custo?.litros?.toString() ?? '',
    preco_litro: custo?.preco_litro?.toString() ?? '',
    data_gasto:  custo?.data_gasto ?? format(new Date(), 'yyyy-MM-dd'),
    observacoes: custo?.observacoes ?? '',
    recorrente:  custo?.recorrente ?? false,
    tipo_recorrencia: (custo?.tipo_recorrencia ?? 'mensal') as 'mensal' | 'trimestral' | 'semestral' | 'anual',
    recorrencia_indefinida: custo?.recorrencia_indefinida ?? true,
    data_fim_recorrencia: custo?.data_fim_recorrencia ?? '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Auto-calc valor from litros × preco_litro for combustivel
  useEffect(() => {
    if (form.categoria !== 'combustivel') return
    const l = parseFloat(form.litros)
    const p = parseFloat(form.preco_litro)
    if (!isNaN(l) && !isNaN(p) && l > 0 && p > 0) set('valor', (l * p).toFixed(2))
  }, [form.litros, form.preco_litro, form.categoria])

  function calcProximaRecorrencia(): string | null {
    if (!form.recorrente) return null
    const dataBase = parseISO(form.data_gasto)
    const intervalos: Record<string, number> = {
      mensal: 30, trimestral: 90, semestral: 180, anual: 365
    }
    const dias = intervalos[form.tipo_recorrencia] || 30
    return format(new Date(dataBase.getTime() + dias * 86400000), 'yyyy-MM-dd')
  }

  async function save() {
    if (!form.vehicle_id || !form.valor || !form.data_gasto) return
    setSaving(true)
    const payload: any = {
      vehicle_id:  form.vehicle_id,
      driver_id:   form.driver_id || null,
      categoria:   form.categoria,
      descricao:   form.descricao || null,
      valor:       parseFloat(form.valor),
      km_odometro: form.km_odometro ? parseInt(form.km_odometro) : null,
      litros:      form.litros     ? parseFloat(form.litros)     : null,
      preco_litro: form.preco_litro ? parseFloat(form.preco_litro) : null,
      data_gasto:  form.data_gasto,
      observacoes: form.observacoes || null,
      recorrente:  form.recorrente,
      tipo_recorrencia: form.recorrente ? form.tipo_recorrencia : null,
      data_inicio_recorrencia: form.recorrente ? form.data_gasto : null,
      data_fim_recorrencia: form.recorrente && !form.recorrencia_indefinida ? form.data_fim_recorrencia : null,
      recorrencia_indefinida: form.recorrente ? form.recorrencia_indefinida : false,
      proxima_data_recorrencia: form.recorrente ? calcProximaRecorrencia() : null,
      ativo:       true,
      updated_at:  new Date().toISOString(),
    }

    let custoId = custo?.id
    if (isEdit) {
      await supabase.from('frota_custos').update(payload).eq('id', custo!.id)
    } else {
      const { data } = await supabase.from('frota_custos').insert(payload).select('id').single()
      custoId = data?.id

      // Se é recorrente, chamar edge function para gerar lançamentos futuros
      if (form.recorrente && custoId) {
        try {
          const supabaseUrl = (window as any).SUPABASE_URL || 'https://taicaxtjtikdajmhtsxc.supabase.co'
          await fetch(`${supabaseUrl}/functions/v1/generate-recurring-costs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(window as any).SUPABASE_ANON_KEY || localStorage.getItem('sb-anon-key') || ''}`,
            },
            body: JSON.stringify({ custo_id: custoId }),
          })
        } catch (err) {
          console.error('Erro ao gerar lançamentos recorrentes:', err)
        }
      }
    }

    // Auto-update vehicle km_atual if odometer provided
    if (payload.km_odometro) {
      const veh = vehicles.find(v => v.id === form.vehicle_id)
      if (veh && (!veh.km_atual || payload.km_odometro > veh.km_atual)) {
        await supabase.from('crm_vehicles')
          .update({ km_atual: payload.km_odometro, updated_at: new Date().toISOString() })
          .eq('id', form.vehicle_id)
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }


  const isCombustivel = form.categoria === 'combustivel'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Veículo */}
          <div>
            <label className="label">Veículo *</label>
            <select className="input" value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">Selecione o veículo</option>
              {vehicles.filter(v => v.ativo).map(v => (
                <option key={v.id} value={v.id}>{v.apelido}{v.placa ? ` — ${v.placa}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div>
            <label className="label">Categoria *</label>
            <select className="input" value={form.categoria} onChange={e => set('categoria', e.target.value as CustoCategoria)}>
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
          </div>

          {/* Data + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data *</label>
              <input type="date" className="input" value={form.data_gasto} onChange={e => set('data_gasto', e.target.value)} />
            </div>
            <div>
              <label className="label">Valor (R$) *</label>
              <input type="number" step="0.01" min="0" className="input" placeholder="0,00"
                value={form.valor} onChange={e => set('valor', e.target.value)} />
            </div>
          </div>

          {/* Combustível extra fields */}
          {isCombustivel && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
              <div>
                <label className="label">Litros abastecidos</label>
                <input type="number" step="0.01" min="0" className="input" placeholder="ex: 40,00"
                  value={form.litros} onChange={e => set('litros', e.target.value)} />
              </div>
              <div>
                <label className="label">Preço / litro (R$)</label>
                <input type="number" step="0.001" min="0" className="input" placeholder="ex: 5,89"
                  value={form.preco_litro} onChange={e => set('preco_litro', e.target.value)} />
              </div>
            </div>
          )}

          {/* KM Odômetro */}
          <div>
            <label className="label flex items-center gap-1">
              KM Odômetro
              <span className="text-[10px] font-normal text-slate-400">(atualiza o hodômetro do veículo)</span>
            </label>
            <input type="number" min="0" className="input" placeholder="ex: 85400"
              value={form.km_odometro} onChange={e => set('km_odometro', e.target.value)} />
          </div>

          {/* Motorista */}
          <div>
            <label className="label">Motorista (opcional)</label>
            <select className="input" value={form.driver_id} onChange={e => set('driver_id', e.target.value)}>
              <option value="">Nenhum</option>
              {drivers.filter(d => d.ativo).map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label className="label">Descrição / Fornecedor</label>
            <input type="text" className="input" placeholder="ex: Posto Ipiranga BR-040"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>

          {/* Observações */}
          <div>
            <label className="label">Observações</label>
            <textarea rows={2} className="input resize-none" placeholder="Detalhes adicionais..."
              value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>

          {/* Recorrência */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
                checked={form.recorrente} onChange={e => set('recorrente', e.target.checked)} />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Este é um custo recorrente?</span>
            </label>

            {form.recorrente && (
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 space-y-3">
                <div>
                  <label className="label">Frequência de Recorrência *</label>
                  <select className="input" value={form.tipo_recorrencia}
                    onChange={e => set('tipo_recorrencia', e.target.value as any)}>
                    <option value="mensal">📅 Mensal (30 dias)</option>
                    <option value="trimestral">📅 Trimestral (90 dias)</option>
                    <option value="semestral">📅 Semestral (180 dias)</option>
                    <option value="anual">📅 Anual (365 dias)</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="duracao"
                      checked={form.recorrencia_indefinida}
                      onChange={() => set('recorrencia_indefinida', true)}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Indefinidamente</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer mt-2">
                    <input type="radio" name="duracao"
                      checked={!form.recorrencia_indefinida}
                      onChange={() => set('recorrencia_indefinida', false)}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Até uma data específica</span>
                  </label>
                </div>

                {!form.recorrencia_indefinida && (
                  <div>
                    <label className="label">Data de término *</label>
                    <input type="date" className="input"
                      value={form.data_fim_recorrencia}
                      onChange={e => set('data_fim_recorrencia', e.target.value)}
                      min={form.data_gasto} />
                  </div>
                )}

                {calcProximaRecorrencia() && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    Próximo lançamento previsto: <strong>{format(parseISO(calcProximaRecorrencia()!), 'dd/MM/yyyy')}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || !form.vehicle_id || !form.valor}
            className="btn-primary flex-1 disabled:opacity-50">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : (isEdit ? 'Salvar' : 'Lançar')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ManutencaoModal ───────────────────────────────────────────────────

interface ManutencaoModalProps {
  manutencao: FrotaManutencao | null
  vehicles: Vehicle[]
  onClose: () => void
  onSaved: () => void
}

function ManutencaoModal({ manutencao, vehicles, onClose, onSaved }: ManutencaoModalProps) {
  const isEdit = !!manutencao
  const [form, setForm] = useState({
    vehicle_id:          manutencao?.vehicle_id ?? '',
    tipo:                manutencao?.tipo ?? 'troca_oleo',
    nome:                manutencao?.nome ?? '',
    intervalo_km:        manutencao?.intervalo_km?.toString() ?? '',
    ultimo_km_realizado: manutencao?.ultimo_km_realizado?.toString() ?? '',
    intervalo_dias:      manutencao?.intervalo_dias?.toString() ?? '',
    ultima_data:         manutencao?.ultima_data ?? '',
    observacoes:         manutencao?.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Auto-fill name + intervals from tipo
  function applyTipo(tipo: string) {
    const preset = MANUTENCAO_TIPOS.find(t => t.tipo === tipo)
    if (!preset) { set('tipo', tipo); return }
    setForm(p => ({
      ...p,
      tipo,
      nome:           preset.nome !== 'Personalizado' ? preset.nome : p.nome,
      intervalo_km:   preset.intervalo_km?.toString() ?? '',
      intervalo_dias: preset.intervalo_dias?.toString() ?? '',
    }))
  }

  function calcProximaKm(): number | null {
    const ult = parseInt(form.ultimo_km_realizado)
    const int = parseInt(form.intervalo_km)
    if (!isNaN(ult) && !isNaN(int)) return ult + int
    const veh = vehicles.find(v => v.id === form.vehicle_id)
    if (veh?.km_atual != null && !isNaN(int)) return veh.km_atual + int
    return null
  }

  function calcProximaData(): string | null {
    const int = parseInt(form.intervalo_dias)
    if (isNaN(int)) return null
    const base = form.ultima_data ? parseISO(form.ultima_data) : new Date()
    return format(new Date(base.getTime() + int * 86400000), 'yyyy-MM-dd')
  }

  async function save() {
    if (!form.vehicle_id || !form.nome) return
    setSaving(true)
    const proxima_km = calcProximaKm()
    const proxima_data = calcProximaData()
    const payload: any = {
      vehicle_id:          form.vehicle_id,
      tipo:                form.tipo,
      nome:                form.nome,
      intervalo_km:        form.intervalo_km  ? parseInt(form.intervalo_km)  : null,
      ultimo_km_realizado: form.ultimo_km_realizado ? parseInt(form.ultimo_km_realizado) : null,
      proxima_km,
      intervalo_dias:      form.intervalo_dias ? parseInt(form.intervalo_dias) : null,
      ultima_data:         form.ultima_data || null,
      proxima_data,
      observacoes:         form.observacoes || null,
      ativo:               true,
      updated_at:          new Date().toISOString(),
    }

    if (isEdit) {
      await supabase.from('frota_manutencoes').update(payload).eq('id', manutencao!.id)
    } else {
      await supabase.from('frota_manutencoes').insert(payload)
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{isEdit ? 'Editar Manutenção' : 'Nova Manutenção Programada'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="label">Veículo *</label>
            <select className="input" value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}>
              <option value="">Selecione</option>
              {vehicles.filter(v => v.ativo).map(v => (
                <option key={v.id} value={v.id}>{v.apelido}{v.placa ? ` — ${v.placa}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.tipo} onChange={e => applyTipo(e.target.value)}>
              {MANUTENCAO_TIPOS.map(t => <option key={t.tipo} value={t.tipo}>{t.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Nome *</label>
            <input type="text" className="input" value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Intervalo (km)</label>
              <input type="number" min="0" className="input" placeholder="ex: 10000"
                value={form.intervalo_km} onChange={e => set('intervalo_km', e.target.value)} />
            </div>
            <div>
              <label className="label">Intervalo (dias)</label>
              <input type="number" min="0" className="input" placeholder="ex: 180"
                value={form.intervalo_dias} onChange={e => set('intervalo_dias', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Último KM realizado</label>
              <input type="number" min="0" className="input" placeholder="ex: 85000"
                value={form.ultimo_km_realizado} onChange={e => set('ultimo_km_realizado', e.target.value)} />
            </div>
            <div>
              <label className="label">Data da última vez</label>
              <input type="date" className="input" value={form.ultima_data} onChange={e => set('ultima_data', e.target.value)} />
            </div>
          </div>

          {(calcProximaKm() || calcProximaData()) && (
            <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/40 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              {calcProximaKm() && <p>Próxima manutenção em: <strong className="text-slate-700 dark:text-slate-200">{calcProximaKm()!.toLocaleString('pt-BR')} km</strong></p>}
              {calcProximaData() && <p>Próxima data: <strong className="text-slate-700 dark:text-slate-200">{format(parseISO(calcProximaData()!), 'dd/MM/yyyy')}</strong></p>}
            </div>
          )}

          <div>
            <label className="label">Observações</label>
            <textarea rows={2} className="input resize-none" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || !form.vehicle_id || !form.nome}
            className="btn-primary flex-1 disabled:opacity-50">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : (isEdit ? 'Salvar' : 'Adicionar')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── RegistrarFeitaModal ───────────────────────────────────────────────
// Quick "mark as done" — logs a cost AND updates the maintenance record

interface RegistrarFeitaProps {
  manutencao: FrotaManutencao
  vehicles: Vehicle[]
  drivers: Driver[]
  onClose: () => void
  onSaved: () => void
}

function RegistrarFeitaModal({ manutencao, vehicles, drivers, onClose, onSaved }: RegistrarFeitaProps) {
  const veh = vehicles.find(v => v.id === manutencao.vehicle_id)
  const [km, setKm] = useState(veh?.km_atual?.toString() ?? '')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [driverId, setDriverId] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!km || !valor) return
    setSaving(true)

    const kmNum = parseInt(km)
    const valorNum = parseFloat(valor)
    const today = new Date().toISOString()

    // Map manutencao tipo to custo categoria
    const catMap: Record<string, CustoCategoria> = {
      troca_oleo: 'troca_oleo', filtro_ar: 'filtro', filtro_comb: 'filtro',
      velas: 'manutencao', pneu: 'pneu', alinhamento: 'alinhamento',
      revisao: 'revisao', freios: 'freios', correia: 'correia',
    }
    const categoria: CustoCategoria = catMap[manutencao.tipo] ?? 'manutencao'

    // 1) Log custo
    await supabase.from('frota_custos').insert({
      vehicle_id: manutencao.vehicle_id,
      driver_id: driverId || null,
      categoria,
      descricao: manutencao.nome,
      valor: valorNum,
      km_odometro: kmNum,
      data_gasto: data,
      observacoes: obs || null,
      updated_at: today,
    })

    // 2) Update maintenance record
    const proxima_km = manutencao.intervalo_km ? kmNum + manutencao.intervalo_km : null
    const proxima_data = manutencao.intervalo_dias
      ? format(new Date(Date.now() + manutencao.intervalo_dias * 86400000), 'yyyy-MM-dd')
      : null

    await supabase.from('frota_manutencoes').update({
      ultimo_km_realizado: kmNum,
      ultima_data: data,
      proxima_km,
      proxima_data,
      updated_at: today,
    }).eq('id', manutencao.id)

    // 3) Update vehicle km
    if (!veh?.km_atual || kmNum > veh.km_atual) {
      await supabase.from('crm_vehicles')
        .update({ km_atual: kmNum, updated_at: today })
        .eq('id', manutencao.vehicle_id)
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Registrar como Feita</p>
            <p className="text-xs text-slate-400 mt-0.5">{manutencao.nome} — {veh?.apelido}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data *</label>
              <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div>
              <label className="label">KM Odômetro *</label>
              <input type="number" min="0" className="input" placeholder="km atual"
                value={km} onChange={e => setKm(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Valor gasto (R$) *</label>
            <input type="number" step="0.01" min="0" className="input" placeholder="0,00"
              value={valor} onChange={e => setValor(e.target.value)} />
          </div>
          <div>
            <label className="label">Motorista (opcional)</label>
            <select className="input" value={driverId} onChange={e => setDriverId(e.target.value)}>
              <option value="">Nenhum</option>
              {drivers.filter(d => d.ativo).map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Observações</label>
            <input type="text" className="input" placeholder="Oficina, peças, etc."
              value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || !km || !valor}
            className="btn-primary flex-1 disabled:opacity-50">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main CustosTab ────────────────────────────────────────────────────

interface Props {
  vehicles: Vehicle[]
  drivers: Driver[]
  onVehiclesChanged: () => void
}

export default function CustosTab({ vehicles, drivers, onVehiclesChanged }: Props) {
  const [subTab, setSubTab] = useState<'lancamentos' | 'manutencoes'>('lancamentos')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [customDateFrom, setCustomDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [customDateTo, setCustomDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [vehicleFilter, setVehicleFilter] = useState('todos')
  const [catFilter, setCatFilter] = useState('todas')
  const [custos, setCustos] = useState<FrotaCusto[]>([])
  const [manutencoes, setManutencoes] = useState<FrotaManutencao[]>([])
  const [loading, setLoading] = useState(true)
  const [editCusto, setEditCusto] = useState<FrotaCusto | null | undefined>(undefined)
  const [editMan, setEditMan] = useState<FrotaManutencao | null | undefined>(undefined)
  const [registrarMan, setRegistrarMan] = useState<FrotaManutencao | null>(null)
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null)

  const { from, to } = useCustomDate
    ? { from: customDateFrom, to: customDateTo }
    : periodoRange(periodo, periodo === 'mes' ? selectedMonth : new Date())

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: mData }] = await Promise.all([
      supabase.from('frota_custos')
        .select('*, vehicle:crm_vehicles(id,apelido,placa), driver:crm_drivers(id,nome)')
        .gte('data_gasto', from).lte('data_gasto', to)
        .order('data_gasto', { ascending: false }),
      supabase.from('frota_manutencoes')
        .select('*, vehicle:crm_vehicles(id,apelido,placa,km_atual)')
        .eq('ativo', true)
        .order('vehicle_id'),
    ])
    setCustos((cData ?? []) as FrotaCusto[])
    setManutencoes((mData ?? []) as FrotaManutencao[])
    setLoading(false)
  }, [from, to])

  useEffect(() => { loadData() }, [loadData])

  // Filtered expenses
  const filtered = useMemo(() => {
    let list = custos
    if (vehicleFilter !== 'todos') list = list.filter(c => c.vehicle_id === vehicleFilter)
    if (catFilter !== 'todas')    list = list.filter(c => c.categoria === catFilter)
    return list
  }, [custos, vehicleFilter, catFilter])

  // KPIs
  const totalGasto   = useMemo(() => filtered.reduce((s, c) => s + c.valor, 0), [filtered])
  const totalCombust = useMemo(() => filtered.filter(c => c.categoria === 'combustivel').reduce((s, c) => s + c.valor, 0), [filtered])
  const totalManut   = useMemo(() => filtered.filter(c => CATEGORIAS[c.categoria]?.isMaint).reduce((s, c) => s + c.valor, 0), [filtered])

  // Cost per km (using km range from odometer readings)
  const custoPerKm = useMemo(() => {
    const withKm = filtered.filter(c => c.km_odometro != null)
    if (withKm.length < 2) return null
    const sorted = [...withKm].sort((a, b) => (a.km_odometro ?? 0) - (b.km_odometro ?? 0))
    const kmRange = (sorted[sorted.length - 1].km_odometro ?? 0) - (sorted[0].km_odometro ?? 0)
    if (kmRange < 100) return null
    return totalGasto / kmRange
  }, [filtered, totalGasto])

  // Per-vehicle breakdown
  const byVehicle = useMemo(() => {
    const map = new Map<string, { vehicle: FrotaCusto['vehicle']; total: number; itens: FrotaCusto[] }>()
    for (const c of filtered) {
      const vid = c.vehicle_id
      if (!map.has(vid)) map.set(vid, { vehicle: c.vehicle, total: 0, itens: [] })
      const entry = map.get(vid)!
      entry.total += c.valor
      entry.itens.push(c)
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total)
  }, [filtered])

  // Maintenance alerts (sorted by urgency)
  const filteredMan = useMemo(() => {
    let list = manutencoes
    if (vehicleFilter !== 'todos') list = list.filter(m => m.vehicle_id === vehicleFilter)
    return list.sort((a, b) => {
      const order = { overdue: 0, danger: 1, warning: 2, ok: 3 }
      return (order[maintStatus(a)] ?? 3) - (order[maintStatus(b)] ?? 3)
    })
  }, [manutencoes, vehicleFilter])

  const alertCount = useMemo(() =>
    manutencoes.filter(m => ['overdue', 'danger', 'warning'].includes(maintStatus(m))).length,
  [manutencoes])

  async function deleteCusto(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('frota_custos').delete().eq('id', id)
    setCustos(p => p.filter(c => c.id !== id))
  }

  async function cancelarRecorrencia(custoRecorrenteId: string, dataAPartir: string) {
    await supabase
      .from('frota_custos')
      .delete()
      .eq('custo_recorrente_id', custoRecorrenteId)
      .gte('data_gasto', dataAPartir)

    const { error } = await supabase
      .from('frota_custos')
      .update({ recorrencia_indefinida: false, data_fim_recorrencia: format(subDays(parseISO(dataAPartir), 1), 'yyyy-MM-dd') })
      .eq('id', custoRecorrenteId)

    if (!error) {
      await loadData()
    }
  }

  async function deleteMan(id: string) {
    if (!confirm('Excluir esta manutenção programada?')) return
    await supabase.from('frota_manutencoes').delete().eq('id', id)
    setManutencoes(p => p.filter(m => m.id !== id))
  }

  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const currentMonthLabel = `${monthNames[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`

  function handleMonthSelect(month: number, year: number) {
    const newDate = new Date(year, month, 1)
    setSelectedMonth(newDate)
    setShowMonthPicker(false)
  }

  const PERIOD_LABELS: Record<Periodo, string> = { semana: 'Esta semana', mes: currentMonthLabel, trimestre: 'Trim.', ano: 'Este ano' }

  return (
    <div className="space-y-4">
      {/* ── Month Picker Modal ── */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4">Selecionar Mês e Ano</h3>

            <div className="space-y-4">
              {/* Year selector */}
              <div>
                <label className="label text-xs mb-2">Ano</label>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() - 1, selectedMonth.getMonth(), 1))}
                    className="btn-ghost px-3 py-1 text-xs">←</button>
                  <input type="number" className="input text-center"
                    value={selectedMonth.getFullYear()}
                    onChange={e => setSelectedMonth(new Date(parseInt(e.target.value), selectedMonth.getMonth(), 1))} />
                  <button onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear() + 1, selectedMonth.getMonth(), 1))}
                    className="btn-ghost px-3 py-1 text-xs">→</button>
                </div>
              </div>

              {/* Month grid */}
              <div>
                <label className="label text-xs mb-2">Mês</label>
                <div className="grid grid-cols-3 gap-2">
                  {monthNames.map((m, idx) => (
                    <button key={idx} onClick={() => handleMonthSelect(idx, selectedMonth.getFullYear())}
                      className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                        selectedMonth.getMonth() === idx
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowMonthPicker(false)} className="btn-secondary flex-1">Fechar</button>
              <button onClick={() => setShowMonthPicker(false)} className="btn-primary flex-1">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters bar ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Period selector / Custom date toggle */}
          {!useCustomDate ? (
            <>
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
                {(['semana', 'mes', 'ano'] as Periodo[]).map(p => (
                  <button key={p} onClick={() => {
                    setPeriodo(p)
                    if (p === 'mes') setShowMonthPicker(true)
                  }}
                    className={`px-3 py-1.5 transition-colors ${periodo === p ? 'bg-orange-500 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
              <button onClick={() => setUseCustomDate(true)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <Calendar size={13} className="inline mr-1" /> Período Personalizado
              </button>
            </>
          ) : (
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">De:</label>
                <input type="date" className="input text-sm py-1.5 w-32" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Até:</label>
                <input type="date" className="input text-sm py-1.5 w-32" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} />
              </div>
              <button onClick={() => setUseCustomDate(false)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                Usar períodos rápidos
              </button>
            </div>
          )}

          {/* Vehicle filter */}
          <select className="input text-sm py-1.5 w-auto ml-auto" value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}>
            <option value="todos">Todos os veículos</option>
            {vehicles.filter(v => v.ativo).map(v => (
              <option key={v.id} value={v.id}>{v.apelido}</option>
            ))}
          </select>

          <button onClick={loadData} className="btn-ghost p-2">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setEditCusto(null)} className="btn-primary text-sm py-1.5">
            <Plus size={15} /> Lançamento
          </button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-slate-400" />
            <span className="text-xs text-slate-500">Total do período</span>
          </div>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{brl(totalGasto)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Fuel size={14} className="text-amber-500" />
            <span className="text-xs text-slate-500">Combustível</span>
          </div>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{brl(totalCombust)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{pct(totalCombust, totalGasto)}% do total</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench size={14} className="text-blue-500" />
            <span className="text-xs text-slate-500">Manutenção</span>
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{brl(totalManut)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{pct(totalManut, totalGasto)}% do total</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-green-500" />
            <span className="text-xs text-slate-500">Custo / km</span>
          </div>
          {custoPerKm != null ? (
            <>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {custoPerKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">por quilômetro</p>
            </>
          ) : (
            <p className="text-sm text-slate-400 mt-1">Informe KM nos lançamentos</p>
          )}
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button onClick={() => setSubTab('lancamentos')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            subTab === 'lancamentos' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}>
          <BarChart3 size={14} /> Lançamentos
        </button>
        <button onClick={() => setSubTab('manutencoes')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            subTab === 'manutencoes' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
          }`}>
          <Wrench size={14} /> Manutenções Programadas
          {alertCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">{alertCount}</span>
          )}
        </button>
      </div>

      {/* ── Lançamentos tab ── */}
      {subTab === 'lancamentos' && (
        <div className="space-y-4">
          {/* Category filter */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setCatFilter('todas')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${catFilter === 'todas' ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
              Todas
            </button>
            {Object.entries(CATEGORIAS).map(([k, v]) => (
              <button key={k} onClick={() => setCatFilter(k)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${catFilter === k ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-800' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {v.emoji} {v.label}
              </button>
            ))}
          </div>

          {/* Per-vehicle accordion */}
          {byVehicle.length > 0 ? (
            <div className="space-y-2">
              {byVehicle.map(([vid, info]) => {
                const isOpen = expandedVehicle === vid
                const pctTotal = pct(info.total, totalGasto)
                return (
                  <div key={vid} className="card overflow-hidden">
                    <button
                      onClick={() => setExpandedVehicle(isOpen ? null : vid)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors text-left"
                    >
                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700">
                        <Car size={14} className="text-slate-500 dark:text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{info.vehicle?.apelido ?? 'Veículo'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden max-w-[120px]">
                            <div className="h-full rounded-full bg-orange-400" style={{ width: `${pctTotal}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-400">{pctTotal}% · {info.itens.length} lançto{info.itens.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <span className="font-bold text-slate-800 dark:text-slate-100 shrink-0">{brl(info.total)}</span>
                      <ChevronRight size={16} className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-50 dark:divide-slate-700/50">
                        {info.itens.map(c => (
                          <div key={c.id} className={`flex items-center gap-3 px-4 py-2.5 ${c.recorrente ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                            <span className="text-base w-6 text-center shrink-0">{CATEGORIAS[c.categoria]?.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm text-slate-700 dark:text-slate-200">
                                  {c.descricao || CATEGORIAS[c.categoria]?.label}
                                </p>
                                {c.recorrente && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                    🔄 {c.tipo_recorrencia}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400 flex items-center gap-2">
                                <Calendar size={9} />
                                {format(parseISO(c.data_gasto), 'dd/MM/yyyy')}
                                {c.recorrente && c.proxima_data_recorrencia && (
                                  <span className="text-blue-600 dark:text-blue-400">
                                    · próximo: {format(parseISO(c.proxima_data_recorrencia), 'dd/MM/yyyy')}
                                  </span>
                                )}
                                {c.km_odometro && <span>· {c.km_odometro.toLocaleString('pt-BR')} km</span>}
                                {c.litros && <span>· {c.litros}L</span>}
                                {c.driver?.nome && <span>· {c.driver.nome}</span>}
                              </p>
                            </div>
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 shrink-0">{brl(c.valor)}</span>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => setEditCusto(c)} className="btn-ghost p-1.5 text-slate-400"><Pencil size={12} /></button>
                              {c.recorrente && c.custo_recorrente_id && (
                                <button
                                  onClick={() => {
                                    if (confirm('Cancelar a recorrência a partir deste mês?\nIsso vai excluir todos os lançamentos futuros.')) {
                                      cancelarRecorrencia(c.custo_recorrente_id!, c.data_gasto)
                                    }
                                  }}
                                  className="btn-ghost p-1.5 text-orange-400"
                                  title="Cancelar recorrência a partir deste mês">
                                  <X size={12} />
                                </button>
                              )}
                              <button onClick={() => deleteCusto(c.id)} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="card p-10 text-center text-slate-400 space-y-2">
              <DollarSign size={28} className="mx-auto opacity-40" />
              <p className="text-sm">Nenhum lançamento no período.</p>
              <button onClick={() => setEditCusto(null)} className="btn-primary mx-auto text-sm">
                <Plus size={14} /> Primeiro lançamento
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manutenções tab ── */}
      {subTab === 'manutencoes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setEditMan(null)} className="btn-primary text-sm py-1.5">
              <Plus size={15} /> Manutenção
            </button>
          </div>

          {filteredMan.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 space-y-2">
              <Wrench size={28} className="mx-auto opacity-40" />
              <p className="text-sm">Nenhuma manutenção programada.</p>
              <button onClick={() => setEditMan(null)} className="btn-primary mx-auto text-sm">
                <Plus size={14} /> Adicionar programação
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMan.map(m => {
                const st = maintStatus(m)
                const style = MAINT_STYLE[st]
                const kmAtual = m.vehicle?.km_atual ?? null
                const kmRem = m.proxima_km != null && kmAtual != null ? m.proxima_km - kmAtual : null
                const diasRem = m.proxima_data ? differenceInDays(parseISO(m.proxima_data), new Date()) : null

                return (
                  <div key={m.id} className={`card px-4 py-3 flex items-start gap-3 border-l-4 ${
                    st === 'overdue' ? 'border-red-400' :
                    st === 'danger'  ? 'border-orange-400' :
                    st === 'warning' ? 'border-amber-400' : 'border-green-400'
                  }`}>
                    <div className={`mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${style.bg} ${style.text}`}>
                      {style.label}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{m.nome}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                          {m.vehicle?.apelido}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-3">
                        {kmAtual != null && <span>Hodômetro atual: {kmAtual.toLocaleString('pt-BR')} km</span>}
                        {m.ultimo_km_realizado && <span>Último: {m.ultimo_km_realizado.toLocaleString('pt-BR')} km</span>}
                        {m.proxima_km && <span className={kmRem != null && kmRem < 0 ? 'text-red-500 font-semibold' : ''}>
                          Próxima: {m.proxima_km.toLocaleString('pt-BR')} km
                          {kmRem != null && <span className="ml-1">({kmRem >= 0 ? `faltam ${kmRem.toLocaleString('pt-BR')} km` : `${Math.abs(kmRem).toLocaleString('pt-BR')} km atrasada`})</span>}
                        </span>}
                        {m.proxima_data && <span className={diasRem != null && diasRem < 0 ? 'text-red-500 font-semibold' : ''}>
                          Data: {format(parseISO(m.proxima_data), 'dd/MM/yyyy')}
                          {diasRem != null && <span className="ml-1">({diasRem >= 0 ? `${diasRem}d` : `${Math.abs(diasRem)}d atrás`})</span>}
                        </span>}
                      </div>
                    </div>

                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setRegistrarMan(m)}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors font-medium">
                        <CheckCircle2 size={12} /> Feita
                      </button>
                      <button onClick={() => setEditMan(m)} className="btn-ghost p-1.5 text-slate-400"><Pencil size={12} /></button>
                      <button onClick={() => deleteMan(m.id)} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {editCusto !== undefined && (
        <CustoModal
          custo={editCusto}
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setEditCusto(undefined)}
          onSaved={() => { loadData(); onVehiclesChanged() }}
        />
      )}
      {editMan !== undefined && (
        <ManutencaoModal
          manutencao={editMan}
          vehicles={vehicles}
          onClose={() => setEditMan(undefined)}
          onSaved={loadData}
        />
      )}
      {registrarMan && (
        <RegistrarFeitaModal
          manutencao={registrarMan}
          vehicles={vehicles}
          drivers={drivers}
          onClose={() => setRegistrarMan(null)}
          onSaved={() => { loadData(); onVehiclesChanged() }}
        />
      )}
    </div>
  )
}
