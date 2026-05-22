import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Secret check is optional — if env var is set, enforce it
  const expectedSecret = Deno.env.get('INSTAGRAM_WEBHOOK_SECRET')
  if (expectedSecret) {
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
  }

  // Accept both JSON and form-data (x-www-form-urlencoded / multipart)
  let comment_id: string | undefined
  let parent_id: string | undefined
  let username: string | undefined
  let text: string | undefined
  let media_id: string | undefined
  let post_link: string | undefined
  let post_caption: string | undefined

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    ;({ comment_id, parent_id, username, text, media_id, post_link, post_caption } = body)
  } else {
    const formData = await req.formData()
    comment_id   = formData.get('comment_id')?.toString()
    parent_id    = formData.get('parent_id')?.toString()
    username     = formData.get('username')?.toString()
    text         = formData.get('text')?.toString()
    media_id     = formData.get('media_id')?.toString()
    post_link    = formData.get('post_link')?.toString()
    post_caption = formData.get('post_caption')?.toString()
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Reply from own account → UPDATE original comment
  if (parent_id && username === 'cantina.em.casa') {
    const { error } = await supabase
      .from('crm_social_comments')
      .update({
        status: 'RESPONDIDO',
        resposta: text ?? null,
        respondido_por: 'cantina.em.casa (Instagram)',
        respondido_em: new Date().toISOString(),
      })
      .eq('comment_id', parent_id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ok: true, action: 'updated' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // New comment → INSERT
  if (!comment_id || !text) {
    return new Response(JSON.stringify({ error: 'comment_id and text are required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Skip duplicates
  const { data: existing } = await supabase
    .from('crm_social_comments')
    .select('id')
    .eq('comment_id', comment_id)
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({ ok: true, action: 'duplicate_skipped' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { error } = await supabase.from('crm_social_comments').insert({
    received_at: new Date().toISOString(),
    platform: 'instagram',
    account: 'cantina.em.casa',
    comment_id,
    comment_type: 'COMENTARIO',
    username: username ?? null,
    nome: null,
    mensagem: text,
    post_link: post_link ?? null,
    post_caption: post_caption ?? null,
    media_id: media_id ?? null,
    status: 'NOVO',
    alerta_enviado: false,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: true, action: 'inserted' }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
})
