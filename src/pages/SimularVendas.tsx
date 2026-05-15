import { useState } from 'react'
import { Calculator, ChevronLeft, MessageCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PriceItem } from '../types'

// ─── Pricing levels (same logic as legacy app) ──────────────────
const NIVEIS = [
  { id: 1, nome: 'Normal',    sub: 'Preço cheio',        fat: 1.00 as number | null, auto: true,
    cor: 'text-green-800 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/30',
    border: 'border-green-400', hex: '#27500A' },
  { id: 2, nome: 'Agressivo', sub: 'Cliente novo',        fat: 0.85 as number | null, auto: true,
    cor: 'text-blue-800 dark:text-blue-300',  bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-400',  hex: '#0C447C' },
  { id: 3, nome: 'Ataque',    sub: 'Concorrente ativo',   fat: null as number | null, auto: false,
    cor: 'text-amber-800 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-400', hex: '#633806' },
  { id: 4, nome: 'Rota',      sub: 'Cidade nova',         fat: null as number | null, auto: false,
    cor: 'text-red-800 dark:text-red-300',   bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-400',   hex: '#791F1F' },
]

type Regime = 'lp_lr' | 'simples'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function pct(v: number) {
  return Math.round(v * 100) + '%'
}

function useSimCalc(
  products: PriceItem[],
  qtds: Record<string, number>,
  empresa: 'lumar' | 'cantina' | null,
  regime: Regime,
) {
  function simBase(p: PriceItem): number {
    return empresa === 'lumar' ? (p.preco_lumar ?? 0) : (p.preco_revenda ?? 0)
  }

  function simPrice(p: PriceItem, nid: number): number {
    const n = NIVEIS.find(x => x.id === nid)!
    return n.fat !== null ? simBase(p) * n.fat : (p.custo ?? 0)
  }

  function calc(nid: number) {
    let pr = 0, cu = 0, ic = 0, ipf = 0, ino = 0
    products.forEach(p => {
      const q = qtds[p.id] || 0
      if (!q) return
      const u = simPrice(p, nid)
      pr += u * q
      cu += (p.custo ?? 0) * q
      if (regime === 'lp_lr') {
        const tx = p.pf ? 0.07 : 0.19
        const v = u * q * tx
        ic += v
        if (p.pf) ipf += v; else ino += v
      }
    })
    return { pr, cu, ic, ipf, ino, mg: pr > 0 ? (pr - cu) / pr : 0 }
  }

  const total = Object.values(qtds).reduce((a, b) => a + b, 0)

  return { simBase, simPrice, calc, total }
}

export default function SimularVendas() {
  const [step, setStep]         = useState(0)
  const [empresa, setEmpresa]   = useState<'lumar' | 'cantina' | null>(null)
  const [cliente, setCliente]   = useState('')
  const [cidade, setCidade]     = useState('')
  const [regime, setRegime]     = useState<Regime>('lp_lr')
  const [qtds, setQtds]         = useState<Record<string, number>>({})
  const [nivel, setNivel]       = useState(2)
  const [levers, setLevers]     = useState({ freezer: false, forno: false, armario: false, consignado: '' })
  const [busca, setBusca]       = useState('')

  const [products, setProducts] = useState<PriceItem[]>([])
  const [loading, setLoading]   = useState(false)

  const { simBase, simPrice, calc, total } = useSimCalc(products, qtds, empresa, regime)

  async function loadProducts(emp: 'lumar' | 'cantina') {
    setLoading(true)
    const { data } = await supabase
      .from('crm_price_items').select('*').eq('empresa', emp).eq('ativo', true).order('nome')
    setProducts((data as PriceItem[]) || [])
    setLoading(false)
  }

  function selectEmpresa(emp: 'lumar' | 'cantina') {
    setEmpresa(emp); setQtds({}); loadProducts(emp); setStep(1)
  }

  function changeQtd(id: string, delta: number) {
    setQtds(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }))
  }

  function toggleLever(key: keyof typeof levers) {
    if (key === 'consignado') return
    setLevers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function leverList(): string[] {
    const L: string[] = []
    if (levers.freezer) L.push('Comodato: Freezer')
    if (levers.forno)   L.push('Comodato: Forno')
    if (levers.armario) L.push('Comodato: Armário')
    if (levers.consignado) L.push('Consignado por ' + levers.consignado)
    return L
  }

  function reset() {
    setStep(0); setEmpresa(null); setCliente(''); setCidade(''); setRegime('lp_lr')
    setQtds({}); setNivel(2); setLevers({ freezer: false, forno: false, armario: false, consignado: '' })
    setBusca(''); setProducts([])
  }

  function buildWhatsApp(): string {
    const lab = empresa === 'lumar' ? 'Lumar Alimentos' : 'Cantina em Casa'
    const c = calc(nivel)
    const nv = NIVEIS.find(x => x.id === nivel)!
    const eft = c.pr - c.ic
    const LA = leverList()
    if (regime === 'lp_lr' && c.ic > 0)
      LA.push(`Crédito ICMS: ${fmt(c.ic)} → custo efetivo ${fmt(eft)}`)

    const activeProds = products.filter(p => (qtds[p.id] || 0) > 0)
    const parts = [
      `*${lab} - Proposta Comercial*`,
      `Cliente: ${cliente || '--'} - ${cidade || '--'}`,
      '',
      '*Pedido:*',
      ...activeProds.map(p => `${qtds[p.id]}x ${p.nome}`),
      '',
      `*Valor total: ${fmt(c.pr)}*`,
      `Nível: ${nv.nome} - Margem: ${pct(c.mg)}`,
    ]
    if (LA.length) parts.push('\n*Condições:*\n' + LA.map(l => `- ${l}`).join('\n'))
    parts.push('', '_Proposta válida 48h. Responda para confirmar._')
    return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(parts.join('\n'))
  }

  const filteredProds = products.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca.toLowerCase())
  )
  const activeProds = products.filter(p => (qtds[p.id] || 0) > 0)
  const currentCalc = calc(nivel)
  const currentNivel = NIVEIS.find(x => x.id === nivel)!

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Calculator size={20} className="text-orange-500" /> Simular Vendas
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Monte um pedido, calcule preços e gere proposta comercial</p>
      </div>

      {/* ── Step 0: empresa ── */}
      {step === 0 && (
        <div className="card p-5 space-y-4">
          <h2 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Selecione a empresa</h2>
          <div className="grid grid-cols-2 gap-3">
            {([
              { e: 'lumar'   as const, ic: '🏭', t: 'Lumar Alimentos',  s: 'Atacado — padarias, mercados' },
              { e: 'cantina' as const, ic: '🥐', t: 'Cantina em Casa',   s: 'Revenda — pontos de venda'   },
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

      {/* ── Step 1: build order ── */}
      {step === 1 && empresa && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(0)} className="btn-ghost p-1.5 rounded-lg"><ChevronLeft size={16} /></button>
            <h2 className="font-bold text-slate-700 dark:text-slate-200">
              {empresa === 'lumar' ? '🏭 Lumar' : '🥐 Cantina em Casa'} — Montar Pedido
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cliente</label>
              <input className="input" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input className="input" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade" />
            </div>
          </div>

          {/* Regime fiscal */}
          <div>
            <label className="label">Regime Fiscal do Cliente</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'lp_lr'   as Regime, label: 'Lucro Presumido / Real', color: 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
                { id: 'simples' as Regime, label: 'Simples Nacional',        color: 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300' },
              ]).map(r => (
                <button key={r.id} onClick={() => setRegime(r.id)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${regime === r.id ? r.color : 'border-slate-200 dark:border-slate-600 text-slate-500'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Product list */}
          <div>
            <label className="label">Produtos</label>
            <input className="input mb-2" placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} />

            {loading ? (
              <div className="text-center text-slate-400 text-sm py-4 flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> Carregando...
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                {filteredProds.map(p => {
                  const q = qtds[p.id] || 0
                  const base = simBase(p)
                  return (
                    <div key={p.id} className="px-3 py-2.5 flex items-center gap-3 bg-white dark:bg-slate-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.nome}</p>
                        <p className="text-[11px] text-slate-400">{fmt(base)} · custo {fmt(p.custo ?? 0)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => changeQtd(p.id, -1)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-base transition-colors ${q > 0 ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                          −
                        </button>
                        <span className="w-5 text-center font-bold text-sm tabular-nums">{q}</span>
                        <button onClick={() => changeQtd(p.id, 1)}
                          className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-base hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
                {filteredProds.length === 0 && (
                  <div className="py-6 text-center text-slate-400 text-sm">Nenhum produto encontrado</div>
                )}
              </div>
            )}
          </div>

          {total > 0 && (
            <div>
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 mb-3">
                <span className="text-sm text-slate-500">{total} item(ns)</span>
                <span className="text-xl font-bold text-slate-800 dark:text-slate-200">{fmt(calc(1).pr)}</span>
              </div>
              <button onClick={() => setStep(2)} className="btn-primary w-full justify-center">
                Calcular estratégia →
              </button>
            </div>
          )}
          {total === 0 && (
            <p className="text-center text-slate-400 text-sm">Adicione produtos para continuar</p>
          )}
        </div>
      )}

      {/* ── Step 2: strategy ── */}
      {step === 2 && empresa && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(1)} className="btn-ghost p-1.5 rounded-lg"><ChevronLeft size={16} /></button>
            <h2 className="font-bold text-slate-700 dark:text-slate-200">
              Estratégia · {cliente || 'Cliente'}{cidade ? ` · ${cidade}` : ''}
            </h2>
          </div>

          {/* Level cards */}
          <div className="grid grid-cols-2 gap-2">
            {NIVEIS.map(n => {
              const c2 = calc(n.id)
              const sel = n.id === nivel
              return (
                <button key={n.id} onClick={() => setNivel(n.id)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${sel ? `${n.bg} ${n.border}` : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${sel ? n.cor : 'text-slate-400'}`}>{n.nome}</div>
                  <div className={`text-xl font-bold ${sel ? n.cor : 'text-slate-800 dark:text-slate-200'}`}>{fmt(c2.pr)}</div>
                  <div className={`text-[11px] mt-0.5 ${sel ? n.cor : 'text-slate-400'}`}>Margem: {pct(c2.mg)}</div>
                  <div className={`text-[10px] font-bold mt-1 ${n.auto ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                    {n.auto ? 'Fecha sozinho' : 'Precisa aprovação'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Info strip */}
          <div className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-700 rounded-lg px-3 py-2">
            {currentNivel.sub} · Margem: {pct(currentCalc.mg)} · Custo total: {fmt(currentCalc.cu)}
          </div>

          {/* ICMS credit card */}
          {regime === 'lp_lr' && currentCalc.ic > 0 ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-green-800 dark:text-green-400 mb-3">
                Argumento de crédito ICMS — use antes de qualquer desconto
              </p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Valor da proposta</span><span className="font-semibold">{fmt(currentCalc.pr)}</span></div>
                {currentCalc.ino > 0 && <div className="flex justify-between"><span className="text-slate-500">Crédito ICMS demais (19%)</span><span className="text-green-700 dark:text-green-400">- {fmt(currentCalc.ino)}</span></div>}
                {currentCalc.ipf > 0 && <div className="flex justify-between"><span className="text-slate-500">Crédito ICMS pão francês (7% líq.)</span><span className="text-green-700 dark:text-green-400">- {fmt(currentCalc.ipf)}</span></div>}
                <div className="flex justify-between font-bold pt-1 border-t border-green-200 dark:border-green-700">
                  <span>Custo efetivo real</span>
                  <span className="text-green-700 dark:text-green-400 text-base">{fmt(currentCalc.pr - currentCalc.ic)}</span>
                </div>
              </div>
              <p className="text-[10px] text-green-600 dark:text-green-500 mt-2">
                Clientes LP/LR recuperam esta parcela do ICMS.{currentCalc.ipf > 0 ? ' *Pão francês 12%, estorno 5%, crédito líq. 7%.' : ''}
              </p>
            </div>
          ) : regime === 'simples' ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Simples Nacional não aproveita crédito de ICMS.
            </div>
          ) : null}

          {/* Levers */}
          <div>
            <label className="label">Alavancas</label>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
              {([
                { key: 'freezer' as const, label: 'Comodato — Freezer' },
                { key: 'forno'   as const, label: 'Comodato — Forno'   },
                { key: 'armario' as const, label: 'Comodato — Armário' },
              ]).map(item => (
                <label key={item.key} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 bg-white dark:bg-slate-800">
                  <input type="checkbox" checked={levers[item.key]} onChange={() => toggleLever(item.key)}
                    className="w-4 h-4 accent-orange-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
                </label>
              ))}
              <div className="px-4 py-3 bg-white dark:bg-slate-800">
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">Consignado por:</p>
                <input className="input text-sm" placeholder="Ex: 2 semanas, 1 mês..."
                  value={levers.consignado} onChange={e => setLevers(prev => ({ ...prev, consignado: e.target.value }))} />
              </div>
            </div>
          </div>

          <button onClick={() => setStep(3)}
            className={`btn w-full justify-center ${currentNivel.auto ? 'btn-primary' : 'bg-red-700 hover:bg-red-800 text-white btn'}`}>
            Gerar proposta {currentNivel.auto ? '' : '⚠️'}
          </button>
        </div>
      )}

      {/* ── Step 3: proposal ── */}
      {step === 3 && empresa && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(2)} className="btn-ghost p-1.5 rounded-lg"><ChevronLeft size={16} /></button>
            <h2 className="font-bold text-slate-700 dark:text-slate-200">Proposta Pronta</h2>
          </div>

          {/* Summary card */}
          <div className={`rounded-xl border-2 p-4 ${currentNivel.bg} ${currentNivel.border}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${currentNivel.cor}`}>
              Nível {currentNivel.nome}
            </div>
            <div className={`text-3xl font-bold ${currentNivel.cor}`}>{fmt(currentCalc.pr)}</div>
            <div className={`text-sm mt-1 ${currentNivel.cor}`}>
              Margem: {pct(currentCalc.mg)} · Custo: {fmt(currentCalc.cu)}
            </div>
            {regime === 'lp_lr' && currentCalc.ic > 0 && (
              <div className="text-sm text-green-700 dark:text-green-400 font-semibold mt-1.5">
                Custo efetivo (pós ICMS): {fmt(currentCalc.pr - currentCalc.ic)}
              </div>
            )}
          </div>

          {/* Products */}
          <div>
            <p className="label">Produtos</p>
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
              {activeProds.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-800">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{qtds[p.id]}x {p.nome}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                    {fmt(simPrice(p, nivel) * (qtds[p.id] || 0))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Conditions */}
          {(() => {
            const LA = leverList()
            if (regime === 'lp_lr' && currentCalc.ic > 0)
              LA.push(`Crédito ICMS: ${fmt(currentCalc.ic)} → custo efetivo ${fmt(currentCalc.pr - currentCalc.ic)}`)
            if (!LA.length) return null
            return (
              <div>
                <p className="label">Condições</p>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
                  {LA.map((l, i) => (
                    <div key={i} className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800">{l}</div>
                  ))}
                </div>
              </div>
            )
          })()}

          {!currentNivel.auto && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Nível {currentNivel.nome} precisa de aprovação antes de confirmar ao cliente.
            </div>
          )}

          <div className="flex gap-2 flex-col">
            <a href={buildWhatsApp()} target="_blank" rel="noopener noreferrer"
              className="btn bg-green-500 hover:bg-green-600 text-white w-full justify-center">
              <MessageCircle size={16} /> Enviar proposta (WhatsApp)
            </a>
            <button onClick={reset} className="btn-secondary w-full justify-center">Nova simulação</button>
          </div>
        </div>
      )}
    </div>
  )
}
