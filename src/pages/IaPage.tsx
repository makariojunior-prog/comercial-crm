import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles, Lock, RefreshCw, Eye, EyeOff, ThumbsUp, ThumbsDown, Pencil, Trash2, Plus, Save, X, AlertCircle, Play, Lightbulb } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { CATEGORIA_NOTICIA } from '../components/NoticiasTicker'
import type { CategoriaNoticia, IaAprendizado, Noticia } from '../types'

type Aba = 'noticias' | 'aprendizados' | 'config'

interface Config {
  ativo: boolean
  limiar_relevancia: number
  max_itens: number
  ultima_execucao: string | null
  ultimo_status: string | null
}

const TIPO_APRENDIZADO: Record<IaAprendizado['tipo'], string> = {
  regra: 'Regra',
  correcao: 'Correção',
  exemplo_bom: 'Exemplo bom',
  exemplo_ruim: 'Exemplo ruim',
}

const avisar = () => window.dispatchEvent(new Event('noticias-changed'))

export default function IaPage() {
  const { isAdmin } = useAuth()
  const [aba, setAba] = useState<Aba>('noticias')

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center text-slate-400 max-w-md mx-auto">
        <Lock size={28} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">O módulo IA é exclusivo para Administradores.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Sparkles size={20} className="text-orange-500" /> IA do Comercial
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          A IA resume a semana do Comercial e publica na barra de notícias dos apps do grupo. Aqui você corrige o que saiu e ensina o que ela deve ou não destacar.
        </p>
      </div>

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 w-fit max-w-full overflow-x-auto">
        {([['noticias', 'Notícias'], ['aprendizados', 'Aprendizados'], ['config', 'Configuração']] as [Aba, string][]).map(([a, label]) => (
          <button key={a} onClick={() => setAba(a)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
              aba === a ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'noticias' && <AbaNoticias />}
      {aba === 'aprendizados' && <AbaAprendizados />}
      {aba === 'config' && <AbaConfig />}
    </div>
  )
}

// ─── Notícias ────────────────────────────────────────────────────

function AbaNoticias() {
  const { profile } = useAuth()
  const [lista, setLista] = useState<Noticia[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [editando, setEditando] = useState<Noticia | null>(null)
  const [avaliando, setAvaliando] = useState<{ n: Noticia; avaliacao: 'boa' | 'ruim' } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('crm_noticias').select('*')
      .order('gerada_em', { ascending: false }).order('relevancia', { ascending: false }).limit(150)
    if (error) toast.error(error.message)
    setLista((data ?? []) as Noticia[])
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const ultimoLote = lista[0]?.lote_id
  const visiveis = useMemo(
    () => (mostrarTodas ? lista : lista.filter(n => n.lote_id === ultimoLote || (n.editada && n.publicada && !n.oculta))),
    [lista, mostrarTodas, ultimoLote])

  async function atualizar(n: Noticia, patch: Partial<Noticia>) {
    const { error } = await supabase.from('crm_noticias').update(patch).eq('id', n.id)
    if (error) { toast.error(error.message); return false }
    setLista(l => l.map(x => (x.id === n.id ? { ...x, ...patch } : x)))
    avisar()
    return true
  }

  async function gerarAgora() {
    setGerando(true)
    const { data, error } = await supabase.functions.invoke('gerar-noticias-comercial', { body: {} })
    setGerando(false)
    const msg = (data as { error?: string } | null)?.error ?? error?.message
    if (msg || !(data as { ok?: boolean } | null)?.ok) { toast.error('Falha ao gerar: ' + (msg ?? 'erro desconhecido')); return }
    const d = data as { geradas: number; publicadas: number }
    toast.success(`${d.geradas} notícia(s) gerada(s), ${d.publicadas} publicada(s)`)
    carregar(); avisar()
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <button onClick={gerarAgora} disabled={gerando} className="btn-primary text-xs">
          {gerando ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} {gerando ? 'Gerando…' : 'Gerar agora'}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 ml-2">
          <input type="checkbox" checked={mostrarTodas} onChange={e => setMostrarTodas(e.target.checked)} /> Mostrar lotes anteriores
        </label>
        <button onClick={carregar} className="btn-ghost p-2 ml-auto" title="Atualizar"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      <p className="text-[11px] text-slate-400 px-1">
        Cada geração substitui as notícias automáticas anteriores. O que você edita fica fixo na barra até vencer (7 dias). Itens abaixo do limiar de relevância aparecem aqui como "não publicados" e podem ser publicados à mão.
      </p>

      {loading && lista.length === 0 ? (
        <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
      ) : visiveis.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">Nenhuma notícia gerada ainda. Use "Gerar agora" ou aguarde a próxima rodada automática.</div>
      ) : (
        <ul className="space-y-2">
          {visiveis.map(n => {
            const cat = CATEGORIA_NOTICIA[n.categoria] ?? CATEGORIA_NOTICIA.destaque
            const noAr = n.publicada && !n.oculta && new Date(n.valida_ate) > new Date()
            return (
              <li key={n.id} className={`card p-3 ${noAr ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className={`font-bold ${cat.corClara}`}>{cat.rotulo}</span>
                      <span className="text-slate-400">{format(new Date(n.gerada_em), 'dd/MM HH:mm')}</span>
                      <span className="font-semibold text-slate-500" title="Relevância (1 a 5)">{'★'.repeat(n.relevancia)}<span className="text-slate-300 dark:text-slate-700">{'★'.repeat(5 - n.relevancia)}</span> <span className="font-normal">{n.relevancia}/5</span></span>
                      {noAr ? <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold">no ar</span>
                        : n.oculta ? <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">oculta</span>
                        : <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">não publicada</span>}
                      {n.editada && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">editada</span>}
                      {n.avaliacao === 'boa' && <ThumbsUp size={12} className="text-green-600" />}
                      {n.avaliacao === 'ruim' && <ThumbsDown size={12} className="text-red-600" />}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">{n.titulo}</p>
                    {n.texto && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{n.texto}</p>}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => setEditando(n)} className="btn-ghost p-1.5" title="Corrigir texto"><Pencil size={14} /></button>
                    {noAr
                      ? <button onClick={() => atualizar(n, { oculta: true })} className="btn-ghost p-1.5" title="Tirar da barra"><EyeOff size={14} /></button>
                      : <button onClick={() => atualizar(n, { oculta: false, publicada: true, editada: true, valida_ate: new Date(Date.now() + 7 * 86400_000).toISOString() })} className="btn-ghost p-1.5" title="Publicar na barra"><Eye size={14} /></button>}
                    <button onClick={() => setAvaliando({ n, avaliacao: 'boa' })} className="btn-ghost p-1.5 text-green-600" title="Boa notícia — ensinar a IA"><ThumbsUp size={14} /></button>
                    <button onClick={() => setAvaliando({ n, avaliacao: 'ruim' })} className="btn-ghost p-1.5 text-red-500" title="Não devia ter saído — ensinar a IA"><ThumbsDown size={14} /></button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editando && (
        <EditarNoticia noticia={editando} onClose={() => setEditando(null)}
          onSave={async (patch, licao) => {
            const ok = await atualizar(editando, { ...patch, editada: true })
            if (ok && licao.trim()) {
              await supabase.from('crm_ia_aprendizados').insert({ tipo: 'correcao', texto: licao.trim(), noticia_id: editando.id, created_by_nome: profile?.nome ?? null })
            }
            if (ok) { toast.success('Notícia corrigida'); setEditando(null) }
          }} />
      )}
      {avaliando && (
        <AvaliarNoticia {...avaliando} onClose={() => setAvaliando(null)}
          onSave={async (licao, ocultar) => {
            const ok = await atualizar(avaliando.n, { avaliacao: avaliando.avaliacao, ...(ocultar ? { oculta: true } : {}) })
            if (ok) {
              const texto = licao.trim() || (avaliando.avaliacao === 'boa'
                ? `Bom exemplo de notícia: "${avaliando.n.titulo}"`
                : `Não publicar notícias como: "${avaliando.n.titulo}"`)
              await supabase.from('crm_ia_aprendizados').insert({
                tipo: avaliando.avaliacao === 'boa' ? 'exemplo_bom' : 'exemplo_ruim', texto,
                noticia_id: avaliando.n.id, created_by_nome: profile?.nome ?? null,
              })
              toast.success('Aprendizado registrado: vale a partir da próxima geração')
              setAvaliando(null)
            }
          }} />
      )}
    </div>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{titulo}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function EditarNoticia({ noticia, onClose, onSave }: {
  noticia: Noticia; onClose: () => void
  onSave: (patch: Partial<Noticia>, licao: string) => void
}) {
  const [titulo, setTitulo] = useState(noticia.titulo)
  const [texto, setTexto] = useState(noticia.texto ?? '')
  const [categoria, setCategoria] = useState<CategoriaNoticia>(noticia.categoria)
  const [relevancia, setRelevancia] = useState(noticia.relevancia)
  const [licao, setLicao] = useState('')
  return (
    <Modal titulo="Corrigir notícia" onClose={onClose}>
      <div><label className="label">Título</label><input className="input" value={titulo} maxLength={120} onChange={e => setTitulo(e.target.value)} /></div>
      <div><label className="label">Texto</label><textarea className="input" rows={3} maxLength={300} value={texto} onChange={e => setTexto(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={categoria} onChange={e => setCategoria(e.target.value as CategoriaNoticia)}>
            {(Object.keys(CATEGORIA_NOTICIA) as CategoriaNoticia[]).map(c => <option key={c} value={c}>{CATEGORIA_NOTICIA[c].rotulo}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Relevância</label>
          <select className="input" value={relevancia} onChange={e => setRelevancia(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} {'★'.repeat(r)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label flex items-center gap-1"><Lightbulb size={12} /> O que a IA deve aprender com essa correção? (opcional)</label>
        <textarea className="input" rows={2} value={licao} onChange={e => setLicao(e.target.value)}
          placeholder='Ex.: "Escrever o nome do cliente sempre como está no cadastro"' />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
        <button onClick={() => onSave({ titulo: titulo.trim(), texto: texto.trim() || null, categoria, relevancia }, licao)}
          disabled={!titulo.trim()} className="btn-primary text-xs"><Save size={14} /> Salvar</button>
      </div>
    </Modal>
  )
}

function AvaliarNoticia({ n, avaliacao, onClose, onSave }: {
  n: Noticia; avaliacao: 'boa' | 'ruim'; onClose: () => void
  onSave: (licao: string, ocultar: boolean) => void
}) {
  const [licao, setLicao] = useState('')
  const [ocultar, setOcultar] = useState(avaliacao === 'ruim')
  return (
    <Modal titulo={avaliacao === 'boa' ? 'Por que esta notícia ficou boa?' : 'Por que esta notícia não devia sair?'} onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300 italic">"{n.titulo}"</p>
      <textarea className="input" rows={3} value={licao} onChange={e => setLicao(e.target.value)}
        placeholder={avaliacao === 'boa'
          ? 'Ex.: "Negócios ganhos com cliente novo do atacado são sempre relevância 5"'
          : 'Ex.: "Visitas de acompanhamento sem novidade não interessam aos outros setores"'} />
      {avaliacao === 'ruim' && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={ocultar} onChange={e => setOcultar(e.target.checked)} /> Tirar esta notícia da barra agora
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost text-xs">Cancelar</button>
        <button onClick={() => onSave(licao, ocultar)} className="btn-primary text-xs"><Save size={14} /> Registrar</button>
      </div>
    </Modal>
  )
}

// ─── Aprendizados ────────────────────────────────────────────────

function AbaAprendizados() {
  const { profile } = useAuth()
  const [lista, setLista] = useState<IaAprendizado[]>([])
  const [loading, setLoading] = useState(true)
  const [novo, setNovo] = useState('')
  const [tipo, setTipo] = useState<IaAprendizado['tipo']>('regra')

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('crm_ia_aprendizados').select('*').order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setLista((data ?? []) as IaAprendizado[])
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!novo.trim()) return
    const { error } = await supabase.from('crm_ia_aprendizados').insert({ tipo, texto: novo.trim(), created_by_nome: profile?.nome ?? null })
    if (error) { toast.error(error.message); return }
    setNovo(''); carregar()
  }
  async function alternar(a: IaAprendizado) {
    const { error } = await supabase.from('crm_ia_aprendizados').update({ ativo: !a.ativo }).eq('id', a.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.map(x => (x.id === a.id ? { ...x, ativo: !a.ativo } : x)))
  }
  async function excluir(a: IaAprendizado) {
    if (!confirm('Excluir este aprendizado?')) return
    const { error } = await supabase.from('crm_ia_aprendizados').delete().eq('id', a.id)
    if (error) { toast.error(error.message); return }
    setLista(l => l.filter(x => x.id !== a.id))
  }

  return (
    <div className="space-y-3">
      <div className="card p-3 space-y-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">Regras que a IA recebe em toda geração. Escreva como orientaria um editor novo.</p>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <select className="input w-auto text-xs" value={tipo} onChange={e => setTipo(e.target.value as IaAprendizado['tipo'])}>
            {(Object.keys(TIPO_APRENDIZADO) as IaAprendizado['tipo'][]).map(t => <option key={t} value={t}>{TIPO_APRENDIZADO[t]}</option>)}
          </select>
          <input className="input flex-1" value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
            placeholder='Ex.: "Sempre destacar quando um cliente pede prazo de pagamento diferente — interessa ao Financeiro"' />
          <button onClick={adicionar} disabled={!novo.trim()} className="btn-primary text-xs"><Plus size={14} /> Adicionar</button>
        </div>
      </div>

      {loading && lista.length === 0 ? (
        <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">Nenhum aprendizado ainda. Eles também nascem das correções e avaliações na aba Notícias.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-700">
          {lista.map(a => (
            <li key={a.id} className={`px-4 py-2.5 flex items-start gap-3 ${a.ativo ? '' : 'opacity-50'}`}>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0 mt-0.5">{TIPO_APRENDIZADO[a.tipo]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200">{a.texto}</p>
                <p className="text-[11px] text-slate-400">{a.created_by_nome ?? '—'} · {format(new Date(a.created_at), 'dd/MM/yyyy')}</p>
              </div>
              <button onClick={() => alternar(a)} className="btn-ghost text-xs py-1 px-2">{a.ativo ? 'Desativar' : 'Ativar'}</button>
              <button onClick={() => excluir(a)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Configuração ────────────────────────────────────────────────

function AbaConfig() {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.from('crm_noticias_config').select('*').eq('id', 1).maybeSingle()
      .then(({ data, error }) => { if (error) toast.error(error.message); setCfg(data as Config | null) })
  }, [])

  async function salvar() {
    if (!cfg) return
    setSalvando(true)
    const { error } = await supabase.from('crm_noticias_config')
      .update({ ativo: cfg.ativo, limiar_relevancia: cfg.limiar_relevancia, max_itens: cfg.max_itens }).eq('id', 1)
    setSalvando(false)
    if (error) toast.error(error.message); else toast.success('Configuração salva')
  }

  if (!cfg) return <div className="flex justify-center py-12"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
  const erro = cfg.ultimo_status?.startsWith('erro')

  return (
    <div className="card p-4 space-y-4 max-w-lg">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={cfg.ativo} onChange={e => setCfg({ ...cfg, ativo: e.target.checked })} />
        Geração automática ligada (dias úteis, 8h e 13h)
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Relevância mínima para publicar</label>
          <select className="input" value={cfg.limiar_relevancia} onChange={e => setCfg({ ...cfg, limiar_relevancia: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r} {'★'.repeat(r)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Máximo de notícias por geração</label>
          <input type="number" min={1} max={30} className="input" value={cfg.max_itens}
            onChange={e => setCfg({ ...cfg, max_itens: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} />
        </div>
      </div>
      <div className={`rounded-lg px-3 py-2 text-xs ${erro ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-slate-50 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300'}`}>
        <p className="font-semibold flex items-center gap-1">{erro && <AlertCircle size={12} />} Última execução: {cfg.ultima_execucao ? format(new Date(cfg.ultima_execucao), 'dd/MM/yyyy HH:mm') : 'nunca'}</p>
        {cfg.ultimo_status && <p className="mt-0.5 break-words">{cfg.ultimo_status}</p>}
      </div>
      <button onClick={salvar} disabled={salvando} className="btn-primary text-xs"><Save size={14} /> Salvar</button>
    </div>
  )
}
