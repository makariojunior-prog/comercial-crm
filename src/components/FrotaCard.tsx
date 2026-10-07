import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import {
  Truck, Bike, Car, Settings2, RefreshCw, WifiOff, MapPin, Gauge, Route as OdoIcon,
  ShieldCheck, FileText, CreditCard, Wrench, IdCard, Check, Eye, EyeOff, X,
} from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { fetchPositions } from '../lib/velotrack'
import { useAuth } from '../contexts/AuthContext'
import { useEscKey } from '../hooks/useEscKey'
import { docExpiryStatus, daysUntil } from '../types'
import type { VelotrackPosition } from '../types'
import { useVisibleInterval } from '../hooks/useVisibleInterval'

// ─── Tipos ────────────────────────────────────────────────────────────────

interface VeiculoRow {
  id: string
  apelido: string
  placa: string | null
  tipo: string | null
  tem_rastreamento: boolean
  velotrack_device_id: number | null
  km_atual: number | null
  proxima_revisao_km: number | null
  venc_seguro: string | null
  venc_ipva: string | null
  crlv_vencimento: string | null
  exibir_no_dashboard: boolean
}

interface ManutencaoRow {
  vehicle_id: string
  nome: string
  proxima_km: number | null
  proxima_data: string | null
}

interface KmRegistro { vehicle_id: string; km: number; data: string }

type Nivel = 'expired' | 'danger' | 'warning'
interface Alerta { chave: string; icone: typeof ShieldCheck; rotulo: string; texto: string; nivel: Nivel }

const REFRESH_MS = 60_000
const NIVEL_ORDEM: Record<Nivel, number> = { warning: 1, danger: 2, expired: 3 }
const NIVEL_ESTILO: Record<Nivel, string> = {
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  danger:  'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
}

const hojeISO = () => format(new Date(), 'yyyy-MM-dd')
const fmtKm = (n: number) => `${n.toLocaleString('pt-BR')} km`
const normPlaca = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function alertaDocumento(chave: string, icone: Alerta['icone'], rotulo: string, data: string | null): Alerta | null {
  const st = docExpiryStatus(data)
  if (st !== 'expired' && st !== 'danger' && st !== 'warning') return null
  const dias = daysUntil(data) ?? 0
  return {
    chave, icone, rotulo, nivel: st,
    texto: dias < 0 ? `vencido há ${Math.abs(dias)}d` : dias === 0 ? 'vence hoje' : `${dias}d`,
  }
}

// Mesmos limiares da aba de manutenções da Logística (CustosTab.maintStatus)
function nivelPorKm(restante: number): Nivel | null {
  if (restante < 0) return 'expired'
  if (restante < 500) return 'danger'
  if (restante < 2000) return 'warning'
  return null
}

function alertasDoVeiculo(v: VeiculoRow, manut: ManutencaoRow[]): Alerta[] {
  const lista: (Alerta | null)[] = [
    alertaDocumento('seguro', ShieldCheck, 'Seguro', v.venc_seguro),
    alertaDocumento('ipva', CreditCard, 'IPVA', v.venc_ipva),
    alertaDocumento('crlv', FileText, 'CRLV', v.crlv_vencimento),
  ]

  if (v.proxima_revisao_km != null && v.km_atual != null) {
    const rest = v.proxima_revisao_km - v.km_atual
    const nivel = nivelPorKm(rest)
    if (nivel) lista.push({
      chave: 'revisao', icone: Wrench, rotulo: 'Revisão', nivel,
      texto: rest < 0 ? `passou ${fmtKm(-rest)}` : `faltam ${fmtKm(rest)}`,
    })
  }

  for (const m of manut) {
    if (m.proxima_km != null && v.km_atual != null) {
      const rest = m.proxima_km - v.km_atual
      const nivel = nivelPorKm(rest)
      if (nivel) lista.push({
        chave: `m-km-${m.nome}`, icone: Wrench, rotulo: m.nome, nivel,
        texto: rest < 0 ? `passou ${fmtKm(-rest)}` : `faltam ${fmtKm(rest)}`,
      })
    }
    if (m.proxima_data) {
      const dias = daysUntil(m.proxima_data) ?? 0
      const nivel: Nivel | null = dias < 0 ? 'expired' : dias < 7 ? 'danger' : dias < 30 ? 'warning' : null
      if (nivel) lista.push({
        chave: `m-dt-${m.nome}`, icone: Wrench, rotulo: m.nome, nivel,
        texto: dias < 0 ? `atrasada ${Math.abs(dias)}d` : dias === 0 ? 'hoje' : `${dias}d`,
      })
    }
  }

  return lista.filter((a): a is Alerta => a !== null)
    .sort((a, b) => NIVEL_ORDEM[b.nivel] - NIVEL_ORDEM[a.nivel])
}

const piorNivel = (as: Alerta[]) => as.reduce((m, a) => Math.max(m, NIVEL_ORDEM[a.nivel]), 0)

function IconeVeiculo({ tipo }: { tipo: string | null }) {
  const t = (tipo ?? '').toLowerCase()
  if (t.includes('moto')) return <Bike size={14} className="text-slate-400 shrink-0" />
  if (t.includes('caminh') || t.includes('van') || t.includes('furg')) return <Truck size={14} className="text-slate-400 shrink-0" />
  return <Car size={14} className="text-slate-400 shrink-0" />
}

// ─── Card ────────────────────────────────────────────────────────────────

/**
 * Card único de Frota: cada veículo reúne rastreamento ao vivo, alertas (documentos e revisões)
 * e o registro rápido de hodômetro. Administradores escolhem quais veículos aparecem.
 */
export default function FrotaCard() {
  const { isAdmin } = useAuth()
  const [veiculos, setVeiculos]       = useState<VeiculoRow[]>([])
  const [manutencoes, setManutencoes] = useState<ManutencaoRow[]>([])
  const [alertasCnh, setAlertasCnh]   = useState<{ nome: string; texto: string; nivel: Nivel }[]>([])
  const [ultimoKm, setUltimoKm]       = useState<Record<string, KmRegistro>>({})
  const [positions, setPositions]     = useState<VelotrackPosition[]>([])
  const [erroPos, setErroPos]         = useState(false)
  const [loadingPos, setLoadingPos]   = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [loading, setLoading]         = useState(true)
  const [configurando, setConfigurando] = useState(false)
  const [kmModal, setKmModal]         = useState<VeiculoRow | null>(null)
  const ativo = useRef(true)

  const carregarDados = useCallback(async () => {
    const [veic, man, drv, km] = await Promise.all([
      supabase.from('crm_vehicles')
        .select('id, apelido, placa, tipo, tem_rastreamento, velotrack_device_id, km_atual, proxima_revisao_km, venc_seguro, venc_ipva, crlv_vencimento, exibir_no_dashboard')
        .eq('ativo', true).order('apelido'),
      supabase.from('frota_manutencoes')
        .select('vehicle_id, nome, proxima_km, proxima_data').eq('ativo', true),
      supabase.from('crm_drivers')
        .select('nome, cnh_vencimento').eq('ativo', true).not('cnh_vencimento', 'is', null),
      supabase.from('frota_odometro_registros')
        .select('vehicle_id, km, data').order('data', { ascending: false })
        .order('created_at', { ascending: false }).limit(500),
    ])
    if (!ativo.current) return
    setVeiculos((veic.data ?? []) as VeiculoRow[])
    setManutencoes((man.data ?? []) as ManutencaoRow[])
    setAlertasCnh((drv.data ?? []).flatMap(d => {
      const a = alertaDocumento('cnh', IdCard, 'CNH', d.cnh_vencimento as string)
      return a ? [{ nome: d.nome as string, texto: a.texto, nivel: a.nivel }] : []
    }))
    const ult: Record<string, KmRegistro> = {}
    for (const r of (km.data ?? []) as KmRegistro[]) if (!ult[r.vehicle_id]) ult[r.vehicle_id] = r
    setUltimoKm(ult)
    setLoading(false)
  }, [])

  const carregarPosicoes = useCallback(async () => {
    if (!ativo.current) return
    setLoadingPos(true)
    setErroPos(false)
    try {
      const data = await fetchPositions()
      if (!ativo.current) return
      setPositions(Array.isArray(data) ? data : [])
      setAtualizadoEm(new Date())
    } catch {
      if (ativo.current) setErroPos(true)
    } finally {
      if (ativo.current) setLoadingPos(false)
    }
  }, [])

  useEffect(() => {
    ativo.current = true
    carregarDados()
    carregarPosicoes()
    return () => { ativo.current = false }
  }, [carregarDados, carregarPosicoes])

  // Posições do rastreador só se atualizam com a aba visível
  useVisibleInterval(carregarPosicoes, REFRESH_MS)

  // Posição de cada veículo: pelo ID do rastreador e, na falta dele, pela placa
  const { posPorVeiculo, semVeiculo } = useMemo(() => {
    const usadas = new Set<number>()
    const mapa: Record<string, VelotrackPosition> = {}
    for (const v of veiculos) {
      const placa = normPlaca(v.placa)
      const p = positions.find(x => v.velotrack_device_id != null && x.iddevice === v.velotrack_device_id)
        ?? (placa ? positions.find(x => normPlaca(x.vehicle_code) === placa || normPlaca(x.description).includes(placa)) : undefined)
      if (p) { mapa[v.id] = p; usadas.add(p.iddevice) }
    }
    return { posPorVeiculo: mapa, semVeiculo: positions.filter(p => !usadas.has(p.iddevice)) }
  }, [veiculos, positions])

  async function alternarVisibilidade(v: VeiculoRow) {
    const novo = !v.exibir_no_dashboard
    setVeiculos(lista => lista.map(x => x.id === v.id ? { ...x, exibir_no_dashboard: novo } : x))
    const { error } = await supabase.from('crm_vehicles').update({ exibir_no_dashboard: novo }).eq('id', v.id)
    if (error) {
      setVeiculos(lista => lista.map(x => x.id === v.id ? { ...x, exibir_no_dashboard: !novo } : x))
      alert('Não foi possível alterar: ' + error.message)
    }
  }

  const visiveis = useMemo(() => {
    return veiculos
      .filter(v => v.exibir_no_dashboard)
      .map(v => ({ v, alertas: alertasDoVeiculo(v, manutencoes.filter(m => m.vehicle_id === v.id)) }))
      .sort((a, b) =>
        Number(!!posPorVeiculo[b.v.id]) - Number(!!posPorVeiculo[a.v.id]) ||
        piorNivel(b.alertas) - piorNivel(a.alertas) ||
        a.v.apelido.localeCompare(b.v.apelido))
  }, [veiculos, manutencoes, posPorVeiculo])

  // Totais do cabeçalho: só os veículos exibidos (+ rastreadores sem veículo cadastrado)
  const posExibidas = [
    ...visiveis.map(x => posPorVeiculo[x.v.id]).filter((p): p is VelotrackPosition => !!p),
    ...semVeiculo,
  ]
  const emRota  = posExibidas.filter(p => p.connected && p.offline_hours <= 1).length
  const parados = posExibidas.filter(p => !p.connected && p.offline_hours <= 1).length
  const offline = posExibidas.filter(p => p.offline_hours > 1).length
  const totalAlertas = visiveis.reduce((s, x) => s + x.alertas.length, 0) + alertasCnh.length
  const hoje = hojeISO()

  if (loading) return null
  if (visiveis.length === 0 && semVeiculo.length === 0 && !isAdmin) return null

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap min-w-0">
          <Truck size={15} className="text-orange-500" />
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Frota</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {emRota > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-[11px] font-bold text-green-700 dark:text-green-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {emRota} em rota
              </span>
            )}
            {parados > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {parados} parado{parados > 1 ? 's' : ''}
              </span>
            )}
            {offline > 0 && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-[11px] font-bold text-red-600 dark:text-red-400">
                <WifiOff size={11} /> {offline} offline
              </span>
            )}
            {totalAlertas > 0 && (
              <span className="px-2 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-[11px] font-bold text-orange-700 dark:text-orange-300">
                {totalAlertas} alerta{totalAlertas > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {atualizadoEm && (
            <span className="text-[10px] text-slate-400">
              {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={carregarPosicoes} disabled={loadingPos} title="Atualizar posições"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <RefreshCw size={13} className={loadingPos ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button onClick={() => setConfigurando(c => !c)} title="Escolher veículos exibidos"
              className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 ${configurando ? 'text-orange-500' : 'text-slate-400'}`}>
              <Settings2 size={14} />
            </button>
          )}
          <a href="#/logistica" className="text-xs text-orange-500 hover:underline font-medium">Ver frota →</a>
        </div>
      </div>

      {configurando && (
        <div className="mb-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Escolha os veículos que aparecem neste card (vale para todos os usuários):</p>
          <div className="flex flex-wrap gap-1.5">
            {veiculos.map(v => (
              <button key={v.id} onClick={() => alternarVisibilidade(v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  v.exibir_no_dashboard
                    ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400'
                }`}>
                {v.exibir_no_dashboard ? <Eye size={12} /> : <EyeOff size={12} />}
                {v.apelido}
              </button>
            ))}
          </div>
        </div>
      )}

      {erroPos && (
        <p className="text-xs text-red-500 mb-2">Falha ao buscar as posições dos rastreadores. Os alertas e o km continuam disponíveis.</p>
      )}

      {visiveis.length === 0 && semVeiculo.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-3">Nenhum veículo selecionado. Use a engrenagem para escolher.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {visiveis.map(({ v, alertas }) => (
          <VeiculoTile
            key={v.id}
            veiculo={v}
            alertas={alertas}
            posicao={posPorVeiculo[v.id]}
            ultimo={ultimoKm[v.id]}
            semKmHoje={ultimoKm[v.id]?.data !== hoje}
            onRegistrarKm={() => setKmModal(v)}
          />
        ))}
        {semVeiculo.map(p => (
          <VeiculoTile key={`pos-${p.iddevice}`} posicao={p} alertas={[]} titulo={p.description || p.vehicle_code} />
        ))}
      </div>

      {alertasCnh.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alertasCnh.map((a, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] ${NIVEL_ESTILO[a.nivel]}`}>
              <IdCard size={11} /> CNH {a.nome} · {a.texto}
            </span>
          ))}
        </div>
      )}

      {kmModal && (
        <RegistrarKmModal
          veiculo={kmModal}
          ultimo={ultimoKm[kmModal.id]}
          onClose={() => setKmModal(null)}
          onSaved={() => { setKmModal(null); carregarDados() }}
        />
      )}
    </div>
  )
}

// ─── Veículo ─────────────────────────────────────────────────────────────

function VeiculoTile({ veiculo, alertas, posicao, ultimo, semKmHoje, titulo, onRegistrarKm }: {
  veiculo?: VeiculoRow
  alertas: Alerta[]
  posicao?: VelotrackPosition
  ultimo?: KmRegistro
  semKmHoje?: boolean
  titulo?: string
  onRegistrarKm?: () => void
}) {
  const offline = posicao ? posicao.offline_hours > 1 : false
  const emRota  = posicao ? posicao.connected && posicao.offline_hours <= 1 : false
  const speed = (posicao as unknown as { speed?: number } | undefined)?.speed
  const hora = posicao?.command_date
    ? new Date(posicao.command_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null
  const kmMostrado = ultimo?.km ?? veiculo?.km_atual ?? null

  const mostraKm = !!veiculo && !!onRegistrarKm
  const linhaInfo = (posicao?.address && !offline) || alertas.length > 0

  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 px-2.5 py-1.5 text-xs space-y-1">
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        {posicao && (
          <span className={`shrink-0 w-2 h-2 rounded-full ${offline ? 'bg-red-400' : emRota ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
        )}
        {veiculo && <IconeVeiculo tipo={veiculo.tipo} />}
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{veiculo?.apelido ?? titulo}</span>
          {veiculo?.placa && <span className="text-slate-400 whitespace-nowrap">· {veiculo.placa}</span>}
          {posicao?.driver && <span className="text-slate-400 truncate">· {posicao.driver}</span>}
        </div>
        {mostraKm && (
          <>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
              <OdoIcon size={10} />
              {kmMostrado != null ? fmtKm(kmMostrado) : 'sem km'}
              {ultimo && <span className="text-slate-400">({format(new Date(ultimo.data + 'T12:00:00'), 'dd/MM')})</span>}
            </span>
            {semKmHoje && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-[10px] font-semibold whitespace-nowrap">sem km hoje</span>
            )}
            <button onClick={onRegistrarKm}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40 font-medium whitespace-nowrap">
              <OdoIcon size={11} /> Registrar km
            </button>
          </>
        )}
        {posicao && (
          <div className="ml-auto shrink-0 flex items-center gap-2 text-[10px]">
            {speed != null && speed > 0 && (
              <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400 font-bold"><Gauge size={9} /> {speed} km/h</span>
            )}
            {offline ? (
              <span className="text-red-400 font-bold flex items-center gap-0.5"><WifiOff size={9} /> {posicao.offline_hours}h</span>
            ) : (
              <a href={`https://www.google.com/maps?q=${parseFloat(posicao.latitude)},${parseFloat(posicao.longitude)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-orange-500 hover:underline flex items-center gap-0.5 font-medium">
                <MapPin size={9} /> {hora ?? 'ver'}
              </a>
            )}
          </div>
        )}
      </div>

      {linhaInfo && (
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
          {posicao?.address && !offline && (
            <span className="text-[10px] text-slate-400 truncate max-w-full" title={posicao.address}>{posicao.address}</span>
          )}
          {alertas.map(a => {
            const Icon = a.icone
            return (
              <span key={a.chave} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${NIVEL_ESTILO[a.nivel]}`}>
                <Icon size={10} /> {a.rotulo} · {a.texto}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Registro de hodômetro ────────────────────────────────────────────────

function RegistrarKmModal({ veiculo, ultimo, onClose, onSaved }: {
  veiculo: VeiculoRow
  ultimo?: KmRegistro
  onClose: () => void
  onSaved: () => void
}) {
  const [km, setKm]       = useState('')
  const [data, setData]   = useState(hojeISO())
  const [saving, setSaving] = useState(false)
  useEscKey(useCallback(onClose, [onClose]))

  const referencia = Math.max(ultimo?.km ?? 0, veiculo.km_atual ?? 0)
  const kmNum = Math.floor(Number(km))
  const valido = km !== '' && Number.isFinite(kmNum) && kmNum >= 0 && !!data
  const menor = valido && referencia > 0 && kmNum < referencia

  async function salvar() {
    if (!valido) return
    if (menor && !window.confirm(`O km informado (${fmtKm(kmNum)}) é menor que o último registrado (${fmtKm(referencia)}). Registrar mesmo assim?`)) return
    setSaving(true)
    const { error } = await supabase.from('frota_odometro_registros').insert({ vehicle_id: veiculo.id, km: kmNum, data })
    setSaving(false)
    if (error) { alert('Não foi possível registrar o km: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Registrar km</h3>
            <p className="text-xs text-slate-500">{veiculo.apelido}{veiculo.placa ? ` · ${veiculo.placa}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Último km: <strong>{referencia > 0 ? fmtKm(referencia) : 'nenhum registro'}</strong>
          {ultimo && <> em {format(new Date(ultimo.data + 'T12:00:00'), 'dd/MM/yyyy')}</>}
        </p>

        <div className="space-y-3">
          <div>
            <label className="label">Km do hodômetro</label>
            <input type="number" inputMode="numeric" min={0} autoFocus className="input" value={km}
              onChange={e => setKm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvar() }} />
            {menor && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                Menor que o último registrado ({fmtKm(referencia)}). Confira antes de salvar.
              </p>
            )}
          </div>
          <div>
            <label className="label">Data</label>
            <input type="date" className="input" value={data} max={hojeISO()} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={!valido || saving} className="btn-primary inline-flex items-center gap-1.5">
            <Check size={14} /> {saving ? 'Salvando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
