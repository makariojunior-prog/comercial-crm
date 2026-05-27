import { useRef, useState, useEffect, useCallback } from 'react'
import { X, AlertCircle, Camera, Trash2, Loader2, Users, CalendarPlus, ChevronDown, MapPin, Search } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import type { Visit } from '../types'
import { VISIT_TYPES } from '../types'
import { useEscKey } from '../hooks/useEscKey'

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

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function makeEmptyForm() {
  return {
    visit_date:    todayLocal(),
    visit_type:    'Prospecção',
    client_name:   '',
    contact_name:  '',
    contact_phone: '',
    local:         '',
    demand:        '',
    report:        '',
    priority:      'MÉDIA',
    status:        'Realizada',
    has_amostra:   false,
  }
}

interface AtacadoClient {
  id: string
  cliente: string
  localizacao: string | null
  telefone: string | null
}

interface NominatimResult {
  place_id: number
  display_name: string
}

export default function VisitModal({ visit, onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const [form, setForm] = useState(
    visit ? {
      visit_date:    visit.visit_date    ?? todayLocal(),
      visit_type:    visit.visit_type    ?? 'Prospecção',
      client_name:   visit.client_name,
      contact_name:  visit.contact_name  ?? '',
      contact_phone: visit.contact_phone ? maskPhone(visit.contact_phone) : '',
      local:         visit.local         ?? '',
      demand:        visit.demand        ?? '',
      report:        visit.report        ?? '',
      priority:      visit.priority      ?? 'MÉDIA',
      status:        visit.status        ?? 'Realizada',
      has_amostra:   visit.has_amostra   ?? false,
    } : makeEmptyForm()
  )

  const initResponsaveis = (): string[] => {
    if (visit?.responsaveis?.length) return visit.responsaveis
    if (visit?.responsible) return [visit.responsible]
    return []
  }
  const [responsaveis,     setResponsaveis]     = useState<string[]>(initResponsaveis)
  const [staffOptions,     setStaffOptions]     = useState<string[]>([])
  const [photos,           setPhotos]           = useState<string[]>(visit?.photo_urls ?? [])
  const [saving,           setSaving]           = useState(false)
  const [uploading,        setUploading]        = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  // Atacado client autocomplete (active when tipo = Acompanhamento)
  const [atacadoClients,  setAtacadoClients]  = useState<AtacadoClient[]>([])
  const [showClientDrop,  setShowClientDrop]  = useState(false)

  // Local geocoding (Nominatim / OpenStreetMap)
  const [localSuggestions, setLocalSuggestions] = useState<NominatimResult[]>([])
  const [showLocalDrop,    setShowLocalDrop]    = useState(false)
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Schedule next appointment
  const [scheduleNext, setScheduleNext] = useState(false)
  const [nextAppt, setNextAppt] = useState({
    titulo:      '',
    data:        addDaysLocal(visit?.visit_date ?? todayLocal(), 7),
    hora_inicio: '',
    descricao:   '',
  })

  useEffect(() => {
    supabase.from('crm_staff').select('name').eq('active', true).order('name')
      .then(({ data }) => {
        if (data) setStaffOptions(data.map((s: any) => s.name as string))
      })
  }, [])

  // Load atacado clients only when tipo = Acompanhamento
  useEffect(() => {
    if (form.visit_type !== 'Acompanhamento') { setAtacadoClients([]); return }
    supabase.from('atacado_clientes')
      .select('id, cliente, localizacao, telefone')
      .eq('status', 'ATIVO')
      .order('cliente')
      .then(({ data }) => { if (data) setAtacadoClients(data as AtacadoClient[]) })
  }, [form.visit_type])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleResp(name: string) {
    setResponsaveis(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  function handleLocalChange(val: string) {
    set('local', val)
    if (localTimerRef.current) clearTimeout(localTimerRef.current)
    if (val.length < 3) { setLocalSuggestions([]); setShowLocalDrop(false); return }
    localTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&countrycodes=br`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        )
        const data: NominatimResult[] = await res.json()
        setLocalSuggestions(data)
        setShowLocalDrop(data.length > 0)
      } catch {
        // ignore geocoding errors silently
      }
    }, 450)
  }

  const filteredAtacado = atacadoClients.filter(c =>
    c.cliente.toLowerCase().includes(form.client_name.toLowerCase())
  )

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
    if (path) {
      try {
        await supabase.storage.from('visit-photos').remove([decodeURIComponent(path)])
      } catch {
        // ignore — detach the photo from the visit regardless
      }
    }
    setPhotos(prev => prev.filter(u => u !== url))
  }

  async function save() {
    if (!form.client_name.trim()) return setError('Nome do cliente é obrigatório')
    if (scheduleNext && !nextAppt.titulo.trim()) return setError('Informe o título do próximo compromisso')
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      local:        form.local.trim() || null,
      responsible:  responsaveis[0] ?? null,
      responsaveis: responsaveis,
      photo_urls:   photos,
    }

    let visitId: string | null = visit?.id ?? null

    if (visit) {
      const { error: err } = await supabase.from('visits').update(payload).eq('id', visit.id)
      if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    } else {
      const { data: inserted, error: err } = await supabase
        .from('visits').insert(payload).select('id').single()
      if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
      visitId = inserted?.id ?? null
    }

    // Cria próximo compromisso se solicitado
    if (scheduleNext && nextAppt.titulo.trim()) {
      await supabase.from('agenda_compromissos').insert({
        titulo:       nextAppt.titulo,
        data:         nextAppt.data,
        hora_inicio:  nextAppt.hora_inicio || null,
        tipo:         'Visita',
        status:       'AGENDADO',
        cliente_nome: form.client_name || null,
        local:        form.local.trim() || null,
        descricao:    nextAppt.descricao || null,
        responsavel:  responsaveis[0]   ?? null,
        responsaveis,
        updated_at:   new Date().toISOString(),
      })
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  const isAcompanhamento = form.visit_type === 'Acompanhamento'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">{visit ? 'Editar Visita' : 'Registrar Visita'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Data + Tipo */}
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
          </div>

          {/* Cliente — autocomplete de Atacado quando tipo = Acompanhamento */}
          <div className="relative">
            <label className="label">
              Cliente *
              {isAcompanhamento && (
                <span className="ml-1.5 text-[10px] font-normal text-orange-500">
                  (clientes Atacado)
                </span>
              )}
            </label>
            <input
              className="input"
              value={form.client_name}
              onChange={e => {
                set('client_name', e.target.value)
                if (isAcompanhamento) setShowClientDrop(true)
              }}
              onFocus={() => { if (isAcompanhamento) setShowClientDrop(true) }}
              onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
              placeholder={isAcompanhamento ? 'Buscar cliente cadastrado...' : 'Nome do cliente visitado'}
            />
            {isAcompanhamento && showClientDrop && filteredAtacado.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredAtacado.slice(0, 8).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => {
                      set('client_name', c.cliente)
                      if (c.localizacao) set('local', c.localizacao)
                      if (c.telefone) set('contact_phone', maskPhone(c.telefone))
                      setShowClientDrop(false)
                    }}
                    className="w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-slate-700 last:border-0 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.cliente}</p>
                    {c.localizacao && (
                      <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin size={9} />{c.localizacao}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contato + Telefone */}
          <div className="grid grid-cols-2 gap-3">
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
          </div>

          {/* Prioridade — botões coloridos */}
          <div>
            <label className="label">Prioridade</label>
            <div className="flex gap-2">
              {(['ALTA', 'MÉDIA', 'BAIXA'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('priority', p)}
                  className={`flex-1 py-2 rounded-lg border text-[11px] font-bold transition-all ${
                    form.priority === p
                      ? p === 'ALTA'  ? 'bg-red-50 border-red-400 text-red-600'
                      : p === 'MÉDIA' ? 'bg-amber-50 border-amber-400 text-amber-600'
                                      : 'bg-green-50 border-green-400 text-green-600'
                      : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Local com geocoding OpenStreetMap */}
          <div className="relative">
            <label className="label flex items-center gap-1.5">
              <MapPin size={12} className="text-slate-400" /> Local
            </label>
            <div className="relative">
              <input
                className="input pr-8"
                value={form.local}
                onChange={e => handleLocalChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowLocalDrop(false), 200)}
                placeholder="Digite para buscar endereço..."
                autoComplete="off"
              />
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {showLocalDrop && localSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {localSuggestions.map(s => (
                  <button
                    key={s.place_id}
                    type="button"
                    onMouseDown={() => {
                      set('local', s.display_name)
                      setShowLocalDrop(false)
                      setLocalSuggestions([])
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-b border-slate-50 dark:border-slate-700 last:border-0 transition-colors"
                  >
                    {s.display_name}
                  </button>
                ))}
              </div>
            )}
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

          {/* Agendar próximo compromisso */}
          <div className={`rounded-xl border transition-all overflow-hidden ${scheduleNext ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-600'}`}>
            <button
              type="button"
              onClick={() => {
                if (!scheduleNext) {
                  setNextAppt(p => ({
                    ...p,
                    titulo: form.client_name ? `Visita — ${form.client_name}` : p.titulo,
                    data:   addDaysLocal(form.visit_date || todayLocal(), 7),
                  }))
                }
                setScheduleNext(v => !v)
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors ${scheduleNext ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <span className="flex items-center gap-2">
                <CalendarPlus size={14} className={scheduleNext ? 'text-blue-600' : 'text-slate-400'} />
                <span className={scheduleNext ? 'text-blue-700 dark:text-blue-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                  Agendar próximo compromisso
                </span>
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${scheduleNext ? 'rotate-180' : ''}`} />
            </button>
            {scheduleNext && (
              <div className="px-3 pb-3 pt-2 space-y-2 bg-blue-50 dark:bg-blue-900/10 border-t border-blue-200 dark:border-blue-800">
                <div>
                  <label className="label">Título *</label>
                  <input
                    className="input"
                    value={nextAppt.titulo}
                    onChange={e => setNextAppt(v => ({ ...v, titulo: e.target.value }))}
                    placeholder="Ex: Visita — Cliente X"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Data</label>
                    <input
                      type="date"
                      className="input"
                      value={nextAppt.data}
                      onChange={e => setNextAppt(v => ({ ...v, data: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label">Horário</label>
                    <input
                      type="time"
                      className="input"
                      value={nextAppt.hora_inicio}
                      onChange={e => setNextAppt(v => ({ ...v, hora_inicio: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Observações</label>
                  <input
                    className="input"
                    value={nextAppt.descricao}
                    onChange={e => setNextAppt(v => ({ ...v, descricao: e.target.value }))}
                    placeholder="Objetivo da próxima visita..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Amostra de Produtos */}
          <div>
            <label className="label">Amostra de Produtos</label>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, has_amostra: !f.has_amostra }))}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                form.has_amostra
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 text-orange-700 dark:text-orange-400'
                  : 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span className="text-base">{form.has_amostra ? '✅' : '○'}</span>
              <span>{form.has_amostra ? 'Com amostra de produtos' : 'Sem amostra de produtos'}</span>
            </button>
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
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || uploading || !form.client_name.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando...' : visit ? 'Salvar' : 'Registrar Visita'}
          </button>
        </div>
      </div>
    </div>
  )
}
