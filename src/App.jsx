import { useState, useEffect } from 'react'
import { Layout, Calculator, Package, Users, BarChart3, Clock, Plus, Search, Filter, TrendingUp, AlertCircle, X, ChevronRight, Save, CheckCircle2 } from 'lucide-react'
import { supabase } from './supabaseClient'

function App() {
  const [currentTab, setCurrentTab] = useState('home')
  const [deals, setDeals] = useState([])
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ active: 0, success: 0, priority: 0 })
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState('deal') // 'deal' or 'visit'
  
  // Form States
  const [dealForm, setDealForm] = useState({
    client_name: '', contact_name: '', contact_phone: '', deal_type: 'LUMAR', 
    responsible: 'MAKÁRIO', status: 'NOVO', priority: 'MÉDIA', interest: '', follow_up: ''
  })
  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    visit_type: 'Prospecção',
    client_name: '',
    contact_name: '',
    contact_phone: '',
    responsible: 'MAKÁRIO',
    status: 'Realizada',
    demand: '',
    report: '',
    priority: 'MÉDIA'
  })

  useEffect(() => {
    fetchStats()
    if (currentTab === 'negocios') fetchDeals()
    if (currentTab === 'visitas') fetchVisits()
  }, [currentTab])

  async function fetchStats() {
    const { data } = await supabase.from('deals').select('status, priority')
    if (data) {
      const active = data.filter(d => ['NOVO', 'EM ANDAMENTO'].includes(d.status)).length
      const success = data.filter(d => d.status === 'SUCESSO').length
      const highPriority = data.filter(d => d.priority === 'ALTA' && ['NOVO', 'EM ANDAMENTO'].includes(d.status)).length
      setStats({ active, success, priority: highPriority })
    }
  }

  async function fetchDeals() {
    setLoading(true)
    const { data } = await supabase.from('deals').select('*').order('last_contact_date', { ascending: false })
    if (data) setDeals(data)
    setLoading(false)
  }

  async function fetchVisits() {
    setLoading(true)
    const { data } = await supabase.from('visits').select('*').order('visit_date', { ascending: false })
    if (data) setVisits(data)
    setLoading(false)
  }

  async function saveDeal(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('deals').insert([dealForm])
    if (!error) {
      setShowModal(false)
      fetchDeals()
      fetchStats()
      setDealForm({ client_name: '', contact_name: '', contact_phone: '', deal_type: 'LUMAR', responsible: 'MAKÁRIO', status: 'NOVO', priority: 'MÉDIA', interest: '', follow_up: '' })
    } else {
      alert('Erro ao salvar: ' + error.message)
    }
    setLoading(false)
  }

  async function saveVisit(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('visits').insert([visitForm])
    if (!error) {
      setShowModal(false)
      fetchVisits()
      setVisitForm({ 
        visit_date: new Date().toISOString().split('T')[0],
        visit_type: 'Prospecção',
        client_name: '',
        contact_name: '',
        contact_phone: '',
        responsible: 'MAKÁRIO',
        status: 'Realizada',
        demand: '',
        report: '',
        priority: 'MÉDIA'
      })
    } else {
      alert('Erro ao salvar: ' + error.message)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-[#faf5e3] pb-24 font-sans relative">
      <header className="bg-[#2f4538] p-4 sticky top-0 z-20 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-white text-xl font-bold italic tracking-tight">Lumar & Cantina</h1>
          <p className="text-white/60 text-[10px] uppercase tracking-widest font-bold">CRM Comercial</p>
        </div>
        {(currentTab === 'negocios' || currentTab === 'visitas') && (
          <button 
            onClick={() => { setModalType(currentTab === 'negocios' ? 'deal' : 'visit'); setShowModal(true); }}
            className="bg-white text-[#2f4538] p-2 rounded-full shadow-md active:scale-90 transition-transform"
          >
            <Plus size={20} />
          </button>
        )}
      </header>

      <main className="p-4">
        {currentTab === 'home' && (
          <div className="space-y-4">
            <div className="bg-[#2f4538] p-6 rounded-3xl text-white shadow-xl relative overflow-hidden border border-white/10">
              <div className="relative z-10">
                <h2 className="text-2xl font-black mb-1">Olá, Makário</h2>
                <p className="text-white/70 text-sm font-medium">Seu funil tem {stats.active} negócios ativos.</p>
              </div>
              <TrendingUp className="absolute -right-4 -bottom-4 text-white/5" size={140} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setCurrentTab('negocios')} className="bg-white p-6 rounded-3xl border border-[#ddd8c8] flex flex-col items-center gap-3 shadow-sm active:bg-gray-50 transition-all">
                <div className="bg-blue-50 p-3 rounded-2xl"><Users className="text-blue-600" size={28} /></div>
                <span className="text-sm font-black text-gray-700 uppercase tracking-tighter">Negócios</span>
              </button>
              <button onClick={() => setCurrentTab('visitas')} className="bg-white p-6 rounded-3xl border border-[#ddd8c8] flex flex-col items-center gap-3 shadow-sm active:bg-gray-50 transition-all">
                <div className="bg-orange-50 p-3 rounded-2xl"><Clock className="text-orange-600" size={28} /></div>
                <span className="text-sm font-black text-gray-700 uppercase tracking-tighter">Visitas</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-[#ddd8c8] overflow-hidden shadow-sm">
               <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest">Performance Comercial</h3>
                  <BarChart3 size={18} className="text-gray-400" />
               </div>
               <div className="p-6 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-3xl font-black text-[#2f4538]">{stats.active}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-black">Ativos</div>
                  </div>
                  <div>
                    <div className="text-3xl font-black text-green-600">{stats.success}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-black">Sucesso</div>
                  </div>
                  <div>
                    <div className="text-3xl font-black text-red-500">{stats.priority}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-black">Urgente</div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {currentTab === 'negocios' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="text" placeholder="Buscar cliente..." className="w-full bg-white border border-[#ddd8c8] rounded-2xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none shadow-sm" />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2f4538]"></div></div>
            ) : (
              <div className="space-y-3 pb-20">
                {deals.map(deal => (
                  <div key={deal.id} className="bg-white p-5 rounded-3xl border border-[#ddd8c8] shadow-sm hover:border-[#2f4538] transition-colors relative">
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter ${
                        deal.status === 'SUCESSO' ? 'bg-green-100 text-green-700' :
                        deal.status === 'CANCELADO' || deal.status === 'DESISTIU' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {deal.status}
                      </span>
                      {deal.priority === 'ALTA' && <AlertCircle className="text-red-500 animate-pulse" size={18} />}
                    </div>
                    <h4 className="font-black text-gray-800 text-lg leading-tight mb-1">{deal.client_name}</h4>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{deal.deal_type} · {deal.responsible}</p>
                    {deal.follow_up && <p className="text-xs text-gray-600 mt-3 line-clamp-2 bg-gray-50 p-2 rounded-xl border border-gray-100 italic">{deal.follow_up}</p>}
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 pt-4 mt-4 border-t border-gray-50 font-bold uppercase tracking-widest">
                      <Clock size={12} />
                      <span>{new Date(deal.last_contact_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentTab === 'visitas' && (
          <div className="space-y-4">
             <div className="bg-orange-600 p-5 rounded-3xl text-white shadow-lg mb-6 flex justify-between items-center">
                <div>
                  <h3 className="font-black text-lg">Visitas do Mês</h3>
                  <p className="text-orange-100 text-sm font-medium">{visits.length} registros encontrados</p>
                </div>
                <Clock size={32} className="text-white/20" />
             </div>

             {loading ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div></div>
            ) : (
              <div className="space-y-3 pb-20">
                {visits.map(visit => (
                  <div key={visit.id} className="bg-white p-5 rounded-3xl border border-[#ddd8c8] shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                    <div className="flex justify-between mb-2">
                       <span className="text-[10px] font-black uppercase text-orange-600 tracking-widest">{visit.visit_type}</span>
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{new Date(visit.visit_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <h4 className="font-black text-gray-800 text-lg leading-tight">{visit.client_name}</h4>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{visit.responsible}</p>
                    {visit.contact_name && <p className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-widest">Contato: {visit.contact_name} {visit.contact_phone && `(${visit.contact_phone})`}</p>}
                    {visit.report && <p className="text-xs text-gray-600 mt-3 bg-orange-50/50 p-3 rounded-2xl border border-orange-100/50 italic">{visit.report}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[#ddd8c8] flex justify-around p-3 pb-8 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] rounded-t-[40px] z-30">
        <button onClick={() => setCurrentTab('home')} className={`flex flex-col items-center transition-all ${currentTab === 'home' ? 'text-[#2f4538] scale-110' : 'text-gray-400'}`}>
          <Layout size={24} strokeWidth={currentTab === 'home' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase mt-1 tracking-widest">Home</span>
        </button>
        <button onClick={() => setCurrentTab('negocios')} className={`flex flex-col items-center transition-all ${currentTab === 'negocios' ? 'text-[#2f4538] scale-110' : 'text-gray-400'}`}>
          <Users size={24} strokeWidth={currentTab === 'negocios' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase mt-1 tracking-widest">Vendas</span>
        </button>
        <button onClick={() => setCurrentTab('visitas')} className={`flex flex-col items-center transition-all ${currentTab === 'visitas' ? 'text-[#2f4538] scale-110' : 'text-gray-400'}`}>
          <Clock size={24} strokeWidth={currentTab === 'visitas' ? 3 : 2} />
          <span className="text-[9px] font-black uppercase mt-1 tracking-widest">Visitas</span>
        </button>
      </nav>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-[480px] rounded-t-[40px] sm:rounded-[40px] p-6 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">
                Novo {modalType === 'deal' ? 'Negócio' : 'Visita'}
              </h2>
              <button onClick={() => setShowModal(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200">
                <X size={20} />
              </button>
            </div>

            {modalType === 'deal' ? (
              <form onSubmit={saveDeal} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Cliente *</label>
                  <input required value={dealForm.client_name} onChange={e => setDealForm({...dealForm, client_name: e.target.value})} type="text" className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none" placeholder="Nome da empresa" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Contato</label>
                      <input value={dealForm.contact_name} onChange={e => setDealForm({...dealForm, contact_name: e.target.value})} type="text" className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none" />
                   </div>
                   <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Fone</label>
                      <input value={dealForm.contact_phone} onChange={e => setDealForm({...dealForm, contact_phone: e.target.value})} type="text" className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none" />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Tipo</label>
                    <select value={dealForm.deal_type} onChange={e => setDealForm({...dealForm, deal_type: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none">
                       <option>LUMAR</option>
                       <option>CANTINA REVENDA</option>
                       <option>LUMAR / CANTINA</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Prioridade</label>
                    <select value={dealForm.priority} onChange={e => setDealForm({...dealForm, priority: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none">
                       <option>BAIXA</option>
                       <option>MÉDIA</option>
                       <option>ALTA</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Acompanhamento</label>
                  <textarea value={dealForm.follow_up} onChange={e => setDealForm({...dealForm, follow_up: e.target.value})} className="w-full bg-gray-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-[#2f4538] outline-none min-h-[80px]" placeholder="O que aconteceu no último contato?"></textarea>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-[#2f4538] text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl flex justify-center items-center gap-2 active:scale-95 transition-all">
                  {loading ? 'Salvando...' : 'Salvar Negócio'}
                </button>
              </form>
            ) : (
              <form onSubmit={saveVisit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Data</label>
                    <input type="date" value={visitForm.visit_date} onChange={e => setVisitForm({...visitForm, visit_date: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Tipo</label>
                    <select value={visitForm.visit_type} onChange={e => setVisitForm({...visitForm, visit_type: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none">
                       <option>Prospecção</option>
                       <option>Cobrança</option>
                       <option>Degustação</option>
                       <option>Pós-Venda</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Cliente *</label>
                  <input required placeholder="Nome do cliente visitado" value={visitForm.client_name} onChange={e => setVisitForm({...visitForm, client_name: e.target.value})} type="text" className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Contato</label>
                      <input value={visitForm.contact_name} onChange={e => setVisitForm({...visitForm, contact_name: e.target.value})} type="text" className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none" />
                   </div>
                   <div>
                      <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Telefone do Contato</label>
                      <input value={visitForm.contact_phone} onChange={e => setVisitForm({...visitForm, contact_phone: e.target.value})} type="text" className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none" />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Responsável</label>
                    <select value={visitForm.responsible} onChange={e => setVisitForm({...visitForm, responsible: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none">
                       <option>MAKÁRIO</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Status</label>
                    <select value={visitForm.status} onChange={e => setVisitForm({...visitForm, status: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none">
                       <option>Realizada</option>
                       <option>Agendada</option>
                       <option>Pendente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Demanda / Objetivo</label>
                  <input placeholder="O que foi buscar nessa visita?" value={visitForm.demand} onChange={e => setVisitForm({...visitForm, demand: e.target.value})} type="text" className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none" />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Relatório</label>
                  <textarea value={visitForm.report} onChange={e => setVisitForm({...visitForm, report: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none min-h-[100px]" placeholder="O que aconteceu? Resultados, próximos passos..."></textarea>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Prioridade</label>
                  <select value={visitForm.priority} onChange={e => setVisitForm({...visitForm, priority: e.target.value})} className="w-full bg-orange-50 border-none rounded-2xl py-4 px-4 text-sm focus:ring-2 focus:ring-orange-600 outline-none">
                     <option>BAIXA</option>
                     <option>MÉDIA</option>
                     <option>ALTA</option>
                  </select>
                </div>

                <div className="pb-2">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 tracking-widest">Fotos (0/3)</label>
                  <div className="mt-2 flex gap-2">
                     <div className="w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400">
                        <Plus size={16} />
                        <span className="text-[8px] font-bold uppercase mt-1">Foto</span>
                     </div>
                  </div>
                  <p className="text-[8px] text-gray-400 mt-2 ml-2">No celular abre a câmera automaticamente · max 3 fotos · comprimidas antes do envio</p>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl flex justify-center items-center gap-2 active:scale-95 transition-all">
                   {loading ? 'Salvando...' : 'Registrar Visita'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export default App
