import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://taicaxtjtikdajmhtsxc.supabase.co'
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não está configurada')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('🔍 Verificando conversas pendentes...\n')

  // Buscar conversas pendentes
  const { data: pending, error: pendingError } = await supabase
    .from('crm_conversations')
    .select('id, texto, status_ia, received_at')
    .eq('status_ia', 'pending')
    .order('received_at', { ascending: false })

  if (pendingError) {
    console.error('❌ Erro ao buscar conversas pendentes:', pendingError)
    process.exit(1)
  }

  // Buscar conversas com erro
  const { data: errors, error: errorsError } = await supabase
    .from('crm_conversations')
    .select('id, texto, status_ia, received_at')
    .eq('status_ia', 'error')
    .order('received_at', { ascending: false })

  if (errorsError) {
    console.error('❌ Erro ao buscar conversas com erro:', errorsError)
    process.exit(1)
  }

  console.log(`📊 Status atual:`)
  console.log(`   • Pendentes: ${pending?.length || 0}`)
  console.log(`   • Com erro: ${errors?.length || 0}`)
  console.log(`   • Total a processar: ${(pending?.length || 0) + (errors?.length || 0)}\n`)

  if (!pending?.length && !errors?.length) {
    console.log('✅ Nenhuma conversa para processar!')
    process.exit(0)
  }

  // Processar pendentes
  if (pending?.length) {
    console.log('⏳ Processando conversas pendentes...')
    const result = await fetch(`${supabaseUrl}/functions/v1/process-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await result.json() as { total?: number; ok?: number; failed?: number; errors?: Array<{ id: string; error: string }> }
    console.log(`   ✓ Processadas: ${json.ok || 0}/${json.total || 0}`)
    if (json.failed) {
      console.log(`   ✗ Falhadas: ${json.failed}`)
      if (json.errors?.slice(0, 3).length) {
        console.log(`   Exemplos de erro:`)
        json.errors.slice(0, 3).forEach(e => {
          console.log(`      • ${e.id.slice(0, 8)}: ${e.error.slice(0, 50)}`)
        })
      }
    }
    console.log()
  }

  // Reprocessar com erro
  if (errors?.length) {
    console.log('🔄 Reprocessando conversas com erro...')
    const result = await fetch(`${supabaseUrl}/functions/v1/reprocess-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const json = await result.json() as { total?: number; ok?: number; failed?: number }
    console.log(`   ✓ Reprocessadas: ${json.ok || 0}/${json.total || 0}`)
    if (json.failed) {
      console.log(`   ✗ Falhadas: ${json.failed}`)
    }
    console.log()
  }

  // Status final
  const { data: finalPending } = await supabase
    .from('crm_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status_ia', 'pending')

  const { data: finalErrors } = await supabase
    .from('crm_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status_ia', 'error')

  console.log('📈 Status final:')
  console.log(`   • Pendentes: ${finalPending?.length || 0}`)
  console.log(`   • Com erro: ${finalErrors?.length || 0}`)
  console.log()

  if (!finalPending?.length && !finalErrors?.length) {
    console.log('✅ Todas as conversas foram processadas com sucesso!')
  }
}

main().catch(err => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
