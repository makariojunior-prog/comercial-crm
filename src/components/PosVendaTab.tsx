import { useState, useEffect, useMemo, useCallback } from 'react'
import { MessageCircle, RefreshCw, Plus, Download, CheckCircle2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { PosVendaCliente } from '../types'
import PosVendaInteracaoModal, { P, fmtTel } from './PosVendaInteracaoModal'

type Filtro = '1' | '2' | 'todos'

function parseDateBR(val: string): string | null {
  const s = val.trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (m2) return `${new Date().getFullYear()}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // Google Sheets serial date (number of days since 1899-12-30)
  const n = parseInt(s, 10)
  if (!isNaN(n) && n > 40000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

async function importarHistorico(): Promise<{ imported: number; skipped: number }> {
  const apiKey  = localStorage.getItem('crm_sheets_api_key') ?? ''
  const sheetId = localStorage.getItem('crm_sheet_id') ?? '15ygrVoRh7cd8iVWn0eBXpEz-jBVsOa4jxemmmva2rnA'
  if (!apiKey) throw new Error('Chave de API não configurada (Configurações → Planilha de Pedidos)')

  // HISTORICO-CRM: A=created_at, B=telefone, C=nome, D=data_interacao, E=observacao
  const range = encodeURIComponent('HISTORICO-CRM!B2:E')
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${encodeURIComponent(apiKey)}`
  const res   = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(body?.error?.message ?? `Erro ${res.status}`)
  }
  const { values = [] } = await res.json() as { values?: string[][] }

  const records = values
    .filter(row => row[0] && row[2]) // precisa de telefone e data
    .map(row => ({
      telefone:       (row[0] ?? '').replace(/\D/g, ''),
      nome:           (row[1] ?? '').trim() || null,
      data_interacao: parseDateBR(row[2] ?? ''),
      observacao:     (row[3] ?? '').trim() || '(sem observação)',
    }))
    .filter(r => r.telefone && r.data_interacao) as {
      telefone: string; nome: string | null; data_interacao: string; observacao: string
    }[]

  if (!records.length) return { imported: 0, skipped: 0 }

  const BATCH = 500
  let imported = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const { data, error } = await supabase
      .from('crm_posvendas_interacoes')
      .upsert(records.slice(i, i + BATCH), { onConflict: 'telefone,data_interacao,observacao', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(error.message)
    imported += data?.length ?? 0
  }
  return { imported, skipped: records.length - imported }
}

// ── Tab principal ─────────────────────────────────────────────────────────────

export default function PosVendaTab({ onCountsChange }: { onCountsChange?: (p1: number, p2: number) => void }) {
  const [clientes, setClientes]         = useState<PosVendaCliente[]>([])
  const [loading, setLoading]           = useState(true)
  const [filtro, setFiltro]             = useState<Filtro>('1')
  const [modal, setModal]               = useState<PosVendaCliente | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const hasApiKey = !!localStorage.getItem('crm_sheets_api_key')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('crm_posvendas').select('*')
    const rows = (data ?? []) as PosVendaCliente[]
    setClientes(rows)
    setLoading(false)
    if (onCountsChange) {
      onCountsChange(
        rows.filter(c => c.prioridade === 1).length,
        rows.filter(c => c.prioridade === 2).length,
      )
    }
  }, [onCountsChange])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    p1: clientes.filter(c => c.prioridade === 1).length,
    p2: clientes.filter(c => c.prioridade === 2).length,
  }), [clientes])

  const filtered = useMemo(() => {
    if (filtro === '1') return clientes.filter(c => c.prioridade === 1)
    if (filtro === '2') return clientes.filter(c => c.prioridade === 2)
    return clientes
  }, [clientes, filtro])

  async function handleImport() {
    setImporting(true)
    setImportStatus(null)
    try {
      const { imported, skipped } = await importarHistorico()
      setImportStatus(`✓ ${imported} importados${skipped > 0 ? `, ${skipped} já existiam` : ''}`)
      load()
    } catch (e) {
      setImportStatus(e instanceof Error ? e.message : 'Erro ao importar')
    } finally {
      setImporting(false)
      setTimeout(() => setImportStatus(null), 6000)
    }
  }

  const FILTROS: [Filtro, string][] = [
    ['1',      `📞 Pós-Venda ${counts.p1}`],
    ['2',      `🚨 Recompra ${counts.p2}`],
    ['todos',  `Todos ${clientes.length}`],
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {FILTROS.map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filtro === id
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost p-2" title="Atualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {hasApiKey && (
            <button
              onClick={handleImport}
              disabled={importing}
              title="Importar histórico de interações da aba HISTORICO-CRM da planilha"
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                importStatus?.startsWith('✓')
                  ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                  : importStatus
                  ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                  : 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30'
              }`}
            >
              <Download size={13} className={importing ? 'animate-pulse' : ''} />
              {importing ? 'Importando…' : (importStatus ?? 'Importar Histórico')}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-green-400 opacity-60" />
          <p className="text-sm">Nenhum cliente para acompanhamento.</p>
          {filtro !== 'todos' && (
            <button onClick={() => setFiltro('todos')} className="text-xs text-orange-500 mt-2 hover:underline">
              Ver todos os clientes →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <ClienteCard key={c.telefone} cliente={c} onAction={() => setModal(c)} />
          ))}
        </div>
      )}

      {modal && (
        <PosVendaInteracaoModal
          cliente={modal}
          onClose={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ClienteCard({ cliente: c, onAction }: { cliente: PosVendaCliente; onAction: () => void }) {
  const cfg = P[c.prioridade] ?? P[3]
  return (
    <div className={`card border-l-4 ${cfg.border} px-4 py-3`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
              {cfg.icon} {cfg.label}
            </span>
            {c.n_pedidos === 1 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                1º pedido
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{c.nome ?? c.telefone}</p>
          <a
            href={`https://wa.me/${c.telefone}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline"
          >
            <MessageCircle size={11} /> {fmtTel(c.telefone)}
          </a>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>🛒 {format(parseISO(c.ult_compra), 'dd/MM/yy')}</span>
            <span className={c.dias_sem_contato >= 40 ? 'text-red-500 font-semibold' : ''}>
              🕐 {c.dias_sem_contato}d sem contato
            </span>
            <span>📦 {c.n_pedidos} pedido{c.n_pedidos !== 1 ? 's' : ''}</span>
          </div>
          {c.ult_interacao && (
            <p className="text-xs text-slate-400 mt-1">
              Ult. interação: {format(parseISO(c.ult_interacao), "dd/MM/yy")}
            </p>
          )}
        </div>
        <button
          onClick={onAction}
          className="shrink-0 flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus size={13} /> Registrar
        </button>
      </div>
    </div>
  )
}

