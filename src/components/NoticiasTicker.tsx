import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Newspaper, X } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useVisibleInterval } from '../hooks/useVisibleInterval'
import type { CategoriaNoticia } from '../types'

interface ItemFeed {
  id: string
  titulo: string
  texto: string | null
  categoria: CategoriaNoticia
  relevancia: number
  gerada_em: string
}

export const CATEGORIA_NOTICIA: Record<CategoriaNoticia, { rotulo: string; cor: string; corClara: string }> = {
  negocio:   { rotulo: 'Negócios',  cor: 'text-emerald-400', corClara: 'text-emerald-600 dark:text-emerald-400' },
  visita:    { rotulo: 'Visitas',   cor: 'text-amber-400',   corClara: 'text-amber-600 dark:text-amber-400' },
  problema:  { rotulo: 'Atenção',   cor: 'text-red-400',     corClara: 'text-red-600 dark:text-red-400' },
  logistica: { rotulo: 'Logística', cor: 'text-sky-400',     corClara: 'text-sky-600 dark:text-sky-400' },
  varejo:    { rotulo: 'Varejo',    cor: 'text-orange-400',  corClara: 'text-orange-600 dark:text-orange-400' },
  demanda:   { rotulo: 'Demanda',   cor: 'text-purple-400',  corClara: 'text-purple-600 dark:text-purple-400' },
  destaque:  { rotulo: 'Destaque',  cor: 'text-yellow-300',  corClara: 'text-yellow-600 dark:text-yellow-300' },
}

const ehAtencao = (n: ItemFeed) => n.categoria === 'problema'

/**
 * Barra de notícias do Comercial, no estilo da do Jarvis. Lê a RPC crm_noticias_feed (a mesma
 * que os outros apps do grupo usam). Some quando não há notícia publicada.
 */
export default function NoticiasTicker() {
  const [itens, setItens] = useState<ItemFeed[]>([])
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(() => {
    supabase.rpc('crm_noticias_feed', { p_limite: 15 }).then(({ data, error }) => {
      if (!error) setItens((data ?? []) as ItemFeed[])
    })
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useVisibleInterval(carregar, 15 * 60_000)
  useEffect(() => {
    window.addEventListener('noticias-changed', carregar)
    return () => window.removeEventListener('noticias-changed', carregar)
  }, [carregar])

  if (itens.length === 0) return null

  // ~7s por item: dá para ler sem a faixa parecer parada
  const duracao = `${Math.max(30, itens.length * 7)}s`
  const faixa = (chave: string) => itens.map(n => {
    const cat = CATEGORIA_NOTICIA[n.categoria] ?? CATEGORIA_NOTICIA.destaque
    // Atenção/problema (inclui os de produção) salta aos olhos: selo vermelho e título em negrito
    if (ehAtencao(n)) return (
      <span key={`${chave}-${n.id}`} className="inline-flex items-center gap-2 px-5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1 rounded bg-red-500 px-1.5 py-0.5 font-bold text-white"><AlertTriangle size={11} /> {cat.rotulo}</span>
        <span className="font-bold text-red-200">{n.titulo}</span>
        <span className="text-slate-500">·</span>
      </span>
    )
    return (
      <span key={`${chave}-${n.id}`} className="inline-flex items-center gap-2 px-5 whitespace-nowrap">
        <span className={`font-bold ${cat.cor}`}>{cat.rotulo}</span>
        <span className="text-slate-100">{n.titulo}</span>
        <span className="text-slate-500">·</span>
      </span>
    )
  })

  return (
    <>
      <div className="flex items-stretch h-8 bg-slate-900 border-b border-slate-800 text-xs shrink-0 overflow-hidden" aria-label="Últimas do Comercial">
        <div className="relative flex-1 overflow-hidden">
          <div className="ticker-faixa absolute inset-y-0 left-0 flex items-center w-max cursor-pointer"
            style={{ ['--ticker-duracao' as string]: duracao }} onClick={() => setAberto(true)}>
            {faixa('a')}{faixa('b')}
          </div>
        </div>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-16">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAberto(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-h-[75vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Newspaper size={16} className="text-orange-500" /> Últimas do Comercial</h2>
              <button onClick={() => setAberto(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={18} /></button>
            </div>
            <ul className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
              {itens.map(n => {
                const cat = CATEGORIA_NOTICIA[n.categoria] ?? CATEGORIA_NOTICIA.destaque
                return (
                  <li key={n.id} className={`px-5 py-3 ${ehAtencao(n) ? 'bg-red-50 dark:bg-red-500/10 border-l-4 border-red-500' : ''}`}>
                    <p className="text-[11px] text-slate-400">
                      <span className={`font-bold ${cat.corClara}`}>{cat.rotulo}</span> · {format(new Date(n.gerada_em), 'dd/MM HH:mm')}
                    </p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">{n.titulo}</p>
                    {n.texto && <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{n.texto}</p>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
