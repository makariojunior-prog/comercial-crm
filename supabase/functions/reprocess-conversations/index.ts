import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CATEGORIAS = ['QUALIDADE', 'LOGÍSTICA', 'RECLAMAÇÃO', 'ELOGIO', 'PEDIDO', 'DÚVIDA', 'OUTROS', 'EQUIPE']

async function analyzeWithGemini(text: string): Promise<{ categoria: string; resumo: string }> {
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured')

  const prompt = `Analyze this customer message and respond with ONLY a JSON object (no markdown, no code blocks):
{
  "categoria": "one of: ${CATEGORIAS.join(', ')}",
  "resumo": "2-3 word summary in Portuguese"
}

Message: "${text}"

Respond with only the JSON object, nothing else.`

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 100,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Gemini API error:', error)
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
        }>
      }
    }>
  }

  const text_content = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text_content) throw new Error('No response from Gemini')

  const result = JSON.parse(text_content)
  return {
    categoria: result.categoria || 'OUTROS',
    resumo: result.resumo || '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch conversations with errors
    const { data: conversas, error: fetchError } = await supabase
      .from('crm_conversations')
      .select('*')
      .eq('status_ia', 'error')
      .limit(50)

    if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`)

    let ok = 0
    let failed = 0

    for (const conversa of conversas || []) {
      try {
        const { categoria, resumo } = await analyzeWithGemini(conversa.texto)

        const { error: updateError } = await supabase
          .from('crm_conversations')
          .update({
            categoria,
            resumo,
            status_ia: 'success',
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversa.id)

        if (updateError) {
          console.error(`Update error for ${conversa.id}:`, updateError)
          failed++
        } else {
          ok++
        }
      } catch (err) {
        failed++
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`Processing error for ${conversa.id}:`, errMsg)
      }
    }

    return new Response(
      JSON.stringify({
        total: conversas?.length || 0,
        ok,
        failed,
      }),
      {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('Function error:', errMsg)
    return new Response(
      JSON.stringify({ error: errMsg }),
      {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      },
    )
  }
})
