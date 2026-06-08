import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CATEGORIAS = ['QUALIDADE', 'LOGÍSTICA', 'RECLAMAÇÃO', 'ELOGIO', 'PEDIDO', 'DÚVIDA', 'OUTROS', 'EQUIPE']

async function getStopWords(): Promise<Set<string>> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase
    .from('ia_stop_words')
    .select('word')

  if (error) {
    console.error('Error fetching stop words:', error)
    return new Set()
  }

  return new Set((data || []).map((row: { word: string }) => row.word.toLowerCase()))
}

function cleanText(text: string, stopWords: Set<string>): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => !stopWords.has(word))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function analyzeWithClaude(text: string, stopWords: Set<string>): Promise<{ categoria: string; resumo: string }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const cleanedText = cleanText(text, stopWords)

  const prompt = `Analise esta mensagem de cliente e responda com APENAS um objeto JSON (sem markdown, sem blocos de código):
{
  "categoria": "uma de: ${CATEGORIAS.join(', ')}",
  "resumo": "resumo de 2-3 palavras em português - seja conciso e extraia apenas informações-chave"
}

Mensagem: "${cleanedText}"

Responda apenas com o objeto JSON, nada mais.`

  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4.5-20241022',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })

      // Retry on rate limit (429) and server errors (5xx)
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 500
          console.warn(`Attempt ${attempt + 1}: Status ${response.status}, retrying in ${backoffMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }

        const error = await response.text()
        console.error('Claude API error:', error)
        throw new Error(`Claude API error: ${response.status}`)
      }

      const data = await response.json() as {
        content?: Array<{
          type?: string
          text?: string
        }>
      }

      const text_content = data.content?.[0]?.text
      if (!text_content) {
        console.error('Claude response:', JSON.stringify(data))
        throw new Error('No response from Claude')
      }

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = text_content.trim()
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '')
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\n/, '').replace(/\n```$/, '')
      }

      try {
        const result = JSON.parse(jsonStr)
        return {
          categoria: result.categoria || 'OUTROS',
          resumo: result.resumo || '',
        }
      } catch (parseError) {
        console.error('JSON parse error. Raw response:', text_content)
        throw new Error(`Failed to parse JSON from Claude: ${parseError}`)
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 500
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
  }

  throw lastError || new Error('Failed after all retry attempts')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch stop words once
    const stopWords = await getStopWords()

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
        const { categoria, resumo } = await analyzeWithClaude(conversa.texto, stopWords)

        const { error: updateError } = await supabase
          .from('crm_conversations')
          .update({
            categoria,
            resumo,
            status_ia: 'OK',
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
