import { createClient } from "jsr:@supabase/supabase-js@2"

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase
    .from('lojas_delivery_status')
    .upsert({
      canal: '99FOOD',
      status: 'OPEN',
      motivo_pausa: null,
      ultima_verificacao: new Date().toISOString(),
      alerta_ativo: false,
      mensagem_alerta: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'canal' })
    .select()

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, data }, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
