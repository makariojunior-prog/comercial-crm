import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Item {
  linha: number
  product_id: number | null
  produto_nome: string | null
  quantidade: number
  preco_unit: number | null
  total: number | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/**
 * Produtos de um pedido do atacado, vindos do Fácil 123 (atacado_pedido_itens).
 * `idVenda` é o id da venda no ERP (atacado_pedidos.id_venda).
 */
export default function PedidoItens({ idVenda }: { idVenda: number | null | undefined }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setItens(null)
    setErro(null)
    if (!idVenda) { setItens([]); return }
    supabase
      .from('atacado_pedido_itens')
      .select('linha, product_id, produto_nome, quantidade, preco_unit, total')
      .eq('id_venda', idVenda)
      .order('linha', { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) { setErro(error.message); return }
        setItens(((data ?? []) as Item[]).map(i => ({
          ...i,
          quantidade: Number(i.quantidade) || 0,
          preco_unit: i.preco_unit == null ? null : Number(i.preco_unit),
          total: i.total == null ? null : Number(i.total),
        })))
      })
    return () => { vivo = false }
  }, [idVenda])

  const soma = (itens ?? []).reduce((s, i) => s + (i.total ?? (i.preco_unit ?? 0) * i.quantidade), 0)

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700">
        <Package size={13} className="text-slate-400" />
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Itens do pedido</span>
        {itens && itens.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-400">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
        )}
      </div>

      {erro ? (
        <p className="px-3 py-3 text-xs text-red-500">Não foi possível carregar os itens: {erro}</p>
      ) : itens === null ? (
        <p className="px-3 py-3 text-xs text-slate-400">Carregando itens…</p>
      ) : itens.length === 0 ? (
        <p className="px-3 py-3 text-xs text-slate-400">
          Sem itens registrados para este pedido. Os itens vêm do Fácil 123 e existem para os pedidos a partir de fev/2026.
        </p>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="text-left font-semibold px-3 py-1.5">Produto</th>
                <th className="text-right font-semibold px-2 py-1.5">Qtd</th>
                <th className="text-right font-semibold px-2 py-1.5">Unit.</th>
                <th className="text-right font-semibold px-3 py-1.5">Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map(i => (
                <tr key={i.linha} className="border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 break-words">{i.produto_nome ?? `Produto #${i.product_id ?? '—'}`}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">{qtd(i.quantidade)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">{i.preco_unit == null ? '—' : brl(i.preco_unit)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{i.total == null ? '—' : brl(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/60 border-t border-slate-200 dark:border-slate-700">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Soma dos itens</span>
            <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{brl(soma)}</span>
          </div>
        </>
      )}
    </div>
  )
}
