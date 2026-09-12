import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, AlertCircle, ArrowRightLeft, Undo2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import { alocarEquipamento, devolverEquipamento, contratoVigenteDoCliente, CATEGORIA_LABELS } from '../lib/comodato'
import {
  COMODATO_ESTADO_LABELS,
  type ComodatoEquipamentoView, type ComodatoEstado,
} from '../types'

type Modo = 'alocar' | 'devolver'

interface Props {
  modo: Modo
  /** Em 'alocar': unidade já escolhida (opcional — senão o modal deixa escolher). */
  equipamento?: ComodatoEquipamentoView | null
  /** Em 'alocar': cliente já fixado (usado quando abre do cadastro do cliente). */
  clientId?: string | null
  clientNome?: string | null
  onClose: () => void
  onSaved: () => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function ComodatoAlocarModal({ modo, equipamento, clientId, clientNome, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // seleção de unidade (quando não veio pronta)
  const [disponiveis, setDisponiveis] = useState<ComodatoEquipamentoView[]>([])
  const [equipId, setEquipId]   = useState(equipamento?.id ?? '')
  const [buscaEquip, setBusca]  = useState('')

  // seleção de cliente (quando não veio pronto)
  const [clientes, setClientes] = useState<{ id: string; nome: string; rota: string | null }[]>([])
  const [cliId, setCliId]       = useState(clientId ?? '')
  const [buscaCli, setBuscaCli] = useState('')

  const [data, setData]           = useState(hoje())
  const [estadoMov, setEstadoMov] = useState<ComodatoEstado>(equipamento?.estado_conservacao ?? 'bom')
  const [nf, setNf]               = useState('')
  const [responsavel, setResp]    = useState('')
  const [recebidoPor, setReceb]   = useState('')
  const [motivo, setMotivo]       = useState('')
  const [observacoes, setObs]     = useState('')

  useEffect(() => {
    if (modo !== 'alocar') return
    if (!equipamento) {
      supabase.from('comodato_equipamentos_view')
        .select('*').eq('situacao', 'disponivel').eq('ativo', true)
        .order('codigo_patrimonio')
        .then(({ data }) => setDisponiveis((data ?? []) as ComodatoEquipamentoView[]))
    }
    if (!clientId) {
      supabase.from('crm_clients').select('id, nome, rota').order('nome').limit(1000)
        .then(({ data }) => setClientes(data ?? []))
    }
  }, [modo, equipamento, clientId])

  const equipsFiltrados = useMemo(() => {
    const q = buscaEquip.trim().toUpperCase()
    if (!q) return disponiveis.slice(0, 50)
    return disponiveis.filter(e =>
      e.codigo_patrimonio.includes(q) || (e.modelo_nome ?? '').toUpperCase().includes(q)
    ).slice(0, 50)
  }, [disponiveis, buscaEquip])

  const clientesFiltrados = useMemo(() => {
    const q = buscaCli.trim().toUpperCase()
    if (!q) return clientes.slice(0, 50)
    return clientes.filter(c => c.nome.toUpperCase().includes(q)).slice(0, 50)
  }, [clientes, buscaCli])

  async function save() {
    setError(null)
    if (modo === 'alocar') {
      if (!equipId) return setError('Escolha o equipamento')
      if (!cliId)   return setError('Escolha o cliente')
    } else if (!equipamento?.alocacao_id) {
      return setError('Este equipamento não tem alocação ativa para devolver.')
    }

    setSaving(true)
    try {
      if (modo === 'alocar') {
        const contratoId = await contratoVigenteDoCliente(cliId)
        await alocarEquipamento({
          equipamentoId: equipId,
          clientId: cliId,
          contratoId,
          dataEntrega: data,
          estadoEntrega: COMODATO_ESTADO_LABELS[estadoMov],
          nfRemessa: nf.trim() || null,
          responsavelEntrega: responsavel.trim() || null,
          recebidoPor: recebidoPor.trim() || null,
          observacoes: observacoes.trim() || null,
        })
      } else {
        await devolverEquipamento({
          alocacaoId: equipamento!.alocacao_id!,
          equipamentoId: equipamento!.id,
          dataRetirada: data,
          estadoDevolucao: COMODATO_ESTADO_LABELS[estadoMov],
          novoEstadoConservacao: estadoMov,
          nfRetorno: nf.trim() || null,
          motivoRetirada: motivo.trim() || null,
          observacoes: observacoes.trim() || null,
        })
      }
      onSaved(); onClose()
    } catch (e: any) {
      setError(e?.code === '23505'
        ? 'Este equipamento já possui uma alocação ativa. Faça a devolução antes de alocar em outro cliente.'
        : (e?.message ?? 'Erro ao salvar'))
    }
    setSaving(false)
  }

  const isAlocar = modo === 'alocar'

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            {isAlocar
              ? <><ArrowRightLeft size={18} className="text-orange-500" /> Alocar Equipamento</>
              : <><Undo2 size={18} className="text-sky-500" /> Registrar Devolução</>}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Equipamento */}
          {equipamento ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 px-3 py-2.5">
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{equipamento.codigo_patrimonio}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {equipamento.modelo_nome ?? '—'}
                {equipamento.categoria ? ` · ${CATEGORIA_LABELS[equipamento.categoria] ?? equipamento.categoria}` : ''}
              </p>
              {!isAlocar && equipamento.client_nome && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Hoje em: {equipamento.client_nome}</p>
              )}
            </div>
          ) : (
            <div>
              <label className="label">Equipamento disponível</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar por patrimônio ou modelo…"
                       value={buscaEquip} onChange={e => setBusca(e.target.value)} />
              </div>
              <select className="input" size={5} value={equipId} onChange={e => setEquipId(e.target.value)}>
                {equipsFiltrados.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.codigo_patrimonio} — {e.modelo_nome ?? 'sem modelo'}
                  </option>
                ))}
              </select>
              {disponiveis.length === 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  Nenhuma unidade disponível no depósito. Cadastre um equipamento ou registre uma devolução.
                </p>
              )}
            </div>
          )}

          {/* Cliente (só ao alocar) */}
          {isAlocar && (
            clientId ? (
              <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest">Cliente</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{clientNome ?? '—'}</p>
              </div>
            ) : (
              <div>
                <label className="label">Cliente</label>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" placeholder="Buscar cliente…"
                         value={buscaCli} onChange={e => setBuscaCli(e.target.value)} />
                </div>
                <select className="input" size={5} value={cliId} onChange={e => setCliId(e.target.value)}>
                  {clientesFiltrados.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}{c.rota ? ` — ${c.rota}` : ''}</option>
                  ))}
                </select>
              </div>
            )
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{isAlocar ? 'Data de entrega' : 'Data de retirada'}</label>
              <input className="input" type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div>
              <label className="label">Estado do equipamento</label>
              <select className="input" value={estadoMov} onChange={e => setEstadoMov(e.target.value as ComodatoEstado)}>
                {(Object.keys(COMODATO_ESTADO_LABELS) as ComodatoEstado[]).map(k => (
                  <option key={k} value={k}>{COMODATO_ESTADO_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{isAlocar ? 'NF de remessa (CFOP 5908)' : 'NF de retorno (CFOP 5909)'}</label>
              <input className="input" value={nf} onChange={e => setNf(e.target.value)} placeholder="Nº da nota" />
            </div>
            {isAlocar ? (
              <div>
                <label className="label">Entregue por</label>
                <input className="input" value={responsavel} onChange={e => setResp(e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="label">Motivo da retirada</label>
                <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)}
                       placeholder="Ex: cliente inativo, troca, defeito" />
              </div>
            )}
          </div>

          {isAlocar && (
            <div>
              <label className="label">Recebido por (no cliente)</label>
              <input className="input" value={recebidoPor} onChange={e => setReceb(e.target.value)} />
            </div>
          )}

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px]" value={observacoes} onChange={e => setObs(e.target.value)} />
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isAlocar
              ? 'A alocação entra no histórico do equipamento e o cadastro do cliente é atualizado automaticamente. Se o cliente já tiver contrato, ele é vinculado.'
              : 'A devolução encerra a alocação sem apagar o histórico. A unidade volta para “Disponível” e sai do cadastro do cliente.'}
          </p>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || (isAlocar && (!equipId || !cliId))}
                  className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : isAlocar ? 'Alocar' : 'Confirmar devolução'}
          </button>
        </div>
      </div>
    </div>
  )
}
