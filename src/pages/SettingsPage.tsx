import { useState, useEffect } from 'react'
import { Settings, Users, Truck, Plus, Trash2, Save, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import type { Staff } from '../types'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/negocios" replace />

  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'staff' | 'general'>('staff')
  
  // New Staff State
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('Entregador')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStaff() {
    setLoading(true)
    const { data } = await supabase.from('crm_staff').select('*').order('name')
    if (data) setStaff(data)
    setLoading(false)
  }

  useEffect(() => { loadStaff() }, [])

  async function addStaff() {
    if (!newName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('crm_staff').insert({
      name: newName.trim(),
      role: newRole,
      phone: newPhone.trim() || null,
      active: true
    })
    if (!error) {
      setNewName(''); setNewPhone(''); loadStaff()
    } else {
      setError(error.message)
    }
    setSaving(false)
  }

  async function toggleStaffActive(id: string, current: boolean) {
    await supabase.from('crm_staff').update({ active: !current }).eq('id', id)
    loadStaff()
  }

  async function deleteStaff(id: string) {
    if (!confirm('Excluir este colaborador permanentemente?')) return
    await supabase.from('crm_staff').delete().eq('id', id)
    loadStaff()
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="text-slate-400" /> Configurações
        </h1>
        <p className="text-sm text-slate-500">Área administrativa para gestão de equipe e preferências</p>
      </div>

      <div className="flex border-b border-slate-200">
        <button onClick={() => setActiveTab('staff')} className={`px-6 py-3 text-sm font-bold flex items-center gap-2 ${activeTab === 'staff' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400'}`}>
          <Users size={16} /> Equipe Operacional
        </button>
        <button onClick={() => setActiveTab('general')} className={`px-6 py-3 text-sm font-bold flex items-center gap-2 ${activeTab === 'general' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-slate-400'}`}>
          <Settings size={16} /> Geral
        </button>
      </div>

      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Plus size={18} className="text-orange-500" /> Cadastrar Novo Colaborador
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Nome</label>
                <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label className="label">Função</label>
                <select className="input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option>Entregador</option>
                  <option>Promotor(a)</option>
                  <option>Vendedor Externo</option>
                  <option>Auxiliar</option>
                </select>
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(62) 9..." />
              </div>
            </div>
            <button onClick={addStaff} disabled={saving} className="btn-primary mt-4 w-full sm:w-auto">
              {saving ? 'Cadastrando...' : 'Cadastrar Colaborador'}
            </button>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </div>

          <div className="card overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Equipe Ativa ({staff.length})</h3>
              <button onClick={loadStaff} className="text-slate-400 hover:text-orange-500 transition-colors">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="divide-y divide-slate-50">
              {staff.map(s => (
                <div key={s.id} className={`flex items-center gap-4 px-4 py-3 ${!s.active ? 'opacity-50' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${s.role === 'Entregador' ? 'bg-blue-50 text-blue-500' : 'bg-orange-50 text-orange-500'}`}>
                    {s.role === 'Entregador' ? <Truck size={20} /> : <Users size={20} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.role} {s.phone && `· ${s.phone}`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleStaffActive(s.id, s.active)} className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${s.active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                      {s.active ? 'Ativo' : 'Inativo'}
                    </button>
                    <button onClick={() => deleteStaff(s.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {staff.length === 0 && !loading && (
                <div className="p-8 text-center text-slate-400 text-sm">Nenhum colaborador cadastrado</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="card p-12 text-center text-slate-400">
          <Settings size={48} className="mx-auto mb-4 opacity-10" />
          <p>Configurações gerais do sistema em breve.</p>
        </div>
      )}
    </div>
  )
}
