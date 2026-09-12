import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, AlertCircle, Wrench, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import {
  COMODATO_MANUT_TIPO_LABELS, COMODATO_MANUT_STATUS_LABELS, COMODATO_PRIORIDADE_LABELS,
  type ComodatoManutencao, type ComodatoManutTipo, type ComodatoManutStatus,
  type ComodatoPrioridade, type ComodatoEquipamentoView,
} from '../types'

interface Props {
  manutencao?: ComodatoManutencao | null
  /** Pré-seleciona a unidade ao abrir a OS a partir da lista de equipamentos. */
  equipamento?: ComodatoEquipamentoView | null
  onClose: () => void
  onSaved: () => void
}

const hoje = () => new Date().toISOString().slice(0, 10)

export default function ComodatoManutencaoModal({ manutencao, equipamento, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [equipamentos, setEquipamentos] = useState<ComodatoEquipamentoView[]>([])
  const [busca, setBusca] = useState('')

  const [equipId, setEquipId]   = useState(manutencao?.equipamento_id ?? equipamento?.id ?? '')
  const [tipo, setTipo]         = useState<ComodatoManutTipo>(manutencao?.tipo ?? 'corretiva')
  const [status, setStatus]     = useState<ComodatoManutStatus>(manutencao?.status ?? 'aberta')
  const [prioridade, setPrior]  = useState<ComodatoPrioridade>(manutencao?.prioridade ?? 'media')
  const [descricao, setDesc]    = useState(manutencao?.descricao ?? '')
  const [solucao, setSolucao]   = useState(manutencao?.solucao ?? '')
  const [dtAbertura, setDtAb]   = useState(manutencao?.data_abertura ?? hoje())
  const [dtAgendada, setDtAg]   = useState(manutencao?.data_agendada ?? '')
  const [dtConclusao, setDtCon] = useState(manutencao?.data_conclusao ?? '')
  const [custo, setCusto]       = useState(manutencao?.custo?.toString() ?? '')
  const [tecnico, setTecnico]   = useState(manutencao?.tecnico ?? '')
  const [fornecedor, setForn]   = useState(manutencao?.fornecedor ?? '')
  const [observacoes, setObs]   = useState(manutencao?.observacoes ?? '')

  useEffect(() => {
    if (manutencao || equipamento) return
    supabase.from('comodato_equipamentos_view').select('*').eq('ativo', true).order('codigo_patrimonio')
      .then(({ data }) => setEquipamentos((data ?? []) as ComodatoEquipamentoView[]))
  }, [manutencao, equipamento])

  const filtrados = useMemo(() => {
    const q = busca.trim().toUpperCase()
    const base = q
      ? equipamentos.filter(e =>
          e.codigo_patrimonio.includes(q) ||
          (e.modelo_nome ?? '').toUpperCase().includes(q) ||
          (e.client_nome ?? '').toUpperCase().includes(q))
      : equipamentos
    return base.slice(0, 50)
  }, [equipamentos, busca])

  // concluir sem data preenchida assume hoje
  useEffect(() => {
    if (status === 'concluida' && !dtConclusao) setDtCon(hoje())
  }, [status])

  async function save() {
    if (!equipId) return setError('Selecione o equipamento')
    if (!descricao.trim()) return setError('Descreva o serviço ou o problema')
    setSaving(true); setError(null)

    // o cliente vem da alocação ativa da unidade — a OS fica ligada ao ponto de venda
    let clientId: string | null = manutencao?.client_id ?? null
    let alocacaoId: string | null = manutencao?.alocacao_id ?? null
    if (!manutencao) {
      const { data: eq } = await supabase
        .from('comodato_equipamentos').select('client_id, alocacao_id').eq('id', equipId).maybeSingle()
      clientId   = eq?.client_id ?? null
      alocacaoId = eq?.alocacao_id ?? null
    }

    const payload = {
      equipamento_id: equipId,
      alocacao_id: alocacaoId,
      client_id: clientId,
      tipo, status, prioridade,
      descricao: descricao.trim(),
      solucao: solucao.trim() || null,
      data_abertura: dtAbertura || hoje(),
      data_agendada: dtAgendada || null,
      data_conclusao: status === 'concluida' ? (dtConclusao || hoje()) : (dtConclusao || null),
      custo: custo ? Number(custo.replace(',', '.')) : null,
      tecnico: tecnico.trim() || null,
      fornecedor: fornecedor.trim() || null,
      observacoes: observacoes.trim() || null,
    }

    const { error: err } = manutencao?.id
      ? await supabase.from('comodato_manutencoes').update(payload).eq('id', manutencao.id)
      : await supabase.from('comodato_manutencoes').insert(payload)

    setSaving(false)
    if (err) return setError(err.message)
    onSaved(); onClose()
  }

  const equipFixo = equipamento ?? null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Wrench size={18} className="text-orange-500" />
            {manutencao ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {equipFixo || manutencao ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 px-3 py-2.5">
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                {equipFixo?.codigo_patrimonio ?? manutencao?.equipamento?.codigo_patrimonio ?? '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {equipFixo?.modelo_nome ?? ''}
                {equipFixo?.client_nome ? ` · ${equipFixo.client_nome}` : ''}
                {manutencao?.client?.nome ? ` · ${manutencao.client.nome}` : ''}
              </p>
            </div>
          ) : (
            <div>
              <label className="label">Equipamento</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar por patrimônio, modelo ou cliente…"
                       value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <select className="input" size={5} value={equipId} onChange={e => setEquipId(e.target.value)}>
                {filtrados.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.codigo_patrimonio} — {e.modelo_nome ?? 'sem modelo'}{e.client_nome ? ` (${e.client_nome})` : ' (depósito)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={tipo} onChange={e => setTipo(e.target.value as ComodatoManutTipo)}>
                {(Object.keys(COMODATO_MANUT_TIPO_LABELS) as ComodatoManutTipo[]).map(k => (
                  <option key={k} value={k}>{COMODATO_MANUT_TIPO_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value as ComodatoManutStatus)}>
                {(Object.keys(COMODATO_MANUT_STATUS_LABELS) as ComodatoManutStatus[]).map(k => (
                  <option key={k} value={k}>{COMODATO_MANUT_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={prioridade} onChange={e => setPrior(e.target.value as ComodatoPrioridade)}>
                {(Object.keys(COMODATO_PRIORIDADE_LABELS) as ComodatoPrioridade[]).map(k => (
                  <option key={k} value={k}>{COMODATO_PRIORIDADE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Problema / serviço</label>
            <textarea className="input min-h-[70px]" value={descricao} onChange={e => setDesc(e.target.value)}
                      placeholder="Ex: freezer não gela, cliente relata ruído no compressor" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Abertura</label>
              <input className="input" type="date" value={dtAbertura} onChange={e => setDtAb(e.target.value)} />
            </div>
            <div>
              <label className="label">Agendada para</label>
              <input className="input" type="date" value={dtAgendada} onChange={e => setDtAg(e.target.value)} />
            </div>
            <div>
              <label className="label">Conclusão</label>
              <input className="input" type="date" value={dtConclusao} onChange={e => setDtCon(e.target.value)} />
            </div>
          </div>

          {(status === 'concluida' || solucao) && (
            <div>
              <label className="label">Solução aplicada</label>
              <textarea className="input min-h-[60px]" value={solucao} onChange={e => setSolucao(e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Custo (R$)</label>
              <input className="input" type="number" step="0.01" value={custo} onChange={e => setCusto(e.target.value)} />
            </div>
            <div>
              <label className="label">Técnico</label>
              <input className="input" value={tecnico} onChange={e => setTecnico(e.target.value)} />
            </div>
            <div>
              <label className="label">Fornecedor</label>
              <input className="input" value={fornecedor} onChange={e => setForn(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px]" value={observacoes} onChange={e => setObs(e.target.value)} />
          </div>

          {tipo === 'preventiva' && (
            <p className="text-[11px] text-slate-400">
              Ao concluir uma preventiva, a próxima é recalculada automaticamente a partir da data de conclusão,
              usando o intervalo configurado na unidade.
            </p>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : 'Salvar OS'}
          </button>
        </div>
      </div>
    </div>
  )
}
