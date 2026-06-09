import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)

interface FrotaCusto {
  id: string
  vehicle_id: string
  driver_id: string | null
  categoria: string
  descricao: string | null
  valor: number
  km_odometro: number | null
  litros: number | null
  preco_litro: number | null
  data_gasto: string
  observacoes: string | null
  recorrente: boolean
  tipo_recorrencia: 'mensal' | 'trimestral' | 'semestral' | 'anual' | null
  proxima_data_recorrencia: string | null
  data_inicio_recorrencia: string | null
  data_fim_recorrencia: string | null
  recorrencia_indefinida: boolean
  custo_recorrente_id: string | null
  ativo: boolean
}

function adicionarMeses(data: Date, meses: number): Date {
  const ano = data.getFullYear()
  const mes = data.getMonth()
  const dia = data.getDate()

  // Mês alvo (pode ultrapassar 11; o Date normaliza ano/mês)
  const alvoAno = ano + Math.floor((mes + meses) / 12)
  const alvoMes = ((mes + meses) % 12 + 12) % 12

  // Último dia do mês alvo — evita "transbordo" (ex: 31/01 + 1 mês = 28/02, não 03/03)
  const ultimoDiaAlvo = new Date(alvoAno, alvoMes + 1, 0).getDate()
  const diaFinal = Math.min(dia, ultimoDiaAlvo)

  return new Date(alvoAno, alvoMes, diaFinal)
}

function formatarData(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

async function gerarLancamentosRecorrentes() {
  console.log('Iniciando geração de lançamentos recorrentes...')

  // Buscar todos os custos recorrentes que não têm custo_recorrente_id (são os originais)
  const { data: custosRecorrentes, error } = await supabase
    .from('frota_custos')
    .select('*')
    .eq('recorrente', true)
    .is('custo_recorrente_id', null)
    .eq('ativo', true)

  if (error) {
    console.error('Erro ao buscar custos recorrentes:', error)
    return { success: false, error: error.message }
  }

  if (!custosRecorrentes || custosRecorrentes.length === 0) {
    console.log('Nenhum custo recorrente encontrado')
    return { success: true, message: 'Nenhum custo para gerar' }
  }

  let totalGerado = 0

  for (const custo of custosRecorrentes as FrotaCusto[]) {
    console.log(`Processando custo recorrente: ${custo.id}`)

    const intervalos: Record<string, number> = {
      mensal: 1,
      trimestral: 3,
      semestral: 6,
      anual: 12,
    }

    const mesesIntervalo = intervalos[custo.tipo_recorrencia || 'mensal'] || 1

    // Determinar a data de fim
    let dataFim: Date
    if (custo.recorrencia_indefinida) {
      // Gerar até 2 anos no futuro
      dataFim = adicionarMeses(new Date(), 24)
    } else if (custo.data_fim_recorrencia) {
      dataFim = new Date(custo.data_fim_recorrencia)
    } else {
      continue // Pular se não conseguir determinar data fim
    }

    // Buscar o último lançamento gerado para este custo
    const { data: ultimoLancamento } = await supabase
      .from('frota_custos')
      .select('data_gasto')
      .eq('custo_recorrente_id', custo.id)
      .order('data_gasto', { ascending: false })
      .limit(1)
      .single()

    let dataProxima: Date
    if (ultimoLancamento) {
      dataProxima = adicionarMeses(new Date(ultimoLancamento.data_gasto), mesesIntervalo)
    } else {
      dataProxima = adicionarMeses(new Date(custo.data_gasto), mesesIntervalo)
    }

    // Gerar lançamentos até a data final
    const novosCustos: any[] = []
    let iteracoes = 0
    const maxIteracoes = 24 // Máximo 24 iterações para evitar loops infinitos

    while (dataProxima <= dataFim && iteracoes < maxIteracoes) {
      novosCustos.push({
        vehicle_id: custo.vehicle_id,
        driver_id: custo.driver_id,
        categoria: custo.categoria,
        descricao: custo.descricao,
        valor: custo.valor,
        km_odometro: null, // Não copiar km para lançamentos recorrentes
        litros: null,
        preco_litro: null,
        data_gasto: formatarData(dataProxima),
        observacoes: custo.observacoes,
        recorrente: false, // Os lançamentos gerados não são recorrentes
        tipo_recorrencia: null,
        proxima_data_recorrencia: null,
        data_inicio_recorrencia: null,
        data_fim_recorrencia: null,
        recorrencia_indefinida: false,
        custo_recorrente_id: custo.id, // Vinculado ao custo original
        ativo: true,
      })

      dataProxima = adicionarMeses(dataProxima, mesesIntervalo)
      iteracoes++
    }

    // Inserir os novos lançamentos
    if (novosCustos.length > 0) {
      const { error: insertError } = await supabase
        .from('frota_custos')
        .insert(novosCustos)

      if (insertError) {
        console.error(`Erro ao inserir lançamentos para ${custo.id}:`, insertError)
      } else {
        console.log(`Gerados ${novosCustos.length} lançamentos para ${custo.id}`)
        totalGerado += novosCustos.length
      }
    }
  }

  console.log(`Processo finalizado. Total de lançamentos gerados: ${totalGerado}`)
  return { success: true, gerado: totalGerado }
}

Deno.serve(async (req) => {
  // Apenas POST
  if (req.method !== 'POST') {
    return new Response('Apenas POST permitido', { status: 405 })
  }

  try {
    const resultado = await gerarLancamentosRecorrentes()
    return new Response(JSON.stringify(resultado), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
