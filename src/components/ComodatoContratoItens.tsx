import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  AlertCircle, Plus, Link2, Unlink, Search, FilePlus2, Pencil, Trash2, ExternalLink, Package, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/format'
import {
  alocarEquipamento, vincularAlocacaoAoContrato, desvincularAlocacaoDoContrato,
  excluirComodato, mensagemErroComodato, CATEGORIA_LABELS,
} from '../lib/comodato'
import {
  COMODATO_ADITIVO_TIPO_LABELS,
  type ComodatoAditivo, type ComodatoAditivoTipo, type ComodatoContratoItem,
  type ComodatoContratoStatus, type ComodatoEquipamentoView,
} from '../types'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  contratoId: string
  clientId: string
  contratoStatus: ComodatoContratoStatus
  dataInicio: string | null
  canEdit: boolean
  isAdmin: boolean
  /** Avisa a página que a lista de contratos/equipamentos mudou. */
  onChanged: () => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

const SECTION_TITLE =
  'text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1 flex items-center justify-between'

export default function ComodatoContratoItens({
  contratoId, clientId, contratoStatus, dataInicio, canEdit, isAdmin, onChanged,
}: Props) {
  const [itens, setItens]       = useState<ComodatoContratoItem[]>([])
  const [aditivos, setAditivos] = useState<ComodatoAditivo[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  // ── vincular equipamentos ──
  const [pickerOpen, setPickerOpen] = useState(false)
  const [candidatos, setCandidatos] = useState<ComodatoEquipamentoView[]>([])
  const [busca, setBusca]           = useState('')
  const [marcados, setMarcados]     = useState<Set<string>>(new Set())
  const [dataInclusao, setDataInclusao] = useState(hoje())
  const [aditivoEscolhido, setAditivoEscolhido] = useState('')

  // ── aditivos ──
  const [formAditivo, setFormAditivo] = useState<Partial<ComodatoAditivo> | null>(null)
  const [excluirAditivo, setExcluirAditivo] = useState<ComodatoAditivo | null>(null)

  const encerrado = contratoStatus === 'encerrado' || contratoStatus === 'cancelado'

  const carregar = useCallback(async () => {
    const [it, ad] = await Promise.all([
      supabase.from('comodato_alocacoes')
        .select(`*, equipamento:comodato_equipamentos!equipamento_id(
                   id, codigo_patrimonio, numero_serie, modelo:comodato_modelos(nome, categoria))`)
        .eq('contrato_id', contratoId)
        .order('data_entrega', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('comodato_contrato_aditivos')
        .select('*').eq('contrato_id', contratoId)
        .order('data_aditivo', { ascending: true }),
    ])
    if (it.error) setError(it.error.message)
    setItens((it.data ?? []) as unknown as ComodatoContratoItem[])
    setAditivos((ad.data ?? []) as ComodatoAditivo[])
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregar() }, [carregar])

  async function abrirPicker() {
    setError(null)
    setPickerOpen(true)
    // depósito + o que já está com este cliente sem contrato
    const { data, error: e } = await supabase.from('comodato_equipamentos_view')
      .select('*')
      .or(`and(situacao.eq.disponivel,ativo.eq.true),and(client_id.eq.${clientId},sem_contrato.eq.true)`)
      .order('codigo_patrimonio')
    if (e) setError(e.message)
    setCandidatos((data ?? []) as ComodatoEquipamentoView[])
  }

  const candidatosFiltrados = useMemo(() => {
    const q = busca.trim().toUpperCase()
    return candidatos.filter(e =>
      !q || e.codigo_patrimonio.includes(q) || (e.modelo_nome ?? '').toUpperCase().includes(q))
  }, [candidatos, busca])

  function alternar(id: string) {
    setMarcados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function vincular() {
    if (marcados.size === 0) return
    setBusy(true); setError(null)
    const falhas: string[] = []
    for (const id of marcados) {
      const eq = candidatos.find(c => c.id === id)
      if (!eq) continue
      try {
        if (eq.alocacao_id) {
          // já está com o cliente, só falta o contrato
          await vincularAlocacaoAoContrato(eq.alocacao_id, contratoId, aditivoEscolhido || null, dataInclusao)
        } else {
          await alocarEquipamento({
            equipamentoId: eq.id, clientId, contratoId,
            aditivoId: aditivoEscolhido || null, dataEntrega: dataInclusao,
          })
        }
      } catch (e: any) {
        falhas.push(`${eq.codigo_patrimonio}: ${mensagemErroComodato(e)}`)
      }
    }
    setBusy(false)
    if (falhas.length) setError(falhas.join(' · '))
    setMarcados(new Set())
    if (!falhas.length) { setPickerOpen(false); setBusca('') }
    await carregar()
    onChanged()
  }

  async function trocarAditivo(item: ComodatoContratoItem, aditivoId: string) {
    setBusy(true); setError(null)
    try {
      const { error: e } = await supabase.from('comodato_alocacoes')
        .update({ aditivo_id: aditivoId || null }).eq('id', item.id)
      if (e) throw e
      await carregar(); onChanged()
    } catch (e: any) { setError(mensagemErroComodato(e)) }
    setBusy(false)
  }

  async function desvincular(item: ComodatoContratoItem) {
    setBusy(true); setError(null)
    try {
      await desvincularAlocacaoDoContrato(item.id)
      await carregar(); onChanged()
    } catch (e: any) { setError(mensagemErroComodato(e)) }
    setBusy(false)
  }

  async function salvarAditivo() {
    if (!formAditivo) return
    setBusy(true); setError(null)
    const payload = {
      contrato_id:     contratoId,
      numero:          formAditivo.numero?.trim() || null,
      tipo:            (formAditivo.tipo ?? 'inclusao_equipamento') as ComodatoAditivoTipo,
      data_aditivo:    formAditivo.data_aditivo || hoje(),
      descricao:       formAditivo.descricao?.trim() || null,
      assinado:        !!formAditivo.assinado,
      data_assinatura: formAditivo.assinado ? (formAditivo.data_assinatura || hoje()) : null,
      arquivo_url:     formAditivo.arquivo_url?.trim() || null,
    }
    const { error: e } = formAditivo.id
      ? await supabase.from('comodato_contrato_aditivos').update(payload).eq('id', formAditivo.id)
      : await supabase.from('comodato_contrato_aditivos').insert(payload)
    setBusy(false)
    if (e) return setError(mensagemErroComodato(e))
    setFormAditivo(null)
    await carregar()
  }

  async function confirmarExclusaoAditivo() {
    if (!excluirAditivo) return
    setBusy(true); setError(null)
    try {
      await excluirComodato('comodato_contrato_aditivos', excluirAditivo.id)
      setExcluirAditivo(null)
      await carregar(); onChanged()
    } catch (e: any) { setError(mensagemErroComodato(e)); setExcluirAditivo(null) }
    setBusy(false)
  }

  const ativos     = itens.filter(i => i.status === 'ativa')
  const historicos = itens.filter(i => i.status !== 'ativa')

  const aditivoLabel = (a: ComodatoAditivo, i: number) =>
    a.numero?.trim() || `Aditivo ${i + 1}`

  const aditivoDoItem = (item: ComodatoContratoItem) => {
    const idx = aditivos.findIndex(a => a.id === item.aditivo_id)
    return idx >= 0 ? aditivoLabel(aditivos[idx], idx) : null
  }

  // equipamento entrando depois do início do contrato, sem aditivo → lembrete
  const precisaAditivo = !!dataInicio && dataInclusao > dataInicio && !aditivoEscolhido

  return (
    <>
      {/* ───────── Equipamentos ───────── */}
      <section className="space-y-3">
        <h3 className={SECTION_TITLE}>
          <span>Equipamentos do contrato ({ativos.length})</span>
          {canEdit && !encerrado && !pickerOpen && (
            <button type="button" onClick={abrirPicker}
              className="normal-case tracking-normal text-xs font-bold text-orange-600 dark:text-orange-400 inline-flex items-center gap-1 hover:underline">
              <Link2 size={12} /> Vincular equipamento
            </button>
          )}
        </h3>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Carregando…</p>
        ) : ativos.length === 0 ? (
          <p className="text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-600 px-3 py-3">
            Nenhum equipamento vinculado a este contrato ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ativos.map(item => (
              <div key={item.id}
                className="flex items-center gap-2 rounded-xl border border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <Package size={14} className="text-orange-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                    <span className="font-mono text-xs font-black mr-1.5">{item.equipamento?.codigo_patrimonio ?? '—'}</span>
                    {item.equipamento?.modelo?.nome ?? 'sem modelo'}
                    {item.equipamento?.modelo?.categoria && (
                      <span className="text-xs text-slate-400"> · {CATEGORIA_LABELS[item.equipamento.modelo.categoria]}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Incluído em {fmtDate(item.data_entrega)}
                    {' · '}
                    {aditivoDoItem(item)
                      ? <span className="font-bold text-sky-600 dark:text-sky-400">{aditivoDoItem(item)}</span>
                      : 'Contrato original'}
                  </p>
                </div>
                {canEdit && !encerrado && (
                  <>
                    <select aria-label="Aditivo do equipamento" disabled={busy}
                      className="input !w-auto !py-1 !text-xs max-w-[9rem]"
                      value={item.aditivo_id ?? ''}
                      onChange={e => trocarAditivo(item, e.target.value)}>
                      <option value="">Contrato original</option>
                      {aditivos.map((a, i) => <option key={a.id} value={a.id}>{aditivoLabel(a, i)}</option>)}
                    </select>
                    <button type="button" disabled={busy} onClick={() => desvincular(item)}
                      className="btn-ghost p-1.5 text-slate-500" title="Desvincular do contrato (o equipamento continua com o cliente)">
                      <Unlink size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {historicos.length > 0 && (
          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer font-medium">Histórico de equipamentos já devolvidos ({historicos.length})</summary>
            <ul className="mt-1.5 space-y-1">
              {historicos.map(item => (
                <li key={item.id} className="flex gap-2 flex-wrap">
                  <span className="font-mono font-bold">{item.equipamento?.codigo_patrimonio ?? '—'}</span>
                  <span>{item.equipamento?.modelo?.nome ?? ''}</span>
                  <span>· {fmtDate(item.data_entrega)} → {fmtDate(item.data_retirada)}</span>
                  {aditivoDoItem(item) && <span>· {aditivoDoItem(item)}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* seletor */}
        {pickerOpen && (
          <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10 p-3 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Buscar por patrimônio ou modelo…"
                     value={busca} onChange={e => setBusca(e.target.value)} />
            </div>

            <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-1">
              {candidatosFiltrados.length === 0 && (
                <p className="px-2 py-2 text-xs text-slate-400">
                  Nenhum equipamento disponível. Cadastre um equipamento ou registre uma devolução.
                </p>
              )}
              {candidatosFiltrados.map(e => (
                <label key={e.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700">
                  <input type="checkbox" checked={marcados.has(e.id)} onChange={() => alternar(e.id)} />
                  <span className="font-mono text-xs font-black">{e.codigo_patrimonio}</span>
                  <span className="truncate text-slate-700 dark:text-slate-200">{e.modelo_nome ?? 'sem modelo'}</span>
                  <span className="ml-auto text-[10px] font-bold shrink-0 text-slate-400">
                    {e.alocacao_id ? 'já está com o cliente' : 'depósito'}
                  </span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data de inclusão</label>
                <input className="input" type="date" value={dataInclusao} onChange={e => setDataInclusao(e.target.value)} />
              </div>
              <div>
                <label className="label">Aditivo</label>
                <select className="input" value={aditivoEscolhido} onChange={e => setAditivoEscolhido(e.target.value)}>
                  <option value="">Contrato original</option>
                  {aditivos.map((a, i) => <option key={a.id} value={a.id}>{aditivoLabel(a, i)}</option>)}
                </select>
              </div>
            </div>

            {precisaAditivo && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Este contrato começou em {fmtDate(dataInicio)}. Equipamento incluído depois disso normalmente é formalizado
                por aditivo — cadastre o aditivo abaixo e selecione-o aqui.
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => { setPickerOpen(false); setMarcados(new Set()) }}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" disabled={busy || marcados.size === 0} onClick={vincular}>
                {busy ? 'Vinculando…' : `Vincular ${marcados.size || ''}`.trim()}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ───────── Aditivos ───────── */}
      <section className="space-y-3">
        <h3 className={SECTION_TITLE}>
          <span>Aditivos ({aditivos.length})</span>
          {canEdit && !formAditivo && (
            <button type="button" onClick={() => setFormAditivo({ tipo: 'inclusao_equipamento', data_aditivo: hoje(), assinado: false })}
              className="normal-case tracking-normal text-xs font-bold text-orange-600 dark:text-orange-400 inline-flex items-center gap-1 hover:underline">
              <Plus size={12} /> Novo aditivo
            </button>
          )}
        </h3>

        {aditivos.length === 0 && !formAditivo && (
          <p className="text-xs text-slate-400">Nenhum aditivo. O contrato vale como foi assinado originalmente.</p>
        )}

        <div className="space-y-1.5">
          {aditivos.map((a, i) => {
            const emUso = itens.filter(x => x.aditivo_id === a.id).length
            return (
              <div key={a.id} className="flex items-start gap-2 rounded-xl border border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 px-3 py-2">
                <FilePlus2 size={14} className="text-sky-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                    {aditivoLabel(a, i)}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">
                      {COMODATO_ADITIVO_TIPO_LABELS[a.tipo]}
                    </span>
                    {a.assinado
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 inline-flex items-center gap-0.5"><CheckCircle2 size={9} /> Assinado</span>
                      : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Não assinado</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {fmtDate(a.data_aditivo)}{emUso > 0 ? ` · ${emUso} equipamento${emUso > 1 ? 's' : ''}` : ''}
                    {a.descricao ? ` · ${a.descricao}` : ''}
                  </p>
                </div>
                {a.arquivo_url && (
                  <a href={a.arquivo_url} target="_blank" rel="noreferrer" className="btn-ghost p-1.5 text-slate-500" title="Abrir documento">
                    <ExternalLink size={14} />
                  </a>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setFormAditivo(a)} className="btn-ghost p-1.5 text-slate-500" title="Editar aditivo">
                    <Pencil size={14} />
                  </button>
                )}
                {isAdmin && (
                  <button type="button" disabled={emUso > 0}
                    onClick={() => setExcluirAditivo(a)}
                    className="btn-ghost p-1.5 text-red-500 disabled:opacity-30"
                    title={emUso > 0 ? 'Há equipamentos vinculados a este aditivo' : 'Excluir aditivo'}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {formAditivo && (
          <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-900/10 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Identificação</label>
                <input className="input" placeholder={`Ex: ${aditivos.length + 1}º Aditivo`}
                       value={formAditivo.numero ?? ''} onChange={e => setFormAditivo({ ...formAditivo, numero: e.target.value })} />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={formAditivo.tipo ?? 'inclusao_equipamento'}
                        onChange={e => setFormAditivo({ ...formAditivo, tipo: e.target.value as ComodatoAditivoTipo })}>
                  {(Object.keys(COMODATO_ADITIVO_TIPO_LABELS) as ComodatoAditivoTipo[]).map(k => (
                    <option key={k} value={k}>{COMODATO_ADITIVO_TIPO_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Data do aditivo</label>
                <input className="input" type="date" value={formAditivo.data_aditivo ?? ''}
                       onChange={e => setFormAditivo({ ...formAditivo, data_aditivo: e.target.value })} />
              </div>
              <div>
                <label className="label">Assinado?</label>
                <button type="button" onClick={() => setFormAditivo({ ...formAditivo, assinado: !formAditivo.assinado })}
                  className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${formAditivo.assinado ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>
                  {formAditivo.assinado ? 'Sim' : 'Não'}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Descrição</label>
              <input className="input" placeholder="Ex: inclusão de 1 freezer 450L a pedido do cliente"
                     value={formAditivo.descricao ?? ''} onChange={e => setFormAditivo({ ...formAditivo, descricao: e.target.value })} />
            </div>
            <div>
              <label className="label">Link do documento (PDF)</label>
              <input className="input" placeholder="https://drive.google.com/…"
                     value={formAditivo.arquivo_url ?? ''} onChange={e => setFormAditivo({ ...formAditivo, arquivo_url: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" onClick={() => setFormAditivo(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={busy} onClick={salvarAditivo}>
                {busy ? 'Salvando…' : 'Salvar aditivo'}
              </button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!excluirAditivo}
        title="Excluir aditivo"
        message={`Excluir ${excluirAditivo?.numero ?? 'este aditivo'}? A exclusão fica registrada na auditoria.`}
        confirmLabel="Excluir"
        loading={busy}
        zClass="z-[80]"
        onConfirm={confirmarExclusaoAditivo}
        onCancel={() => setExcluirAditivo(null)}
      />
    </>
  )
}
