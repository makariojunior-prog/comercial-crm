import { useEffect, useState } from 'react'
import { Sparkles, Copy, Clock, Check, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { Briefing, BriefingResult } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export default function BriefingBI() {
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [current, setCurrent] = useState<BriefingResult | null>(null)
  const [currentMeta, setCurrentMeta] = useState<Briefing | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('crm_briefings')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(20)
    const list = (data ?? []) as Briefing[]
    setBriefings(list)
    if (list.length > 0 && list[0].full_json) {
      setCurrent(list[0].full_json)
      setCurrentMeta(list[0])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
        },
      })
      const json = await resp.json()
      if (!resp.ok || json.error) {
        setError(json.error ?? 'Erro ao gerar briefing')
        return
      }
      setCurrent(json as BriefingResult)
      await load()
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  function buildWAMessage(b: BriefingResult): string {
    const hoje = new Date().toLocaleDateString('pt-BR')
    return [
      `📊 *BRIEFING COMERCIAL — ${hoje}*`,
      `_Cantina em Casa & Lumar Alimentos_`,
      ``,
      `🚨 *ALERTAS*`,
      b.alertas_urgentes || '-',
      ``,
      `👣 *VISITAS*`,
      b.visitas_resumo || '-',
      ``,
      `📈 *PIPELINE*`,
      b.pipeline_resumo || '-',
      ``,
      `✅ *AÇÕES DA SEMANA*`,
      b.proximas_acoes || '-',
      ``,
      `🔍 *INSIGHT*`,
      b.insight_estrategico || '-',
      ``,
      `_🤖 Gerado pelo Cantiner_`,
    ].join('\n')
  }

  async function copy() {
    if (!current) return
    await navigator.clipboard.writeText(buildWAMessage(current))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Briefing IA — Cantiner</h1>
          <p className="text-xs text-slate-400">Análise semanal gerada por inteligência artificial com base em negócios e visitas</p>
        </div>
        <button onClick={generate} disabled={generating} className="btn-primary">
          <Sparkles size={16} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Gerando...' : 'Gerar Briefing'}
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
            <AlertCircle size={16} /> Erro ao gerar briefing
          </div>
          <p className="text-sm text-red-600">{error}</p>
          {error.includes('OPENAI_API_KEY') && (
            <div className="bg-red-100 rounded-lg p-3 text-xs text-red-700 space-y-1">
              <p><strong>Configure a chave da API:</strong></p>
              <p>1. Acesse: supabase.com/dashboard → seu projeto → Edge Functions</p>
              <p>2. Clique em <strong>generate-briefing</strong> → aba <strong>Secrets</strong></p>
              <p>3. Adicione: <code className="bg-red-200 px-1 rounded">OPENAI_API_KEY</code> = sua chave OpenAI</p>
            </div>
          )}
        </div>
      )}

      {/* Gerando */}
      {generating && (
        <div className="card p-10 text-center">
          <Sparkles size={36} className="mx-auto mb-3 text-orange-400 animate-pulse" />
          <p className="font-semibold text-slate-700">Analisando negócios e visitas...</p>
          <p className="text-xs text-slate-400 mt-1">O Cantiner está preparando sua análise</p>
        </div>
      )}

      {/* Briefing atual */}
      {current && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                {currentMeta?.week_ref ?? 'Último briefing'}
              </h2>
              {currentMeta && (
                <p className="text-xs text-slate-400">
                  {format(parseISO(currentMeta.generated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {currentMeta.deals_count != null && ` · ${currentMeta.deals_count} negócios · ${currentMeta.visits_count} visitas analisadas`}
                </p>
              )}
            </div>
            <button onClick={copy} className="btn-secondary text-xs py-1.5">
              {copied
                ? <><Check size={13} className="text-green-500" /> Copiado!</>
                : <><Copy size={13} /> Copiar para WhatsApp</>}
            </button>
          </div>

          <BriefingCard icon="🚨" title="Alertas Urgentes" content={current.alertas_urgentes} color="red" />
          <BriefingCard icon="👣" title="Visitas" content={current.visitas_resumo} color="blue" />
          <BriefingCard icon="📈" title="Pipeline" content={current.pipeline_resumo} color="amber" />
          <BriefingCard icon="✅" title="Próximas Ações" content={current.proximas_acoes} color="green" />
          <BriefingCard icon="🔍" title="Insight Estratégico" content={current.insight_estrategico} color="purple" />
        </div>
      )}

      {/* Histórico */}
      {briefings.length > 1 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
            <Clock size={14} /> Histórico de Briefings
          </h2>
          <div className="space-y-2">
            {briefings.slice(1).map(b => (
              <button
                key={b.id}
                onClick={() => { setCurrent(b.full_json); setCurrentMeta(b) }}
                className="card w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{b.week_ref ?? '-'}</p>
                  <p className="text-xs text-slate-400">
                    {format(parseISO(b.generated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {b.deals_count != null && ` · ${b.deals_count} negócios`}
                  </p>
                </div>
                <span className="text-xs text-orange-500 font-semibold">Ver →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !current && !generating && (
        <div className="card p-12 text-center text-slate-400">
          <Sparkles size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum briefing gerado ainda</p>
          <p className="text-xs mt-1 mb-4">Configure a chave ANTHROPIC_API_KEY no Supabase e clique em Gerar</p>
          <button onClick={generate} className="btn-primary mx-auto">
            <Sparkles size={14} /> Gerar Primeiro Briefing
          </button>
        </div>
      )}
    </div>
  )
}

function BriefingCard({ icon, title, content, color }: {
  icon: string; title: string; content: string; color: string
}) {
  const bg: Record<string, string> = {
    red: 'bg-red-50 border-red-200', blue: 'bg-blue-50 border-blue-200',
    amber: 'bg-amber-50 border-amber-200', green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  }
  const tc: Record<string, string> = {
    red: 'text-red-700', blue: 'text-blue-700', amber: 'text-amber-700',
    green: 'text-green-700', purple: 'text-purple-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${tc[color]}`}>{icon} {title}</p>
      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{content || '-'}</p>
    </div>
  )
}
