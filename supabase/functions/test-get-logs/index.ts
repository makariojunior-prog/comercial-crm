import { createClient } from "jsr:@supabase/supabase-js@2"

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase
    .from('delivery_webhook_logs')
    .select('*')
    .eq('canal', '99FOOD')
    .order('received_at', { ascending: false })
    .limit(10)

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify(data, null, 2), { headers: { 'Content-Type': 'application/json' } })
})
