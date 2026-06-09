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

async function analyzeWithGemini(text: string, stopWords: Set<string>): Promise<{ categoria: string; resumo: string }> {
  const apiKey = Deno.env.get('GOOGLE_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured')

  const cleanedText = cleanText(text, stopWords)

  // Truncate text if too long to avoid token limits
  const maxTextLength = 500
  const truncatedText = cleanedText.length > maxTextLength ? cleanedText.substring(0, maxTextLength) + '...' : cleanedText

  const prompt = `Analyze this customer message and respond with ONLY a JSON object (no markdown, no code blocks):
{
  "categoria": "one of: ${CATEGORIAS.join(', ')}",
  "resumo": "2-3 word summary in Portuguese - be concise and extract only key information"
}

Message: "${truncatedText}"

Respond with only the JSON object, nothing else.`

  const maxRetries = 5
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add delay between retries to avoid rate limiting (exponential backoff starting at 1s)
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 1000 + Math.random() * 1000
        console.log(`Attempt ${attempt + 1}/${maxRetries + 1}: Waiting ${Math.round(delayMs)}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 90000) // 90 second timeout for this specific request

      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
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
            maxOutputTokens: 256,
          },
        }),
      })

      clearTimeout(timeout)

      // Retry on rate limit (429) and server errors (5xx)
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 500
          console.warn(`Attempt ${attempt + 1}: Status ${response.status}, retrying in ${backoffMs}ms...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }

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
      if (!text_content) {
        console.error('Gemini response:', JSON.stringify(data))
        throw new Error('No response from Gemini')
      }

      // Extract and validate JSON from response (robust parsing)
      let jsonStr = text_content.trim()

      // Remove markdown code blocks (flexible: handle \r\n, \n, spaces)
      if (jsonStr.startsWith('```')) {
        // Remove opening ``` and optional "json" language marker
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '')
        // Remove closing ```
        jsonStr = jsonStr.replace(/\s*```\s*$/, '')
      }

      jsonStr = jsonStr.trim()
      console.log(`Extracted JSON string (first 200 chars): ${jsonStr.substring(0, 200)}`)

      let result: any
      try {
        result = JSON.parse(jsonStr)
      } catch (parseError) {
        // If JSON.parse fails, try to extract JSON object manually
        console.warn('JSON.parse failed, attempting regex extraction...')
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          throw new Error(`Invalid JSON format. Raw response: ${text_content.substring(0, 500)}`)
        }
        try {
          result = JSON.parse(jsonMatch[0])
        } catch (e) {
          throw new Error(`Failed to parse extracted JSON: ${e}. Content: ${jsonMatch[0].substring(0, 200)}`)
        }
      }

      // Validate required fields
      if (!result.categoria || !result.resumo) {
        throw new Error(`Missing required fields. Got: categoria="${result.categoria}", resumo="${result.resumo}"`)
      }

      // Validate categoria is in allowed list
      if (!CATEGORIAS.includes(result.categoria)) {
        console.warn(`Invalid categoria "${result.categoria}", defaulting to OUTROS`)
        result.categoria = 'OUTROS'
      }

      return {
        categoria: result.categoria,
        resumo: String(result.resumo).trim(),
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
        const { categoria, resumo } = await analyzeWithGemini(conversa.texto, stopWords)

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
