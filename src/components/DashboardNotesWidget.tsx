import { useState, useEffect } from 'react'
import { StickyNote, Pin, ChevronRight, Plus, Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Note } from '../types'
import { NOTE_COLORS } from '../types'
import { Link } from 'react-router-dom'
import NoteModal from './NoteModal'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function DashboardNotesWidget() {
  const { user } = useAuth()
  const [notes, setNotes]           = useState<Note[]>([])
  const [unreadCount, setUnread]    = useState(0)
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)

  async function load() {
    if (!user?.id) return
    setLoading(true)

    // My pinned notes + notes that mention me (unread)
    const [myRes, mentionRes] = await Promise.all([
      supabase
        .from('crm_notes')
        .select('*, author:crm_users(nome), mentions:crm_note_mentions(user_id, is_read)')
        .eq('author_id', user.id)
        .eq('is_pinned', true)
        .order('updated_at', { ascending: false })
        .limit(3),
      supabase
        .from('crm_note_mentions')
        .select('note_id, is_read, note:crm_notes(*, author:crm_users(nome))')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(4),
    ])

    const pinned = (myRes.data || []) as Note[]

    const mentioned = (mentionRes.data || [])
      .map((m: any) => m.note)
      .filter(Boolean) as Note[]

    setUnread(mentioned.length)

    // Merge pinned + unread mentions, deduplicate by id
    const seen = new Set<string>()
    const merged: Note[] = []
    for (const n of [...mentioned, ...pinned]) {
      if (!seen.has(n.id)) { seen.add(n.id); merged.push(n) }
    }
    setNotes(merged.slice(0, 5))
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.id])

  async function markRead(noteId: string) {
    if (!user?.id) return
    await supabase
      .from('crm_note_mentions')
      .update({ is_read: true })
      .eq('note_id', noteId)
      .eq('user_id', user.id)
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          <StickyNote size={16} className="text-yellow-500" />
          Notas
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">
              <Bell size={9} /> {unreadCount}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Plus size={16} />
          </button>
          <Link to="/notas" className="text-xs font-semibold text-orange-500 hover:underline flex items-center gap-0.5">
            Ver todas <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : notes.length === 0 ? (
        <div className="py-6 text-center text-slate-400 text-xs">
          <StickyNote size={24} className="mx-auto mb-2 opacity-30" />
          Nenhuma nota fixada ou menção nova
          <button
            onClick={() => setShowModal(true)}
            className="block mx-auto mt-2 text-orange-500 font-semibold hover:underline"
          >
            + Criar nota
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => {
            const c = NOTE_COLORS[n.color] ?? NOTE_COLORS.yellow
            const isUnread = n.mentions?.some(m => !m.is_read && (m as any).user_id === user?.id)

            return (
              <div
                key={n.id}
                className={`rounded-xl border p-3 transition-all cursor-pointer hover:shadow-sm ${c.bg} ${c.border} ${isUnread ? 'ring-2 ring-orange-400 ring-offset-1' : ''}`}
                onClick={() => { if (isUnread) markRead(n.id) }}
              >
                <div className="flex items-start gap-2">
                  {n.is_pinned && <Pin size={12} className="text-orange-500 shrink-0 mt-0.5" />}
                  {isUnread && <Bell size={12} className="text-orange-500 shrink-0 mt-0.5 animate-pulse" />}
                  <div className="flex-1 min-w-0">
                    {n.title && (
                      <p className="font-bold text-xs text-slate-800 truncate">{n.title}</p>
                    )}
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{n.content}</p>
                  </div>
                  <span className="text-[9px] text-slate-400 shrink-0">
                    {format(parseISO(n.updated_at), 'dd/MM', { locale: ptBR })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <NoteModal onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}
