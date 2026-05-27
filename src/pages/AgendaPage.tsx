import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, CalendarDays, CalendarPlus, X, Clock, Users, Copy, Trash2, AlertCircle, FileText } from 'lucide-react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { AgendaCompromisso } from '../types'
import { useAuth } from '../contexts/AuthContext'

const TIPOS = ['Visita', 'Reunião', 'Ligação', 'Entrega', 'Outros'] as const

const STATUS_STYLE: Record<string, string> = {
  AGENDADO:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  REALIZADO: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELADO: 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500',
}

const TIPO_BORDER: Record<string, string> = {
  'Visita':              'border-l-orange-400',
  'Reunião':             'border-l-blue-400',
  'Ligação':             'border-l-purple-400',
  'Entrega':             'border-l-green-400',
  'Outros':              'border-l-slate-400',
  'Degustação':          'border-l-rose-400',
  'Promoção':            'border-l-pink-400',
  'Evento Comemorativo': 'border-l-fuchsia-400',
  'Inauguração':         'border-l-rose-500',
  'Outro':               'border-l-slate-400',
}

export default function AgendaPage() {
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [items, setItems]       = useState<AgendaCompromisso[]>([])
  const [loading, setLoading]   = useState(true)
  const [staffOptions, setStaffOptions] = useState<string[]>([])
  const [filterResp, setFilterResp]     = useState('')
  const [editModal, setEditModal]       = useState<{ item?: AgendaCompromisso | null; defaultDate?: string } | null>(null)
  const [dupItem, setDupItem]           = useState<AgendaCompromisso | null>(null)

  const weekEnd  = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    supabase.from('crm_staff').select('name').eq('active', true).order('name')
      .then(({ data }) => { if (data) setStaffOptions(data.map((s: any) => s.name)) })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('agenda_compromissos')
      .select('*')
      .gte('data', format(weekStart, 'yyyy-MM-dd'))
      .lte('data', format(weekEnd,  'yyyy-MM-dd'))
      .order('hora_inicio', { nullsFirst: false })
    setItems(data ?? [])
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    if (!filterResp) return items
    return items.filter(i => i.responsaveis?.includes(filterResp) || i.responsavel === filterResp)
  }, [items, filterResp])

  const itemsForDay = (day: Date) => visible.filter(i => i.data === format(day, 'yyyy-MM-dd'))

  const goToday  = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const prevWeek = () => setWeekStart(w => subWeeks(w, 1))
  const nextWeek = () => setWeekStart(w => addWeeks(w, 1))

  async function deleteItem(id: string) {
    if (!confirm('Excluir este compromisso?')) return
    await supabase.from('agenda_compromissos').delete().eq('id', id)
    load()
  }

  async function handleDuplicate(item: AgendaCompromisso, newDate: string) {
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = item
    await supabase.from('agenda_compromissos').insert({ ...rest, data: newDate, status: 'AGENDADO', updated_at: new Date().toISOString() })
    setDupItem(null)
    load()
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <CalendarDays size={20} className="text-orange-500" /> Agenda
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {format(weekStart, "dd 'de' MMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMM yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {staffOptions.length > 0 && (
            <select
              value={filterResp}
              onChange={e => setFilterResp(e.target.value)}
              className="text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">Todos</option>
              {staffOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-xl p-0.5">
            <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
              <ChevronLeft size={14} />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors">
              Hoje
            </button>
            <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500">
              <ChevronRight size={14} />
            </button>
          </div>
          {loading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
          <button onClick={() => setEditModal({})} className="btn-primary">
            <Plus size={15} /> Agendar
          </button>
        </div>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {weekDays.map(day => {
          const dayItems = itemsForDay(day)
          const today    = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={`rounded-2xl border overflow-hidden ${today ? 'border-orange-300 dark:border-orange-600' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800`}
            >
              {/* Day header */}
              <div className={`px-3 py-2 border-b ${today ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-100 dark:border-slate-700'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wide ${today ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {format(day, 'EEE', { locale: ptBR })}
                    </p>
                    <p className={`text-lg font-bold leading-tight ${today ? 'text-orange-600 dark:text-orange-400' : 'text-slate-700 dark:text-slate-200'}`}>
                      {format(day, 'dd')}
                    </p>
                    <p className="text-[10px] text-slate-400">{format(day, 'MMM', { locale: ptBR })}</p>
                  </div>
                  <button
                    onClick={() => setEditModal({ defaultDate: format(day, 'yyyy-MM-dd') })}
                    className="p-1 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 text-slate-400 hover:text-orange-500 transition-colors mt-0.5"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {dayItems.length > 0 && (
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {dayItems.length} compromisso{dayItems.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Items */}
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {dayItems.length === 0 ? (
                  <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center py-3">—</p>
                ) : dayItems.map(item => (
                  <AppointmentCard
                    key={item.id}
                    item={item}
                    onEdit={() => setEditModal({ item })}
                    onDelete={() => deleteItem(item.id)}
                    onDuplicate={() => setDupItem(item)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create/Edit Modal */}
      {editModal !== null && (
        <AppointmentModal
          item={editModal.item ?? null}
          defaultDate={editModal.defaultDate}
          staffOptions={staffOptions}
          currentUser={profile?.nome ?? ''}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load() }}
        />
      )}

      {/* Duplicate Modal */}
      {dupItem && (
        <DuplicateModal
          item={dupItem}
          onClose={() => setDupItem(null)}
          onConfirm={newDate => handleDuplicate(dupItem, newDate)}
        />
      )}
    </div>
  )
}

// ─── AppointmentCard ───────────────────────────────────────────────
function AppointmentCard({ item, onEdit, onDelete, onDuplicate }: {
  item: AgendaCompromisso
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const borderColor = TIPO_BORDER[item.tipo] ?? 'border-l-slate-400'
  const canceled    = item.status === 'CANCELADO'

  return (
    <div
      className={`rounded-xl border-l-4 ${borderColor} bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 px-2 py-1.5 cursor-pointer group hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors`}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {item.hora_inicio && (
            <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mb-0.5">
              <Clock size={9} />
              {item.hora_inicio.substring(0, 5)}{item.hora_fim ? `–${item.hora_fim.substring(0, 5)}` : ''}
            </p>
          )}
          <p className={`text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate ${canceled ? 'line-through opacity-60' : ''}`}>
            {item.titulo}
          </p>
          {item.cliente_nome && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.cliente_nome}</p>
          )}
          {item.responsaveis?.length > 0 && (
            <p className="text-[10px] text-orange-500 font-medium truncate">{item.responsaveis.join(', ')}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_STYLE[item.status] ?? ''}`}>
            {item.status === 'AGENDADO' ? 'AGEND.' : item.status === 'REALIZADO' ? 'OK' : 'CANC.'}
          </span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={onDuplicate}
              className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors"
              title="Duplicar"
            >
              <Copy size={10} />
            </button>
            <button
              onClick={onDelete}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
              title="Excluir"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AppointmentModal ─────────────────────────────────────────────
function AppointmentModal({ item, defaultDate, staffOptions, currentUser, onClose, onSaved }: {
  item: AgendaCompromisso | null
  defaultDate?: string
  staffOptions: string[]
  currentUser: string
  onClose: () => void
  onSaved: () => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [form, setForm] = useState({
    titulo:       item?.titulo               ?? '',
    data:         item?.data                 ?? defaultDate ?? today,
    hora_inicio:  item?.hora_inicio?.substring(0, 5) ?? '',
    hora_fim:     item?.hora_fim?.substring(0, 5)    ?? '',
    tipo:         item?.tipo                 ?? 'Visita',
    status:       item?.status               ?? 'AGENDADO',
    descricao:    item?.descricao            ?? '',
    local:        item?.local                ?? '',
    cliente_nome: item?.cliente_nome         ?? '',
  })
  const [responsaveis, setResponsaveis] = useState<string[]>(item?.responsaveis ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Convert to visit report (only for existing items)
  const [convertVisit, setConvertVisit] = useState(false)
  const [visitReport, setVisitReport]   = useState({
    visit_status: 'Realizada',
    demand:       item?.descricao ?? '',
    report:       '',
  })

  // Schedule next appointment
  const [scheduleNext, setScheduleNext] = useState(false)
  const defaultNextDate = item
    ? format(addDays(new Date(item.data + 'T12:00'), 7), 'yyyy-MM-dd')
    : format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const [nextAppt, setNextAppt] = useState({
    titulo:      item?.cliente_nome ? `Visita — ${item.cliente_nome}` : '',
    data:        defaultNextDate,
    hora_inicio: item?.hora_inicio?.substring(0, 5) ?? '',
    descricao:   '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleResp(name: string) {
    setResponsaveis(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  async function save() {
    if (!form.titulo.trim()) return setError('Título é obrigatório')
    if (scheduleNext && !nextAppt.titulo.trim()) return setError('Informe o título do próximo compromisso')
    setSaving(true)
    setError(null)

    // 1. Save the appointment (auto-mark REALIZADO when converting to visit)
    const finalStatus = convertVisit ? 'REALIZADO' : form.status
    const payload = {
      ...form,
      status:       finalStatus,
      hora_inicio:  form.hora_inicio  || null,
      hora_fim:     form.hora_fim     || null,
      descricao:    form.descricao    || null,
      local:        form.local        || null,
      cliente_nome: form.cliente_nome || null,
      responsavel:  responsaveis[0]   ?? null,
      responsaveis,
      criado_por:   item ? item.criado_por : currentUser,
      updated_at:   new Date().toISOString(),
    }

    let apptId = item?.id
    if (item) {
      const { error: err } = await supabase.from('agenda_compromissos').update(payload).eq('id', item.id)
      if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
    } else {
      const { data: inserted, error: err } = await supabase.from('agenda_compromissos').insert(payload).select('id').single()
      if (err) { setError('Erro ao salvar: ' + err.message); setSaving(false); return }
      apptId = inserted?.id
    }

    // 2. Convert to visit report
    if (convertVisit && apptId) {
      const visitPayload = {
        visit_date:  form.data,
        visit_type:  toVisitType(form.tipo),
        client_name: form.cliente_nome || 'Não informado',
        demand:      visitReport.demand || null,
        report:      visitReport.report || null,
        status:      visitReport.visit_status,
        responsible: responsaveis[0]  ?? null,
        responsaveis,
        priority:    'MÉDIA',
        has_amostra: false,
        photo_urls:  [] as string[],
      }
      const { data: visitData } = await supabase.from('visits').insert(visitPayload).select('id').single()
      if (visitData?.id) {
        await supabase.from('agenda_compromissos')
          .update({ visit_id: visitData.id, updated_at: new Date().toISOString() })
          .eq('id', apptId)
      }
    }

    // 3. Schedule next appointment
    if (scheduleNext && nextAppt.titulo.trim()) {
      await supabase.from('agenda_compromissos').insert({
        titulo:       nextAppt.titulo,
        data:         nextAppt.data,
        hora_inicio:  nextAppt.hora_inicio || null,
        tipo:         'Visita',
        status:       'AGENDADO',
        cliente_nome: form.cliente_nome || null,
        descricao:    nextAppt.descricao || null,
        responsavel:  responsaveis[0]   ?? null,
        responsaveis,
        criado_por:   currentUser,
        updated_at:   new Date().toISOString(),
      })
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-100">
            {item ? 'Editar Compromisso' : 'Novo Compromisso'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* ── Campos principais ── */}
          <div>
            <label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Visita ao cliente" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={form.data} onChange={e => set('data', e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Início</label>
              <input type="time" className="input" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} />
            </div>
            <div>
              <label className="label">Fim</label>
              <input type="time" className="input" value={form.hora_fim} onChange={e => set('hora_fim', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Cliente</label>
            <input className="input" value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} placeholder="Nome do cliente" />
          </div>

          <div>
            <label className="label">Local</label>
            <input className="input" value={form.local} onChange={e => set('local', e.target.value)} placeholder="Endereço ou descrição do local" />
          </div>

          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="AGENDADO">Agendado</option>
              <option value="REALIZADO">Realizado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="label flex items-center gap-1"><Users size={12} /> Responsáveis</label>
            {staffOptions.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Carregando equipe…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {staffOptions.map(name => {
                  const sel = responsaveis.includes(name)
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleResp(name)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                        sel
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600'
                      }`}
                    >
                      {sel ? '✓ ' : ''}{name}
                    </button>
                  )
                })}
              </div>
            )}
            {responsaveis.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-1">{responsaveis.join(', ')}</p>
            )}
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              placeholder="Detalhes, pautas, objetivos..."
            />
          </div>

          {/* ── Converter em relatório de visita (só para edição) ── */}
          {item && (
            <div className={`rounded-xl border transition-all overflow-hidden ${convertVisit ? 'border-green-300 dark:border-green-700' : 'border-slate-200 dark:border-slate-600'}`}>
              <button
                type="button"
                onClick={() => setConvertVisit(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors ${convertVisit ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} className={convertVisit ? 'text-green-600' : 'text-slate-400'} />
                  <span className={convertVisit ? 'text-green-700 dark:text-green-300 font-semibold' : 'text-slate-600 dark:text-slate-300'}>
                    Converter em relatório de visita
                  </span>
                </span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${convertVisit ? 'rotate-180' : ''}`} />
              </button>
              {convertVisit && (
                <div className="px-3 pb-3 pt-2 space-y-2 bg-green-50 dark:bg-green-900/10 border-t border-green-200 dark:border-green-800">
                  <div>
                    <label className="label">Status da visita</label>
                    <select
                      className="input"
                      value={visitReport.visit_status}
                      onChange={e => setVisitReport(v => ({ ...v, visit_status: e.target.value }))}
                    >
                      <option>Realizada</option>
                      <option>Cancelada</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Demanda / Objetivo</label>
                    <input
                      className="input"
                      value={visitReport.demand}
                      onChange={e => setVisitReport(v => ({ ...v, demand: e.target.value }))}
                      placeholder="O que foi buscar nessa visita?"
                    />
                  </div>
                  <div>
                    <label className="label">Relatório</label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      value={visitReport.report}
                      onChange={e => setVisitReport(v => ({ ...v, report: e.target.value }))}
                      placeholder="O que aconteceu? Resultados, próximos passos..."
                    />
                  </div>
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">
                    Uma visita será registrada automaticamente e o compromisso marcado como Realizado.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Agendar próximo compromisso ── */}
          <div className={`rounded-xl border transition-all overflow-hidden ${scheduleNext ? 'border-blue-300 dark:border-blue-700' : 'border-slate-200 dark:border-slate-600'}`}>
            <button
              type="button"
              onClick={() => {
                if (!scheduleNext && form.cliente_nome && !nextAppt.titulo) {
                  setNextAppt(p => ({ ...p, titulo: `Visita — ${form.cliente_nome}` }))
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
        </div>

        {error && (
          <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-700 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
            <AlertCircle size={13} className="shrink-0" /> {error}
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={save} disabled={saving || !form.titulo.trim()} className="btn-primary flex-1 justify-center">
            {saving ? 'Salvando…' : item ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── DuplicateModal ────────────────────────────────────────────────
function DuplicateModal({ item, onClose, onConfirm }: {
  item: AgendaCompromisso
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Duplicar Compromisso</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nova data para <strong className="text-slate-700 dark:text-slate-200">"{item.titulo}"</strong>:
        </p>
        <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={() => onConfirm(date)} className="btn-primary flex-1 justify-center">
            <Copy size={13} /> Duplicar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────
function toVisitType(tipo: string): string {
  const map: Record<string, string> = {
    'Visita':  'Acompanhamento',
    'Reunião': 'Reunião',
    'Entrega': 'Entrega',
  }
  return map[tipo] ?? 'Outro'
}
