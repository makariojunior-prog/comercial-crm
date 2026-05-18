import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Calendar, Printer,
  RefreshCw, Share2, AlertCircle, Truck, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────

interface RomaneioItem {
  uid: string
  empresa: 'LUMAR' | 'CANTINA'
  pedido: string
  cliente: string
  turno: string
  rota: string
  pgto: string
  valor: number
  obs: string
  ocorrencia_db: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

function turnoOrd(t: string | null) {
  const u = (t ?? '').toUpperCase()
  if (u.includes('MAN')) return 1
  if (u.includes('TARD')) return 2
  if (u.includes('NOIT')) return 3
  return 4
}

function firstName(nome: string) {
  return nome.trim().split(/\s+/)[0].toUpperCase()
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ─── Main component ───────────────────────────────────────────────────

export default function RomaneioTab() {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  // Filtros
  const [date, setDate]             = useState(todayStr)
  const [entregador, setEntregador] = useState('')
  const [turnoManha, setM]          = useState(true)
  const [turnoTarde, setT]          = useState(true)
  const [turnoNoite, setN]          = useState(true)

  // Dados
  const [items,   setItems]   = useState<RomaneioItem[]>([])
  const [loading, setLoading] = useState(false)
  const [drivers, setDrivers] = useState<{ id: string; nome: string }[]>([])
  const [vehicles, setVehicles] = useState<{ id: string; apelido: string; placa: string | null }[]>([])

  // Veículo do romaneio (persistido no banco)
  const [veiculo,       setVeiculo]       = useState('')
  const [savingVeiculo, setSavingVeiculo] = useState(false)
  const [veiculoSalvo,  setVeiculoSalvo]  = useState(false)

  // Estado mutável por item
  const [seqMap,      setSeqMap]      = useState<Record<string, string>>({})
  const [entregueMap, setEntregueMap] = useState<Record<string, boolean>>({})
  const [ocorrMap,    setOcorrMap]    = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('crm_drivers').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setDrivers(data ?? []))
    supabase.from('crm_vehicles').select('id, apelido, placa').eq('ativo', true).order('apelido')
      .then(({ data }) => setVehicles(data ?? []))
  }, [])

  // ── Derivados ────────────────────────────────────────────────────

  const dateObj   = useMemo(() => new Date(date + 'T12:00'), [date])
  const isToday   = date === todayStr
  const dateLabel = format(dateObj, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const datePrint = format(dateObj, 'dd/MM/yyyy')
  const dateShort = format(dateObj, 'dd/MM')

  const entregadorLabel = entregador || 'TODOS OS ENTREGADORES'
  const turnosLabel = [
    turnoManha && 'MANHÃ', turnoTarde && 'TARDE', turnoNoite && 'NOITE',
  ].filter(Boolean).join(' + ') || 'Todos'

  const lumarItems   = useMemo(() => items.filter(i => i.empresa === 'LUMAR'),   [items])
  const cantinaItems = useMemo(() => items.filter(i => i.empresa === 'CANTINA'), [items])
  const totalLumar   = lumarItems.reduce((s, i) => s + i.valor, 0)
  const totalCantina = cantinaItems.reduce((s, i) => s + i.valor, 0)
  const totalGeral   = totalLumar + totalCantina
  const qtdEntregues = items.filter(i => entregueMap[i.uid]).length

  // Ordenação: automática por seqMap quando qualquer número for inserido
  const displayItems = useMemo(() => {
    const parseSeq = (uid: string) => {
      const n = parseInt(seqMap[uid] ?? '', 10)
      return isNaN(n) ? 9999 : n
    }
    const hasAnySeq = Object.values(seqMap).some(v => /^\d+$/.test(v.trim()))
    const base = [
      ...items.filter(i => i.empresa === 'LUMAR')  .sort((a, b) => turnoOrd(a.turno) - turnoOrd(b.turno)),
      ...items.filter(i => i.empresa === 'CANTINA').sort((a, b) => turnoOrd(a.turno) - turnoOrd(b.turno)),
    ]
    if (!hasAnySeq) return base
    return [...base].sort((a, b) => {
      const sa = parseSeq(a.uid), sb = parseSeq(b.uid)
      if (sa !== sb) return sa - sb
      if (a.empresa !== b.empresa) return a.empresa === 'LUMAR' ? -1 : 1
      return turnoOrd(a.turno) - turnoOrd(b.turno)
    })
  }, [items, seqMap])

  // ── Carregar dados (automático ao mudar filtros) ─────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setSeqMap({}); setEntregueMap({}); setOcorrMap({})
    setVeiculoSalvo(false)

    const nenhum = !turnoManha && !turnoTarde && !turnoNoite
    const buildOr = () => {
      if (nenhum) return undefined
      const parts = ['turno.is.null']
      if (turnoManha) parts.push('turno.eq.MANHÃ')
      if (turnoTarde) parts.push('turno.eq.TARDE')
      if (turnoNoite) parts.push('turno.eq.NOITE')
      return parts.join(',')
    }
    const turnoOr = buildOr()

    let qL = supabase
      .from('atacado_pedidos')
      .select('id, id_venda, numero_pedido, cliente_nome, turno, entregador, valor, ocorrencia, veiculo, crm_client:crm_clients(nome,rota,pgto)')
      .eq('data_entrega', date)
      .eq('ignorado', false)
      .neq('tipo', 'CANCELADO')
    if (turnoOr) qL = qL.or(turnoOr)
    if (entregador) qL = (qL as any).eq('entregador', entregador)

    let qC = supabase
      .from('varejo_pedidos')
      .select('id, num_pedido, cliente, turno, entregador, valor_liquido, restricao, rota_definida, sugestao_rota, veiculo')
      .eq('data_entrega', date)
      .neq('status_icon', '❌')
      .not('entregador', 'eq', 'RETIRADA')
    if (turnoOr) qC = qC.or(turnoOr)
    if (entregador) qC = (qC as any).eq('entregador', entregador)

    const [{ data: atacado }, { data: cantina }] = await Promise.all([qL, qC])

    const lumar: RomaneioItem[] = ((atacado ?? []) as any[]).map(p => ({
      uid:           `L${p.id}`,
      empresa:       'LUMAR' as const,
      pedido:        p.numero_pedido ? String(p.numero_pedido) : `#${p.id_venda}`,
      cliente:       p.crm_client?.nome ?? p.cliente_nome ?? '—',
      turno:         (p.turno ?? '').toUpperCase(),
      rota:          p.crm_client?.rota ?? '',
      pgto:          p.crm_client?.pgto ?? '',
      valor:         Number(p.valor) || 0,
      obs:           '',
      ocorrencia_db: p.ocorrencia ?? '',
    }))

    const cant: RomaneioItem[] = ((cantina ?? []) as any[]).map(p => ({
      uid:           `C${p.id}`,
      empresa:       'CANTINA' as const,
      pedido:        p.num_pedido ? String(p.num_pedido) : '—',
      cliente:       p.cliente ?? '—',
      turno:         (p.turno ?? '').toUpperCase(),
      rota:          p.rota_definida ?? p.sugestao_rota ?? '',
      pgto:          '',
      valor:         Number(p.valor_liquido) || 0,
      obs:           p.restricao ?? '',
      ocorrencia_db: '',
    }))

    // Detecta veículo já salvo nos pedidos (usa o primeiro valor encontrado)
    const allRows = [...(atacado ?? []), ...(cantina ?? [])] as any[]
    const veiculoDetectado = allRows.find(p => p.veiculo)?.veiculo ?? ''
    setVeiculo(veiculoDetectado)

    setItems([...lumar, ...cant])
    setLoading(false)
  }, [date, entregador, turnoManha, turnoTarde, turnoNoite])

  // ── Salvar veículo em todos os pedidos do romaneio ───────────────

  async function handleVeiculoChange(novo: string) {
    setVeiculo(novo)
    if (!items.length) return
    setSavingVeiculo(true)
    setVeiculoSalvo(false)

    const lumarIds  = items.filter(i => i.empresa === 'LUMAR')  .map(i => parseInt(i.uid.slice(1)))
    const cantinaIds = items.filter(i => i.empresa === 'CANTINA').map(i => parseInt(i.uid.slice(1)))

    await Promise.all([
      lumarIds.length
        ? supabase.from('atacado_pedidos').update({ veiculo: novo || null }).in('id', lumarIds)
        : Promise.resolve(),
      cantinaIds.length
        ? supabase.from('varejo_pedidos').update({ veiculo: novo || null }).in('id', cantinaIds)
        : Promise.resolve(),
    ])

    setSavingVeiculo(false)
    setVeiculoSalvo(true)
    setTimeout(() => setVeiculoSalvo(false), 2500)
  }

  // Carrega automaticamente sempre que os filtros mudarem
  useEffect(() => { load() }, [load])

  // ── Compartilhar (WhatsApp) ──────────────────────────────────────

  function compartilhar() {
    const linhas = [
      `🚚 *ROMANEIO ${datePrint}*`,
      `Entregador: ${entregadorLabel}   Turno: ${turnosLabel}`,
      '',
    ]
    for (const emp of ['LUMAR', 'CANTINA'] as const) {
      const grupo = displayItems.filter(i => i.empresa === emp)
      if (!grupo.length) continue
      linhas.push(`--- ${emp === 'LUMAR' ? '🏭 LUMAR' : '🛒 CANTINA'} ---`)
      grupo.forEach((it, idx) => {
        const seq = seqMap[it.uid] ? `${seqMap[it.uid]}. ` : `${idx + 1}. `
        linhas.push(`${seq}${it.pedido} — ${it.cliente}${it.turno ? ` [${it.turno}]` : ''}${it.rota ? ` — ${it.rota}` : ''}`)
      })
      linhas.push('')
    }
    linhas.push(`📊 Total: ${items.length} pedido(s) — ${fmt(totalGeral)}`)
    navigator.clipboard.writeText(linhas.join('\n'))
      .then(() => alert('✅ Texto copiado! Cole no WhatsApp.'))
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media screen { .print-only { display: none !important; } }

        @media print {
          /* ── Isolar área de impressão ── */
          body > * { visibility: hidden; }
          #romaneio-print-root { visibility: visible; position: fixed; inset: 0; background: white; z-index: 9999; }
          #romaneio-print-root * { visibility: visible; }
          @page { size: A4 portrait; margin: 8mm 7mm; }
          .no-print { display: none !important; }

          /* ── Reset geral → preto e branco ── */
          #romaneio-print-root,
          #romaneio-print-root * {
            color: #000 !important;
            background: white !important;
            background-color: white !important;
            background-image: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            text-shadow: none !important;
          }

          /* ── Tipografia compacta ── */
          #romaneio-print-root table {
            font-size: 7.5pt !important;
            border-collapse: collapse !important;
            width: 100% !important;
          }
          #romaneio-print-root td,
          #romaneio-print-root th {
            padding: 2px 4px !important;
            border: 0.4pt solid #999 !important;
            line-height: 1.3 !important;
          }

          /* ── Cabeçalho do romaneio ── */
          .rom-header {
            border-bottom: 1.5pt solid #000 !important;
            padding: 0 0 4px 0 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            margin-bottom: 4px !important;
          }
          .rom-header h2 { font-size: 9.5pt !important; font-weight: bold !important; }
          .rom-header p  { font-size: 7.5pt !important; margin: 1px 0 !important; }

          /* ── Cabeçalho de grupo (LUMAR / CANTINA) ── */
          .rom-group td {
            background-color: #e8e8e8 !important;
            font-size: 7.5pt !important;
            font-weight: bold !important;
            letter-spacing: 0.02em !important;
            border-top: 1pt solid #555 !important;
            padding: 3px 4px !important;
          }

          /* ── Cabeçalho de colunas ── */
          .rom-cols td {
            background-color: #f0f0f0 !important;
            font-size: 6.5pt !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            border: 0.4pt solid #888 !important;
          }

          /* ── Linha de dados ── */
          .rom-row td { border: 0.3pt solid #ccc !important; }
          .rom-row-alt td { background-color: #f9f9f9 !important; border: 0.3pt solid #ccc !important; }

          /* ── Subtotal ── */
          .rom-subtotal td {
            background-color: #ececec !important;
            font-size: 7pt !important;
            font-weight: bold !important;
            border-top: 0.8pt solid #777 !important;
          }

          /* ── Total geral ── */
          .rom-total td {
            background-color: #ddd !important;
            font-weight: bold !important;
            font-size: 7.5pt !important;
            border-top: 1.5pt solid #000 !important;
          }

          /* ── Campos de formulário ── */
          .print-input {
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            font-size: 7.5pt !important;
            width: 100% !important;
          }

          /* ── Assinaturas ── */
          .rom-signature {
            margin-top: 6px !important;
            padding-top: 4px !important;
            border-top: 0.8pt solid #888 !important;
            font-size: 7.5pt !important;
          }

          tr { page-break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-4">

        {/* ── Filtros ──────────────────────────────────────────────── */}
        <div className="card p-4 space-y-3 no-print">
          {/* Linha 1: data + entregador + refresh */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Navegação de data */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
              <button
                onClick={() => setDate(format(subDays(dateObj, 1), 'yyyy-MM-dd'))}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setDate(todayStr)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  isToday
                    ? 'bg-white dark:bg-slate-600 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600'
                }`}
              >
                <Calendar size={10} className="inline mr-1" />
                {isToday ? 'Hoje' : dateShort}
              </button>
              <button
                onClick={() => setDate(format(addDays(dateObj, 1), 'yyyy-MM-dd'))}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-600 transition-colors text-slate-500"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <input
              type="date"
              className="input text-sm py-1.5 w-auto"
              value={date}
              onChange={e => setDate(e.target.value)}
            />

            <select
              className="input text-sm py-1.5 flex-1 min-w-[160px]"
              value={entregador}
              onChange={e => setEntregador(e.target.value)}
            >
              <option value="">Todos os entregadores</option>
              {drivers.map(d => (
                <option key={d.id} value={firstName(d.nome)}>{firstName(d.nome)}</option>
              ))}
            </select>

            {/* Veículo */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <Truck size={14} className="text-slate-400 shrink-0" />
              <select
                className="input text-sm py-1.5 flex-1 dark:[color-scheme:dark]"
                value={veiculo}
                onChange={e => handleVeiculoChange(e.target.value)}
                disabled={savingVeiculo || !items.length}
              >
                <option value="">— veículo —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.apelido}>
                    {v.apelido}{v.placa ? ` (${v.placa})` : ''}
                  </option>
                ))}
              </select>
              {savingVeiculo && <RefreshCw size={13} className="animate-spin text-slate-400 shrink-0" />}
              {veiculoSalvo   && <Check size={13} className="text-green-500 shrink-0" />}
            </div>

            <button
              onClick={load}
              disabled={loading}
              title="Recarregar"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Linha 2: turnos */}
          <div className="flex items-center gap-5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Turno:</span>
            {([
              ['MANHÃ', turnoManha, setM],
              ['TARDE', turnoTarde, setT],
              ['NOITE', turnoNoite, setN],
            ] as const).map(([label, val, set]) => (
              <label key={label} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={val}
                  onChange={e => set(e.target.checked)}
                  className="w-4 h-4 rounded accent-orange-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
              </label>
            ))}
            <p className="text-[10px] text-slate-400 italic">Pedidos sem turno são sempre incluídos</p>
          </div>

          {!loading && (
            <p className="text-[11px] text-slate-400 italic capitalize">{dateLabel}</p>
          )}
        </div>

        {/* ── Loading ──────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm">Carregando romaneio...</span>
          </div>
        )}

        {/* ── KPIs ─────────────────────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
            <KPI label="Total de pedidos" value={String(items.length)} icon="📦" />
            <KPI
              label="🏭 Lumar"
              value={fmt(totalLumar)}
              sub={`${lumarItems.length} pedido(s)`}
              color="text-blue-700 dark:text-blue-300"
            />
            <KPI
              label="🛒 Cantina"
              value={fmt(totalCantina)}
              sub={`${cantinaItems.length} pedido(s)`}
              color="text-purple-700 dark:text-purple-300"
            />
            <KPI
              label="Total geral"
              value={fmt(totalGeral)}
              color="text-green-700 dark:text-green-300"
              icon="💰"
            />
          </div>
        )}

        {/* ── Barra de ações ───────────────────────────────────────── */}
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap no-print">
            <button
              onClick={compartilhar}
              className="btn-secondary text-xs py-1.5 gap-1"
              title="Copiar lista de pedidos para WhatsApp"
            >
              <Share2 size={13} /> Compartilhar
            </button>
            <button
              onClick={() => window.print()}
              className="btn-primary text-xs py-1.5 gap-1 ml-auto"
            >
              <Printer size={13} /> Imprimir / PDF
            </button>
          </div>
        )}

        {/* ── Progressbar de entrega ───────────────────────────────── */}
        {!loading && items.length > 0 && qtdEntregues > 0 && (
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2.5 no-print">
            <span className="text-green-700 dark:text-green-300 font-bold text-sm whitespace-nowrap">
              ✅ {qtdEntregues}/{items.length}
            </span>
            <div className="flex-1 h-2 bg-green-200 dark:bg-green-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${(qtdEntregues / items.length) * 100}%` }}
              />
            </div>
            {qtdEntregues === items.length
              ? <span className="text-green-700 dark:text-green-300 font-bold text-xs whitespace-nowrap">🎉 Rota concluída!</span>
              : <span className="text-green-600 dark:text-green-400 text-xs whitespace-nowrap">{items.length - qtdEntregues} restante(s)</span>
            }
          </div>
        )}

        {/* ── Vazio ────────────────────────────────────────────────── */}
        {!loading && items.length === 0 && (
          <div className="card p-14 text-center text-slate-400">
            <AlertCircle size={28} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhuma entrega encontrada</p>
            <p className="text-xs mt-1">para {datePrint} com os filtros selecionados</p>
          </div>
        )}

        {/* ══ ROMANEIO — área de impressão ══════════════════════════ */}
        {!loading && items.length > 0 && (
          <div id="romaneio-print-root">
            <div id="romaneio-print" className="card overflow-hidden">

              {/* Cabeçalho */}
              <div className="rom-header bg-[#1a237e] text-white px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold">
                    🚚 ROMANEIO DE ENTREGAS — CANTINA EM CASA & LUMAR ALIMENTOS
                  </h2>
                  <p className="text-xs text-blue-200 mt-0.5 capitalize">{dateLabel}</p>
                </div>
                <div className="text-right text-xs text-blue-200 shrink-0">
                  <p>{entregadorLabel}</p>
                  <p>Turno: {turnosLabel}</p>
                  {veiculo && (
                    <p className="flex items-center gap-1 justify-end">
                      <Truck size={10} /> {veiculo}
                    </p>
                  )}
                  <p className="font-bold text-white">{items.length} pedido(s)</p>
                </div>
              </div>

              {/* Tabela */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[740px] border-collapse">
                  <colgroup>
                    <col style={{ width: 40 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ minWidth: 160 }} />
                    <col style={{ width: 68 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 88 }} />
                    <col />
                    <col style={{ width: 34 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>

                  {(['LUMAR', 'CANTINA'] as const).map(emp => {
                    const grupo = displayItems.filter(i => i.empresa === emp)
                    if (!grupo.length) return null
                    const isLumar = emp === 'LUMAR'
                    const totalEmp = grupo.reduce((s, i) => s + i.valor, 0)

                    return (
                      <tbody key={emp}>
                        <tr className="rom-group">
                          <td colSpan={10} className={`px-3 py-2 font-bold text-white text-[11px] tracking-wide ${isLumar ? 'bg-blue-800' : 'bg-purple-900'}`}>
                            {isLumar ? '🏭 LUMAR ALIMENTOS' : '🛒 CANTINA EM CASA'}
                          </td>
                        </tr>

                        <tr className="rom-cols bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold text-[10px] text-center">
                          {['Nº', 'PEDIDO', 'CLIENTE', 'TURNO', 'ROTA', 'PGTO', 'VALOR (R$)', 'OBS / RESTRIÇÃO', '✓', 'OCORRÊNCIA'].map(h => (
                            <td key={h} className={`px-2 py-1.5 border border-slate-300 dark:border-slate-600 ${['CLIENTE', 'OBS / RESTRIÇÃO', 'OCORRÊNCIA'].includes(h) ? 'text-left' : ''}`}>
                              {h}
                            </td>
                          ))}
                        </tr>

                        {grupo.map((item, idx) => {
                          const entregue = entregueMap[item.uid] ?? false
                          const rowBg = idx % 2 === 0 ? 'bg-white dark:bg-slate-800/10' : 'bg-slate-50 dark:bg-slate-800/30'
                          const rowPrint = idx % 2 === 0 ? 'rom-row' : 'rom-row-alt'

                          return (
                            <tr key={item.uid} className={`${rowPrint} ${rowBg} transition-colors ${entregue ? 'opacity-50' : ''}`}>
                              <td className="px-1 py-1 border-b border-l border-slate-200 dark:border-slate-700 text-center">
                                <input
                                  type="number"
                                  min={1}
                                  className="print-input w-9 text-center text-xs border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-orange-400"
                                  value={seqMap[item.uid] ?? ''}
                                  onChange={e => setSeqMap(m => ({ ...m, [item.uid]: e.target.value }))}
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-center font-mono font-bold text-slate-700 dark:text-slate-200">
                                {item.pedido}
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-left font-medium text-slate-800 dark:text-slate-100">
                                {item.cliente}
                              </td>
                              <td className={`px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-center text-[10px] font-semibold ${!item.turno ? 'text-orange-500 bg-orange-50/50 dark:bg-orange-900/10' : 'text-slate-600 dark:text-slate-300'}`}>
                                {item.turno || '—'}
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-center text-slate-600 dark:text-slate-300 text-[10px]">
                                {item.rota || '—'}
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400 text-[10px]">
                                {item.pgto || '—'}
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-center font-semibold text-green-700 dark:text-green-400 whitespace-nowrap">
                                {item.valor > 0 ? fmt(item.valor) : '—'}
                              </td>
                              <td className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400 text-[10px] leading-tight">
                                {item.obs || ''}
                              </td>
                              <td className="px-1 py-1 border-b border-slate-200 dark:border-slate-700 text-center">
                                <input
                                  type="checkbox"
                                  checked={entregue}
                                  onChange={() => setEntregueMap(m => ({ ...m, [item.uid]: !m[item.uid] }))}
                                  className="w-4 h-4 accent-green-500 cursor-pointer no-print"
                                />
                                <span className="print-only inline-block w-3.5 h-3.5 border border-slate-500 rounded-sm" />
                              </td>
                              <td className="px-1 py-1 border-b border-r border-slate-200 dark:border-slate-700">
                                <input
                                  type="text"
                                  className="print-input w-full text-[10px] border border-transparent rounded px-1 py-0.5 bg-transparent text-slate-600 dark:text-slate-300 focus:outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-300"
                                  value={ocorrMap[item.uid] ?? item.ocorrencia_db}
                                  onChange={e => setOcorrMap(m => ({ ...m, [item.uid]: e.target.value }))}
                                  placeholder="—"
                                />
                              </td>
                            </tr>
                          )
                        })}

                        <tr className={`rom-subtotal font-bold text-[10px] ${isLumar ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200'}`}>
                          <td colSpan={6} className="px-3 py-1.5 text-right border-b border-slate-300 dark:border-slate-600">
                            {isLumar ? '🏭 LUMAR' : '🛒 CANTINA'} — {grupo.length} pedido(s)
                          </td>
                          <td className="px-2 py-1.5 text-center border-b border-slate-300 dark:border-slate-600 whitespace-nowrap font-bold">
                            {fmt(totalEmp)}
                          </td>
                          <td colSpan={3} className="border-b border-slate-300 dark:border-slate-600" />
                        </tr>
                      </tbody>
                    )
                  })}

                  <tfoot>
                    <tr className="rom-total bg-slate-800 dark:bg-slate-900 text-white text-[11px] font-bold">
                      <td colSpan={2} className="px-3 py-2.5 text-center tracking-wide">TOTAIS</td>
                      <td className="px-2 py-2.5 text-center text-blue-300">🏭 {fmt(totalLumar)} ({lumarItems.length} ped.)</td>
                      <td className="px-2 py-2.5" />
                      <td colSpan={2} className="px-2 py-2.5 text-center text-purple-300">🛒 {fmt(totalCantina)} ({cantinaItems.length} ped.)</td>
                      <td className="px-2 py-2.5 text-center text-green-300 whitespace-nowrap text-sm">{fmt(totalGeral)}</td>
                      <td colSpan={3} className="px-2 py-2.5 text-center text-slate-400 text-[10px]">{items.length} pedido(s) no total</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Rodapé — assinaturas */}
              <div className="rom-signature px-4 pt-5 pb-4 grid grid-cols-2 gap-x-8 gap-y-4 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 mt-2">
                <div>
                  <p className="mb-6 font-medium">Assinatura do Entregador:</p>
                  <div className="border-b border-slate-400 dark:border-slate-500" />
                </div>
                <div>
                  <p className="mb-6 font-medium">Assinatura do Recebedor:</p>
                  <div className="border-b border-slate-400 dark:border-slate-500" />
                </div>
                <div className="flex gap-6">
                  <span>Saída: <span className="border-b border-slate-400 inline-block w-24" /></span>
                  <span>Retorno: <span className="border-b border-slate-400 inline-block w-24" /></span>
                </div>
                <div>
                  <span>Conferência: <span className="border-b border-slate-400 inline-block w-48" /></span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────

function KPI({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon?: string; color?: string
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
        {icon && <span className="mr-1">{icon}</span>}{label}
      </p>
      <p className={`text-lg font-bold mt-0.5 leading-tight ${color ?? 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
