import { useState, useEffect, useCallback, useRef } from 'react'
import {
  X, CheckCircle2, Circle, Edit2, Calendar, Clock,
  MessageSquare, Send, Loader2, AlertCircle, UserPlus,
} from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useEscKey } from '../hooks/useEscKey'
import type { Task, TaskComment, TaskPriority, TaskStatus, CrmUser } from '../types'
import { TASK_PRIORITIES } from '../types'

interface Props {
  task: Task
  onClose: () => void
  onSaved: () => void
}

type Tab = 'detalhes' | 'comentarios'

export default function TaskDetailModal({ task: initialTask, onClose, onSaved }: Props) {
  const { user } = useAuth()
  useEscKey(useCallback(onClose, [onClose]))

  const [task, setTask]           = useState<Task>(initialTask)
  const [tab, setTab]             = useState<Tab>('detalhes')
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Edit form fields
  const [title, setTitle]         = useState(task.title)
  const [description, setDesc]    = useState(task.description ?? '')
  const [deadline, setDeadline]   = useState(task.deadline ?? '')
  const [priority, setPriority]   = useState<TaskPriority>(task.priority)
  const [status, setStatus]       = useState<TaskStatus>(task.status)
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    task.assignees?.map(a => a.user_id) ?? []
  )
  const [users, setUsers]         = useState<CrmUser[]>([])

  // Comments
  const [comments, setComments]   = useState<TaskComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Load users and assignees when editing
  useEffect(() => {
    supabase.from('crm_users').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setUsers(data as CrmUser[]) })
  }, [])

  // Load full task with assignees
  useEffect(() => {
    async function loadFull() {
      const [taskRes, assigneesRes, usersRes] = await Promise.all([
        supabase.from('crm_tasks').select('*').eq('id', task.id).single(),
        supabase.from('crm_task_assignees').select('task_id, user_id').eq('task_id', task.id),
        supabase.from('crm_users').select('id, nome'),
      ])
      if (taskRes.data) {
        const usersMap: Record<string, string> = Object.fromEntries(
          (usersRes.data || []).map((u: any) => [u.id, u.nome])
        )
        const full: Task = {
          ...taskRes.data,
          assignees: (assigneesRes.data || []).map((a: any) => ({
            user_id: a.user_id,
            user_nome: usersMap[a.user_id] ?? 'Usuário',
          })),
        }
        setTask(full)
        setTitle(full.title)
        setDesc(full.description ?? '')
        setDeadline(full.deadline ?? '')
        setPriority(full.priority)
        setStatus(full.status)
        setSelectedAssignees(full.assignees?.map(a => a.user_id) ?? [])
      }
    }
    loadFull()
  }, [task.id])

  // Load comments when tab is opened
  useEffect(() => {
    if (tab !== 'comentarios') return
    loadComments()
  }, [tab, task.id])

  async function loadComments() {
    setCommentsLoading(true)
    const { data } = await supabase
      .from('crm_task_comments')
      .select('*, author:author_id(nome)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true })
    setComments((data ?? []) as TaskComment[])
    setCommentsLoading(false)
    setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function sendComment() {
    if (!newComment.trim()) return
    setSendingComment(true)
    setCommentError(null)
    const { error } = await supabase.from('crm_task_comments').insert({
      task_id:   task.id,
      author_id: user?.id ?? null,
      content:   newComment.trim(),
    })
    if (error) { setCommentError(error.message); setSendingComment(false); return }
    setNewComment('')
    setSendingComment(false)
    loadComments()
  }

  async function toggleStatus() {
    const next: TaskStatus = task.status === 'PENDENTE' ? 'CONCLUIDA' : 'PENDENTE'
    const { error } = await supabase.from('crm_tasks').update({ status: next }).eq('id', task.id)
    if (!error) {
      setTask(t => ({ ...t, status: next }))
      setStatus(next)
      onSaved()
    }
  }

  async function saveEdit() {
    if (!title.trim()) return setError('Título é obrigatório.')
    const valid = selectedAssignees.filter(Boolean)
    if (!valid.length) return setError('Selecione pelo menos um responsável.')
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('crm_tasks').update({
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline || null,
        priority,
        status,
      }).eq('id', task.id)
      if (err) throw err

      await supabase.from('crm_task_assignees').delete().eq('task_id', task.id)
      const { error: insErr } = await supabase.from('crm_task_assignees').insert(
        valid.map(uid => ({ task_id: task.id, user_id: uid }))
      )
      if (insErr) throw insErr

      // Refresh local task state
      const usersMap = Object.fromEntries(users.map(u => [u.id, u.nome]))
      setTask(t => ({
        ...t,
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline || null,
        priority,
        status,
        assignees: valid.map(uid => ({ user_id: uid, user_nome: usersMap[uid] ?? 'Usuário' })),
      }))
      setEditing(false)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setTitle(task.title)
    setDesc(task.description ?? '')
    setDeadline(task.deadline ?? '')
    setPriority(task.priority)
    setStatus(task.status)
    setSelectedAssignees(task.assignees?.map(a => a.user_id) ?? [])
    setError(null)
    setEditing(false)
  }

  const prio = TASK_PRIORITIES[task.priority]
  const isCompleted = task.status === 'CONCLUIDA'
  const commentsCount = comments.length

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={toggleStatus}
              title={isCompleted ? 'Marcar como pendente' : 'Marcar como concluída'}
              className={`shrink-0 transition-colors ${isCompleted ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-green-500'}`}
            >
              {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
            </button>
            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${prio.color} ${prio.bg}`}>
              {prio.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                title="Editar tarefa"
              >
                <Edit2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 dark:border-slate-700 shrink-0">
          {([['detalhes', 'Detalhes'], ['comentarios', `Comentários${commentsCount > 0 ? ` (${commentsCount})` : ''}`]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === id
                  ? 'text-orange-500 border-b-2 border-orange-500'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── DETALHES ── */}
          {tab === 'detalhes' && (
            <div className="px-5 py-4 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </div>
              )}

              {/* Title */}
              {editing ? (
                <div>
                  <label className="label">Título</label>
                  <input
                    className="input text-base font-medium"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    autoFocus
                  />
                </div>
              ) : (
                <h2 className={`text-base font-bold text-slate-800 dark:text-slate-100 leading-snug ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                  {task.title}
                </h2>
              )}

              {/* Description */}
              {editing ? (
                <div>
                  <label className="label">Descrição</label>
                  <textarea
                    className="input min-h-[80px] resize-none"
                    value={description}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Detalhes adicionais..."
                  />
                </div>
              ) : task.description ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  {task.description}
                </p>
              ) : null}

              {/* Deadline + Status */}
              <div className="grid grid-cols-2 gap-4">
                {editing ? (
                  <>
                    <div>
                      <label className="label flex items-center gap-1"><Calendar size={13} /> Prazo</label>
                      <input type="date" className="input text-sm" value={deadline} onChange={e => setDeadline(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Status</label>
                      <select className="input text-sm" value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                        <option value="PENDENTE">Pendente</option>
                        <option value="CONCLUIDA">Concluída</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {task.deadline && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Clock size={14} className="text-slate-400" />
                        <span>{format(parseISO(task.deadline), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}</span>
                      </div>
                    )}
                    <div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isCompleted ? '✓ Concluída' : '○ Pendente'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Priority (edit only) */}
              {editing && (
                <div>
                  <label className="label">Prioridade (Matriz Eisenhower)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(TASK_PRIORITIES) as TaskPriority[]).map(p => {
                      const info = TASK_PRIORITIES[p]
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            priority === p
                              ? `${info.bg} ring-2 ring-orange-500 ring-offset-1`
                              : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <p className={`text-xs font-bold ${info.color}`}>{info.label}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Assignees */}
              {editing ? (
                <div>
                  <label className="label flex items-center gap-1"><UserPlus size={13} /> Responsáveis</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {users.map(u => {
                      const sel = selectedAssignees.includes(u.id)
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedAssignees(prev =>
                            prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                          )}
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                            sel
                              ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {sel ? '✓ ' : ''}{u.nome}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : task.assignees && task.assignees.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Responsáveis</p>
                  <div className="flex flex-wrap gap-1.5">
                    {task.assignees.map(a => (
                      <span
                        key={a.user_id}
                        className="inline-flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 px-2.5 py-1 rounded-full font-medium"
                      >
                        <span className="w-4 h-4 rounded-full bg-orange-200 dark:bg-orange-700 flex items-center justify-center text-[9px] font-black">
                          {a.user_nome.charAt(0)}
                        </span>
                        {a.user_nome}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Created at */}
              {!editing && (
                <p className="text-[11px] text-slate-400">
                  Criada {formatDistanceToNow(parseISO(task.created_at), { locale: ptBR, addSuffix: true })}
                </p>
              )}
            </div>
          )}

          {/* ── COMENTÁRIOS ── */}
          {tab === 'comentarios' && (
            <div className="flex flex-col h-full">
              <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(90vh - 220px)' }}>
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={20} className="animate-spin text-slate-300" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhum comentário ainda.</p>
                    <p className="text-xs mt-1 opacity-60">Seja o primeiro a comentar!</p>
                  </div>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-[11px] font-black text-orange-600 dark:text-orange-400 shrink-0 mt-0.5">
                        {(c.author?.nome ?? 'U').charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {c.author?.nome ?? 'Usuário'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDistanceToNow(parseISO(c.created_at), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-700/50 rounded-xl rounded-tl-sm px-3 py-2">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={commentsEndRef} />
              </div>

              {/* Comment input */}
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 shrink-0">
                {commentError && (
                  <p className="text-xs text-red-600 mb-2">{commentError}</p>
                )}
                <div className="flex gap-2">
                  <textarea
                    className="input flex-1 text-sm resize-none min-h-[40px] max-h-[100px]"
                    placeholder="Escreva um comentário…"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment() }
                    }}
                    rows={1}
                  />
                  <button
                    onClick={sendComment}
                    disabled={sendingComment || !newComment.trim()}
                    className="btn-primary px-3 py-2 shrink-0 self-end"
                    title="Enviar (Enter)"
                  >
                    {sendingComment ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Enter para enviar · Shift+Enter para nova linha</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer (edit mode only) */}
        {tab === 'detalhes' && editing && (
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3 shrink-0">
            <button onClick={cancelEdit} className="btn-secondary flex-1 justify-center py-2.5">
              Cancelar
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="btn-primary flex-1 justify-center py-2.5"
            >
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
