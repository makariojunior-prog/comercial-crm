import { useState, useEffect, useCallback } from 'react'
import {
  Package, Plus, Undo2, FileSignature, AlertTriangle, Wrench,
  RefreshCw, ExternalLink, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtCurrency, fmtDate } from '../lib/format'
import { SITUACAO_COLORS, CATEGORIA_LABELS } from '../lib/comodato'
import {
  COMODATO_SITUACAO_LABELS, COMODATO_CONTRATO_LABELS, comodatoContratoAlerta,
  type ComodatoEquipamentoView, type ComodatoContrato,
} from '../types'
import ComodatoAlocarModal from './ComodatoAlocarModal'
import ComodatoContratoModal from './ComodatoContratoModal'

interface Props {
  clientId: string
  clientNome: string
  /** Texto livre original, exibido como referência histórica da migração. */
  textoLegado?: string | null
  canEdit?: boolean
}

/**
 * Painel de comodato do cliente — usado dentro do ClientModal e na aba
 * Contratos do módulo. Opera sobre as mesmas tabelas do módulo Comodato,
 * então qualquer alteração aqui aparece lá e vice-versa.
 */
export default function ComodatoClientePanel({ clientId, clientNome, textoLegado, canEdit = true }: Props) {
  const [equipamentos, setEquipamentos] = useState<ComodatoEquipamentoView[]>([])
  const [contratos, setContratos]       = useState<ComodatoContrato[]>([])
  const [loading, setLoading]           = useState(true)

  const [alocando, setAlocando]   = useState(false)
  const [devolvendo, setDevolvendo] = useState<ComodatoEquipamentoView | null>(null)
  const [editContrato, setEditContrato] = useState<ComodatoContrato | null | undefined>(undefined)

  const load = useCallback(async () => {
    setLoading(true)
    const [eq, ct] = await Promise.all([
      supabase.from('comodato_equipamentos_view').select('*')
        .eq('client_id', clientId).order('codigo_patrimonio'),
      supabase.from('comodato_contratos').select('*')
        .eq('client_id', clientId).order('created_at', { ascending: false }),
    ])
    setEquipamentos((eq.data ?? []) as ComodatoEquipamentoView[])
    setContratos((ct.data ?? []) as ComodatoContrato[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const valorTotal = equipamentos.reduce((s, e) => s + (e.valor_efetivo ?? 0), 0)
  const contratoAtivo = contratos.find(c => c.status === 'vigente' || c.status === 'pendente_assinatura') ?? null
  const alerta = comodatoContratoAlerta(contratoAtivo?.data_fim)
  const semContrato = equipamentos.filter(e => e.sem_contrato).length
  const aRevisar = equipamentos.filter(e => e.revisar).length

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200">
            <Package size={13} className="text-orange-500" />
            {equipamentos.length} {equipamentos.length === 1 ? 'equipamento' : 'equipamentos'}
          </span>
          {valorTotal > 0 && (
            <span className="text-slate-400">· {fmtCurrency(valorTotal)} imobilizados</span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1.5">
            <button type="button" onClick={load} className="btn-ghost p-1.5" title="Atualizar">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={() => setAlocando(true)} className="btn-primary text-xs py-1.5 px-3">
              <Plus size={13} /> Alocar
            </button>
          </div>
        )}
      </div>

      {/* Alertas */}
      {(semContrato > 0 || alerta || aRevisar > 0) && (
        <div className="space-y-1.5">
          {semContrato > 0 && (
            <div className="flex items-center gap-2 text-[11px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              {semContrato} {semContrato === 1 ? 'equipamento sem contrato vinculado' : 'equipamentos sem contrato vinculado'}
            </div>
          )}
          {alerta && (
            <div className={`flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5 border ${
              alerta === 'vencido'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            }`}>
              <AlertTriangle size={12} className="shrink-0" />
              Contrato {alerta === 'vencido' ? 'vencido' : 'vencendo'} em {fmtDate(contratoAtivo?.data_fim)}
            </div>
          )}
          {aRevisar > 0 && (
            <div className="flex items-center gap-2 text-[11px] bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 rounded-lg px-2.5 py-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              {aRevisar} {aRevisar === 1 ? 'unidade importada aguarda conferência' : 'unidades importadas aguardam conferência'}
            </div>
          )}
        </div>
      )}

      {/* Contrato */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Contrato</p>
            {contratoAtivo ? (
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {contratoAtivo.numero ?? 'Sem número'}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {COMODATO_CONTRATO_LABELS[contratoAtivo.status]}
                </span>
                {contratoAtivo.contrato_assinado ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 inline-flex items-center gap-0.5">
                    <CheckCircle2 size={9} /> Assinado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    Não assinado
                  </span>
                )}
                {contratoAtivo.data_fim && (
                  <span className="text-[11px] text-slate-400">até {fmtDate(contratoAtivo.data_fim)}</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">Nenhum contrato cadastrado para este cliente.</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {contratoAtivo?.arquivo_url && (
              <a href={contratoAtivo.arquivo_url} target="_blank" rel="noreferrer" className="btn-ghost p-1.5" title="Abrir PDF">
                <ExternalLink size={13} />
              </a>
            )}
            {canEdit && (
              <button type="button" onClick={() => setEditContrato(contratoAtivo)}
                      className="btn-ghost p-1.5 text-orange-500" title={contratoAtivo ? 'Editar contrato' : 'Criar contrato'}>
                <FileSignature size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Equipamentos */}
      {loading ? (
        <div className="text-center py-4 text-xs text-slate-400">Carregando equipamentos…</div>
      ) : equipamentos.length === 0 ? (
        <div className="text-center py-5 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
          Nenhum equipamento em comodato com este cliente.
        </div>
      ) : (
        <div className="space-y-1.5">
          {equipamentos.map(e => (
            <div key={e.id} className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
              <div className="mt-0.5 p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 shrink-0">
                <Package size={13} className="text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{e.codigo_patrimonio}</span>
                  <span className="text-sm text-slate-800 dark:text-slate-100 truncate">{e.modelo_nome ?? '—'}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SITUACAO_COLORS[e.situacao]}`}>
                    {COMODATO_SITUACAO_LABELS[e.situacao]}
                  </span>
                  {e.revisar && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                      revisar
                    </span>
                  )}
                  {e.manutencao_vencida && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 inline-flex items-center gap-0.5">
                      <Wrench size={9} /> preventiva vencida
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex gap-2.5 flex-wrap">
                  {e.categoria && <span>{CATEGORIA_LABELS[e.categoria] ?? e.categoria}</span>}
                  {e.numero_serie && <span>Série {e.numero_serie}</span>}
                  {e.data_entrega && <span>Desde {fmtDate(e.data_entrega)}</span>}
                  {e.valor_efetivo != null && <span>{fmtCurrency(e.valor_efetivo)}</span>}
                </div>
              </div>
              {canEdit && (
                <button type="button" onClick={() => setDevolvendo(e)}
                        className="btn-ghost p-1.5 text-sky-500 shrink-0" title="Registrar devolução">
                  <Undo2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Texto original preservado da migração */}
      {textoLegado && (
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
            Ver o texto livre original (antes do módulo)
          </summary>
          <p className="mt-1.5 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 font-mono">
            {textoLegado}
          </p>
        </details>
      )}

      {alocando && (
        <ComodatoAlocarModal
          modo="alocar" clientId={clientId} clientNome={clientNome}
          onClose={() => setAlocando(false)} onSaved={load}
        />
      )}
      {devolvendo && (
        <ComodatoAlocarModal
          modo="devolver" equipamento={devolvendo}
          onClose={() => setDevolvendo(null)} onSaved={load}
        />
      )}
      {editContrato !== undefined && (
        <ComodatoContratoModal
          contrato={editContrato} clientId={clientId} clientNome={clientNome}
          onClose={() => setEditContrato(undefined)} onSaved={load}
        />
      )}
    </div>
  )
}
