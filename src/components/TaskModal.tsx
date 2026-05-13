import { useState, useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, Calendar, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Task, TaskPriority, TaskStatus, CrmUser } from '../types'
import { TASK_PRIORITIES } from '../types'

interface TaskModalProps {
  task?: Task | null
  onClose: () => void
  onSaved: () => void
}

export default function TaskModal({ task, onClose, onSaved }: TaskModalProps) {
  const { user } = useAuth()
  const [title, setTitle]       = useState(task?.title ?? '')
  const [description, setDesc]  = useState(task?.description ?? '')
  const [deadline, setDeadline] = useState(task?.deadline ?? '')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'URGENTE_IMPORTANTE')
  const [status, setStatus]     = useState<TaskStatus>(task?.status ?? 'PENDENTE')
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    task?.assignees?.map(a => a.user_id) ?? (user?.id ? [user.id] : [])
  )
  const [users, setUsers]   = useState<CrmUser[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crm_users').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => {
        if (data) {
          setUsers(data as CrmUser[])
          // Se ainda não há assignee selecionado, adiciona o usuário atual
          setSelectedAssignees(prev =>
            prev.length > 0 ? prev : (user?.id ? [user.id] : [])
          )
        }
      })
  }, [user?.id])

  async function save() {
    if (!user?.id) return setError('Sessão inválida. Faça login novamente.')
    if (!title.trim()) return setError('Título é obrigatório.')
    const validAssignees = selectedAssignees.filter(Boolean)
    if (validAssignees.length === 0) return setError('Selecione pelo menos um responsável.')

    setSaving(true)
    setError(null)

    try {
      const taskData = {
        title:       title.trim(),
        description: description.trim() || null,
        deadline:    deadline || null,
        priority,
        status,
        creator_id:  task?.creator_id ?? user.id,
      }

      let taskId = task?.id

      if (taskId) {
        const { error: err } = await supabase.from('crm_tasks').update(taskData).eq('id', taskId)
        if (err) throw err
      } else {
        const { data: rows, error: err } = await supabase.from('crm_tasks').insert(taskData).select()
        if (err) throw err
        if (!rows?.length) throw new Error('Nenhum dado retornado após criação.')
        taskId = rows[0].id
      }

      // Sync assignees — delete then re-insert
      const { error: delErr } = await supabase.from('crm_task_assignees').delete().eq('task_id', taskId)
      if (delErr) throw delErr

      const { error: insErr } = await supabase
        .from('crm_task_assignees')
        .insert(validAssignees.map(uid => ({ task_id: taskId, user_id: uid })))
      if (insErr) throw insErr

      onSaved()
      onClose()
    } catch (err: any) {
      console.error('TaskModal save error:', err)
      setError(err?.message ?? 'Erro ao salvar tarefa.')
    } finally {
      setSaving(false)
    }
  }

  const toggleAssignee = (uid: string) => {
    setSelectedAssignees(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-orange-500" />
            {task?.id ? 'Editar Tarefa' : 'Nova Tarefa'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Erro no topo — sempre visível */}
        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 shadow-sm">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="label">Título da Demanda</label>
            <input
              className="input text-lg font-medium"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Descrição (opcional)</label>
            <textarea
              className="input min-h-[80px]"
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Detalhes adicionais..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <Calendar size={14} /> Prazo
              </label>
              <input
                type="date"
                className="input"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
              >
                <option value="PENDENTE">Pendente</option>
                <option value="CONCLUIDA">Concluída</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Matriz Eisenhower (Prioridade)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(TASK_PRIORITIES) as TaskPriority[]).map(p => {
                const info = TASK_PRIORITIES[p]
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      priority === p
                        ? `${info.bg} ring-2 ring-orange-500 ring-offset-1`
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-xs font-bold ${info.color}`}>{info.label}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-1.5">
              <UserPlus size={14} /> Responsáveis
            </label>
            {users.length === 0 ? (
              <p className="text-xs text-slate-400 italic mt-1">Carregando usuários...</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {users.map(u => {
                  const selected = selectedAssignees.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAssignee(u.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                        selected
                          ? 'bg-orange-500 border-orange-600 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{u.nome}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1.5">
              {selectedAssignees.filter(Boolean).length} responsável(is) selecionado(s)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center py-3">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex-1 justify-center py-3 shadow-md"
          >
            {saving ? 'Salvando...' : task?.id ? 'Salvar Alterações' : 'Criar Tarefa'}
          </button>
        </div>
      </div>
    </div>
  )
}
