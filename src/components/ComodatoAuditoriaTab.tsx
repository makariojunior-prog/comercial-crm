import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, ChevronRight, ChevronDown, Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDatetime } from '../lib/format'
import {
  COMODATO_AUDITORIA_TABELA_LABELS,
  type ComodatoAuditoria, type ComodatoAuditoriaOperacao,
} from '../types'

const OP_META: Record<ComodatoAuditoriaOperacao, { label: string; cls: string; icon: any }> = {
  INSERT: { label: 'Criou',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: Plus },
  UPDATE: { label: 'Alterou', cls: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',         icon: Pencil },
  DELETE: { label: 'Excluiu', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',         icon: Trash2 },
}

const LIMITE = 300
const OCULTOS = new Set(['created_at', 'updated_at'])

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function Detalhe({ a }: { a: ComodatoAuditoria }) {
  if (a.operacao === 'UPDATE') {
    const campos = a.campos_alterados ?? []
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="font-semibold pr-3 pb-1">Campo</th>
            <th className="font-semibold pr-3 pb-1">Antes</th>
            <th className="font-semibold pb-1">Depois</th>
          </tr>
        </thead>
        <tbody>
          {campos.map(c => (
            <tr key={c} className="align-top border-t border-slate-100 dark:border-slate-700">
              <td className="font-mono pr-3 py-1 text-slate-600 dark:text-slate-300">{c}</td>
              <td className="pr-3 py-1 text-red-600 dark:text-red-400 break-all">{fmtValor(a.dados_antigos?.[c])}</td>
              <td className="py-1 text-green-700 dark:text-green-400 break-all">{fmtValor(a.dados_novos?.[c])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const dados = (a.operacao === 'INSERT' ? a.dados_novos : a.dados_antigos) ?? {}
  const linhas = Object.entries(dados).filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== '')
  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-1">
        {a.operacao === 'INSERT' ? 'Dados gravados' : 'Dados no momento da exclusão'}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {linhas.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="text-slate-700 dark:text-slate-200 break-all">{fmtValor(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function ComodatoAuditoriaTab() {
  const [rows, setRows]       = useState<ComodatoAuditoria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)
  const [aberto, setAberto]   = useState<number | null>(null)

  const [tabela, setTabela]   = useState('TODAS')
  const [operacao, setOperacao] = useState<ComodatoAuditoriaOperacao | 'TODAS'>('TODAS')
  const [dias, setDias]       = useState(30)
  const [busca, setBusca]     = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    let q = supabase.from('comodato_auditoria').select('*')
      .order('ocorrido_em', { ascending: false }).limit(LIMITE)
    if (tabela !== 'TODAS')   q = q.eq('tabela', tabela)
    if (operacao !== 'TODAS') q = q.eq('operacao', operacao)
    if (dias > 0) q = q.gte('ocorrido_em', new Date(Date.now() - dias * 86400000).toISOString())
    const { data, error } = await q
    if (error) setErro(error.message)
    setRows((data ?? []) as ComodatoAuditoria[])
    setLoading(false)
  }, [tabela, operacao, dias])

  useEffect(() => { carregar() }, [carregar])

  const filtradas = useMemo(() => {
    const t = busca.trim().toUpperCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.usuario_nome ?? '').toUpperCase().includes(t)
      || (r.usuario_email ?? '').toUpperCase().includes(t)
      || (r.resumo ?? '').toUpperCase().includes(t))
  }, [rows, busca])

  return (
    <div className="space-y-3">
      <div className="card p-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldAlert size={15} className="shrink-0 mt-0.5 text-orange-500" />
        <p>
          Registro de tudo que foi criado, alterado ou excluído no módulo Comodato, com o usuário e o horário.
          Visível apenas para administradores e não pode ser editado nem apagado.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input className="input flex-1 min-w-[180px]" placeholder="Buscar por usuário ou registro…"
               value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="input !w-auto" value={tabela} onChange={e => setTabela(e.target.value)}>
          <option value="TODAS">Todos os cadastros</option>
          {Object.entries(COMODATO_AUDITORIA_TABELA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input !w-auto" value={operacao} onChange={e => setOperacao(e.target.value as any)}>
          <option value="TODAS">Todas as ações</option>
          <option value="INSERT">Criações</option>
          <option value="UPDATE">Alterações</option>
          <option value="DELETE">Exclusões</option>
        </select>
        <select className="input !w-auto" value={dias} onChange={e => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={0}>Todo o período</option>
        </select>
        <button onClick={carregar} className="btn-ghost p-2" title="Atualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {erro}. Se a tabela de auditoria ainda não existe, aplique a migration 20260921120000 no Supabase.
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-slate-400">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">Nenhum registro no período.</div>
      ) : (
        <div className="space-y-1.5">
          {filtradas.map(a => {
            const meta = OP_META[a.operacao]
            const Icon = meta.icon
            const open = aberto === a.id
            return (
              <div key={a.id} className="card overflow-hidden">
                <button onClick={() => setAberto(open ? null : a.id)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  {open ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 shrink-0 ${meta.cls}`}>
                    <Icon size={10} /> {meta.label}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                    {COMODATO_AUDITORIA_TABELA_LABELS[a.tabela] ?? a.tabela}
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-100 truncate flex-1 min-w-0">{a.resumo ?? a.registro_id}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 text-right">
                    <span className="block font-medium">{a.usuario_nome ?? a.usuario_email ?? 'Desconhecido'}</span>
                    <span>{fmtDatetime(a.ocorrido_em)}</span>
                  </span>
                </button>
                {open && (
                  <div className="px-4 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60">
                    {a.usuario_email && <p className="text-[11px] text-slate-400 mb-2">{a.usuario_email}</p>}
                    <Detalhe a={a} />
                  </div>
                )}
              </div>
            )
          })}
          {rows.length >= LIMITE && (
            <p className="text-[11px] text-center text-slate-400">
              Mostrando os {LIMITE} registros mais recentes. Use os filtros para refinar.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
