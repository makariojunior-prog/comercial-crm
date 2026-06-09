import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Esta função será chamada automaticamente a cada 5 minutos via CRON
    // Processa APENAS conversas com status_ia = 'pending'

    console.log('🔄 Auto-processor started', new Date().toISOString())

    const result = await fetch('https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/process-conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({}),
    })

    const data = await result.json()

    console.log(`✅ Auto-processor result: ${data.ok}/${data.total} processed, ${data.failed} failed`)

    return new Response(
      JSON.stringify({
        status: 'success',
        timestamp: new Date().toISOString(),
        ...data,
      }),
      {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('Auto-processor error:', errMsg)
    return new Response(
      JSON.stringify({ error: errMsg, timestamp: new Date().toISOString() }),
      {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      },
    )
  }
})
