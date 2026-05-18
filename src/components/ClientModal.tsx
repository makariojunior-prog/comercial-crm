import { useState, useCallback, useEffect } from 'react'
import { X, User, Phone, MapPin, Building2, MessageSquare, Save, AlertCircle, CheckCircle2, AlertTriangle, UserX, Briefcase, Package, Wrench, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Client, ClientStatus } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface ClientModalProps {
  client?: Client | null
  onClose: () => void
  onSaved: () => void
}

const MANUTENCOES = ['MENSAL', 'SEMANAL', 'INATIVO'] as const
const FREQUENCIAS = ['1X', '2X', '3X', '4X', '5X'] as const
const TIPOS       = ['LUMAR', 'LUMAR REVENDA', 'CANTINA REVENDA', 'LUMAR / CANTINA'] as const
const DIAS_SEMANA = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'] as const

export default function ClientModal({ client, onClose, onSaved }: ClientModalProps) {
  useEscKey(useCallback(onClose, [onClose]))
  const [nome, setNome]               = useState(client?.nome ?? '')
  const [telefone, setTelefone]       = useState(client?.telefone ?? '')
  const [cnpj_cpf, setCnpjCpf]       = useState(client?.cnpj_cpf ?? '')
  const [rota, setRota]               = useState(client?.rota ?? '')
  const [setor, setSetor]             = useState(client?.setor ?? '')
  const [pgto, setPgto]               = useState(client?.pgto ?? '')
  const [localizacao, setLocalizacao] = useState(client?.localizacao ?? '')
  const [diasEntrega, setDiasEntrega] = useState<string[]>(
    (client?.dia_entrega ?? '').split(',').map(d => d.trim()).filter(Boolean)
  )
  const [observacoes, setObservacoes] = useState(client?.observacoes ?? '')
  const [tipo, setTipo]               = useState(client?.tipo ?? '')
  const [status, setStatus]           = useState<ClientStatus>(client?.status ?? 'ATIVO')

  // Campos antes ausentes do modal
  const [carteira, setCarteira]       = useState(client?.carteira ?? '')
  const [manutencao, setManutencao]   = useState(client?.manutencao ?? '')
  const [frequencia, setFrequencia]   = useState(client?.frequencia ?? '')
  const [mensagem, setMensagem]       = useState(client?.mensagem ?? 'NÃO')
  const [restricao, setRestricao]     = useState(client?.restricao ?? '')
  const [comodato, setComodato]       = useState(client?.comodato ?? '')
  const [valor, setValor]             = useState(client?.valor ?? '')

  const [carteirasOptions, setCarteirasOptions] = useState<string[]>([])
  const [pgtoOptions, setPgtoOptions]           = useState<string[]>([])

  useEffect(() => {
    supabase.from('crm_carteiras').select('nome').eq('ativo', true).order('nome')
      .then(({ data }) => setCarteirasOptions((data ?? []).map(c => c.nome)))
    supabase.from('crm_pgto_opcoes').select('nome').eq('ativo', true).order('ordem')
      .then(({ data }) => setPgtoOptions((data ?? []).map(p => p.nome)))
  }, [])

  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function save() {
    if (!nome.trim()) return setError('Nome é obrigatório')

    setSaving(true)
    setError(null)

    const clientData = {
      nome:          nome.trim().toUpperCase(),
      telefone:      telefone.trim() || null,
      cnpj_cpf:      cnpj_cpf.trim() || null,
      rota:          rota.trim() || null,
      setor:         setor.trim() || null,
      pgto:          pgto.trim() || null,
      localizacao:   localizacao.trim() || null,
      dia_entrega:   diasEntrega.length ? diasEntrega.join(', ') : null,
      observacoes:   observacoes.trim() || null,
      tipo:          tipo.trim() || null,
      status,
      carteira:      carteira || null,
      manutencao:    manutencao || null,
      frequencia:    frequencia || null,
      mensagem:      mensagem || null,
      restricao:     restricao.trim() || null,
      comodato:      comodato.trim() || null,
      valor:         valor.trim() || null,
    }

    try {
      if (client?.id) {
        const { error: err } = await supabase.from('crm_clients').update(clientData).eq('id', client.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('crm_clients').insert({ ...clientData, pedidos_count: 0 })
        if (err) throw err
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <User size={18} className="text-orange-500" />
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Identificação ─────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Identificação
            </h3>
            <div className="sm:col-span-2">
              <label className="label text-xs font-black uppercase text-slate-400">Nome do Cliente</label>
              <input className="input font-bold" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: JOÃO DA SILVA" autoFocus />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">CPF / CNPJ</label>
                <input className="input" value={cnpj_cpf} onChange={e => setCnpjCpf(e.target.value)} placeholder="00.000..." />
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">WhatsApp / Telefone</label>
                <input className="input" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(62) 9..." />
              </div>
            </div>

            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Situação do Cliente</label>
              <div className="flex gap-2">
                <button onClick={() => setStatus('ATIVO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'ATIVO' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                  <CheckCircle2 size={16} /> ATIVO
                </button>
                <button onClick={() => setStatus('PERDENDO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'PERDENDO' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                  <AlertTriangle size={16} /> PERDENDO
                </button>
                <button onClick={() => setStatus('PERDIDO')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 transition-all ${status === 'PERDIDO' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                  <UserX size={16} /> PERDIDO
                </button>
              </div>
            </div>
          </section>

          {/* ── Comercial ──────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Informações Comerciais
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Tipo (Lumar / Cantina)</label>
                <select className="input" value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Carteira (Vendedor)</label>
                <select className="input" value={carteira} onChange={e => setCarteira(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {carteira && !carteirasOptions.includes(carteira) && (
                    <option value={carteira}>{carteira}</option>
                  )}
                  {carteirasOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Forma de Pagamento</label>
                <select className="input" value={pgto} onChange={e => setPgto(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {pgto && !pgtoOptions.includes(pgto) && (
                    <option value={pgto}>{pgto}</option>
                  )}
                  {pgtoOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Manutenção</label>
                <select className="input" value={manutencao} onChange={e => setManutencao(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {MANUTENCOES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Frequência</label>
                <select className="input" value={frequencia} onChange={e => setFrequencia(e.target.value)}>
                  <option value="">Selecionar...</option>
                  {FREQUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Dias de Entrega</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {DIAS_SEMANA.map(dia => {
                    const sel = diasEntrega.includes(dia)
                    return (
                      <button
                        key={dia}
                        type="button"
                        onClick={() => setDiasEntrega(prev =>
                          sel ? prev.filter(d => d !== dia) : [...prev, dia]
                        )}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border-2 transition-all ${
                          sel
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-orange-300'
                        }`}
                      >
                        {dia.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
                {diasEntrega.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">{diasEntrega.join(', ')}</p>
                )}
              </div>
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Recebe Mensagem WhatsApp?</label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setMensagem('SIM')}
                  className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${mensagem === 'SIM' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}
                >
                  <MessageCircle size={14} /> SIM
                </button>
                <button
                  type="button"
                  onClick={() => setMensagem('NÃO')}
                  className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${mensagem === 'NÃO' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}
                >
                  <X size={14} /> NÃO
                </button>
              </div>
            </div>
          </section>

          {/* ── Localização ────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Localização
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Rota</label>
                <input className="input" value={rota} onChange={e => setRota(e.target.value)} placeholder="Ex: GARAVELO" />
              </div>
              <div>
                <label className="label text-xs font-black uppercase text-slate-400">Setor / Bairro</label>
                <input className="input" value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex: MARISTA" />
              </div>
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Link Maps ou Coordenadas GPS</label>
              <input className="input" value={localizacao} onChange={e => setLocalizacao(e.target.value)} placeholder="https://maps... ou -16.xxx, -49.xxx" />
            </div>
          </section>

          {/* ── Comodato ───────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Comodato / Equipamentos
            </h3>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Equipamentos em Comodato</label>
              <textarea className="input min-h-[60px]" value={comodato} onChange={e => setComodato(e.target.value)} placeholder="Ex: FREEZER FRICON 450LT, ARMÁRIO VAZIO 58X70..." />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Valor do Comodato</label>
              <input className="input" value={valor} onChange={e => setValor(e.target.value)} placeholder="Ex: R$ 1.900,00" />
            </div>
          </section>

          {/* ── Observações ────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1">
              Observações
            </h3>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Restrição de Entrega</label>
              <input className="input" value={restricao} onChange={e => setRestricao(e.target.value)} placeholder="Ex: ENTREGAR SOMENTE COM PAGAMENTO" />
            </div>
            <div>
              <label className="label text-xs font-black uppercase text-slate-400">Observações Gerais</label>
              <textarea className="input min-h-[80px]" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Detalhes, horários, preferências..." />
            </div>
          </section>

        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 bg-slate-50/50 dark:bg-slate-800/50">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center gap-2 py-3 shadow-md">
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Cliente'}
          </button>
        </div>
      </div>
    </div>
  )
}
