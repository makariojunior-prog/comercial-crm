import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Vehicle, Driver } from '../types'
import { VEHICLE_TIPOS, VEHICLE_COMBUSTIVEIS } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  vehicle?: Vehicle | null
  onClose: () => void
  onSaved: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const TIPOS_CONTA = ['ativo', 'manutencao', 'parado', 'inativo'] as const
const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo', manutencao: 'Em manutenção', parado: 'Parado', inativo: 'Inativo'
}

const emptyForm = () => ({
  empresa: 'cantina' as 'lumar' | 'cantina',
  apelido: '', tipo: '', marca_modelo: '', ano: '', placa: '', cor: '', combustivel: '',
  tanque_litros: '', driver_id: '',
  venc_seguro: '', seguradora: '', contato_seguradora: '',
  venc_ipva: '', crlv_vencimento: '', renavam: '',
  documentacao: '', km_atual: '', proxima_revisao_km: '', capacidade_carga_kg: '',
  tem_rastreamento: false, velotrack_device_id: '',
  status_operacional: 'ativo',
  ativo: true,
})

export default function VehicleModal({ vehicle, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<Record<string, any>>(vehicle ? {
    empresa: vehicle.empresa,
    apelido: vehicle.apelido,
    tipo: vehicle.tipo ?? '',
    marca_modelo: vehicle.marca_modelo ?? '',
    ano: vehicle.ano?.toString() ?? '',
    placa: vehicle.placa ?? '',
    cor: vehicle.cor ?? '',
    combustivel: vehicle.combustivel ?? '',
    tanque_litros: vehicle.tanque_litros?.toString() ?? '',
    driver_id: vehicle.driver_id ?? '',
    venc_seguro: vehicle.venc_seguro ?? '',
    seguradora: vehicle.seguradora ?? '',
    contato_seguradora: vehicle.contato_seguradora ?? '',
    venc_ipva: vehicle.venc_ipva ?? '',
    crlv_vencimento: (vehicle as any).crlv_vencimento ?? '',
    renavam: (vehicle as any).renavam ?? '',
    documentacao: vehicle.documentacao ?? '',
    km_atual: vehicle.km_atual?.toString() ?? '',
    proxima_revisao_km: vehicle.proxima_revisao_km?.toString() ?? '',
    capacidade_carga_kg: (vehicle as any).capacidade_carga_kg?.toString() ?? '',
    tem_rastreamento: vehicle.tem_rastreamento,
    velotrack_device_id: vehicle.velotrack_device_id?.toString() ?? '',
    status_operacional: (vehicle as any).status_operacional ?? 'ativo',
    ativo: vehicle.ativo,
  } : emptyForm())

  useEffect(() => {
    supabase.from('crm_drivers').select('id, nome, cnh_vencimento').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setDrivers(data as Driver[]) })
  }, [])

  function set(field: string, value: any) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.apelido.trim()) { setError('Apelido é obrigatório.'); return }
    setSaving(true); setError(null)

    const payload = {
      empresa: form.empresa,
      apelido: form.apelido.trim(),
      tipo: form.tipo || null,
      marca_modelo: form.marca_modelo || null,
      ano: form.ano ? parseInt(form.ano) : null,
      placa: form.placa?.toUpperCase().replace(/\s/g, '') || null,
      cor: form.cor || null,
      combustivel: form.combustivel || null,
      tanque_litros: form.tanque_litros ? parseFloat(form.tanque_litros) : null,
      driver_id: form.driver_id || null,
      venc_seguro: form.venc_seguro || null,
      seguradora: form.seguradora || null,
      contato_seguradora: form.contato_seguradora || null,
      venc_ipva: form.venc_ipva || null,
      crlv_vencimento: form.crlv_vencimento || null,
      renavam: form.renavam || null,
      documentacao: form.documentacao || null,
      km_atual: form.km_atual ? parseInt(form.km_atual) : null,
      proxima_revisao_km: form.proxima_revisao_km ? parseInt(form.proxima_revisao_km) : null,
      capacidade_carga_kg: form.capacidade_carga_kg ? parseInt(form.capacidade_carga_kg) : null,
      tem_rastreamento: form.tem_rastreamento,
      velotrack_device_id: form.velotrack_device_id ? parseInt(form.velotrack_device_id) : null,
      status_operacional: form.status_operacional,
      ativo: form.ativo,
    }

    const { error: err } = vehicle
      ? await supabase.from('crm_vehicles').update(payload).eq('id', vehicle.id)
      : await supabase.from('crm_vehicles').insert(payload)

    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{vehicle ? 'Editar Veículo' : 'Novo Veículo'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Empresa */}
          <div>
            <label className="label">Empresa</label>
            <div className="flex gap-2">
              {(['cantina', 'lumar'] as const).map(e => (
                <button key={e} type="button" onClick={() => set('empresa', e)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                    form.empresa === e
                      ? e === 'lumar' ? 'bg-blue-50 border-blue-300 text-blue-700 border-2' : 'bg-orange-50 border-orange-300 text-orange-700 border-2'
                      : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50'
                  }`}>
                  {e === 'lumar' ? '🔵 Lumar' : '🟠 Cantina em Casa'}
                </button>
              ))}
            </div>
          </div>

          {/* Identificação */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Identificação</p>
            <div className="grid grid-cols-2 gap-x-4">
              <div className="col-span-2">
                <Field label="Apelido *">
                  <input className="input" value={form.apelido} onChange={e => set('apelido', e.target.value)} placeholder="Ex: Kangoo Branca, Gol do Tiago" autoFocus />
                </Field>
              </div>
              <Field label="Tipo">
                <select className="input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  <option value="">Selecione</option>
                  {VEHICLE_TIPOS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Marca / Modelo">
                <input className="input" value={form.marca_modelo} onChange={e => set('marca_modelo', e.target.value)} placeholder="Ex: Renault Kangoo" />
              </Field>
              <Field label="Ano">
                <input type="number" min={1990} max={2030} className="input" value={form.ano} onChange={e => set('ano', e.target.value)} placeholder="Ex: 2021" />
              </Field>
              <Field label="Placa">
                <input className="input uppercase" value={form.placa} onChange={e => set('placa', e.target.value.toUpperCase())} placeholder="ABC1D23" maxLength={7} />
              </Field>
              <Field label="Cor">
                <input className="input" value={form.cor} onChange={e => set('cor', e.target.value)} placeholder="Ex: Branco" />
              </Field>
              <Field label="Combustível">
                <select className="input" value={form.combustivel} onChange={e => set('combustivel', e.target.value)}>
                  <option value="">Selecione</option>
                  {VEHICLE_COMBUSTIVEIS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Tanque (L)">
                <input type="number" step="0.5" className="input" value={form.tanque_litros} onChange={e => set('tanque_litros', e.target.value)} placeholder="Ex: 55" />
              </Field>
              <Field label="RENAVAM">
                <input className="input" value={form.renavam} onChange={e => set('renavam', e.target.value)} placeholder="11 dígitos" maxLength={11} />
              </Field>
              <Field label="Capacidade de carga (kg)">
                <input type="number" className="input" value={form.capacidade_carga_kg} onChange={e => set('capacidade_carga_kg', e.target.value)} placeholder="Ex: 600" />
              </Field>
            </div>
          </div>

          {/* Motorista e status */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Motorista e Status</p>
            <div className="grid grid-cols-2 gap-x-4">
              <div className="col-span-2">
                <Field label="Motorista principal">
                  <select className="input" value={form.driver_id} onChange={e => set('driver_id', e.target.value)}>
                    <option value="">Sem motorista fixo</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Status operacional">
                <select className="input" value={form.status_operacional} onChange={e => set('status_operacional', e.target.value)}>
                  {TIPOS_CONTA.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Km atual (odômetro)">
                <input type="number" className="input" value={form.km_atual} onChange={e => set('km_atual', e.target.value)} placeholder="Ex: 85000" />
              </Field>
              <Field label="Próxima revisão (km)">
                <input type="number" className="input" value={form.proxima_revisao_km} onChange={e => set('proxima_revisao_km', e.target.value)} placeholder="Ex: 90000" />
              </Field>
            </div>
          </div>

          {/* Documentação */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Documentação e Vencimentos</p>
            <div className="grid grid-cols-2 gap-x-4">
              <Field label="Vencimento IPVA">
                <input type="date" className="input" value={form.venc_ipva} onChange={e => set('venc_ipva', e.target.value)} />
              </Field>
              <Field label="Vencimento CRLV">
                <input type="date" className="input" value={form.crlv_vencimento} onChange={e => set('crlv_vencimento', e.target.value)} />
              </Field>
              <Field label="Vencimento Seguro">
                <input type="date" className="input" value={form.venc_seguro} onChange={e => set('venc_seguro', e.target.value)} />
              </Field>
              <Field label="Seguradora">
                <input className="input" value={form.seguradora} onChange={e => set('seguradora', e.target.value)} placeholder="Ex: Porto Seguro" />
              </Field>
              <div className="col-span-2">
                <Field label="Contato da Seguradora">
                  <input className="input" value={form.contato_seguradora} onChange={e => set('contato_seguradora', e.target.value)} placeholder="Telefone ou e-mail" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Observações / Documentação">
                  <textarea className="input resize-none" rows={2} value={form.documentacao} onChange={e => set('documentacao', e.target.value)} placeholder="Status dos documentos, observações gerais..." />
                </Field>
              </div>
            </div>
          </div>

          {/* Rastreamento */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Rastreamento</p>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 mb-3">
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Possui rastreador</span>
                <p className="text-xs text-slate-400 mt-0.5">Ativa o monitoramento no mapa em tempo real</p>
              </div>
              <button type="button" onClick={() => set('tem_rastreamento', !form.tem_rastreamento)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${form.tem_rastreamento ? 'bg-green-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                {form.tem_rastreamento ? 'Sim' : 'Não'}
              </button>
            </div>
            {form.tem_rastreamento && (
              <Field label="ID do dispositivo Velotrack (iddevice)">
                <input type="number" className="input" value={form.velotrack_device_id} onChange={e => set('velotrack_device_id', e.target.value)} placeholder="Ex: 9817674 (obtido no login Velotrack)" />
              </Field>
            )}
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.apelido.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : vehicle ? 'Salvar' : 'Cadastrar Veículo'}
          </button>
        </div>
      </div>
    </div>
  )
}
