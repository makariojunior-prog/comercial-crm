import { useState, useEffect } from 'react'
import { Plus, Search, Pin, Trash2, Edit2, StickyNote, Bell, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Note, NoteColor } from '../types'
import { NOTE_COLORS } from '../types'
import NoteModal from '../components/NoteModal'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type TabId = 'minhas' | 'para_mim'

export default function NotesPage() {
  const { user } = useAuth()
  const [notes, setNotes]         = useState<Note[]>([])
  const [mentions, setMentions]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [tab, setTab]             = useState<TabId>('minhas')
  const [colorFilter, setColorF]  = useState<NoteColor | 'TODOS'>('TODOS')
  const [showModal, setShowModal] = useState(false)
  const [editNote, setEditNote]   = useState<Note | null>(null)

  async function load() {
    if (!user?.id) return
    setLoading(true)

    const [myRes, mentionRes] = await Promise.all([
      supabase
        .from('crm_notes')
        .select('*, author:crm_users(nome), mentions:crm_note_mentions(id, user_id, is_read, user:crm_users(nome))')
        .eq('author_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false }),
      supabase
        .from('crm_note_mentions')
        .select('id, is_read, note:crm_notes(*, author:crm_users(nome), mentions:crm_note_mentions(id, user_id, is_read))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    setNotes((myRes.data || []) as Note[])
    setMentions(mentionRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  async function deleteNote(id: string) {
    if (!confirm('Excluir esta nota permanentemente?')) return
    await supabase.from('crm_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function togglePin(note: Note) {
    await supabase.from('crm_notes').update({ is_pinned: !note.is_pinned }).eq('id', note.id)
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n))
  }

  async function markRead(mentionId: string) {
    await supabase.from('crm_note_mentions').update({ is_read: true }).eq('id', mentionId)
    setMentions(prev => prev.map(m => m.id === mentionId ? { ...m, is_read: true } : m))
  }

  const filteredNotes = notes.filter(n => {
    const q = search.toLowerCase()
    const matchSearch = !q || (n.title ?? '').toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    const matchColor = colorFilter === 'TODOS' || n.color === colorFilter
    return matchSearch && matchColor
  })

  const unreadMentions = mentions.filter(m => !m.is_read)
  const allMentionNotes = mentions.map(m => ({ ...m.note, _mention_id: m.id, _is_read: m.is_read }))
    .filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <StickyNote className="text-yellow-500" size={24} /> Notas
          </h1>
          <p className="text-sm text-slate-500">Anotações pessoais e lembretes para a equipe</p>
        </div>
        <button onClick={() => { setEditNote(null); setShowModal(true) }} className="btn-primary">
          <Plus size={18} /> Nova Nota
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setTab('minhas')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === 'minhas' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500'}`}
        >
          Minhas Notas ({notes.length})
        </button>
        <button
          onClick={() => setTab('para_mim')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'para_mim' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500'}`}
        >
          Para Mim ({mentions.length})
          {unreadMentions.length > 0 && (
            <span className="text-[10px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
              {unreadMentions.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'minhas' && (
        <>
          {/* Search + color filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                className="input pl-9"
                placeholder="Buscar notas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 items-center">
              <button
                onClick={() => setColorF('TODOS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${colorFilter === 'TODOS' ? 'bg-slate-800 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                Todas
              </button>
              {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => (
                <button
                  key={c}
                  onClick={() => setColorF(c)}
                  className={`w-6 h-6 rounded-full transition-all ${NOTE_COLORS[c].dot} ${colorFilter === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}`}
                  title={NOTE_COLORS[c].label}
                />
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-slate-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <StickyNote size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">
                {search ? 'Nenhuma nota encontrada' : 'Nenhuma nota ainda'}
              </p>
              {!search && (
                <button onClick={() => setShowModal(true)} className="btn-primary mt-4 mx-auto">
                  <Plus size={16} /> Criar primeira nota
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotes.map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onEdit={() => { setEditNote(note); setShowModal(true) }}
                  onDelete={() => deleteNote(note.id)}
                  onTogglePin={() => togglePin(note)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'para_mim' && (
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : allMentionNotes.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Bell size={48} className="mx-auto mb-4 opacity-20" />
              <p>Nenhum colega enviou notas para você ainda</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allMentionNotes.map((n: any) => (
                <div
                  key={n._mention_id}
                  className={`relative rounded-2xl border-2 p-4 transition-all ${NOTE_COLORS[n.color as NoteColor]?.bg ?? 'bg-yellow-50'} ${NOTE_COLORS[n.color as NoteColor]?.border ?? 'border-yellow-300'} ${!n._is_read ? 'ring-2 ring-orange-400 ring-offset-1' : 'opacity-75'}`}
                >
                  {!n._is_read && (
                    <button
                      onClick={() => markRead(n._mention_id)}
                      className="absolute top-2 right-2 p-1 rounded-full bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                      title="Marcar como lido"
                    >
                      <X size={10} />
                    </button>
                  )}
                  {n.is_pinned && <Pin size={12} className="text-orange-500 mb-1" />}
                  {n.title && <p className="font-bold text-sm text-slate-800 truncate mb-1">{n.title}</p>}
                  <p className="text-xs text-slate-700 line-clamp-4 leading-relaxed">{n.content}</p>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
                    <span className="text-[10px] font-bold text-slate-500">
                      De: {n.author?.nome ?? '—'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {format(parseISO(n.updated_at), 'dd/MM', { locale: ptBR })}
                    </span>
                  </div>
                  {!n._is_read && (
                    <button
                      onClick={() => markRead(n._mention_id)}
                      className="mt-2 w-full py-1.5 rounded-lg bg-black/10 hover:bg-black/15 text-[11px] font-bold text-slate-700 transition-colors"
                    >
                      ✓ Marcar como lido
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showModal && (
        <NoteModal
          note={editNote}
          onClose={() => { setShowModal(false); setEditNote(null) }}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ─── NoteCard ───────────────────────────────────────────────────
function NoteCard({ note, onEdit, onDelete, onTogglePin }: {
  note: Note
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const c = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow
  const mentionNames = (note.mentions || [])
    .map((m: any) => m.user?.nome)
    .filter(Boolean)

  return (
    <div className={`group relative rounded-2xl border-2 p-4 transition-all hover:shadow-md ${c.bg} ${c.border}`}>
      {/* Actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onTogglePin}
          className={`p-1.5 rounded-lg transition-colors ${note.is_pinned ? 'text-orange-500 bg-orange-50' : 'text-slate-400 bg-white/70 hover:text-slate-600'}`}
          title={note.is_pinned ? 'Desfixar' : 'Fixar'}
        >
          <Pin size={12} />
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-lg bg-white/70 text-slate-400 hover:text-slate-600 transition-colors">
          <Edit2 size={12} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg bg-white/70 text-slate-400 hover:text-red-500 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Pin indicator */}
      {note.is_pinned && <Pin size={12} className="text-orange-500 mb-1.5" />}

      {/* Content */}
      {note.title && (
        <p className="font-bold text-sm text-slate-800 mb-1 pr-16">{note.title}</p>
      )}
      <p className="text-xs text-slate-700 line-clamp-6 leading-relaxed whitespace-pre-wrap">
        {note.content}
      </p>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">
          {format(parseISO(note.updated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
        </span>
        {mentionNames.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Users size={9} />
            {mentionNames.slice(0, 2).join(', ')}
            {mentionNames.length > 2 && ` +${mentionNames.length - 2}`}
          </span>
        )}
      </div>
    </div>
  )
}
