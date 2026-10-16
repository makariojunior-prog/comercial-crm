// Desativada na auditoria de 16/10/2026: devolvia os logs de webhook do 99Food para qualquer um.
// A tela Loja do Comercial lê delivery_webhook_logs direto, logada. Pode ser apagada no painel.
Deno.serve(() => new Response(JSON.stringify({ error: 'desativada' }), {
  status: 410,
  headers: { 'Content-Type': 'application/json' },
}))
