import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save, Search, ChevronDown, ChevronRight, Archive, Users, ShoppingBag, MapPin, Handshake, Truck, Inbox, Gavel, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { fmtCurrency, fmtDia } from '../../lib/format'
import type { ComiteReuniao } from '../../types'
import type { PeriodoComite } from './comiteConfig'

interface Snapshot {
  resumo?: { varejo?: { faturamento: number; pedidos: number }; posvendas?: { pos_venda: number; recompra: number } }
  visitas?: { cliente: string; data: string; tipo: string | null; responsaveis: string | null; amostra: boolean; relatorio: string | null }[]
  negocios?: { cliente: string; status: string | null; tipo: string | null; novo: boolean; movimentos: number; ganho: boolean }[]
  ocorrencias?: { data: string; tipo: string | null; gravidade: string; status: string; cliente: string | null; descricao: string }[]
  demandas_abertas?: { titulo: string; setor: string; tipo: string; prioridade: string; status: string; desde: string }[]
  notas?: { cliente: string; texto: string; por: string | null }[]
}

/** Ata da semana selecionada + histórico das reuniões (com o retrato congelado de cada semana). */
export default function ComiteHistorico({ ini, fim }: PeriodoComite) {
  const [reunioes, setReunioes] = useState<ComiteReuniao[]>([])
  const [usuarios, setUsuarios] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('crm_comite_reunioes').select('*').order('semana_ini', { ascending: false })
    if (error) toast.error(error.message)
    setReunioes((data ?? []) as ComiteReuniao[])
    setLoading(false)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    supabase.from('crm_users').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios((data ?? []).map((u: { nome: string }) => u.nome)))
  }, [])

  const daSemana = reunioes.find(r => r.semana_ini === ini) ?? null

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return reunioes
    return reunioes.filter(r => [r.ata, r.encaminhamentos, r.participantes.join(' '), JSON.stringify(r.snapshot)]
      .some(x => (x ?? '').toLowerCase().includes(q)))
  }, [reunioes, busca])

  return (
    <div className="space-y-4">
      <AtaDaSemana key={`${ini}-${daSemana?.updated_at ?? ''}`} ini={ini} fim={fim} reuniao={daSemana} usuarios={usuarios} onSaved={carregar} />

      <section className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm"><Archive size={16} className="text-orange-500" /> Histórico do comitê</h2>
          <div className="relative flex-1 min-w-[200px] ml-auto max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 text-sm py-1.5" placeholder="Buscar em atas, clientes, decisões..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <button onClick={carregar} className="btn-ghost p-2" title="Atualizar"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        {loading && reunioes.length === 0 ? (
          <div className="flex justify-center py-10"><RefreshCw size={22} className="animate-spin text-orange-400" /></div>
        ) : filtradas.length === 0 ? (
          <div className="card p-8 text-center text-slate-400 text-sm">{reunioes.length ? 'Nada encontrado.' : 'Nenhuma reunião registrada ainda. Salve a ata acima ao fim do comitê.'}</div>
        ) : (
          filtradas.map(r => (
            <ReuniaoCard key={r.id} r={r} aberta={aberta === r.id} onToggle={() => setAberta(a => (a === r.id ? null : r.id))} />
          ))
        )}
      </section>
    </div>
  )
}

function AtaDaSemana({ ini, fim, reuniao, usuarios, onSaved }: { ini: string; fim: string; reuniao: ComiteReuniao | null; usuarios: string[]; onSaved: () => void }) {
  const [participantes, setParticipantes] = useState<string[]>(reuniao?.participantes ?? [])
  const [ata, setAta] = useState(reuniao?.ata ?? '')
  const [encaminhamentos, setEncaminhamentos] = useState(reuniao?.encaminhamentos ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const { error } = await supabase.rpc('crm_comite_fechar_semana', {
      p_ini: ini, p_fim: fim, p_ata: ata, p_encaminhamentos: encaminhamentos, p_participantes: participantes,
    })
    setSalvando(false)
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return }
    toast.success('Comitê da semana salvo no histórico')
    onSaved()
  }

  const alterna = (n: string) => setParticipantes(p => (p.includes(n) ? p.filter(x => x !== n) : [...p, n]))

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm"><Gavel size={16} className="text-orange-500" /> Ata do comitê · semana de {fmtDia(ini)} a {fmtDia(fim)}</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {reuniao
              ? `Registrada em ${fmtDia(reuniao.realizada_em)}${reuniao.created_by_nome ? ` por ${reuniao.created_by_nome}` : ''}. Salvar de novo atualiza a ata e o retrato da semana.`
              : 'Ao salvar, o comitê guarda a ata junto com um retrato da semana (vendas, visitas, negócios, ocorrências, demandas e registros), que fica para consulta.'}
          </p>
        </div>
      </div>

      <div>
        <label className="label flex items-center gap-1"><Users size={12} /> Participantes</label>
        <div className="flex gap-1 flex-wrap">
          {usuarios.map(n => (
            <button key={n} type="button" onClick={() => alterna(n)}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${participantes.includes(n) ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-orange-300'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">Pauta e discussão</label>
        <textarea className="input" rows={4} value={ata} onChange={e => setAta(e.target.value)} placeholder="Principais pontos discutidos na reunião..." />
      </div>
      <div>
        <label className="label">Decisões e encaminhamentos</label>
        <textarea className="input" rows={3} value={encaminhamentos} onChange={e => setEncaminhamentos(e.target.value)} placeholder="O que foi decidido, quem faz o quê e até quando..." />
      </div>
      <button onClick={salvar} disabled={salvando} className="btn-primary text-xs">
        {salvando ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {reuniao ? 'Atualizar no histórico' : 'Salvar no histórico'}
      </button>
    </section>
  )
}

function ReuniaoCard({ r, aberta, onToggle }: { r: ComiteReuniao; aberta: boolean; onToggle: () => void }) {
  const s = r.snapshot as Snapshot
  const ganhos = s.negocios?.filter(n => n.ganho).length ?? 0
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
        {aberta ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">Semana de {fmtDia(r.semana_ini)} a {fmtDia(r.semana_fim)}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {r.participantes.length ? r.participantes.join(', ') : 'Participantes não informados'}
            {r.encaminhamentos ? ` · ${r.encaminhamentos.split('\n')[0]}` : ''}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 shrink-0">
          {s.resumo?.varejo && <span className="inline-flex items-center gap-1"><ShoppingBag size={11} /> {fmtCurrency(Number(s.resumo.varejo.faturamento))}</span>}
          <span className="inline-flex items-center gap-1"><MapPin size={11} /> {s.visitas?.length ?? 0}</span>
          <span className="inline-flex items-center gap-1"><Handshake size={11} /> {s.negocios?.length ?? 0}</span>
          {ganhos > 0 && <span className="inline-flex items-center gap-1 text-green-600"><Trophy size={11} /> {ganhos}</span>}
          <span className="inline-flex items-center gap-1"><Truck size={11} /> {s.ocorrencias?.length ?? 0}</span>
        </div>
      </button>

      {aberta && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-3 space-y-4 text-sm">
          {r.ata && <Bloco titulo="Pauta e discussão"><p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{r.ata}</p></Bloco>}
          {r.encaminhamentos && <Bloco titulo="Decisões e encaminhamentos"><p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{r.encaminhamentos}</p></Bloco>}

          {s.resumo && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Faturamento varejo', fmtCurrency(Number(s.resumo.varejo?.faturamento ?? 0))],
                ['Pedidos varejo', String(s.resumo.varejo?.pedidos ?? 0)],
                ['Recompras', String(s.resumo.posvendas?.recompra ?? 0)],
                ['Pós-vendas', String(s.resumo.posvendas?.pos_venda ?? 0)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                  <p className="text-[10px] text-slate-500">{l}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          )}

          {!!s.notas?.length && (
            <Bloco titulo={`Registros do comitê (${s.notas.length})`} icon={Gavel}>
              <ul className="space-y-1">{s.notas.map((n, i) => <li key={i}><strong>{n.cliente}:</strong> {n.texto}{n.por ? <span className="text-slate-400"> — {n.por}</span> : null}</li>)}</ul>
            </Bloco>
          )}
          {!!s.negocios?.length && (
            <Bloco titulo={`Negócios movimentados (${s.negocios.length})`} icon={Handshake}>
              <ul className="space-y-0.5">{s.negocios.map((n, i) => (
                <li key={i} className="flex items-center gap-1.5 flex-wrap">
                  {n.ganho && <Trophy size={12} className="text-green-600" />}<strong>{n.cliente}</strong>
                  <span className="text-slate-500">{n.tipo ?? ''} · {n.status ?? '—'}{n.novo ? ' · novo' : ''}</span>
                </li>
              ))}</ul>
            </Bloco>
          )}
          {!!s.visitas?.length && (
            <Bloco titulo={`Visitas realizadas (${s.visitas.length})`} icon={MapPin}>
              <ul className="space-y-1">{s.visitas.map((v, i) => (
                <li key={i}><strong>{v.cliente}</strong> <span className="text-slate-500">· {fmtDia(v.data)} · {v.tipo ?? ''}{v.responsaveis ? ` · ${v.responsaveis}` : ''}{v.amostra ? ' · amostra' : ''}</span>
                  {v.relatorio && <p className="text-xs text-slate-500 line-clamp-2">{v.relatorio}</p>}</li>
              ))}</ul>
            </Bloco>
          )}
          {!!s.ocorrencias?.length && (
            <Bloco titulo={`Ocorrências da logística (${s.ocorrencias.length})`} icon={Truck}>
              <ul className="space-y-0.5">{s.ocorrencias.map((o, i) => (
                <li key={i}><span className="text-slate-500">{fmtDia(o.data)} · {o.tipo ?? 'Sem tipo'} · {o.gravidade} · {o.status}</span>{o.cliente ? <strong> · {o.cliente}</strong> : null} — {o.descricao}</li>
              ))}</ul>
            </Bloco>
          )}
          {!!s.demandas_abertas?.length && (
            <Bloco titulo={`Demandas em aberto naquela semana (${s.demandas_abertas.length})`} icon={Inbox}>
              <ul className="space-y-0.5">{s.demandas_abertas.map((d, i) => (
                <li key={i}><strong>{d.setor}:</strong> {d.titulo} <span className="text-slate-500">({d.tipo}, prioridade {d.prioridade}, desde {fmtDia(d.desde)})</span></li>
              ))}</ul>
            </Bloco>
          )}
        </div>
      )}
    </div>
  )
}

function Bloco({ titulo, icon: Icon, children }: { titulo: string; icon?: typeof MapPin; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1">{Icon && <Icon size={11} />} {titulo}</p>
      <div className="text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  )
}
