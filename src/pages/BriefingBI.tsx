import { useEffect, useState } from 'react'
import { Sparkles, Copy, Clock, Check, AlertCircle, ChevronDown, BookOpen, Edit2, Save, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Briefing, BriefingResult } from '../types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

async function authToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ANON_KEY
}

interface IaConfig {
  key: string
  value: unknown
  label: string
  descricao: string | null
  tipo: string
  updated_at: string
}

export default function BriefingBI() {
  const { isAdmin } = useAuth()
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
      const token = await authToken()
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-briefing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
      })
      const json = await resp.json().catch(() => ({ error: 'Resposta inválida do servidor' }))
      if (!resp.ok || json.error) {
        setError(json.error ?? `Erro ${resp.status} ao gerar briefing`)
        return
      }
      setCurrent(json as BriefingResult)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">IA — Cantiner</h1>
          <p className="text-xs text-slate-400">Análise semanal e classificação de mensagens por inteligência artificial</p>
        </div>
        <button onClick={generate} disabled={generating} className="btn-primary">
          <Sparkles size={16} className={generating ? 'animate-pulse' : ''} />
          {generating ? 'Gerando...' : 'Gerar Briefing'}
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-semibold text-sm">
            <AlertCircle size={16} /> Erro ao gerar briefing
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          {error.includes('OPENAI_API_KEY') && (
            <div className="bg-red-100 dark:bg-red-900/30 rounded-lg p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p><strong>Configure a chave da API:</strong></p>
              <p>1. Acesse: supabase.com/dashboard → seu projeto → Edge Functions</p>
              <p>2. Clique em <strong>generate-briefing</strong> → aba <strong>Secrets</strong></p>
              <p>3. Adicione: <code className="bg-red-200 dark:bg-red-800 px-1 rounded">OPENAI_API_KEY</code> = sua chave OpenAI</p>
            </div>
          )}
        </div>
      )}

      {/* Gerando */}
      {generating && (
        <div className="card p-10 text-center">
          <Sparkles size={36} className="mx-auto mb-3 text-orange-400 animate-pulse" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">Analisando negócios e visitas...</p>
          <p className="text-xs text-slate-400 mt-1">O Cantiner está preparando sua análise</p>
        </div>
      )}

      {/* Briefing atual */}
      {current && !generating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
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
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
            <Clock size={14} /> Histórico de Briefings
          </h2>
          <div className="space-y-2">
            {briefings.slice(1).map(b => (
              <button
                key={b.id}
                onClick={() => { setCurrent(b.full_json); setCurrentMeta(b) }}
                className="card w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{b.week_ref ?? '-'}</p>
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

      {/* Base de Treinamento IA */}
      <TrainingBaseSection isAdmin={isAdmin} />
    </div>
  )
}

// ── Briefing card ──────────────────────────────────────────────────────────────

function BriefingCard({ icon, title, content, color }: {
  icon: string; title: string; content: string; color: string
}) {
  const bg: Record<string, string> = {
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
  }
  const tc: Record<string, string> = {
    red: 'text-red-700 dark:text-red-300', blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300', green: 'text-green-700 dark:text-green-300',
    purple: 'text-purple-700 dark:text-purple-300',
  }
  return (
    <div className={`rounded-xl border p-4 ${bg[color]}`}>
      <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${tc[color]}`}>{icon} {title}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">{content || '-'}</p>
    </div>
  )
}

// ── Training base section ──────────────────────────────────────────────────────

function TrainingBaseSection({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen]         = useState(false)
  const [configs, setConfigs]   = useState<IaConfig[]>([])
  const [loading, setLoading]   = useState(false)
  const [editKey, setEditKey]   = useState<string | null>(null)
  const [editVal, setEditVal]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  async function loadConfigs() {
    setLoading(true)
    const { data } = await supabase.from('ia_config').select('*').order('key')
    setConfigs((data ?? []) as IaConfig[])
    setLoading(false)
  }

  useEffect(() => { if (open && configs.length === 0) loadConfigs() }, [open])

  function startEdit(cfg: IaConfig) {
    setEditKey(cfg.key)
    setEditVal(
      cfg.tipo === 'lista'
        ? (cfg.value as string[]).join('\n')
        : String(cfg.value)
    )
  }

  async function saveEdit(cfg: IaConfig) {
    setSaving(true)
    const newValue = cfg.tipo === 'lista'
      ? editVal.split('\n').map(s => s.trim()).filter(Boolean)
      : editVal
    await supabase.from('ia_config')
      .update({ value: newValue, updated_at: new Date().toISOString() })
      .eq('key', cfg.key)
    setSaving(false)
    setEditKey(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    await loadConfigs()
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <BookOpen size={14} className="text-purple-500" />
          Base de Treinamento IA
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Base de conhecimento usada pela IA para classificar mensagens do WhatsApp em tempo real.
            {isAdmin
              ? ' Como admin, você pode editar os itens abaixo — as alterações ficam salvas aqui para referência e contribuição.'
              : ' Apenas administradores podem editar.'}
          </p>

          {saved && (
            <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              <Check size={12} /> Salvo com sucesso.
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : configs.map(cfg => (
            <div key={cfg.key} className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-600">
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cfg.label}</p>
                  {cfg.descricao && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{cfg.descricao}</p>
                  )}
                </div>
                {isAdmin && editKey !== cfg.key && (
                  <button
                    onClick={() => startEdit(cfg)}
                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 transition-colors"
                  >
                    <Edit2 size={11} /> Editar
                  </button>
                )}
              </div>

              {/* Card body */}
              <div className="p-3">
                {editKey === cfg.key ? (
                  <div className="space-y-2">
                    <textarea
                      className="input w-full text-xs font-mono resize-y"
                      rows={cfg.tipo === 'texto' ? 12 : 10}
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                    />
                    {cfg.tipo === 'lista' && (
                      <p className="text-[10px] text-slate-400">Uma palavra ou frase por linha</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(cfg)}
                        disabled={saving}
                        className="btn-primary text-xs py-1.5 gap-1"
                      >
                        <Save size={11} /> {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => setEditKey(null)}
                        className="btn-secondary text-xs py-1.5 gap-1"
                      >
                        <X size={11} /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : cfg.tipo === 'lista' ? (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {(cfg.value as string[]).map((kw: string) => (
                      <span
                        key={kw}
                        className="text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-mono border border-purple-200 dark:border-purple-800"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                ) : (
                  <pre className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-52 overflow-y-auto">
                    {String(cfg.value)}
                  </pre>
                )}

                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-2">
                  Atualizado: {format(parseISO(cfg.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
