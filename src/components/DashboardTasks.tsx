import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, Plus, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Task, TaskPriority } from '../types'
import { TASK_PRIORITIES } from '../types'
import TaskModal from './TaskModal'
import { Link } from 'react-router-dom'

export default function DashboardTasks() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority | null>(null)

  async function loadTasks() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('crm_tasks')
      .select(`
        *,
        assignees:crm_task_assignees(
          user_id,
          user:crm_users(nome)
        )
      `)
      .eq('status', 'PENDENTE')
      .order('created_at', { ascending: false })

    if (data) {
      const formattedTasks = data.map((t: any) => ({
        ...t,
        assignees: t.assignees.map((a: any) => ({
          user_id: a.user_id,
          user_nome: a.user?.nome || 'Usuário'
        }))
      }))
      // Filter only tasks where user is assignee
      const myTasks = formattedTasks.filter((t: any) => 
        t.assignees.some((a: any) => a.user_id === user.id)
      )
      setTasks(myTasks)
    }
    setLoading(false)
  }

  useEffect(() => { loadTasks() }, [user])

  async function toggleStatus(task: Task) {
    const { error } = await supabase
      .from('crm_tasks')
      .update({ status: 'CONCLUIDA' })
      .eq('id', task.id)
    
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== task.id))
    }
  }

  const quadrants: { id: TaskPriority; label: string; bg: string; border: string; text: string }[] = [
    { id: 'URGENTE_IMPORTANTE',         label: 'Fazer Agora',       bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-700' },
    { id: 'IMPORTANTE_NAO_URGENTE',     label: 'Agendar',           bg: 'bg-blue-50',   border: 'border-blue-100',   text: 'text-blue-700' },
    { id: 'URGENTE_NAO_IMPORTANTE',     label: 'Delegar',           bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700' },
    { id: 'NAO_URGENTE_NAO_IMPORTANTE', label: 'Eliminar/Esperar',  bg: 'bg-slate-50',  border: 'border-slate-100',  text: 'text-slate-600' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          🎯 Matriz Eisenhower
        </h2>
        <Link to="/tarefas" className="text-xs font-semibold text-orange-500 hover:underline flex items-center gap-0.5">
          Ver todas <ChevronRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {quadrants.map(q => (
          <div key={q.id} className={`rounded-2xl border ${q.bg} ${q.border} p-4 min-h-[160px] flex flex-col`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[10px] font-black uppercase tracking-wider ${q.text}`}>
                {q.label}
              </span>
              <button 
                onClick={() => { setSelectedPriority(q.id); setShowModal(true) }}
                className={`p-1 rounded-lg hover:bg-white/50 transition-colors ${q.text}`}
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex-1 space-y-2">
              {tasks.filter(t => t.priority === q.id).slice(0, 3).map(task => (
                <div key={task.id} className="flex items-start gap-2 group">
                  <button 
                    onClick={() => toggleStatus(task)}
                    className="mt-0.5 shrink-0 text-slate-300 hover:text-orange-500 transition-colors"
                  >
                    <Circle size={14} />
                  </button>
                  <p className="text-xs text-slate-700 line-clamp-2 leading-tight flex-1">
                    {task.title}
                  </p>
                </div>
              ))}
              {tasks.filter(t => t.priority === q.id).length === 0 && (
                <p className="text-[10px] text-slate-400 italic">Nenhuma tarefa pendente</p>
              )}
              {tasks.filter(t => t.priority === q.id).length > 3 && (
                <p className="text-[10px] text-slate-400 font-medium">
                  + {tasks.filter(t => t.priority === q.id).length - 3} outras
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <TaskModal 
          task={selectedPriority ? { priority: selectedPriority } as any : null}
          onClose={() => { setShowModal(false); setSelectedPriority(null) }}
          onSaved={loadTasks}
        />
      )}
    </div>
  )
}
