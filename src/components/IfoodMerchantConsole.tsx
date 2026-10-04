import { useState } from 'react'
import { Store, PauseCircle, Clock, Loader2, Play, List, Trash2, CalendarClock } from 'lucide-react'
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

/**
 * Console dos 3 cenários do módulo Merchant (homologação iFood): cada botão chama a API de
 * verdade e mostra a resposta bruta — serve para gravar o vídeo e para operar a loja.
 */
export default function IfoodMerchantConsole() {
  const [carregando, setCarregando] = useState<string | null>(null)
  const [resposta, setResposta] = useState<IfoodResposta | null>(null)
  const [minutos, setMinutos] = useState(30)
  const [motivo, setMotivo] = useState('Teste de pausa — homologação')

  async function rodar(rotulo: string, action: IfoodAcao, params: Record<string, unknown> = {}) {
    setCarregando(rotulo)
    try {
      const r = await chamarIfoodMerchant(action, params)
      setResposta(r)
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

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2.5">
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Store size={14} className="text-orange-500" /> Cenário 1 — Informações e disponibilidade
        </h5>
        <div className="flex flex-wrap gap-2">
          <Botao rotulo="Listar loja vinculada" action="merchants" icon={List} />
          <Botao rotulo="Detalhes da loja" action="detalhes" icon={Store} />
          <Botao rotulo="Aberta ou fechada?" action="status" icon={Play} />
        </div>
      </div>

      <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2.5">
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <PauseCircle size={14} className="text-orange-500" /> Cenário 2 — Pausas (interrupções)
        </h5>
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
      </div>

      <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2.5">
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Clock size={14} className="text-orange-500" /> Cenário 3 — Horários de funcionamento
        </h5>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Horário de teste: sábado 10h–19h e domingo 09h–12h / 13h–16h / 17h–23h. Substitui os horários da loja de teste.
        </p>
        <div className="flex flex-wrap gap-2">
          <Botao rotulo="Ver horários" action="horarios" icon={CalendarClock} />
          <button
            onClick={() => {
              if (window.confirm('Substituir os horários de funcionamento da loja iFood pelo horário de teste?')) {
                rodar('Aplicar horário de teste', 'definir-horarios', { turnos: HORARIO_TESTE })
              }
            }}
            disabled={carregando !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            {carregando === 'Aplicar horário de teste' ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
            Aplicar horário de teste
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 text-[11px]">
          <span className="font-semibold text-slate-300">Resposta da API</span>
          {resposta && (
            <span className={resposta.ok ? 'text-green-400' : 'text-red-400'}>
              {resposta.action} · HTTP {resposta.status}
            </span>
          )}
        </div>
        <pre className="p-3 text-[11px] leading-snug max-h-80 overflow-auto whitespace-pre-wrap break-words">
          {resposta
            ? JSON.stringify(resposta.ok ? resposta.resultado : { erro: resposta.erro, detalhe: resposta.detalhe }, null, 2)
            : 'Clique em uma das ações acima para chamar o iFood.'}
        </pre>
      </div>
    </div>
  )
}
