import { useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, Wrench, Info, FileSignature, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import { fmtDate } from '../lib/format'
import {
  COMODATO_ESTADO_LABELS, COMODATO_SITUACAO_LABELS, COMODATO_CONTRATO_LABELS,
  type ComodatoContratoStatus,
  type ComodatoEquipamentoView, type ComodatoModelo, type ComodatoEstado,
} from '../types'
import { CATEGORIA_LABELS } from '../lib/comodato'

interface Props {
  equipamento?: ComodatoEquipamentoView | null
  onClose: () => void
  onSaved: () => void
}

interface VinculoContrato {
  data_entrega: string
  contrato: {
    id: string; numero: string | null; status: ComodatoContratoStatus
    contrato_assinado: boolean; data_fim: string | null
  } | null
  aditivo: { numero: string | null; data_aditivo: string } | null
  client: { nome: string } | null
}

export default function ComodatoEquipamentoModal({ equipamento, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [modelos, setModelos] = useState<ComodatoModelo[]>([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [codigo, setCodigo]         = useState(equipamento?.codigo_patrimonio ?? '')
  const [modeloId, setModeloId]     = useState(equipamento?.modelo_id ?? '')
  const [serie, setSerie]           = useState(equipamento?.numero_serie ?? '')
  const [empresa, setEmpresa]       = useState<'lumar' | 'cantina'>(equipamento?.empresa ?? 'lumar')
  const [estado, setEstado]         = useState<ComodatoEstado>(equipamento?.estado_conservacao ?? 'bom')
  const [valor, setValor]           = useState(equipamento?.valor_aquisicao?.toString() ?? '')
  const [dataAq, setDataAq]         = useState(equipamento?.data_aquisicao ?? '')
  const [nf, setNf]                 = useState(equipamento?.nota_fiscal_compra ?? '')
  const [fornecedor, setFornecedor] = useState(equipamento?.fornecedor ?? '')
  const [intervalo, setIntervalo]   = useState(equipamento?.manutencao_intervalo_meses?.toString() ?? '')
  const [ultimaManut, setUltima]    = useState(equipamento?.ultima_manutencao ?? '')
  const [conferencia, setConf]      = useState(equipamento?.ultima_conferencia ?? '')
  const [observacoes, setObs]       = useState(equipamento?.observacoes ?? '')
  const [revisar, setRevisar]       = useState(equipamento?.revisar ?? false)
  const [ativo, setAtivo]           = useState(equipamento?.ativo ?? true)

  // contrato ao qual o equipamento está vinculado hoje (via alocação ativa)
  const [vinculo, setVinculo] = useState<VinculoContrato | null>(null)
  const [vinculoCarregado, setVinculoCarregado] = useState(!equipamento?.alocacao_id)

  useEffect(() => {
    if (!equipamento?.alocacao_id) return
    supabase.from('comodato_alocacoes')
      .select(`data_entrega,
               contrato:comodato_contratos(id, numero, status, contrato_assinado, data_fim),
               aditivo:comodato_contrato_aditivos(numero, data_aditivo),
               client:crm_clients(nome)`)
      .eq('id', equipamento.alocacao_id).maybeSingle()
      .then(({ data }) => { setVinculo((data as unknown as VinculoContrato) ?? null); setVinculoCarregado(true) })
  }, [equipamento?.alocacao_id])

  useEffect(() => {
    supabase.from('comodato_modelos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => setModelos((data ?? []) as ComodatoModelo[]))
  }, [])

  const modeloSel = modelos.find(m => m.id === modeloId)

  async function save() {
    if (!modeloId) return setError('Selecione o modelo do equipamento')
    setSaving(true); setError(null)

    const payload: Record<string, any> = {
      modelo_id: modeloId,
      numero_serie: serie.trim() || null,
      empresa,
      estado_conservacao: estado,
      valor_aquisicao: valor ? Number(valor.replace(',', '.')) : null,
      data_aquisicao: dataAq || null,
      nota_fiscal_compra: nf.trim() || null,
      fornecedor: fornecedor.trim() || null,
      manutencao_intervalo_meses: intervalo ? parseInt(intervalo, 10) : null,
      ultima_manutencao: ultimaManut || null,
      ultima_conferencia: conferencia || null,
      observacoes: observacoes.trim() || null,
      revisar,
      ativo,
    }
    // código em branco = o banco gera (FRZ-0001, ARM-0002…)
    if (codigo.trim()) payload.codigo_patrimonio = codigo.trim().toUpperCase()

    // recalcula a próxima preventiva quando há intervalo e última manutenção
    if (payload.manutencao_intervalo_meses && payload.ultima_manutencao) {
      const d = new Date(payload.ultima_manutencao)
      d.setMonth(d.getMonth() + payload.manutencao_intervalo_meses)
      payload.proxima_manutencao = d.toISOString().slice(0, 10)
    }

    const { error: err } = equipamento?.id
      ? await supabase.from('comodato_equipamentos').update(payload).eq('id', equipamento.id)
      : await supabase.from('comodato_equipamentos').insert(payload)

    setSaving(false)
    if (err) {
      setError(err.code === '23505' ? 'Já existe um equipamento com esse código de patrimônio.' : err.message)
      return
    }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">
              {equipamento ? `Equipamento ${equipamento.codigo_patrimonio}` : 'Novo Equipamento'}
            </h2>
            {equipamento && (
              <p className="text-xs text-slate-500 mt-0.5">
                {COMODATO_SITUACAO_LABELS[equipamento.situacao]}
                {equipamento.client_nome ? ` · ${equipamento.client_nome}` : ''}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {equipamento?.revisar && (
            <div className="flex gap-2 items-start bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Unidade criada pela importação do campo livre. Confira número de série, valor e estado,
                depois desmarque “Pendente de revisão”.
              </span>
            </div>
          )}

          {equipamento && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
                Contrato vinculado
              </h3>
              {!vinculoCarregado ? (
                <p className="text-xs text-slate-400">Carregando…</p>
              ) : vinculo?.contrato ? (
                <div className="rounded-xl border border-orange-100 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 px-3 py-2.5 flex items-start gap-2.5">
                  <FileSignature size={16} className="text-orange-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                      {vinculo.contrato.numero ? `Contrato ${vinculo.contrato.numero}` : 'Contrato sem número'}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {COMODATO_CONTRATO_LABELS[vinculo.contrato.status]}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        vinculo.contrato.contrato_assinado
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                        {vinculo.contrato.contrato_assinado ? 'Assinado' : 'Não assinado'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {vinculo.client?.nome ? `${vinculo.client.nome} · ` : ''}
                      incluído em {fmtDate(vinculo.data_entrega)}
                      {' · '}{vinculo.aditivo ? `aditivo ${vinculo.aditivo.numero ?? fmtDate(vinculo.aditivo.data_aditivo)}` : 'contrato original'}
                      {vinculo.contrato.data_fim ? ` · vence ${fmtDate(vinculo.contrato.data_fim)}` : ''}
                    </p>
                  </div>
                </div>
              ) : equipamento.alocacao_id ? (
                <div className="flex gap-2 items-start rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    Em comodato{vinculo?.client?.nome ? ` com ${vinculo.client.nome}` : ''}, <b>sem contrato vinculado</b>.
                    Abra o contrato do cliente e use “Vincular equipamento”.
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-600 px-3 py-2.5">
                  Sem contrato — o equipamento não está alocado a nenhum cliente.
                </p>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Identificação
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Código de patrimônio</label>
                <input className="input font-mono" value={codigo} onChange={e => setCodigo(e.target.value)}
                       placeholder={equipamento ? '' : 'Deixe vazio para gerar'} />
              </div>
              <div>
                <label className="label">Nº de série</label>
                <input className="input font-mono" value={serie} onChange={e => setSerie(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Modelo</label>
              <select className="input" value={modeloId} onChange={e => setModeloId(e.target.value)}>
                <option value="">Selecione…</option>
                {modelos.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nome} — {CATEGORIA_LABELS[m.categoria] ?? m.categoria}
                  </option>
                ))}
              </select>
              {modeloSel?.manutencao_intervalo_meses && !intervalo && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Preventiva padrão do modelo: a cada {modeloSel.manutencao_intervalo_meses} meses.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Empresa</label>
                <div className="flex gap-2">
                  {(['lumar', 'cantina'] as const).map(e => (
                    <button key={e} type="button" onClick={() => setEmpresa(e)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                        empresa === e
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                      }`}>
                      {e === 'lumar' ? 'Lumar' : 'Cantina'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Estado de conservação</label>
                <select className="input" value={estado} onChange={e => setEstado(e.target.value as ComodatoEstado)}>
                  {(Object.keys(COMODATO_ESTADO_LABELS) as ComodatoEstado[]).map(k => (
                    <option key={k} value={k}>{COMODATO_ESTADO_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Aquisição
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Valor de aquisição (R$)</label>
                <input className="input" type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div>
                <label className="label">Data de aquisição</label>
                <input className="input" type="date" value={dataAq} onChange={e => setDataAq(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nota fiscal de compra</label>
                <input className="input" value={nf} onChange={e => setNf(e.target.value)} />
              </div>
              <div>
                <label className="label">Fornecedor</label>
                <input className="input" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Manutenção e conferência
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Preventiva (meses)</label>
                <input className="input" type="number" min="1" value={intervalo} onChange={e => setIntervalo(e.target.value)} />
              </div>
              <div>
                <label className="label">Última manutenção</label>
                <input className="input" type="date" value={ultimaManut} onChange={e => setUltima(e.target.value)} />
              </div>
              <div>
                <label className="label">Última conferência</label>
                <input className="input" type="date" value={conferencia} onChange={e => setConf(e.target.value)} />
              </div>
            </div>
            {equipamento?.proxima_manutencao && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Wrench size={11} /> Próxima preventiva atual: {new Date(equipamento.proxima_manutencao).toLocaleDateString('pt-BR')}
              </p>
            )}
          </section>

          <div>
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px]" value={observacoes} onChange={e => setObs(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pendente de revisão</span>
                <p className="text-xs text-slate-400 mt-0.5">Marca a unidade na fila de conferência do módulo</p>
              </div>
              <button type="button" onClick={() => setRevisar(v => !v)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${revisar ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                {revisar ? 'Sim' : 'Não'}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Unidade ativa</span>
              <button type="button" onClick={() => setAtivo(v => !v)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${ativo ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                {ativo ? 'Sim' : 'Não'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
