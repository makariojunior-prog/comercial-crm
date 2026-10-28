import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft, Pencil, Truck, Gauge, Wallet, Fuel, Wrench, Receipt, AlertTriangle, Info, CheckCircle2, ChevronDown, ChevronRight, CalendarClock, FileText, Droplet, ClipboardList,
} from 'lucide-react'
import { format, parseISO, addMonths, startOfMonth, subDays, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Vehicle } from '../types'
import { docExpiryStatus, daysUntil } from '../types'
import { useEscKey } from '../hooks/useEscKey'
import { CATEGORIAS, type FrotaManutencao } from './CustosTab'
import VehicleModal from './VehicleModal'
import {
  carregarVidaVeiculo, kmNaData, chaveMes, GRUPOS, GRUPO_LABEL,
  type DadosVeiculo, type Gasto, type Grupo, type Mes, type OcorrenciaVeiculo, type PontoKm,
} from './veiculoVidaDados'

// ─── Formatação ───────────────────────────────────────────────────────

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const brl0 = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlCurto = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl0(v)
const kmFmt = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const kmCurto = (v: number) => Math.abs(v) >= 10000 ? `${Math.round(v / 1000).toLocaleString('pt-BR')} mil` : Math.round(v).toLocaleString('pt-BR')
const dataFmt = (d: string) => format(parseISO(d), 'dd/MM/yy')
const mesCurto = (chave: string) => format(parseISO(`${chave}-01`), 'MMM/yy', { locale: ptBR })
const mesLongo = (chave: string) => {
  const s = format(parseISO(`${chave}-01`), "MMMM 'de' yyyy", { locale: ptBR })
  return s[0].toUpperCase() + s.slice(1)
}
const ts = (d: string) => parseISO(d).getTime()

// Paleta validada (claro e escuro) para as 4 categorias de gasto; a ordem é fixa.
const COR: Record<Grupo, { fill: string; bg: string }> = {
  combustivel: { fill: 'fill-[#2a78d6] dark:fill-[#3987e5]', bg: 'bg-[#2a78d6] dark:bg-[#3987e5]' },
  manutencao:  { fill: 'fill-[#eb6834] dark:fill-[#d95926]', bg: 'bg-[#eb6834] dark:bg-[#d95926]' },
  fixos:       { fill: 'fill-[#1baf7a] dark:fill-[#199e70]', bg: 'bg-[#1baf7a] dark:bg-[#199e70]' },
  outros:      { fill: 'fill-[#eda100] dark:fill-[#c98500]', bg: 'bg-[#eda100] dark:bg-[#c98500]' },
}
const GRID = 'stroke-slate-200 dark:stroke-slate-700'
const EIXO_TXT = 'fill-slate-400 dark:fill-slate-500 text-[10px]'
const ANEL = 'stroke-white dark:stroke-slate-800'

type Periodo = '3m' | '6m' | '12m' | 'tudo'
const PERIODOS: { id: Periodo; label: string; meses: number | null }[] = [
  { id: '3m', label: '3 meses', meses: 3 },
  { id: '6m', label: '6 meses', meses: 6 },
  { id: '12m', label: '12 meses', meses: 12 },
  { id: 'tudo', label: 'Tudo', meses: null },
]

// ─── Utilitários de gráfico ───────────────────────────────────────────

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) max = min + 1
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(6))
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

function topoArredondado(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, h, w / 2))
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

function Tooltip({ x, y, largura, children }: { x: number; y: number; largura: number; children: ReactNode }) {
  const aEsquerda = x > largura * 0.6
  return (
    <div className="pointer-events-none absolute z-10 min-w-[190px] max-w-[260px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: Math.max(0, y - 8), transform: `translate(${aEsquerda ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      {children}
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-900/40 px-6 text-center text-sm text-slate-400">{children}</div>
}

function Secao({ titulo, subtitulo, direita, children }: { titulo: string; subtitulo?: ReactNode; direita?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{titulo}</h3>
          {subtitulo && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>}
        </div>
        {direita}
      </div>
      {children}
    </section>
  )
}

// ─── Gráfico: hodômetro + manutenções ─────────────────────────────────

interface Marco { data: string; km: number; gastos: Gasto[] }

function KmChart({ pontos, marcos }: { pontos: PontoKm[]; marcos: Marco[] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<{ i: number; tipo: 'ponto' | 'marco' } | null>(null)
  const H = 240, M = { t: 14, r: 14, b: 26, l: 48 }

  const g = useMemo(() => {
    if (pontos.length < 2 || w === 0) return null
    const t0 = ts(pontos[0].data), t1 = Math.max(ts(pontos[pontos.length - 1].data), t0 + 864e5)
    const kms = pontos.map(p => p.km)
    const ticks = niceTicks(Math.min(...kms), Math.max(...kms), 4)
    const yMin = ticks[0], yMax = ticks[ticks.length - 1]
    const pw = w - M.l - M.r, ph = H - M.t - M.b
    const x = (d: string) => M.l + ((ts(d) - t0) / (t1 - t0)) * pw
    const y = (km: number) => M.t + (1 - (km - yMin) / (yMax - yMin || 1)) * ph
    const meses: string[] = []
    for (let d = startOfMonth(addMonths(new Date(t0), 1)); d.getTime() <= t1; d = addMonths(d, 1)) meses.push(format(d, 'yyyy-MM-dd'))
    const passo = Math.max(1, Math.ceil(meses.length / Math.max(1, Math.floor(pw / 64))))
    return { x, y, ticks, meses: meses.filter((_, i) => i % passo === 0) }
  }, [pontos, w])

  if (pontos.length < 2) return <div ref={ref}><Vazio>Poucas leituras de km neste período para desenhar a evolução.</Vazio></div>

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    if (!g) return
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    let melhor: { i: number; tipo: 'ponto' | 'marco'; d: number } | null = null
    marcos.forEach((m, i) => { const d = Math.abs(g.x(m.data) - px); if (d <= 12 && (!melhor || d < melhor.d)) melhor = { i, tipo: 'marco', d } })
    if (!melhor) pontos.forEach((p, i) => { const d = Math.abs(g.x(p.data) - px); if (!melhor || d < melhor.d) melhor = { i, tipo: 'ponto', d } })
    const m = melhor as { i: number; tipo: 'ponto' | 'marco' } | null
    setHover(m ? { i: m.i, tipo: m.tipo } : null)
  }

  const linha = g ? pontos.map((p, i) => `${i ? 'L' : 'M'}${g.x(p.data).toFixed(1)},${g.y(p.km).toFixed(1)}`).join('') : ''
  const area = g ? `${linha}L${g.x(pontos[pontos.length - 1].data)},${H - M.b}L${g.x(pontos[0].data)},${H - M.b}Z` : ''
  const hp = hover && g ? (hover.tipo === 'marco' ? marcos[hover.i] : pontos[hover.i]) : null
  const hx = hp && g ? g.x(hp.data) : 0
  const hy = hp && g ? g.y(hp.km) : 0

  return (
    <div ref={ref} className="relative">
      {g && (
        <svg width={w} height={H} className="block select-none" style={{ touchAction: 'pan-y' }}
          onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHover(null)}>
          {g.ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={g.y(t)} y2={g.y(t)} className={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={g.y(t)} dy="0.32em" textAnchor="end" className={EIXO_TXT}>{kmCurto(t)}</text>
            </g>
          ))}
          {g.meses.map(d => (
            <text key={d} x={g.x(d)} y={H - 8} textAnchor="middle" className={EIXO_TXT}>{format(parseISO(d), 'MMM/yy', { locale: ptBR })}</text>
          ))}
          <path d={area} className="fill-[#2a78d6]/10 dark:fill-[#3987e5]/15" />
          <path d={linha} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />
          {hp && <line x1={hx} x2={hx} y1={M.t} y2={H - M.b} strokeWidth={1} className="stroke-slate-400 dark:stroke-slate-500" />}
          {marcos.map((m, i) => (
            <circle key={i} cx={g.x(m.data)} cy={g.y(m.km)} r={hover?.tipo === 'marco' && hover.i === i ? 7 : 5.5}
              strokeWidth={2} className={`${COR.manutencao.fill} ${ANEL}`} />
          ))}
          {hp && hover?.tipo === 'ponto' && <circle cx={hx} cy={hy} r={4.5} strokeWidth={2} className={`fill-[#2a78d6] dark:fill-[#3987e5] ${ANEL}`} />}
        </svg>
      )}
      {hp && g && (
        <Tooltip x={hx} y={hy} largura={w}>
          {hover!.tipo === 'marco' ? (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{dataFmt(hp.data)} · ~{kmFmt(hp.km)}</p>
              {(hp as Marco).gastos.map(gs => (
                <div key={gs.id} className="mt-1">
                  <p className="flex justify-between gap-3 text-slate-700 dark:text-slate-200">
                    <span>{CATEGORIAS[gs.categoria].emoji} {CATEGORIAS[gs.categoria].label}</span>
                    <span className="font-semibold tabular-nums">{brl(gs.valor)}</span>
                  </p>
                  {gs.descricao && <p className="text-slate-500 dark:text-slate-400">{gs.descricao}</p>}
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{dataFmt(hp.data)}</p>
              <p className="tabular-nums text-slate-700 dark:text-slate-200">{kmFmt(hp.km)}</p>
              {(hp as PontoKm).registrado !== hp.km && (
                <p className="text-slate-500 dark:text-slate-400">leitura digitada: {kmFmt((hp as PontoKm).registrado)}</p>
              )}
            </>
          )}
        </Tooltip>
      )}
    </div>
  )
}

// ─── Gráfico: gastos por mês (empilhado) ──────────────────────────────

function GastosMensaisChart({ meses, grupos }: { meses: Mes[]; grupos: Grupo[] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 220, M = { t: 18, r: 8, b: 26, l: 56 }
  const totais = meses.map(m => grupos.reduce((s, gr) => s + m.porGrupo[gr], 0))
  const maxTotal = Math.max(0, ...totais)

  if (!meses.length || maxTotal === 0) return <div ref={ref}><Vazio>Nenhum gasto lançado neste período.</Vazio></div>

  const ticks = niceTicks(0, maxTotal, 4)
  const yMax = ticks[ticks.length - 1]
  const pw = Math.max(0, w - M.l - M.r), ph = H - M.t - M.b
  const banda = pw / meses.length
  const bw = Math.min(40, banda * 0.62)
  const y = (v: number) => M.t + (1 - v / yMax) * ph
  const passo = Math.max(1, Math.ceil(meses.length / Math.max(1, Math.floor(pw / 52))))
  const iMax = totais.indexOf(maxTotal)

  return (
    <div ref={ref} className="relative">
      {w > 0 && (
        <svg width={w} height={H} className="block select-none" style={{ touchAction: 'pan-y' }} onPointerLeave={() => setHover(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className={EIXO_TXT}>{brlCurto(t)}</text>
            </g>
          ))}
          {meses.map((m, i) => {
            const cx = M.l + banda * i + banda / 2
            let base = H - M.b
            const visiveis = grupos.filter(gr => m.porGrupo[gr] > 0)
            return (
              <g key={m.chave} opacity={hover === null || hover === i ? 1 : 0.45}>
                {visiveis.map((gr, j) => {
                  const h = (m.porGrupo[gr] / yMax) * ph
                  const topo = base - h
                  const ultimo = j === visiveis.length - 1
                  const hDesenho = Math.max(0.5, ultimo ? h : h - 2)
                  const el = ultimo
                    ? <path key={gr} d={topoArredondado(cx - bw / 2, topo, bw, hDesenho, 4)} className={COR[gr].fill} />
                    : <rect key={gr} x={cx - bw / 2} y={topo + 2} width={bw} height={hDesenho} className={COR[gr].fill} />
                  base = topo
                  return el
                })}
                {i === iMax && (
                  <text x={cx} y={y(totais[i]) - 5} textAnchor="middle" className="fill-slate-600 dark:fill-slate-300 text-[10px] font-semibold">{brlCurto(totais[i])}</text>
                )}
                {i % passo === 0 && <text x={cx} y={H - 8} textAnchor="middle" className={EIXO_TXT}>{mesCurto(m.chave)}</text>}
                <rect x={M.l + banda * i} y={M.t} width={banda} height={ph} fill="transparent"
                  onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && w > 0 && (() => {
        const m = meses[hover]
        const total = totais[hover]
        return (
          <Tooltip x={M.l + banda * hover + banda / 2} y={y(total)} largura={w}>
            <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{mesLongo(m.chave)}</p>
            {grupos.map(gr => m.porGrupo[gr] > 0 && (
              <p key={gr} className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${COR[gr].bg}`} />{GRUPO_LABEL[gr]}</span>
                <span className="tabular-nums">{brl(m.porGrupo[gr])}</span>
              </p>
            ))}
            <p className="mt-1 flex justify-between gap-3 border-t border-slate-100 dark:border-slate-700 pt-1 font-semibold text-slate-800 dark:text-slate-100">
              <span>Total</span><span className="tabular-nums">{brl(total)}</span>
            </p>
            {m.km > 0 && <p className="text-slate-500 dark:text-slate-400">{kmFmt(m.km)} rodados · {brl(total / m.km)}/km</p>}
          </Tooltip>
        )
      })()}
    </div>
  )
}

// ─── Gráfico: custo de combustível por km ─────────────────────────────

const KM_MIN_MES = 50

function EficienciaChart({ meses }: { meses: Mes[] }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 200, M = { t: 16, r: 12, b: 26, l: 52 }
  const vals = meses.map(m => (m.km >= KM_MIN_MES && m.combustivelAtribuido > 0 ? m.combustivelAtribuido / m.km : null))
  const validos = vals.filter((v): v is number => v != null)

  if (validos.length === 0) {
    return <div ref={ref}><Vazio>Sem trechos com km e abastecimento suficientes para calcular o custo por km.</Vazio></div>
  }

  const somaComb = meses.reduce((s, m, i) => s + (vals[i] != null ? m.combustivelAtribuido : 0), 0)
  const somaKm = meses.reduce((s, m, i) => s + (vals[i] != null ? m.km : 0), 0)
  const media = somaComb / somaKm
  const ticks = niceTicks(0, Math.max(...validos) * 1.1, 4)
  const yMax = ticks[ticks.length - 1]
  const pw = Math.max(0, w - M.l - M.r), ph = H - M.t - M.b
  const banda = pw / meses.length
  const x = (i: number) => M.l + banda * i + banda / 2
  const y = (v: number) => M.t + (1 - v / yMax) * ph
  const passo = Math.max(1, Math.ceil(meses.length / Math.max(1, Math.floor(pw / 52))))
  let d = ''
  vals.forEach((v, i) => { if (v == null) return; d += `${vals[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}` })

  return (
    <div ref={ref}>
      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span className="h-px w-4 bg-slate-500 dark:bg-slate-400" />Média do período: <b className="tabular-nums">{brl(media)}/km</b>
      </p>
      <div className="relative">
      {w > 0 && (
        <svg width={w} height={H} className="block select-none" style={{ touchAction: 'pan-y' }} onPointerLeave={() => setHover(null)}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} className={GRID} strokeWidth={1} />
              <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className={EIXO_TXT}>{brl(t)}</text>
            </g>
          ))}
          <line x1={M.l} x2={w - M.r} y1={y(media)} y2={y(media)} strokeWidth={1} className="stroke-slate-500 dark:stroke-slate-400" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} strokeWidth={1} className="stroke-slate-400 dark:stroke-slate-500" />}
          <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />
          {vals.map((v, i) => v != null && (
            <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5.5 : 4} strokeWidth={2} className={`fill-[#2a78d6] dark:fill-[#3987e5] ${ANEL}`} />
          ))}
          {meses.map((m, i) => (
            <g key={m.chave}>
              {i % passo === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className={EIXO_TXT}>{mesCurto(m.chave)}</text>}
              <rect x={M.l + banda * i} y={M.t} width={banda} height={ph} fill="transparent"
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            </g>
          ))}
        </svg>
      )}
      {hover !== null && w > 0 && (() => {
        const m = meses[hover]
        const v = vals[hover]
        return (
          <Tooltip x={x(hover)} y={v != null ? y(v) : M.t + ph / 2} largura={w}>
            <p className="mb-1 font-semibold text-slate-800 dark:text-slate-100">{mesLongo(m.chave)}</p>
            {v != null ? (
              <>
                <p className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(v)}/km</p>
                <p className="text-slate-500 dark:text-slate-400">{brl(m.combustivelAtribuido)} em {kmFmt(m.km)}</p>
                <p className="text-slate-500 dark:text-slate-400">{v > media ? `${Math.round((v / media - 1) * 100)}% acima` : `${Math.round((1 - v / media) * 100)}% abaixo`} da média</p>
                {m.litrosCompletos && m.litrosAtribuidos > 0 && (
                  <p className="text-slate-500 dark:text-slate-400">{(m.km / m.litrosAtribuidos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km/l</p>
                )}
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">Km insuficiente para calcular.</p>
            )}
          </Tooltip>
        )
      })()}
      </div>
    </div>
  )
}

// ─── Leitura rápida (insights) ────────────────────────────────────────

type Tom = 'bom' | 'atencao' | 'alerta' | 'info'
interface Insight { tom: Tom; texto: ReactNode }

const TOM: Record<Tom, { icon: typeof Info; cls: string; label: string }> = {
  bom:     { icon: CheckCircle2,  cls: 'text-green-600 dark:text-green-400', label: 'Bom' },
  atencao: { icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', label: 'Atenção' },
  alerta:  { icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400',     label: 'Alerta' },
  info:    { icon: Info,          cls: 'text-slate-500 dark:text-slate-400', label: 'Info' },
}

function gerarInsights(vehicle: Vehicle, dados: DadosVeiculo, gastosPeriodo: Gasto[], ocorrenciasPeriodo: OcorrenciaVeiculo[]): Insight[] {
  const out: Insight[] = []
  const { meses, pontos, kmAtual } = dados

  const custoKm = (ms: Mes[]) => {
    const km = ms.reduce((s, m) => s + m.km, 0)
    const c = ms.reduce((s, m) => s + m.combustivelAtribuido, 0)
    return km >= 300 && c > 0 ? c / km : null
  }
  const ult = custoKm(meses.slice(-3)), ant = custoKm(meses.slice(-6, -3))
  if (ult != null && ant != null) {
    const var_ = ult / ant - 1
    const txt = <>Combustível por km {var_ >= 0 ? 'subiu' : 'caiu'} <b>{Math.abs(Math.round(var_ * 100))}%</b> nos últimos 3 meses ({brl(ant)} → {brl(ult)}/km).</>
    out.push({ tom: var_ > 0.1 ? 'atencao' : var_ < -0.1 ? 'bom' : 'info', texto: txt })
  }

  if (pontos.length >= 2) {
    const ini = kmNaData(pontos, format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    const fim = pontos[pontos.length - 1]
    if (ini != null && pontos[0].data <= format(subDays(new Date(), 30), 'yyyy-MM-dd') && fim.km > ini) {
      out.push({ tom: 'info', texto: <>Ritmo recente: <b>{Math.round((fim.km - ini) / 30).toLocaleString('pt-BR')} km/dia</b> (≈ {kmFmt(fim.km - ini)} nos últimos 30 dias).</> })
    }
  }

  const abertas = dados.ocorrencias.filter(o => o.status === 'aberta')
  if (abertas.length) {
    const graves = abertas.filter(o => o.gravidade === 'alta').length
    out.push({ tom: graves ? 'alerta' : 'atencao', texto: <><b>{abertas.length} ocorrência{abertas.length > 1 ? 's' : ''} em aberto</b> neste veículo{graves ? <> ({graves} de gravidade alta)</> : ''}; a mais antiga é de {dataFmt(abertas[0].data)}.</> })
  }
  const prejOco = ocorrenciasPeriodo.reduce((t, o) => t + (o.prejuizo ?? 0), 0)
  if (prejOco > 0) {
    out.push({ tom: 'atencao', texto: <>Ocorrências do período causaram <b>{brl(prejOco)}</b> de prejuízo informado.</> })
  }

  const limiteOleo = vehicle.tipo === 'Moto' ? 3000 : 10000
  const oleos = dados.gastos.filter(g => g.categoria === 'troca_oleo')
  const ultimoOleo = oleos[oleos.length - 1]
  if (ultimoOleo && kmAtual != null) {
    const kmOleo = kmNaData(pontos, ultimoOleo.data)
    const desde = kmOleo != null ? kmAtual - kmOleo : null
    const diasDesde = differenceInDays(new Date(), parseISO(ultimoOleo.data))
    if (desde != null) {
      out.push({
        tom: desde > limiteOleo ? 'alerta' : desde > limiteOleo * 0.8 ? 'atencao' : 'bom',
        texto: <>Última troca de óleo em {dataFmt(ultimoOleo.data)}: há <b>~{kmFmt(desde)}</b> e {diasDesde} dias{desde > limiteOleo ? ` — passou da referência de ${kmFmt(limiteOleo)}` : ''}.</>,
      })
    }
  } else if (!ultimoOleo && dados.gastos.length > 0) {
    out.push({ tom: 'atencao', texto: <>Nenhuma troca de óleo registrada desde {dataFmt(dados.gastos[0].data)}.</> })
  }

  const total = gastosPeriodo.reduce((s, g) => s + g.valor, 0)
  const fixos = gastosPeriodo.filter(g => g.grupo === 'fixos').reduce((s, g) => s + g.valor, 0)
  if (total > 0 && fixos / total >= 0.4) {
    out.push({ tom: 'info', texto: <>Custos fixos (prestação, rastreamento, seguro, IPVA) são <b>{Math.round((fixos / total) * 100)}%</b> do gasto do período.</> })
  }

  const manut = gastosPeriodo.filter(g => g.grupo === 'manutencao').sort((a, b) => b.valor - a.valor)[0]
  if (manut) {
    out.push({ tom: 'info', texto: <>Maior manutenção do período: <b>{CATEGORIAS[manut.categoria].label}</b> de {brl(manut.valor)} em {dataFmt(manut.data)}.</> })
  }

  const docs: [string | null, string][] = [[vehicle.venc_seguro, 'Seguro'], [vehicle.venc_ipva, 'IPVA'], [(vehicle as any).crlv_vencimento ?? null, 'CRLV']]
  for (const [d, label] of docs) {
    const st = docExpiryStatus(d)
    if (st && st !== 'ok') {
      const n = daysUntil(d) ?? 0
      out.push({ tom: st === 'expired' ? 'alerta' : 'atencao', texto: <>{label} {n < 0 ? <>vencido há <b>{Math.abs(n)} dias</b></> : <>vence em <b>{n} dias</b></>} ({dataFmt(d!)}).</> })
    }
  }

  if (dados.saltos.length > 0) {
    out.push({ tom: 'atencao', texto: <><b>{dados.saltos.length} salto{dados.saltos.length > 1 ? 's' : ''} de km</b> sem explicação nas leituras; esses trechos ficam fora das contas de km (veja "Qualidade dos dados").</> })
  }
  if (!out.length) out.push({ tom: 'info', texto: 'Ainda não há dados suficientes para gerar observações.' })
  return out
}

// ─── Manutenção programada ────────────────────────────────────────────

function statusManut(m: FrotaManutencao, kmAtual: number | null): 'ok' | 'warning' | 'danger' | 'overdue' {
  const ordem = { ok: 0, warning: 1, danger: 2, overdue: 3 } as const
  let porKm: keyof typeof ordem = 'ok', porData: keyof typeof ordem = 'ok'
  if (m.proxima_km != null && kmAtual != null) {
    const rest = m.proxima_km - kmAtual
    porKm = rest < 0 ? 'overdue' : rest < 500 ? 'danger' : rest < 2000 ? 'warning' : 'ok'
  }
  if (m.proxima_data) {
    const d = differenceInDays(parseISO(m.proxima_data), new Date())
    porData = d < 0 ? 'overdue' : d < 7 ? 'danger' : d < 30 ? 'warning' : 'ok'
  }
  return ordem[porKm] >= ordem[porData] ? porKm : porData
}
const MANUT_STYLE = {
  ok:      'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  danger:  'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
  overdue: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
}
const MANUT_LABEL = { ok: 'Em dia', warning: 'Atenção', danger: 'Urgente', overdue: 'Vencida' }

// ─── Linha do tempo ───────────────────────────────────────────────────

type FiltroTL = 'todos' | Grupo | 'ocorrencias'

function LinhaDoTempo({ meses, gastos, ocorrencias, corte }: { meses: Mes[]; gastos: Gasto[]; ocorrencias: OcorrenciaVeiculo[]; corte: string | null }) {
  const [filtro, setFiltro] = useState<FiltroTL>('todos')
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const porMes = useMemo(() => {
    const map = new Map<string, Gasto[]>()
    for (const g of gastos) {
      const k = chaveMes(g.data)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(g)
    }
    return map
  }, [gastos])
  const ocoPorMes = useMemo(() => {
    const map = new Map<string, OcorrenciaVeiculo[]>()
    for (const o of ocorrencias) {
      const k = chaveMes(o.data)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(o)
    }
    return map
  }, [ocorrencias])
  const lista = [...meses].reverse().filter(m => (porMes.get(m.chave)?.length ?? 0) > 0 || (ocoPorMes.get(m.chave)?.length ?? 0) > 0 || m.km > 0)

  const toggle = (k: string) => setAbertos(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['todos', ...GRUPOS, 'ocorrencias'] as FiltroTL[]).map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${filtro === f
              ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}>
            {f !== 'todos' && f !== 'ocorrencias' && <span className={`h-2 w-2 rounded-sm ${COR[f].bg}`} />}
            {f === 'ocorrencias' && <span className="h-2 w-2 rounded-sm bg-red-500" />}
            {f === 'todos' ? 'Tudo' : f === 'ocorrencias' ? 'Ocorrências' : GRUPO_LABEL[f]}
          </button>
        ))}
      </div>
      {lista.length === 0 && <Vazio>Nada registrado neste período.</Vazio>}
      <ol className="relative space-y-5 border-l-2 border-slate-200 dark:border-slate-700 pl-5 ml-2">
        {lista.map(m => {
          const doMes = filtro === 'ocorrencias' ? [] : (porMes.get(m.chave) ?? []).filter(g => filtro === 'todos' || g.grupo === filtro)
          const ocoMes = (filtro === 'todos' || filtro === 'ocorrencias' ? ocoPorMes.get(m.chave) ?? [] : []).slice().reverse()
          const comb = doMes.filter(g => g.grupo === 'combustivel')
          const outros = doMes.filter(g => g.grupo !== 'combustivel').sort((a, b) => b.data.localeCompare(a.data))
          if (!doMes.length && !ocoMes.length && filtro !== 'todos') return null
          const aberto = abertos.has(m.chave)
          const somaComb = comb.reduce((s, g) => s + g.valor, 0)
          return (
            <li key={m.chave} className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-800 bg-slate-400 dark:bg-slate-500" />
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{mesLongo(m.chave)}</h4>
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {brl(m.total)}{m.km > 0 && <> · {kmFmt(m.km)} rodados · {brl(m.total / m.km)}/km</>}
                </span>
              </div>
              <div className="space-y-1.5">
                {ocoMes.map(o => <ItemOcorrencia key={o.id} o={o} />)}
                {outros.map(g => <ItemGasto key={g.id} g={g} />)}
                {comb.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700">
                    <button onClick={() => toggle(m.chave)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <span className={`h-2 w-2 shrink-0 rounded-sm ${COR.combustivel.bg}`} />
                      <Fuel size={14} className="shrink-0 text-slate-400" />
                      <span className="flex-1 text-slate-700 dark:text-slate-200">
                        {comb.length} abastecimento{comb.length > 1 ? 's' : ''}
                        <span className="text-xs text-slate-500 dark:text-slate-400"> · média {brl(somaComb / comb.length)}</span>
                        {m.km > 0 && m.combustivelAtribuido > 0 && m.km >= KM_MIN_MES && (
                          <span className="text-xs text-slate-500 dark:text-slate-400"> · {brl(m.combustivelAtribuido / m.km)}/km</span>
                        )}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(somaComb)}</span>
                      {aberto ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                    </button>
                    {aberto && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/60 border-t border-slate-100 dark:border-slate-700">
                        {[...comb].reverse().map(g => (
                          <div key={g.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                            <span className="w-14 tabular-nums text-slate-500 dark:text-slate-400">{dataFmt(g.data)}</span>
                            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">
                              {g.descricao || 'Abastecimento'}{g.motorista ? ` · ${g.motorista}` : ''}
                            </span>
                            {g.km != null && <span className="tabular-nums text-slate-400">{kmFmt(g.km)}</span>}
                            {g.litros != null && <span className="tabular-nums text-slate-400">{g.litros.toLocaleString('pt-BR')} L</span>}
                            {g.origem === 'financeiro' && <TagFinanceiro />}
                            <span className="w-20 text-right font-medium tabular-nums text-slate-700 dark:text-slate-200">{brl(g.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!doMes.length && !ocoMes.length && <p className="text-xs text-slate-400">Só leituras de km neste mês.</p>}
              </div>
            </li>
          )
        })}
      </ol>
      {corte && <p className="mt-4 text-xs text-slate-400">Desde {dataFmt(corte)} os gastos vêm do app Financeiro (etiqueta "Financeiro").</p>}
    </div>
  )
}

function TagFinanceiro() {
  return <span className="rounded bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:text-violet-300">Financeiro</span>
}

const GRAVIDADE_OCO = {
  alta:  { rotulo: 'Alta',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  media: { rotulo: 'Média', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  baixa: { rotulo: 'Baixa', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}

function ItemOcorrencia({ o }: { o: OcorrenciaVeiculo }) {
  const grav = GRAVIDADE_OCO[o.gravidade] ?? GRAVIDADE_OCO.media
  const aberta = o.status === 'aberta'
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-900/10 px-3 py-2 text-sm">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-sm bg-red-500" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-800 dark:text-slate-100">
          <span className="font-semibold">{o.emoji ?? '⚠️'} Ocorrência{o.tipo ? ` · ${o.tipo}` : ''}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${grav.cls}`}>{grav.rotulo}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${aberta ? 'bg-red-600 text-white' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>{aberta ? 'Aberta' : 'Resolvida'}</span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {dataFmt(o.data)}{o.motorista ? ` · 👤 ${o.motorista}` : ''}{o.cliente ? ` · ${o.cliente}` : ''}
        </p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{o.descricao}</p>
        {o.resolucao && <p className="mt-0.5 text-xs italic text-slate-500 dark:text-slate-400">Resolução: {o.resolucao}</p>}
      </div>
      {o.prejuizo != null && o.prejuizo > 0 && <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{brl(o.prejuizo)}</span>}
    </div>
  )
}

function ItemGasto({ g }: { g: Gasto }) {
  const cat = CATEGORIAS[g.categoria]
  const destaque = g.grupo === 'manutencao'
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${destaque
      ? 'border border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-900/10'
      : 'border border-slate-200 dark:border-slate-700'}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${COR[g.grupo].bg}`} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-slate-800 dark:text-slate-100">
          <span className={destaque ? 'font-semibold' : ''}>{cat.emoji} {cat.label}</span>
          {g.origem === 'financeiro' && <TagFinanceiro />}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {dataFmt(g.data)}{g.km != null ? ` · ${kmFmt(g.km)}` : ''}{g.descricao ? ` · ${g.descricao}` : ''}
        </p>
        {g.observacoes && <p className="mt-0.5 text-xs italic text-slate-400">{g.observacoes}</p>}
      </div>
      <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(g.valor)}</span>
    </div>
  )
}

// ─── Painel ───────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, valor, sub }: { icon: typeof Gauge; label: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"><Icon size={13} />{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

export default function VeiculoVidaPanel({ vehicle, onClose, onSaved }: {
  vehicle: Vehicle
  onClose: () => void
  onSaved: () => void
}) {
  const [editando, setEditando] = useState(false)
  useEscKey(() => { if (!editando) onClose() })
  const [dados, setDados] = useState<DadosVeiculo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('tudo')
  const [comFixos, setComFixos] = useState(true)
  const [qualidadeAberta, setQualidadeAberta] = useState(false)

  useEffect(() => {
    let vivo = true
    setDados(null); setErro(null)
    carregarVidaVeiculo(vehicle.id, vehicle.km_atual)
      .then(d => { if (vivo) setDados(d) })
      .catch(e => { if (vivo) setErro(e.message ?? 'Erro ao carregar') })
    return () => { vivo = false }
  }, [vehicle.id, vehicle.km_atual])

  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  const inicio = useMemo(() => {
    const p = PERIODOS.find(x => x.id === periodo)!
    return p.meses ? format(startOfMonth(addMonths(new Date(), -(p.meses - 1))), 'yyyy-MM-dd') : '0000-00-00'
  }, [periodo])

  const v = useMemo(() => {
    if (!dados) return null
    const meses = dados.meses.filter(m => `${m.chave}-01` >= inicio)
    const gastos = dados.gastos.filter(g => g.data >= inicio)
    const ocorrencias = dados.ocorrencias.filter(o => o.data >= inicio)
    const pontos = dados.pontos.filter(p => p.data >= inicio)
    const marcosMap = new Map<string, Gasto[]>()
    for (const g of gastos) {
      if (g.grupo !== 'manutencao') continue
      if (!marcosMap.has(g.data)) marcosMap.set(g.data, [])
      marcosMap.get(g.data)!.push(g)
    }
    const marcos: Marco[] = [...marcosMap.entries()]
      .map(([data, gs]) => ({ data, gastos: gs, km: kmNaData(dados.pontos, data) ?? 0 }))
      .filter(m => pontos.length >= 2 && m.data >= pontos[0].data && m.data <= pontos[pontos.length - 1].data)
    const porGrupo = { combustivel: 0, manutencao: 0, fixos: 0, outros: 0 } as Record<Grupo, number>
    for (const g of gastos) porGrupo[g.grupo] += g.valor
    const total = gastos.reduce((s, g) => s + g.valor, 0)
    const km = meses.reduce((s, m) => s + m.km, 0)
    const combAtr = meses.reduce((s, m) => s + (m.km >= KM_MIN_MES ? m.combustivelAtribuido : 0), 0)
    const kmComb = meses.reduce((s, m) => s + (m.km >= KM_MIN_MES && m.combustivelAtribuido > 0 ? m.km : 0), 0)
    const litrosOk = meses.every(m => m.combustivelAtribuido === 0 || m.litrosCompletos) && meses.some(m => m.litrosAtribuidos > 0)
    const litros = meses.reduce((s, m) => s + m.litrosAtribuidos, 0)
    const manut = gastos.filter(g => g.grupo === 'manutencao')
    const porCategoria = new Map<string, { valor: number; n: number; grupo: Grupo }>()
    for (const g of gastos) {
      const e = porCategoria.get(g.categoria) ?? { valor: 0, n: 0, grupo: g.grupo }
      e.valor += g.valor; e.n++
      porCategoria.set(g.categoria, e)
    }
    const nMeses = Math.max(1, meses.length)
    const diasPeriodo = pontos.length >= 2 ? Math.max(1, differenceInDays(parseISO(pontos[pontos.length - 1].data), parseISO(pontos[0].data))) : null
    return {
      meses, gastos, ocorrencias, pontos, marcos, porGrupo, total, km, combAtr, kmComb, litrosOk, litros, manut, nMeses, diasPeriodo,
      categorias: [...porCategoria.entries()].sort((a, b) => b[1].valor - a[1].valor),
      insights: gerarInsights(vehicle, dados, gastos, ocorrencias),
    }
  }, [dados, inicio, vehicle])

  const statusOp = (vehicle as any).status_operacional ?? 'ativo'
  const grupos = comFixos ? GRUPOS : GRUPOS.filter(g => g !== 'fixos')

  // Portal no body: o layout tem ancestral que vira referência do position:fixed.
  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#f8fafc] dark:bg-slate-900" role="dialog" aria-modal="true" aria-label={`Vida do veículo ${vehicle.apelido}`}>
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <button onClick={onClose} className="btn-ghost p-2" aria-label="Voltar"><ArrowLeft size={18} /></button>
          <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 p-2"><Truck size={18} className="text-orange-600 dark:text-orange-400" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{vehicle.apelido}</h2>
              {vehicle.placa && <span className="rounded bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">{vehicle.placa}</span>}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusOp === 'ativo' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'}`}>
                {({ ativo: 'Ativo', manutencao: 'Em manutenção', parado: 'Parado', inativo: 'Inativo' } as Record<string, string>)[statusOp] ?? statusOp}
              </span>
            </div>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {[vehicle.marca_modelo, vehicle.ano, vehicle.combustivel, (vehicle.driver as any)?.nome && `👤 ${(vehicle.driver as any).nome}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={() => setEditando(true)} className="btn-secondary text-sm"><Pencil size={14} /> <span className="hidden sm:inline">Editar cadastro</span></button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-3">
          {PERIODOS.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${periodo === p.id
                ? 'bg-orange-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24">
        {erro && <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">{erro}</div>}
        {!dados && !erro && <div className="py-16 text-center text-slate-400">Carregando a vida do veículo…</div>}

        {dados && v && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Kpi icon={Gauge} label="Km atual" valor={dados.kmAtual != null ? kmFmt(dados.kmAtual) : '—'}
                sub={v.km > 0 ? <>+{kmFmt(v.km)} no período{v.diasPeriodo ? ` · ${Math.round(v.km / v.diasPeriodo)} km/dia` : ''}</> : 'Sem km rodado calculável'} />
              <Kpi icon={Wallet} label="Gasto no período" valor={brl0(v.total)} sub={<>{brl0(v.total / v.nMeses)}/mês em média</>} />
              <Kpi icon={Fuel} label="Combustível por km" valor={v.kmComb > 0 ? `${brl(v.combAtr / v.kmComb)}` : '—'}
                sub={v.litrosOk ? `${(v.kmComb / v.litros).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km/l` : `${brl0(v.porGrupo.combustivel)} em combustível`} />
              <Kpi icon={Wrench} label="Manutenção" valor={brl0(v.porGrupo.manutencao)}
                sub={v.manut.length ? `${v.manut.length} serviço${v.manut.length > 1 ? 's' : ''} · último ${dataFmt(v.manut[v.manut.length - 1].data)}` : 'Nenhum serviço no período'} />
              <Kpi icon={ClipboardList} label="Ocorrências" valor={v.ocorrencias.length}
                sub={v.ocorrencias.length
                  ? <>{v.ocorrencias.filter(o => o.status === 'aberta').length} em aberto{v.ocorrencias.some(o => (o.prejuizo ?? 0) > 0) ? ` · ${brl0(v.ocorrencias.reduce((t, o) => t + (o.prejuizo ?? 0), 0))} de prejuízo` : ''}</>
                  : 'Nenhuma no período'} />
              <Kpi icon={Receipt} label="Custo total por km" valor={v.km > 0 ? brl(v.total / v.km) : '—'}
                sub={v.km > 0 ? <>sem fixos: {brl((v.total - v.porGrupo.fixos) / v.km)}/km</> : undefined} />
            </div>

            {/* Leitura rápida */}
            <Secao titulo="Leitura rápida" subtitulo="O que os números deste veículo estão dizendo">
              <ul className="grid gap-2 md:grid-cols-2">
                {v.insights.map((ins, i) => {
                  const t = TOM[ins.tom]
                  return (
                    <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                      <t.icon size={15} className={`mt-0.5 shrink-0 ${t.cls}`} aria-label={t.label} />
                      <span>{ins.texto}</span>
                    </li>
                  )
                })}
              </ul>
            </Secao>

            {/* Km + manutenções */}
            <Secao titulo="Quilometragem e manutenções"
              subtitulo="Cada ponto laranja é uma manutenção: passe o mouse (ou toque) para ver o serviço e o valor."
              direita={
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#2a78d6] dark:bg-[#3987e5]" />Hodômetro</span>
                  <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${COR.manutencao.bg}`} />Manutenção</span>
                </div>
              }>
              <KmChart pontos={v.pontos} marcos={v.marcos} />
            </Secao>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Secao titulo="Gastos por mês" subtitulo="Para onde foi o dinheiro, mês a mês"
                direita={
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <input type="checkbox" checked={comFixos} onChange={e => setComFixos(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Incluir fixos
                  </label>
                }>
                <div className="mb-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
                  {grupos.map(g => <span key={g} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${COR[g].bg}`} />{GRUPO_LABEL[g]}</span>)}
                </div>
                <GastosMensaisChart meses={v.meses} grupos={grupos} />
              </Secao>

              <Secao titulo="Combustível por km" subtitulo="Quanto custa rodar 1 km, mês a mês. Subiu sem motivo? Vale checar rota, motorista ou o carro.">
                <EficienciaChart meses={v.meses} />
              </Secao>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Onde vai o dinheiro (tabela) */}
              <Secao titulo="Onde vai o dinheiro" subtitulo="Por categoria, no período">
                {v.categorias.length === 0 ? <p className="text-sm text-slate-400">Sem gastos no período.</p> : (
                  <div className="space-y-2">
                    {v.categorias.map(([c, e]) => {
                      const cat = CATEGORIAS[c as keyof typeof CATEGORIAS]
                      return (
                        <div key={c}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="text-slate-700 dark:text-slate-200">{cat.emoji} {cat.label} <span className="text-xs text-slate-400">({e.n})</span></span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl0(e.valor)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                              <div className={`h-full rounded-full ${COR[e.grupo].bg}`} style={{ width: `${(e.valor / v.total) * 100}%` }} />
                            </div>
                            <span className="w-9 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{e.valor / v.total < 0.01 ? '<1' : Math.round((e.valor / v.total) * 100)}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Secao>

              <Secao titulo="Manutenção programada" subtitulo="Próximas trocas e revisões">
                {dados.manutencoes.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma programada. Cadastre em <b>Custos › Manutenções</b> para o sistema avisar quando estiver perto do km ou da data.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {dados.manutencoes.map(m => {
                      const st = statusManut(m, dados.kmAtual)
                      return (
                        <div key={m.id} className="flex items-start gap-2 text-sm">
                          <CalendarClock size={15} className="mt-0.5 shrink-0 text-slate-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-slate-800 dark:text-slate-100">{m.nome}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {m.proxima_km != null && <>em {kmFmt(m.proxima_km)}{dados.kmAtual != null && ` (${m.proxima_km - dados.kmAtual >= 0 ? 'faltam' : 'passou'} ${kmFmt(Math.abs(m.proxima_km - dados.kmAtual))})`}</>}
                              {m.proxima_km != null && m.proxima_data && ' · '}
                              {m.proxima_data && <>até {dataFmt(m.proxima_data)}</>}
                            </p>
                          </div>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${MANUT_STYLE[st]}`}>{MANUT_LABEL[st]}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Secao>

              <Secao titulo="Documentos">
                <div className="space-y-2 text-sm">
                  {([[vehicle.venc_seguro, 'Seguro', vehicle.seguradora], [vehicle.venc_ipva, 'IPVA', null], [(vehicle as any).crlv_vencimento ?? null, 'CRLV', null]] as [string | null, string, string | null][]).map(([d, label, extra]) => {
                    const st = docExpiryStatus(d)
                    const n = daysUntil(d)
                    const cls = !st ? 'text-slate-400' : st === 'ok' ? 'text-green-600 dark:text-green-400' : st === 'expired' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                    return (
                      <div key={label} className="flex items-center gap-2">
                        <FileText size={15} className="shrink-0 text-slate-400" />
                        <span className="flex-1 text-slate-700 dark:text-slate-200">{label}{extra ? <span className="text-xs text-slate-400"> · {extra}</span> : ''}</span>
                        <span className={`text-xs font-medium ${cls}`}>
                          {d ? <>{dataFmt(d)} · {n! < 0 ? `vencido há ${Math.abs(n!)}d` : `${n}d`}</> : 'sem data'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Secao>
            </div>

            {/* Linha do tempo */}
            <Secao titulo="Linha do tempo" subtitulo="Gastos, manutenções e ocorrências do veículo, do mais recente ao mais antigo">
              <LinhaDoTempo meses={v.meses} gastos={v.gastos} ocorrencias={v.ocorrencias} corte={dados.corte} />
            </Secao>

            {/* Qualidade dos dados */}
            {(dados.saltos.length > 0 || dados.descartadas.length > 0) && (
              <section className="card border border-amber-200 dark:border-amber-900/50 p-4">
                <button onClick={() => setQualidadeAberta(a => !a)} className="flex w-full items-center gap-2 text-left">
                  <Droplet size={15} className="text-amber-500" />
                  <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Qualidade dos dados: {dados.saltos.length} salto{dados.saltos.length !== 1 ? 's' : ''} de km e {dados.descartadas.length} leitura{dados.descartadas.length !== 1 ? 's' : ''} ignorada{dados.descartadas.length !== 1 ? 's' : ''}
                  </span>
                  {qualidadeAberta ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                </button>
                {qualidadeAberta && (
                  <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-300">
                    <p className="text-slate-500 dark:text-slate-400">
                      O gráfico de km é reconstruído a partir dos trechos coerentes entre leituras e ancorado no km mais recente.
                      Trechos com queda de km ou mais de 1.000 km/dia ficam fora das contas. Corrigir a leitura no lançamento resolve.
                      Saltos nos últimos dias costumam ser o hodômetro real sendo anotado pela primeira vez; nesse caso não há o que corrigir.
                    </p>
                    {dados.saltos.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold">Saltos sem explicação</p>
                        <ul className="space-y-0.5">
                          {dados.saltos.map((s, i) => (
                            <li key={i} className="tabular-nums">
                              {dataFmt(s.de.data)} {kmFmt(s.de.km)} → {dataFmt(s.para.data)} {kmFmt(s.para.km)}
                              <span className={s.diff < 0 ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}> ({s.diff > 0 ? '+' : ''}{s.diff.toLocaleString('pt-BR')} km em {s.dias} dia{s.dias > 1 ? 's' : ''})</span>
                              {s.para.fonte === 'cadastro' && <span className="text-slate-400"> · km do cadastro</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {dados.descartadas.length > 0 && (
                      <div>
                        <p className="mb-1 font-semibold">Leituras ignoradas</p>
                        <ul className="space-y-0.5">
                          {dados.descartadas.map((d, i) => (
                            <li key={i} className="tabular-nums">{dataFmt(d.leitura.data)} · {kmFmt(d.leitura.km)} <span className="text-slate-400">({d.motivo})</span></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {editando && <VehicleModal vehicle={vehicle} onClose={() => setEditando(false)} onSaved={onSaved} />}
    </div>,
    document.body,
  )
}
