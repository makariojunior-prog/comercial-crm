import { useState, useEffect } from 'react'
import { Plus, Search, Filter, CheckCircle2, Circle, Clock, MoreVertical, Trash2, Edit2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Task } from '../types'
import { TASK_PRIORITIES } from '../types'
import TaskModal from '../components/TaskModal'
import TaskDetailModal from '../components/TaskDetailModal'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function TasksPage() {
  const { user, isAdmin } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [search, setSearch] = useState('')
  const [viewAll, setViewAll] = useState(false) // Toggle for Admins

  async function loadTasks() {
    setLoading(true)

    // Parallel fetch: tasks + assignee links + user names
    const [tasksRes, assigneesRes, usersRes] = await Promise.all([
      supabase.from('crm_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_task_assignees').select('task_id, user_id'),
      supabase.from('crm_users').select('id, nome'),
    ])

    if (tasksRes.error) {
      console.error('Error loading tasks:', tasksRes.error)
      setLoading(false)
      return
    }

    const usersMap: Record<string, string> = Object.fromEntries(
      (usersRes.data || []).map((u: any) => [u.id, u.nome])
    )
    const allAssignees = assigneesRes.data || []

    const formattedTasks = (tasksRes.data || []).map((t: any) => ({
      ...t,
      assignees: allAssignees
        .filter((a: any) => a.task_id === t.id)
        .map((a: any) => ({ user_id: a.user_id, user_nome: usersMap[a.user_id] || 'Usuário' })),
    }))

    const filtered = (!isAdmin || !viewAll)
      ? formattedTasks.filter((t: Task) => t.assignees?.some((a) => a.user_id === user?.id))
      : formattedTasks

    setTasks(filtered)
    setLoading(false)
  }

  useEffect(() => {
    if (user?.id) loadTasks()
    else setLoading(false)
  }, [viewAll, user?.id, isAdmin])

  async function toggleStatus(task: Task) {
    const newStatus = task.status === 'PENDENTE' ? 'CONCLUIDA' : 'PENDENTE'
    const { error } = await supabase
      .from('crm_tasks')
      .update({ status: newStatus })
      .eq('id', task.id)
    
    if (!error) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Excluir esta tarefa permanentemente?')) return
    const { error } = await supabase.from('crm_tasks').delete().eq('id', id)
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== id))
    }
  }

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  )

  const pending = filteredTasks.filter(t => t.status === 'PENDENTE')
  const completed = filteredTasks.filter(t => t.status === 'CONCLUIDA')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tarefas</h1>
          <p className="text-sm text-slate-500">
            {viewAll ? 'Visualizando todas as tarefas da equipe' : 'Gerenciando suas tarefas individuais'}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button 
              onClick={() => setViewAll(!viewAll)} 
              className={`btn-secondary ${viewAll ? 'bg-orange-50 border-orange-200 text-orange-600' : ''}`}
              title={viewAll ? 'Ver apenas minhas tarefas' : 'Ver tarefas de todos'}
            >
              <Users size={18} />
              <span className="hidden sm:inline">{viewAll ? 'Ver minhas' : 'Ver Equipe'}</span>
            </button>
          )}
          <button 
            onClick={() => { setEditingTask(null); setShowModal(true) }} 
            className="btn-primary"
          >
            <Plus size={18} /> Nova Tarefa
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            className="input pl-10" 
            placeholder="Buscar tarefas..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn-secondary px-3">
          <Filter size={18} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Carregando tarefas...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <CheckCircle2 size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nenhuma tarefa encontrada</p>
        </div>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pendentes ({pending.length})</h2>
              <div className="grid gap-3">
                {pending.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleStatus(task)}
                    onEdit={() => setDetailTask(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Concluídas ({completed.length})</h2>
              <div className="grid gap-3 opacity-60">
                {completed.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => toggleStatus(task)}
                    onEdit={() => setDetailTask(task)}
                    onDelete={() => deleteTask(task.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editingTask}
          onClose={() => { setShowModal(false); setEditingTask(null) }}
          onSaved={loadTasks}
        />
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onSaved={() => { loadTasks(); setDetailTask(null) }}
        />
      )}
    </div>
  )
}

function TaskCard({ task, onToggle, onEdit, onDelete }: { 
  task: Task, 
  onToggle: () => void, 
  onEdit: () => void,
  onDelete: () => void 
}) {
  const prio = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES['NAO_URGENTE_NAO_IMPORTANTE']
  const isCompleted = task.status === 'CONCLUIDA'

  return (
    <div className={`card p-4 transition-all hover:shadow-md group ${isCompleted ? 'bg-slate-50' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`mt-1 shrink-0 transition-colors ${isCompleted ? 'text-green-500' : 'text-slate-300 hover:text-orange-500'}`}
        >
          {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={onEdit}
              className={`font-semibold text-left hover:text-orange-600 transition-colors ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}
            >
              {task.title}
            </button>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button onClick={onEdit} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600" title="Abrir tarefa">
                <Edit2 size={14} />
              </button>
              <button onClick={onDelete} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500" title="Excluir">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          
          {task.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
          )}
          
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {task.categoria && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-50 text-blue-600 border border-blue-100">
                {task.categoria}
              </span>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${prio.color} ${prio.bg}`}>
              {prio.label}
            </span>
            
            {task.deadline && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock size={12} />
                {format(parseISO(task.deadline), 'dd MMM', { locale: ptBR })}
              </span>
            )}

            <div className="flex -space-x-2">
              {task.assignees?.map((a, i) => (
                <div 
                  key={i} 
                  className="w-6 h-6 rounded-full bg-orange-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-orange-600"
                  title={a.user_nome}
                >
                  {a.user_nome.charAt(0)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
