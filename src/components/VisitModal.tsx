import { useRef, useState, useEffect } from 'react'
import { X, AlertCircle, Camera, Trash2, Loader2, Users } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import type { Visit } from '../types'
import { VISIT_TYPES, VISIT_STATUS } from '../types'

interface Props {
  visit?: Visit | null
  onClose: () => void
  onSaved: () => void
}

function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const MAX_PHOTOS = 3
const COMPRESS_OPTIONS = { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true }

const emptyForm = {
  visit_date:    new Date().toISOString().split('T')[0],
  visit_type:    'Prospecção',
  client_name:   '',
  contact_name:  '',
  contact_phone: '',
  demand:        '',
  report:        '',
  priority:      'MÉDIA',
  status:        'Realizada',
}

export default function VisitModal({ visit, onClose, onSaved }: Props) {
  const [form, setForm] = useState(
    visit ? {
      visit_date:    visit.visit_date    ?? emptyForm.visit_date,
      visit_type:    visit.visit_type    ?? emptyForm.visit_type,
      client_name:   visit.client_name,
      contact_name:  visit.contact_name  ?? '',
      contact_phone: visit.contact_phone ? maskPhone(visit.contact_phone) : '',
      demand:        visit.demand        ?? '',
      report:        visit.report        ?? '',
      priority:      visit.priority      ?? emptyForm.priority,
      status:        visit.status        ?? emptyForm.status,
    } : emptyForm
  )

  const initResponsaveis = (): string[] => {
    if (visit?.responsaveis?.length) return visit.responsaveis
    if (visit?.responsible) return [visit.responsible]
    return []
  }
  const [responsaveis,  setResponsaveis]  = useState<string[]>(initResponsaveis)
  const [staffOptions,  setStaffOptions]  = useState<string[]>([])
  const [photos,        setPhotos]        = useState<string[]>(visit?.photo_urls ?? [])
  const [saving,        setSaving]        = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase
      .from('crm_staff')
      .select('name')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setStaffOptions(data.map((s: any) => s.name as string))
      })
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleResp(name: string) {
    setResponsaveis(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Máximo de ${MAX_PHOTOS} fotos por visita`)
      e.target.value = ''
      return
    }
    setUploading(true)
    setError(null)
    for (const file of files) {
      try {
        const compressed = await imageCompression(file, COMPRESS_OPTIONS)
        const ext = file.type === 'image/png' ? 'png' : 'jpg'
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { data, error: upErr } = await supabase.storage
          .from('visit-photos')
          .upload(fileName, compressed, { contentType: compressed.type, upsert: false })
        if (upErr) { setError('Erro no upload: ' + upErr.message); break }
        const { data: { publicUrl } } = supabase.storage.from('visit-photos').getPublicUrl(data.path)
        setPhotos(prev => [...prev, publicUrl])
      } catch {
        setError('Erro ao processar foto')
        break
      }
    }
    setUploading(false)
    e.target.value = ''
  }

  async function removePhoto(url: string) {
    const path = url.split('/object/public/visit-photos/')[1]
    if (path) await supabase.storage.from('visit-photos').remove([decodeURIComponent(path)])
    setPhotos(prev => prev.filter(u => u !== url))
  }

  async function save() {
    if (!form.client_name.trim()) return setError('Nome do cliente é obrigatório')
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      responsible:  responsaveis[0] ?? null,
      responsaveis: responsaveis,
      photo_urls:   photos,
    }
    const { error: err } = visit
      ? await supabase.from('visits').update(payload).eq('id', visit.id)
      : await supabase.from('visits').insert(payload)
    if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{visit ? 'Editar Visita' : 'Registrar Visita'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={form.visit_date} onChange={e => set('visit_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.visit_type} onChange={e => set('visit_type', e.target.value)}>
                {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Cliente *</label>
              <input className="input" value={form.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nome do cliente visitado" />
            </div>
            <div>
              <label className="label">Contato</label>
              <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Nome da pessoa" />
            </div>
            <div>
              <label className="label">Telefone</label>
              <input
                className="input"
                value={form.contact_phone}
                onChange={e => set('contact_phone', maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {VISIT_STATUS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {['ALTA', 'MÉDIA', 'BAIXA'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Responsáveis multi-select */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Users size={13} /> Responsáveis
            </label>
            {staffOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Carregando equipe… Cadastre membros em Usuários &gt; Equipe.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {staffOptions.map(name => {
                  const sel = responsaveis.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleResp(name)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                        sel
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  )
                })}
              </div>
            )}
            {responsaveis.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                {responsaveis.length} selecionado(s): {responsaveis.join(', ')}
              </p>
            )}
          </div>

          <div>
            <label className="label">Demanda / Objetivo</label>
            <input className="input" value={form.demand} onChange={e => set('demand', e.target.value)} placeholder="O que foi buscar nessa visita?" />
          </div>
          <div>
            <label className="label">Relatório</label>
            <textarea className="input resize-none" rows={3} value={form.report} onChange={e => set('report', e.target.value)} placeholder="O que aconteceu? Resultados, próximos passos..." />
          </div>

          {/* Fotos */}
          <div>
            <label className="label">Fotos ({photos.length}/{MAX_PHOTOS})</label>
            <div className="flex gap-2 flex-wrap">
              {photos.map((url, i) => (
                <div key={i} className="relative group w-20 h-20 shrink-0">
                  <img src={url} alt={`Foto ${i + 1}`} className="w-20 h-20 object-cover rounded-xl border border-slate-200" />
                  <button
                    onClick={() => removePhoto(url)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-orange-400 hover:text-orange-400 transition-colors shrink-0 disabled:opacity-50"
                >
                  {uploading
                    ? <Loader2 size={22} className="animate-spin" />
                    : <><Camera size={22} /><span className="text-[10px] mt-1 font-medium">Foto</span></>
                  }
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handlePhotoSelect}
            />
            <p className="text-[11px] text-slate-400 mt-1.5">
              No celular abre a câmera · max {MAX_PHOTOS} fotos · comprimidas antes do envio
            </p>
          </div>
        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 border-t border-red-200">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || uploading || !form.client_name.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : visit ? 'Salvar' : 'Registrar Visita'}
          </button>
        </div>
      </div>
    </div>
  )
}
