import { useEffect, useState } from 'react'
import { Store, PauseCircle, Clock, Loader2, Play, List, Trash2, CalendarClock, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { chamarIfoodMerchant, type IfoodAcao, type IfoodResposta } from '../lib/ifoodMerchant'

// Horário de teste pedido pela homologação: sábado 10h–19h e domingo em 3 intervalos.
const HORARIO_TESTE = [
  { dia: 'SATURDAY', inicio: '10:00', fim: '19:00' },
  { dia: 'SUNDAY', inicio: '09:00', fim: '12:00' },
  { dia: 'SUNDAY', inicio: '13:00', fim: '16:00' },
  { dia: 'SUNDAY', inicio: '17:00', fim: '23:00' },
]

const DURACOES = [15, 30, 60, 120]

const DIAS: [string, string][] = [
  ['MONDAY', 'Segunda'], ['TUESDAY', 'Terça'], ['WEDNESDAY', 'Quarta'], ['THURSDAY', 'Quinta'],
  ['FRIDAY', 'Sexta'], ['SATURDAY', 'Sábado'], ['SUNDAY', 'Domingo'],
]

// Endpoint do iFood que cada ação chama (mostrado no registro de chamadas).
const ENDPOINT: Record<IfoodAcao, string> = {
  merchants: 'GET /merchant/v1.0/merchants',
  detalhes: 'GET /merchant/v1.0/merchants/{id}',
  status: 'GET /merchant/v1.0/merchants/{id}/status',
  pausas: 'GET /merchant/v1.0/merchants/{id}/interruptions',
  pausar: 'POST /merchant/v1.0/merchants/{id}/interruptions',
  reabrir: 'DELETE /merchant/v1.0/merchants/{id}/interruptions/{id}',
  horarios: 'GET /merchant/v1.0/merchants/{id}/opening-hours',
  'definir-horarios': 'PUT /merchant/v1.0/merchants/{id}/opening-hours',
}

interface Chamada { quando: Date; rotulo: string; action: IfoodAcao; http: number; ok: boolean }
interface Pausa { id: string; description?: string; start?: string; end?: string }
interface Turno { dayOfWeek: string; start: string; duration: number }

const fmtDataHora = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' })
const fmtIso = (s?: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—')

function fimTurno(start: string, duracao: number) {
  const [h, m] = start.split(':').map(Number)
  const t = h * 60 + m + duracao
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/**
 * Painel do lojista para o módulo Merchant (homologação iFood): mostra loja, situação, pausas e
 * horários como tela de controle da loja, e registra cada chamada feita à API do iFood.
 * Cada botão chama a API de verdade.
 */
export default function IfoodMerchantConsole() {
  const [carregando, setCarregando] = useState<string | null>(null)
  const [resposta, setResposta] = useState<IfoodResposta | null>(null)
  const [minutos, setMinutos] = useState(30)
  const [motivo, setMotivo] = useState('Teste de pausa — homologação')
  const [agora, setAgora] = useState(new Date())
  const [chamadas, setChamadas] = useState<Chamada[]>([])
  const [loja, setLoja] = useState<{ nome?: string; id?: string } | null>(null)
  const [situacao, setSituacao] = useState<{ status: string; motivo: string | null } | null>(null)
  const [pausas, setPausas] = useState<Pausa[] | null>(null)
  const [turnos, setTurnos] = useState<Turno[] | null>(null)

  // Relógio visível na tela (a homologação pede data e hora no vídeo)
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function interpretar(action: IfoodAcao, r: IfoodResposta) {
    const res = r.resultado as any
    if (!r.ok || res == null) return
    if (action === 'merchants' && Array.isArray(res) && res[0]) setLoja({ id: res[0].id, nome: res[0].name })
    if (action === 'detalhes') setLoja({ id: res.id, nome: res.name ?? res.corporateName })
    if (action === 'status') setSituacao({ status: res.status, motivo: res.motivo ?? null })
    if (action === 'pausar' || action === 'reabrir') setSituacao(s => ({ status: res.status, motivo: s?.motivo ?? null }))
    if (action === 'pausas') setPausas(Array.isArray(res) ? res : [])
    if (action === 'reabrir') setPausas([])
    if (action === 'horarios') setTurnos(Array.isArray(res?.shifts) ? res.shifts : [])
    if (action === 'definir-horarios') setTurnos(null) // força nova consulta para validar
  }

  async function rodar(rotulo: string, action: IfoodAcao, params: Record<string, unknown> = {}) {
    setCarregando(rotulo)
    try {
      const r = await chamarIfoodMerchant(action, params)
      setResposta(r)
      setChamadas(c => [{ quando: new Date(), rotulo, action, http: r.status, ok: r.ok }, ...c].slice(0, 50))
      interpretar(action, r)
      if (r.ok) toast.success(`${rotulo}: ok`)
      else toast.error(`${rotulo}: ${r.erro ?? 'falhou'}`)
    } finally {
      setCarregando(null)
    }
  }

  const Botao = ({ rotulo, action, params, icon: Icon, perigo }: {
    rotulo: string; action: IfoodAcao; params?: Record<string, unknown>
    icon: typeof Store; perigo?: boolean
  }) => (
    <button
      onClick={() => rodar(rotulo, action, params)}
      disabled={carregando !== null}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${
        perigo
          ? 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
      }`}
    >
      {carregando === rotulo ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />} {rotulo}
    </button>
  )

  const badge = situacao && ({
    OPEN: { txt: 'Loja aberta', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    PAUSED: { txt: 'Loja em pausa', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    CLOSED: { txt: 'Loja fechada', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  } as Record<string, { txt: string; cls: string }>)[situacao.status]

  const card = 'p-4 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2.5'
  const titulo = 'text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2'

  return (
    <div className="space-y-4">
      {/* Cabeçalho: loja, situação e relógio */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-100 dark:border-slate-700/60">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{loja?.nome ?? 'Loja iFood (clique em "Listar loja vinculada")'}</p>
          {loja?.id && <p className="text-[11px] text-slate-400 font-mono">{loja.id}</p>}
        </div>
        <div className="flex items-center gap-3">
          {badge && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badge.cls}`} title={situacao?.motivo ?? undefined}>
              {badge.txt}
            </span>
          )}
          <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
            {fmtDataHora(agora)}
          </span>
        </div>
      </div>

      <div className={card}>
        <h5 className={titulo}><Store size={14} className="text-orange-500" /> Cenário 1 — Informações e disponibilidade</h5>
        <div className="flex flex-wrap gap-2">
          <Botao rotulo="Listar loja vinculada" action="merchants" icon={List} />
          <Botao rotulo="Detalhes da loja" action="detalhes" icon={Store} />
          <Botao rotulo="Aberta ou fechada?" action="status" icon={Play} />
        </div>
        {situacao?.motivo && <p className="text-[11px] text-slate-500 dark:text-slate-400">{situacao.motivo}</p>}
      </div>

      <div className={card}>
        <h5 className={titulo}><PauseCircle size={14} className="text-orange-500" /> Cenário 2 — Pausas (interrupções)</h5>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Duração</label>
            <select className="input !py-1.5 !text-xs" value={minutos} onChange={e => setMinutos(Number(e.target.value))}>
              {DURACOES.map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="label">Motivo</label>
            <input className="input !py-1.5 !text-xs" value={motivo} maxLength={100} onChange={e => setMotivo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao rotulo="Cadastrar pausa" action="pausar" params={{ minutos, motivo }} icon={PauseCircle} />
          <Botao rotulo="Listar pausas ativas" action="pausas" icon={List} />
          <Botao rotulo="Remover pausas" action="reabrir" icon={Trash2} perigo />
        </div>
        {pausas && (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-1 font-semibold">Motivo</th><th className="font-semibold">Início</th><th className="font-semibold">Fim</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {pausas.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-400">Nenhuma pausa ativa.</td></tr>}
              {pausas.map(p => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800">
                  <td className="py-1">{p.description || '—'}</td><td>{fmtIso(p.start)}</td><td>{fmtIso(p.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={card}>
        <h5 className={titulo}><Clock size={14} className="text-orange-500" /> Cenário 3 — Horários de funcionamento</h5>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Horário de teste: sábado 10h–19h e domingo 09h–12h / 13h–16h / 17h–23h. Substitui os horários da loja de teste.
        </p>
        <div className="flex flex-wrap gap-2">
          <Botao rotulo="Ver horários" action="horarios" icon={CalendarClock} />
          <button
            onClick={async () => {
              if (window.confirm('Substituir os horários de funcionamento da loja iFood pelo horário de teste?')) {
                await rodar('Aplicar horário de teste', 'definir-horarios', { turnos: HORARIO_TESTE })
                await rodar('Ver horários', 'horarios')
              }
            }}
            disabled={carregando !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            {carregando === 'Aplicar horário de teste' ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
            Aplicar horário de teste
          </button>
        </div>
        {turnos && (
          <table className="w-full text-xs">
            <tbody className="text-slate-700 dark:text-slate-200">
              {DIAS.map(([chave, nome]) => {
                const doDia = turnos.filter(t => t.dayOfWeek === chave).sort((a, b) => a.start.localeCompare(b.start))
                return (
                  <tr key={chave} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-1 font-semibold w-24">{nome}</td>
                    <td>
                      {doDia.length === 0
                        ? <span className="text-slate-400">Fechado</span>
                        : doDia.map(t => `${t.start.slice(0, 5)}–${fimTurno(t.start, t.duration)}`).join('  ·  ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Registro das chamadas feitas ao iFood nesta sessão */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <h5 className={titulo}><RefreshCw size={14} className="text-orange-500" /> Registro de chamadas ao iFood</h5>
          {chamadas.length > 0 && (
            <button onClick={() => setChamadas([])} className="text-[11px] text-slate-400 hover:text-slate-600">limpar</button>
          )}
        </div>
        <table className="w-full text-[11px] font-mono">
          <tbody className="text-slate-700 dark:text-slate-200">
            {chamadas.length === 0 && <tr><td className="py-1 text-slate-400">Nenhuma chamada ainda.</td></tr>}
            {chamadas.map((c, i) => (
              <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-1 pr-2 whitespace-nowrap">{fmtDataHora(c.quando)}</td>
                <td className="pr-2">{ENDPOINT[c.action]}</td>
                <td className={`text-right font-bold ${c.ok ? 'text-green-600' : 'text-red-500'}`}>HTTP {c.http}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 overflow-hidden">
        <summary className="px-3 py-1.5 text-[11px] font-semibold text-slate-300 cursor-pointer">
          Resposta bruta da API {resposta && <span className={resposta.ok ? 'text-green-400' : 'text-red-400'}>· {resposta.action} · HTTP {resposta.status}</span>}
        </summary>
        <pre className="p-3 text-[11px] leading-snug max-h-80 overflow-auto whitespace-pre-wrap break-words">
          {resposta
            ? JSON.stringify(resposta.ok ? resposta.resultado : { erro: resposta.erro, detalhe: resposta.detalhe }, null, 2)
            : 'Clique em uma das ações acima para chamar o iFood.'}
        </pre>
      </details>
    </div>
  )
}
