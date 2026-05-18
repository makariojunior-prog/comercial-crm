import { useState, useCallback, useEffect } from 'react'
import { X, AlertCircle, Phone, MapPin, User, Truck, CalendarClock, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { VarejoPedido } from '../types'
import { TURNOS, EMPRESAS_ROTA } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  pedido: VarejoPedido
  onClose: () => void
  onSaved: () => void
}

const STATUS_LABELS: Record<string, string> = {
  '⚠️': 'Aguardando',
  '🛵': 'Em rota',
  '✅': 'Entregue',
  '❌': 'Cancelado',
}

const ORIGEM_COLORS: Record<string, string> = {
  'IFOOD':        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  '99FOOD':       'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'CARDAPIO WEB': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
}

const firstName = (nome: string) => nome.trim().split(/\s+/)[0]

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
      <Icon size={12} className="shrink-0 mt-0.5 text-slate-400" />
      <span className="font-medium text-slate-400 w-16 shrink-0">{label}</span>
      <span className="flex-1">{value}</span>
    </div>
  )
}

export default function PedidoModal({ pedido, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))

  const [form, setForm] = useState({
    data_entrega:   pedido.data_entrega ?? '',
    turno:          pedido.turno ?? '',
    restricao:      pedido.restricao ?? '',
    flag_restricao: pedido.flag_restricao ?? '',
    atendente:      pedido.atendente ?? '',
    rota_definida:  pedido.rota_definida ?? '',
    entregador:     pedido.entregador ?? '',
    empresa:        pedido.empresa ?? '',
    status_icon:    pedido.status_icon ?? '⚠️',
  })

  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [drivers, setDrivers] = useState<{ id: string; nome: string }[]>([])
  const [users,   setUsers]   = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    let active = true
    supabase.from('crm_drivers').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (active) setDrivers(data ?? []) })
    supabase.from('crm_users').select('id, nome').order('nome')
      .then(({ data }) => { if (active) setUsers(data ?? []) })
    return () => { active = false }
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('varejo_pedidos')
      .update({
        data_entrega:          form.data_entrega   || null,
        turno:                 form.turno          || null,
        restricao:             form.restricao      || null,
        flag_restricao:        form.flag_restricao || null,
        atendente:             form.atendente      || null,
        rota_definida:         form.rota_definida  || null,
        entregador:            form.entregador     || null,
        empresa:               form.empresa        || null,
        status_icon:           form.status_icon,
        data_entrega_definida: !!(form.data_entrega && form.turno),
      })
      .eq('id', pedido.id)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }

  const brl = (v: number | null) => v != null
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

  const recebidoEm = pedido.created_at
    ? format(parseISO(pedido.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null

  // Nomes únicos para os selects (primeiro nome)
  const userNames = users.map(u => firstName(u.nome))
  const driverNames = drivers.map(d => firstName(d.nome))
  // Se o valor salvo não está na lista, mostra como opção extra
  const extraAtendente = form.atendente && !userNames.includes(form.atendente) ? form.atendente : null
  const extraEntregador = form.entregador && !driverNames.includes(form.entregador) ? form.entregador : null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{form.status_icon}</span>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100">Pedido #{pedido.num_pedido}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ORIGEM_COLORS[pedido.origem] ?? 'bg-slate-100 text-slate-600'}`}>
                  {pedido.origem}
                </span>
                {pedido.qtd_pedidos_cliente > 1 && (
                  <span className="text-[10px] text-slate-400">{pedido.qtd_pedidos_cliente}º pedido do cliente</span>
                )}
                {pedido.order_timing === 'scheduled' && pedido.scheduled_start && (
                  <span className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                    <CalendarClock size={10} />
                    {new Date(pedido.scheduled_start).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Info do pedido (read-only) */}
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Dados do pedido</p>
            {recebidoEm && (
              <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Clock size={12} className="shrink-0 mt-0.5 text-slate-400" />
                <span className="font-medium text-slate-400 w-16 shrink-0">Recebido</span>
                <span className="flex-1 font-medium text-slate-600 dark:text-slate-300">{recebidoEm}</span>
              </div>
            )}
            <InfoRow icon={User}   label="Cliente"   value={pedido.cliente} />
            <InfoRow icon={Phone}  label="Telefone"  value={pedido.telefone} />
            <InfoRow icon={MapPin} label="Bairro"    value={pedido.bairro} />
            <InfoRow icon={MapPin} label="Endereço"  value={pedido.endereco_completo} />
            {pedido.complemento && <InfoRow icon={MapPin} label="Compl." value={pedido.complemento} />}
            {pedido.ponto_referencia && <InfoRow icon={MapPin} label="Referência" value={pedido.ponto_referencia} />}
            {pedido.sugestao_rota && <InfoRow icon={Truck} label="Sugestão" value={pedido.sugestao_rota} />}
            <div className="flex gap-4 pt-1">
              <span className="text-xs text-slate-500">Líquido: <strong className="text-slate-800 dark:text-slate-100">{brl(pedido.valor_liquido)}</strong></span>
              <span className="text-xs text-slate-500">Frete: <strong className="text-slate-800 dark:text-slate-100">{brl(pedido.frete)}</strong></span>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Status</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_LABELS).map(([icon, label]) => (
                <button key={icon} type="button"
                  onClick={() => set('status_icon', icon)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.status_icon === icon
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                      : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}>
                  <span>{icon}</span> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Seção Atendente */}
          <div>
            <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-3">Atendente</p>
            <div className="grid grid-cols-2 gap-3">

              {/* Data de entrega — pode ser diferente do dia do pedido */}
              <div>
                <label className="label">Data de Entrega</label>
                <input
                  type="date"
                  className="input"
                  value={form.data_entrega}
                  onChange={e => set('data_entrega', e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Pode diferir da data do pedido</p>
              </div>

              <div>
                <label className="label">Turno</label>
                <select className="input" value={form.turno} onChange={e => set('turno', e.target.value)}>
                  <option value="">Selecione</option>
                  {TURNOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <label className="label">Restrição / Observação de Entrega</label>
                <textarea className="input resize-none" rows={2}
                  value={form.restricao}
                  onChange={e => set('restricao', e.target.value)}
                  placeholder="Ex.: Ligar antes, deixar com porteiro, horário específico..." />
              </div>

              <div>
                <label className="label">Marcador</label>
                <div className="flex gap-2">
                  {['', '⚠️', '✅'].map(f => (
                    <button key={f} type="button"
                      onClick={() => set('flag_restricao', f)}
                      className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                        form.flag_restricao === f
                          ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 font-bold'
                          : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}>
                      {f || '—'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Atendente responsável</label>
                <select className="input" value={form.atendente} onChange={e => set('atendente', e.target.value)}>
                  <option value="">Selecione</option>
                  {extraAtendente && (
                    <option value={extraAtendente}>{extraAtendente}</option>
                  )}
                  {users.map(u => (
                    <option key={u.id} value={firstName(u.nome)}>{firstName(u.nome)}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Seção Logística */}
          <div>
            <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-3">Logística</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Rota Definida</label>
                <input className="input" value={form.rota_definida} onChange={e => set('rota_definida', e.target.value)}
                  placeholder={pedido.sugestao_rota ?? 'Ex.: Rota 3 — Norte'} />
              </div>
              <div>
                <label className="label">Entregador</label>
                <select className="input" value={form.entregador} onChange={e => set('entregador', e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="RETIRADA">🏪 RETIRADA</option>
                  {extraEntregador && extraEntregador !== 'RETIRADA' && (
                    <option value={extraEntregador}>{extraEntregador}</option>
                  )}
                  {drivers.map(d => (
                    <option key={d.id} value={firstName(d.nome)}>{firstName(d.nome)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Empresa da Rota</label>
                <div className="flex gap-2">
                  {EMPRESAS_ROTA.map(e => (
                    <button key={e} type="button" onClick={() => set('empresa', e)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all ${
                        form.empresa === e
                          ? e === 'LUMAR'
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                            : 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                          : 'border-slate-200 dark:border-slate-600 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Fechar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
