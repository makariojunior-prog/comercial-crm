import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, AlertCircle, FileSignature, Search, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEscKey } from '../hooks/useEscKey'
import {
  COMODATO_CONTRATO_LABELS,
  type ComodatoContrato, type ComodatoContratoStatus,
} from '../types'

interface Props {
  contrato?: ComodatoContrato | null
  /** Pré-seleciona o cliente ao criar (usado a partir do cadastro do cliente). */
  clientId?: string | null
  clientNome?: string | null
  onClose: () => void
  onSaved: () => void
}

const RESPONSAVEIS = [
  { id: 'comodante',     label: 'Nós (comodante)' },
  { id: 'comodatario',   label: 'Cliente (comodatário)' },
  { id: 'compartilhado', label: 'Compartilhada' },
] as const

export default function ComodatoContratoModal({ contrato, clientId, clientNome, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const [clientes, setClientes] = useState<{ id: string; nome: string; rota: string | null }[]>([])
  const [buscaCli, setBuscaCli] = useState('')

  const [cliId, setCliId]         = useState(contrato?.client_id ?? clientId ?? '')
  const [numero, setNumero]       = useState(contrato?.numero ?? '')
  const [empresa, setEmpresa]     = useState<'lumar' | 'cantina'>(contrato?.empresa ?? 'lumar')
  const [status, setStatus]       = useState<ComodatoContratoStatus>(contrato?.status ?? 'vigente')
  const [assinado, setAssinado]   = useState(contrato?.contrato_assinado ?? false)
  const [dtAssin, setDtAssin]     = useState(contrato?.data_assinatura ?? '')
  const [dtInicio, setDtInicio]   = useState(contrato?.data_inicio ?? '')
  const [prazo, setPrazo]         = useState(contrato?.prazo_meses?.toString() ?? '')
  const [dtFim, setDtFim]         = useState(contrato?.data_fim ?? '')
  const [renovacao, setRenov]     = useState(contrato?.renovacao_automatica ?? false)
  const [contrapartida, setContr] = useState(contrato?.contrapartida ?? '')
  const [volume, setVolume]       = useState(contrato?.volume_minimo ?? '')
  const [respManut, setRespManut] = useState(contrato?.responsavel_manutencao ?? 'comodante')
  const [respInterno, setRespInt] = useState(contrato?.responsavel_interno ?? '')
  const [contato, setContato]     = useState(contrato?.contato_cliente ?? '')
  const [arquivo, setArquivo]     = useState(contrato?.arquivo_url ?? '')
  const [testemunhas, setTest]    = useState(contrato?.testemunhas ?? '')
  const [valorBens, setValorBens] = useState(contrato?.valor_total_bens?.toString() ?? '')
  const [observacoes, setObs]     = useState(contrato?.observacoes ?? '')

  useEffect(() => {
    if (contrato || clientId) return
    supabase.from('crm_clients').select('id, nome, rota').order('nome').limit(1000)
      .then(({ data }) => setClientes(data ?? []))
  }, [contrato, clientId])

  const clientesFiltrados = useMemo(() => {
    const q = buscaCli.trim().toUpperCase()
    const base = q ? clientes.filter(c => c.nome.toUpperCase().includes(q)) : clientes
    return base.slice(0, 50)
  }, [clientes, buscaCli])

  // prévia do vencimento — o banco recalcula na gravação
  const fimPrevisto = useMemo(() => {
    if (dtFim) return dtFim
    if (!dtInicio || !prazo) return ''
    const d = new Date(dtInicio)
    d.setMonth(d.getMonth() + parseInt(prazo, 10))
    return d.toISOString().slice(0, 10)
  }, [dtInicio, prazo, dtFim])

  async function save() {
    if (!cliId) return setError('Selecione o cliente')
    setSaving(true); setError(null)

    const payload = {
      client_id: cliId,
      numero: numero.trim() || null,
      empresa,
      status,
      contrato_assinado: assinado,
      data_assinatura: dtAssin || null,
      data_inicio: dtInicio || null,
      prazo_meses: prazo ? parseInt(prazo, 10) : null,
      data_fim: dtFim || null,
      renovacao_automatica: renovacao,
      contrapartida: contrapartida.trim() || null,
      volume_minimo: volume.trim() || null,
      responsavel_manutencao: respManut,
      responsavel_interno: respInterno.trim() || null,
      contato_cliente: contato.trim() || null,
      arquivo_url: arquivo.trim() || null,
      testemunhas: testemunhas.trim() || null,
      valor_total_bens: valorBens ? Number(valorBens.replace(',', '.')) : null,
      observacoes: observacoes.trim() || null,
    }

    const { error: err } = contrato?.id
      ? await supabase.from('comodato_contratos').update(payload).eq('id', contrato.id)
      : await supabase.from('comodato_contratos').insert(payload)

    setSaving(false)
    if (err) return setError(err.message)
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileSignature size={18} className="text-orange-500" />
            {contrato ? 'Editar Contrato' : 'Novo Contrato de Comodato'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Cliente */}
          {contrato || clientId ? (
            <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 px-3 py-2.5">
              <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest">Comodatário</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {contrato?.client?.nome ?? clientNome ?? '—'}
              </p>
            </div>
          ) : (
            <div>
              <label className="label">Cliente (comodatário)</label>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar cliente…" value={buscaCli} onChange={e => setBuscaCli(e.target.value)} />
              </div>
              {/* Lista de botões em vez de <select size>: o React pré-seleciona visualmente a 1ª
                  option quando o value não bate, e clicar nela não dispara onChange (cliId ficava vazio). */}
              <div className="input h-32 overflow-y-auto p-1 space-y-0.5" role="listbox" aria-label="Clientes">
                {clientesFiltrados.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-slate-400">Nenhum cliente encontrado</p>
                )}
                {clientesFiltrados.map(c => (
                  <button key={c.id} type="button" role="option" aria-selected={c.id === cliId}
                    onClick={() => { setCliId(c.id); setError(null) }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      c.id === cliId
                        ? 'bg-orange-500 text-white font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}>
                    {c.nome}{c.rota ? ` — ${c.rota}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Situação
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nº do contrato</label>
                <input className="input" value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex: CMD-2026-014" />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={status} onChange={e => setStatus(e.target.value as ComodatoContratoStatus)}>
                  {(Object.keys(COMODATO_CONTRATO_LABELS) as ComodatoContratoStatus[]).map(k => (
                    <option key={k} value={k}>{COMODATO_CONTRATO_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Contrato assinado</span>
                <p className="text-xs text-slate-400 mt-0.5">Sem assinatura não há segurança jurídica sobre o bem</p>
              </div>
              <button type="button" onClick={() => setAssinado(v => !v)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${assinado ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>
                {assinado ? 'Sim' : 'Não'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Empresa (comodante)</label>
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
                <label className="label">Data de assinatura</label>
                <input className="input" type="date" value={dtAssin} onChange={e => setDtAssin(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Vigência
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Início</label>
                <input className="input" type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} />
              </div>
              <div>
                <label className="label">Prazo (meses)</label>
                <input className="input" type="number" min="1" value={prazo} onChange={e => setPrazo(e.target.value)} placeholder="12" />
              </div>
              <div>
                <label className="label">Vencimento</label>
                <input className="input" type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} />
              </div>
            </div>
            {!dtFim && fimPrevisto && (
              <p className="text-[11px] text-slate-400">
                Vencimento calculado automaticamente: {new Date(fimPrevisto).toLocaleDateString('pt-BR')}
              </p>
            )}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Renovação automática</span>
              <button type="button" onClick={() => setRenov(v => !v)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${renovacao ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                {renovacao ? 'Sim' : 'Não'}
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Contrapartida e responsabilidades
            </h3>
            <div>
              <label className="label">Contrapartida comercial</label>
              <input className="input" value={contrapartida} onChange={e => setContr(e.target.value)}
                     placeholder="Ex: exclusividade de exposição dos produtos Lumar" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Volume mínimo</label>
                <input className="input" value={volume} onChange={e => setVolume(e.target.value)} placeholder="Ex: 40 cx/mês" />
              </div>
              <div>
                <label className="label">Manutenção por conta de</label>
                <select className="input" value={respManut} onChange={e => setRespManut(e.target.value as any)}>
                  {RESPONSAVEIS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Responsável interno</label>
                <input className="input" value={respInterno} onChange={e => setRespInt(e.target.value)} />
              </div>
              <div>
                <label className="label">Contato no cliente</label>
                <input className="input" value={contato} onChange={e => setContato(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-700 pb-1">
              Documentos
            </h3>
            <div>
              <label className="label">Link do contrato assinado (PDF)</label>
              <div className="flex gap-2">
                <input className="input" value={arquivo} onChange={e => setArquivo(e.target.value)}
                       placeholder="https://drive.google.com/…" />
                {arquivo && (
                  <a href={arquivo} target="_blank" rel="noreferrer" className="btn-secondary px-3 shrink-0">
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Testemunhas</label>
                <input className="input" value={testemunhas} onChange={e => setTest(e.target.value)} />
              </div>
              <div>
                <label className="label">Valor total dos bens (R$)</label>
                <input className="input" type="number" step="0.01" value={valorBens} onChange={e => setValorBens(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea className="input min-h-[60px]" value={observacoes} onChange={e => setObs(e.target.value)} />
            </div>
          </section>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : 'Salvar Contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}
