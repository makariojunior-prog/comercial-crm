import { useState, useEffect, useCallback } from 'react'
import { X, Pin, Users, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Note, NoteColor, CrmUser } from '../types'
import { NOTE_COLORS } from '../types'
import { useEscKey } from '../hooks/useEscKey'

interface Props {
  note?: Note | null
  defaultMentions?: string[]
  onClose: () => void
  onSaved: () => void
}

export default function NoteModal({ note, defaultMentions = [], onClose, onSaved }: Props) {
  useEscKey(useCallback(onClose, [onClose]))
  const { user } = useAuth()
  const [title,    setTitle]    = useState(note?.title    ?? '')
  const [content,  setContent]  = useState(note?.content  ?? '')
  const [color,    setColor]    = useState<NoteColor>(note?.color ?? 'yellow')
  const [isPinned, setIsPinned] = useState(note?.is_pinned ?? false)
  const [mentions, setMentions] = useState<string[]>(
    note?.mentions?.map(m => m.user_id) ?? defaultMentions
  )
  const [users,   setUsers]   = useState<CrmUser[]>([])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crm_users').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setUsers(data as CrmUser[]) })
  }, [])

  function toggleMention(uid: string) {
    setMentions(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  async function save() {
    if (!content.trim()) return setError('O conteúdo da nota é obrigatório.')
    if (!user?.id) return setError('Sessão inválida.')
    setSaving(true)
    setError(null)

    try {
      const noteData = {
        title:     title.trim() || null,
        content:   content.trim(),
        color,
        is_pinned: isPinned,
        author_id: note?.author_id ?? user.id,
        updated_at: new Date().toISOString(),
      }

      let noteId = note?.id

      if (noteId) {
        const { error: e } = await supabase.from('crm_notes').update(noteData).eq('id', noteId)
        if (e) throw e
      } else {
        const { data, error: e } = await supabase.from('crm_notes').insert(noteData).select()
        if (e) throw e
        if (!data?.length) throw new Error('Nenhum dado retornado após criação da nota.')
        noteId = data[0].id
      }

      // Sync mentions: delete all, re-insert
      await supabase.from('crm_note_mentions').delete().eq('note_id', noteId)
      if (mentions.length > 0) {
        const { error: e } = await supabase.from('crm_note_mentions').insert(
          mentions.map(uid => ({ note_id: noteId, user_id: uid, is_read: false }))
        )
        if (e) throw e
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar nota.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] border-2 ${NOTE_COLORS[color].border} ${NOTE_COLORS[color].bg}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <h2 className="font-bold text-slate-800">{note?.id ? 'Editar Nota' : 'Nova Nota'}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPinned(p => !p)}
              className={`p-1.5 rounded-lg transition-colors ${isPinned ? 'text-orange-500 bg-orange-50' : 'text-slate-400 hover:bg-black/5'}`}
              title={isPinned ? 'Desfixar' : 'Fixar nota'}
            >
              <Pin size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 text-slate-400">
              <X size={20} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <input
            className="w-full bg-transparent border-none outline-none text-lg font-bold text-slate-800 placeholder:text-slate-400 placeholder:font-normal"
            placeholder="Título (opcional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />

          {/* Content */}
          <textarea
            className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400 resize-none min-h-[240px] leading-relaxed"
            placeholder="Escreva sua nota aqui..."
            value={content}
            onChange={e => setContent(e.target.value)}
          />

          {/* Color picker */}
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2">
              {(Object.keys(NOTE_COLORS) as NoteColor[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${NOTE_COLORS[c].dot} ${color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-70 hover:opacity-100'}`}
                  title={NOTE_COLORS[c].label}
                />
              ))}
            </div>
          </div>

          {/* Assign to users */}
          <div>
            <label className="label flex items-center gap-1.5"><Users size={12} /> Co-responsáveis / Notificar</label>
            <div className="flex flex-wrap gap-2">
              {users.map(u => {
                const selected = mentions.includes(u.id)
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMention(u.id)}
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${
                      selected
                        ? 'bg-slate-700 border-slate-800 text-white shadow-sm'
                        : 'bg-white/60 border-black/10 text-slate-600 hover:bg-white/80'
                    }`}
                  >
                    {selected ? '✓ ' : ''}{u.nome}
                  </button>
                )
              })}
            </div>
            {mentions.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-1.5">
                {mentions.length} pessoa{mentions.length !== 1 ? 's' : ''} será notificada
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-black/5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || !content.trim()}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : note?.id ? 'Salvar' : 'Criar Nota'}
          </button>
        </div>
      </div>
    </div>
  )
}
