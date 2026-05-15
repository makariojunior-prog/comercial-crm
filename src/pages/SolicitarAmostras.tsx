import { useState, useEffect } from 'react'
import { Gift, Package, Printer, MessageCircle, RefreshCw, AlertCircle, ChevronLeft } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import type { PriceItem } from '../types'
import { useAuth } from '../contexts/AuthContext'

type AmoItem = {
  qtd: number
  tipo: 'assado' | 'congelado'
  formato: 'unidades' | 'pacote'
  tamanho: '' | '500g' | '1kg' | '3kg'
}

type AmoStatus = 'PENDENTE' | 'PRODUZINDO' | 'ENTREGUE' | 'CANCELADO'

interface AmoRequest {
  id: string
  empresa: string
  vendedor: string
  cliente: string | null
  observacoes: string | null
  entrega_data: string | null
  entrega_hora: string | null
  itens: { nome: string; qtd: number; tipo: string; formato: string; tamanho: string }[]
  status: AmoStatus
  created_at: string
}

const STATUS_CFG: Record<AmoStatus, { label: string; bg: string; text: string }> = {
  PENDENTE:   { label: 'Pendente',   bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-400' },
  PRODUZINDO: { label: 'Produzindo', bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-400'   },
  ENTREGUE:   { label: 'Entregue',   bg: 'bg-green-100 dark:bg-green-900/40',  text: 'text-green-700 dark:text-green-400' },
  CANCELADO:  { label: 'Cancelado',  bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-400'     },
}

function addBizDays(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const dw = d.getDay()
    if (dw !== 0 && dw !== 6) added++
  }
  return d.toISOString().split('T')[0]
}

function buildWhatsApp(req: AmoRequest): string {
  const lab = req.empresa === 'lumar' ? 'Lumar Alimentos' : 'Cantina em Casa'
  let msg = `*Pedido de Amostras — ${lab}*\nVendedor: ${req.vendedor}`
  if (req.cliente) msg += `\nCliente: ${req.cliente}`
  if (req.entrega_data || req.entrega_hora)
    msg += `\nEntrega desejada: ${req.entrega_data || '—'} ${req.entrega_hora || ''}`
  msg += '\n\n*Produtos:*\n'
  msg += req.itens.map(it => {
    let extra = ''
    if (it.tipo === 'congelado')
      extra = ' — ' + (it.formato === 'pacote' ? `Pacote${it.tamanho ? ' ' + it.tamanho : ''}` : 'Unidades')
    return `- ${it.qtd}x ${it.nome} (${it.tipo === 'assado' ? 'Assado' : 'Congelado'}${extra})`
  }).join('\n')
  if (req.observacoes) msg += `\n\n*Obs:* ${req.observacoes}`
  msg += '\n\n_CRM Comercial_'
  return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg)
}

// ─── Print component ────────────────────────────────────────────
function PrintOrder({ req }: { req: AmoRequest }) {
  const lab = req.empresa === 'lumar' ? 'Lumar Alimentos' : 'Cantina em Casa'
  const createdAt = format(parseISO(req.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ borderBottom: '2px solid #333', paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Pedido de Amostras</h1>
        <h2 style={{ fontSize: 16, fontWeight: 400, color: '#555', margin: '4px 0 0' }}>{lab}</h2>
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>Emitido em {createdAt}</p>
      </div>
      <table style={{ width: '100%', marginBottom: 16, fontSize: 14 }}>
        <tbody>
          <tr><td style={{ width: 130, color: '#555', paddingBottom: 4 }}>Vendedor:</td><td style={{ fontWeight: 600 }}>{req.vendedor}</td></tr>
          {req.cliente && <tr><td style={{ color: '#555', paddingBottom: 4 }}>Cliente:</td><td style={{ fontWeight: 600 }}>{req.cliente}</td></tr>}
          {req.entrega_data && (
            <tr>
              <td style={{ color: '#555', paddingBottom: 4 }}>Entrega:</td>
              <td style={{ fontWeight: 600 }}>{req.entrega_data} {req.entrega_hora || ''}</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #ddd', paddingBottom: 6, marginBottom: 8 }}>Produtos</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ddd' }}>Produto</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid #ddd', width: 60 }}>Qtd</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ddd' }}>Tipo</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #ddd' }}>Formato/Tam.</th>
          </tr>
        </thead>
        <tbody>
          {req.itens.map((it, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{it.nome}</td>
              <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{it.qtd}</td>
              <td style={{ padding: '6px 8px' }}>{it.tipo === 'assado' ? '🔥 Assado' : '❄️ Congelado'}</td>
              <td style={{ padding: '6px 8px' }}>
                {it.tipo === 'congelado' ? (it.formato === 'pacote' ? `Pacote ${it.tamanho || ''}`.trim() : 'Unidades') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {req.observacoes && (
        <div style={{ marginTop: 16, padding: '10px 12px', background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6 }}>
          <strong style={{ fontSize: 12 }}>Observações:</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>{req.observacoes}</p>
        </div>
      )}
      <p style={{ marginTop: 20, fontSize: 11, color: '#aaa', textAlign: 'center' }}>CRM Comercial · Cantina / Lumar</p>
    </div>
  )
}

// ─── Request card (list) ────────────────────────────────────────
function RequestCard({ req, onPrint, onStatusChange }: {
  req: AmoRequest
  onPrint: (r: AmoRequest) => void
  onStatusChange: () => void
}) {
  const cfg = STATUS_CFG[req.status] || STATUS_CFG.PENDENTE
  const lab = req.empresa === 'lumar' ? 'Lumar' : 'Cantina em Casa'
  const dt = format(parseISO(req.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })
  const [saving, setSaving] = useState(false)

  async function changeStatus(s: AmoStatus) {
    setSaving(true)
    await supabase.from('crm_amostras').update({ status: s }).eq('id', req.id)
    setSaving(false)
    onStatusChange()
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            <span className="text-xs font-semibold text-slate-500">{lab}</span>
            <span className="text-xs text-slate-400">{dt}</span>
          </div>
          <p className="font-semibold text-slate-800 dark:text-slate-200 mt-1">{req.vendedor}</p>
          {req.cliente && <p className="text-xs text-slate-500">Cliente: {req.cliente}</p>}
          {req.entrega_data && <p className="text-xs text-slate-400">Entrega: {req.entrega_data} {req.entrega_hora || ''}</p>}
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap">
          <button onClick={() => onPrint(req)} className="btn-secondary text-xs py-1.5 px-2.5">
            <Printer size={13} /> Imprimir
          </button>
          <a href={buildWhatsApp(req)} target="_blank" rel="noopener noreferrer"
            className="btn text-xs py-1.5 px-2.5 bg-green-500 hover:bg-green-600 text-white">
            <MessageCircle size={13} /> WA
          </a>
        </div>
      </div>
      <div className="text-xs text-slate-500 space-y-0.5">
        {req.itens.map((it, i) => (
          <span key={i} className="inline-block mr-3">
            {it.qtd}x {it.nome}
            {it.tipo === 'congelado' ? ` ❄️${it.formato === 'pacote' && it.tamanho ? ' ' + it.tamanho : ''}` : ' 🔥'}
          </span>
        ))}
      </div>
      {req.status !== 'ENTREGUE' && req.status !== 'CANCELADO' && (
        <div className="flex gap-1.5 pt-1 flex-wrap">
          {req.status === 'PENDENTE' && (
            <button onClick={() => changeStatus('PRODUZINDO')} disabled={saving}
              className="btn-secondary text-[11px] py-1 px-2">Iniciar produção</button>
          )}
          {req.status === 'PRODUZINDO' && (
            <button onClick={() => changeStatus('ENTREGUE')} disabled={saving}
              className="btn text-[11px] py-1 px-2 bg-green-500 hover:bg-green-600 text-white">Marcar entregue</button>
          )}
          <button onClick={() => changeStatus('CANCELADO')} disabled={saving}
            className="btn-danger text-[11px] py-1 px-2">Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────
export default function SolicitarAmostras() {
  const { profile } = useAuth()

  const [step, setStep]               = useState(0)
  const [empresa, setEmpresa]         = useState<'lumar' | 'cantina' | null>(null)
  const [vendedor, setVendedor]       = useState(profile?.nome || '')
  const [cliente, setCliente]         = useState('')
  const [obs, setObs]                 = useState('')
  const [entregaData, setEntregaData] = useState('')
  const [entregaHora, setEntregaHora] = useState('')
  const [itens, setItens]             = useState<Record<string, AmoItem>>({})
  const [busca, setBusca]             = useState('')

  const [products, setProducts]       = useState<PriceItem[]>([])
  const [requests, setRequests]       = useState<AmoRequest[]>([])
  const [loadingProds, setLoadingProds] = useState(false)
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [filterStatus, setFilterStatus] = useState<AmoStatus | 'TODOS'>('TODOS')
  const [sending, setSending]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [savedReq, setSavedReq]       = useState<AmoRequest | null>(null)
  const [printTarget, setPrintTarget] = useState<AmoRequest | null>(null)

  const minDate = addBizDays(2)

  useEffect(() => { loadRequests() }, [])

  useEffect(() => {
    if (!printTarget) return
    const t = setTimeout(() => { window.print() }, 80)
    const onAfter = () => setPrintTarget(null)
    window.addEventListener('afterprint', onAfter)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', onAfter) }
  }, [printTarget])

  async function loadProducts(emp: 'lumar' | 'cantina') {
    setLoadingProds(true)
    const { data } = await supabase
      .from('crm_price_items').select('*').eq('empresa', emp).eq('ativo', true).order('nome')
    setProducts((data as PriceItem[]) || [])
    setLoadingProds(false)
  }

  async function loadRequests() {
    setLoadingReqs(true)
    const { data } = await supabase
      .from('crm_amostras').select('*').order('created_at', { ascending: false }).limit(30)
    setRequests((data || []) as AmoRequest[])
    setLoadingReqs(false)
  }

  function selectEmpresa(emp: 'lumar' | 'cantina') {
    setEmpresa(emp); setItens({}); loadProducts(emp); setStep(1)
  }

  function changeQtd(nome: string, delta: number) {
    setItens(prev => {
      const cur = prev[nome] || { qtd: 0, tipo: 'assado', formato: 'unidades', tamanho: '' }
      return { ...prev, [nome]: { ...cur, qtd: Math.max(0, cur.qtd + delta) } }
    })
  }

  function changeTipo(nome: string, tipo: 'assado' | 'congelado') {
    setItens(prev => ({
      ...prev,
      [nome]: { ...(prev[nome] || { qtd: 1, tipo, formato: 'unidades', tamanho: '' }), tipo, formato: 'unidades', tamanho: '' },
    }))
  }

  function setItemField(nome: string, field: keyof AmoItem, value: string) {
    setItens(prev => ({
      ...prev,
      [nome]: { ...(prev[nome] || { qtd: 1, tipo: 'assado', formato: 'unidades', tamanho: '' }), [field]: value },
    }))
  }

  const activeItems = Object.entries(itens).filter(([, v]) => v.qtd > 0)

  async function send() {
    if (!empresa) return
    if (!vendedor.trim()) { setError('Informe seu nome.'); return }
    if (activeItems.length === 0) { setError('Selecione ao menos um produto.'); return }
    if (entregaData && entregaData < minDate) {
      setError(`Data de entrega precisa ser a partir de ${minDate} (2 dias úteis).`)
      return
    }
    setSending(true); setError(null)

    const payload = activeItems.map(([nome, v]) => ({
      nome,
      qtd: v.qtd,
      tipo: v.tipo,
      formato: v.tipo === 'congelado' ? v.formato : 'unidades',
      tamanho: v.tipo === 'congelado' && v.formato === 'pacote' ? v.tamanho : '',
    }))

    const { data, error: err } = await supabase
      .from('crm_amostras')
      .insert({ empresa, vendedor: vendedor.trim(), cliente: cliente.trim() || null,
        observacoes: obs.trim() || null, entrega_data: entregaData || null,
        entrega_hora: entregaHora || null, itens: payload, status: 'PENDENTE' })
      .select().single()

    if (err) { setError('Erro ao salvar: ' + err.message); setSending(false); return }
    setSavedReq(data as AmoRequest)
    setSending(false)
    loadRequests()
    setStep(2)
  }

  function reset() {
    setStep(0); setEmpresa(null); setVendedor(profile?.nome || '')
    setCliente(''); setObs(''); setEntregaData(''); setEntregaHora('')
    setItens({}); setBusca(''); setSavedReq(null); setError(null)
  }

  const filteredProds = products.filter(p => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
  const filteredReqs = filterStatus === 'TODOS' ? requests : requests.filter(r => r.status === filterStatus)

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Print-only area */}
      {printTarget && (
        <div className="print-only">
          <PrintOrder req={printTarget} />
        </div>
      )}

      <div className="no-print space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Gift size={20} className="text-orange-500" /> Solicitar Amostras
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Monte o pedido e envie para a fábrica</p>
        </div>

        {/* ── Form card ── */}
        <div className="card p-5">

          {/* Step 0 — empresa */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Selecione a empresa</h2>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { e: 'lumar'   as const, ic: '🏭', t: 'Lumar Alimentos',  s: 'Formato atacado (3kg, 1kg)' },
                  { e: 'cantina' as const, ic: '🥐', t: 'Cantina em Casa',   s: 'Formato varejo (800g)'      },
                ]).map(x => (
                  <button key={x.e} onClick={() => selectEmpresa(x.e)}
                    className="rounded-xl border-2 border-slate-200 dark:border-slate-600 p-4 text-left hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all active:scale-[.98]">
                    <div className="text-3xl mb-2">{x.ic}</div>
                    <div className="font-bold text-sm text-slate-800 dark:text-slate-200">{x.t}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{x.s}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — form */}
          {step === 1 && empresa && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(0)} className="btn-ghost p-1.5 rounded-lg">
                  <ChevronLeft size={16} />
                </button>
                <h2 className="font-bold text-slate-700 dark:text-slate-200">
                  {empresa === 'lumar' ? '🏭 Lumar Alimentos' : '🥐 Cantina em Casa'}
                </h2>
              </div>

              {/* Dados */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Seu nome (vendedor) *</label>
                  <input className="input" value={vendedor} onChange={e => setVendedor(e.target.value)} placeholder="Seu nome" />
                </div>
                <div className="col-span-2">
                  <label className="label">Cliente / Estabelecimento</label>
                  <input className="input" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" />
                </div>
                <div>
                  <label className="label">Data de entrega</label>
                  <input type="date" className="input" min={minDate} value={entregaData} onChange={e => setEntregaData(e.target.value)} />
                </div>
                <div>
                  <label className="label">Horário</label>
                  <input type="time" className="input" value={entregaHora} onChange={e => setEntregaHora(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="label">Observações</label>
                  <textarea className="input resize-none" rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Observações adicionais..." />
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                ⏳ São necessários até <strong>2 dias úteis</strong> para confecção das amostras.
              </div>

              {/* Products */}
              <div>
                <label className="label">Produtos</label>
                <p className="text-xs text-slate-400 mb-2">
                  Qtd · <span className="text-orange-600 font-bold">Assado</span> ou <span className="text-blue-600 font-bold">Congelado</span>
                  {empresa === 'lumar' && ' · Congelado+Pacote: escolha o tamanho'}
                </p>
                <input className="input mb-2" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />

                {loadingProds ? (
                  <div className="text-center text-slate-400 text-sm py-4">Carregando produtos...</div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredProds.map(p => {
                      const it = itens[p.nome] || { qtd: 0, tipo: 'assado' as const, formato: 'unidades' as const, tamanho: '' as const }
                      const q = it.qtd
                      return (
                        <div key={p.id} className="px-3 py-2.5 bg-white dark:bg-slate-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate min-w-0">{p.nome}</span>
                            {/* Stepper */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button onClick={() => changeQtd(p.nome, -1)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-base transition-colors ${q > 0 ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                                −
                              </button>
                              <span className="w-5 text-center font-bold text-sm tabular-nums">{q}</span>
                              <button onClick={() => changeQtd(p.nome, 1)}
                                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-base hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                                +
                              </button>
                            </div>
                            {/* Tipo toggle */}
                            {q > 0 && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => changeTipo(p.nome, 'assado')}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${it.tipo === 'assado' ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                  🔥 Ass.
                                </button>
                                <button onClick={() => changeTipo(p.nome, 'congelado')}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${it.tipo === 'congelado' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                  ❄️ Cong.
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Congelado options */}
                          {q > 0 && it.tipo === 'congelado' && (
                            <div className="mt-2 pl-1 flex flex-wrap gap-x-4 gap-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400">Formato:</span>
                                {(['unidades', 'pacote'] as const).map(f => (
                                  <button key={f} onClick={() => setItemField(p.nome, 'formato', f)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${it.formato === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                    {f === 'unidades' ? 'Unidades' : 'Pacote'}
                                  </button>
                                ))}
                              </div>
                              {empresa === 'lumar' && it.formato === 'pacote' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-400">Tamanho:</span>
                                  {(['500g', '1kg', '3kg'] as const).map(sz => (
                                    <button key={sz} onClick={() => setItemField(p.nome, 'tamanho', sz)}
                                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors ${it.tamanho === sz ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                      {sz}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {filteredProds.length === 0 && (
                      <div className="py-6 text-center text-slate-400 text-sm">Nenhum produto encontrado</div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  <AlertCircle size={13} /> {error}
                </div>
              )}

              <button onClick={send} disabled={sending || activeItems.length === 0} className="btn-primary w-full justify-center">
                {sending ? 'Enviando...' : `Enviar Pedido (${activeItems.length} produto${activeItems.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          )}

          {/* Step 2 — success */}
          {step === 2 && savedReq && (
            <div className="text-center space-y-4 py-4">
              <div className="text-5xl">✅</div>
              <div>
                <h2 className="text-xl font-bold text-green-700 dark:text-green-400">Pedido enviado!</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {savedReq.cliente ? `Para ${savedReq.cliente} · ` : ''}{savedReq.itens.length} produto{savedReq.itens.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2 justify-center flex-wrap">
                <button onClick={() => setPrintTarget(savedReq)} className="btn-secondary">
                  <Printer size={16} /> Imprimir
                </button>
                <a href={buildWhatsApp(savedReq)} target="_blank" rel="noopener noreferrer"
                  className="btn bg-green-500 hover:bg-green-600 text-white">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              </div>
              <button onClick={reset} className="btn-ghost text-sm">Nova solicitação</button>
            </div>
          )}
        </div>

        {/* ── Requests list ── */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
              <Package size={16} className="text-orange-500" /> Pedidos
            </h2>
            <div className="flex items-center gap-2">
              <select className="input text-xs w-auto py-1.5" value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as AmoStatus | 'TODOS')}>
                <option value="TODOS">Todos</option>
                {(Object.keys(STATUS_CFG) as AmoStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                ))}
              </select>
              <button onClick={loadRequests} className="btn-ghost p-1.5">
                <RefreshCw size={14} className={loadingReqs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {loadingReqs ? (
            <div className="text-center text-slate-400 text-sm py-4">Carregando...</div>
          ) : filteredReqs.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">Nenhum pedido encontrado</div>
          ) : (
            <div className="space-y-2">
              {filteredReqs.map(req => (
                <RequestCard key={req.id} req={req} onPrint={setPrintTarget} onStatusChange={loadRequests} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
