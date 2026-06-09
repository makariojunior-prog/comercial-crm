import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface RomaneioItem {
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
  data_entrega: string | null
  entregador: string | null
}

interface LoadParams {
  date: string
  entregador?: string
  turnoManha?: boolean
  turnoTarde?: boolean
  turnoNoite?: boolean
  empresaLumar?: boolean
  empresaCantina?: boolean
}

export function useRomaneioPedidos() {
  const [items, setItems] = useState<RomaneioItem[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (params: LoadParams) => {
    setLoading(true)

    const {
      date,
      entregador = '',
      turnoManha = true,
      turnoTarde = true,
      turnoNoite = true,
      empresaLumar = true,
      empresaCantina = true,
    } = params

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

    const isRetiradaFilter = entregador === 'RETIRADA'

    let qL = supabase
      .from('atacado_pedidos')
      .select('id, id_venda, numero_pedido, cliente_nome, turno, entregador, valor, ocorrencia, veiculo, data_entrega, crm_client:crm_clients(nome,rota,pgto)')
      .eq('data_entrega', date)
      .eq('ignorado', false)
      .neq('tipo', 'CANCELADO')
    if (turnoOr) qL = qL.or(turnoOr)
    if (isRetiradaFilter) {
      qL = (qL as any).or('entregador.eq.RETIRADA,entregador.eq.BALCÃO,entregador.eq.RETIRADA/BALCÃO')
    } else if (entregador) {
      qL = (qL as any).eq('entregador', entregador)
    }

    let qC = supabase
      .from('varejo_pedidos')
      .select('id, num_pedido, cliente, turno, entregador, valor_liquido, restricao, rota_definida, sugestao_rota, veiculo, ocorrencia, data_entrega')
      .eq('data_entrega', date)
      .neq('status_icon', '❌')
    if (turnoOr) qC = qC.or(turnoOr)
    if (isRetiradaFilter) {
      qC = (qC as any).eq('entregador', 'RETIRADA')
    } else {
      qC = qC.not('entregador', 'eq', 'RETIRADA')
      if (entregador) qC = (qC as any).eq('entregador', entregador)
    }

    const [{ data: atacado }, { data: cantina }] = await Promise.all([
      empresaLumar ? qL : Promise.resolve({ data: [] as any[] }),
      empresaCantina ? qC : Promise.resolve({ data: [] as any[] }),
    ])

    const lumar: RomaneioItem[] = ((atacado ?? []) as any[]).map(p => ({
      uid: `L${p.id}`,
      empresa: 'LUMAR' as const,
      pedido: p.numero_pedido ? String(p.numero_pedido) : `#${p.id_venda}`,
      cliente: p.crm_client?.nome ?? p.cliente_nome ?? '—',
      turno: (p.turno ?? '').toUpperCase(),
      rota: p.crm_client?.rota ?? '',
      pgto: p.crm_client?.pgto ?? '',
      valor: Number(p.valor) || 0,
      obs: '',
      ocorrencia_db: p.ocorrencia ?? '',
      data_entrega: p.data_entrega,
      entregador: p.entregador,
    }))

    const cant: RomaneioItem[] = ((cantina ?? []) as any[]).map(p => ({
      uid: `C${p.id}`,
      empresa: 'CANTINA' as const,
      pedido: p.num_pedido ? String(p.num_pedido) : '—',
      cliente: p.cliente ?? '—',
      turno: (p.turno ?? '').toUpperCase(),
      rota: p.rota_definida ?? p.sugestao_rota ?? '',
      pgto: '',
      valor: Number(p.valor_liquido) || 0,
      obs: p.restricao ?? '',
      ocorrencia_db: p.ocorrencia ?? '',
      data_entrega: p.data_entrega,
      entregador: p.entregador,
    }))

    setItems([...lumar, ...cant])
    setLoading(false)
  }, [])

  return { items, loading, load }
}
