// digisac-webhook — recebe mensagens do WhatsApp (Digisac), grava em crm_conversations
// e classifica com IA na hora. Falhas de IA são marcadas como status_ia='error' e
// reprocessadas automaticamente pelo cron de reprocess-conversations (a cada 5 min).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_KEY        = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
// GOOGLE_API_KEY é a secret que existe no projeto (legado); GEMINI_API_KEY tem precedência se criada
const GEMINI_KEY           = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_API_KEY') ?? '';
const GEMINI_MODEL         = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
// Sem ANTHROPIC_API_KEY configurada, cai para Gemini em vez de falhar com 401
const AI_PROVIDER          = (Deno.env.get('AI_PROVIDER') ?? (ANTHROPIC_KEY ? 'ANTHROPIC' : 'GEMINI')) as 'ANTHROPIC' | 'GEMINI';

interface ConnConfig { conexao: string; api_url: string; token: string; service_id: string; }

// Tokens do Digisac vêm de secrets (Deno.env), nunca hardcoded no repositório.
// Configure via: supabase secrets set DIGISAC_TOKEN_CANTINA=... DIGISAC_TOKEN_LUMAR=...
const DIGISAC_TOKEN_CANTINA = Deno.env.get('DIGISAC_TOKEN_CANTINA') ?? '';
const DIGISAC_TOKEN_LUMAR   = Deno.env.get('DIGISAC_TOKEN_LUMAR')   ?? '';

const CONNECTIONS: Record<string, ConnConfig> = {
  '27a84876-386b-41ed-b5f9-8aba351a30c0': {
    conexao: 'CANTINA', service_id: '27a84876-386b-41ed-b5f9-8aba351a30c0',
    api_url: 'https://cantinaemcasa.digisac.co/api/v1',
    token:   DIGISAC_TOKEN_CANTINA,
  },
  'f96b8e7f-636e-4bc2-b487-28de012b2236': {
    conexao: 'LUMAR', service_id: 'f96b8e7f-636e-4bc2-b487-28de012b2236',
    api_url: 'https://lumar.digisac.io/api/v1',
    token:   DIGISAC_TOKEN_LUMAR,
  },
  '70ca7140-c4d1-40b4-98b1-3fa918634181': {
    conexao: 'LUMAR_NOVOS', service_id: '70ca7140-c4d1-40b4-98b1-3fa918634181',
    api_url: 'https://lumar.digisac.io/api/v1',
    token:   DIGISAC_TOKEN_LUMAR,
  },
};

const ENTREGADORES = new Set([
  '556281092106','556292159860','556294391877',
  '556282229852','556282424071','556294617681','556281147564',
]);

const ALERTAS = {
  SUPERVISOR:    ['5562981624768'],
  LOGISTICA:     ['5562993902654'],
  NUTRICIONISTA: ['5562983381996'],
};

const KW_QUALIDADE = [
  'cabelo','fio','pelo','plástico','plastico','metal','grampo','prego','parafuso',
  'inseto','bicho','barata','formiga','mosca','asa','larva','mosquito',
  'mofo','bolor','fungo','ponto preto','mancha','podre','estragado',
  'cheiro','fedendo','fedorento','cheiro ruim','cheiro estranho','cheiro diferente',
  'gosto estranho','gosto diferente','gosto ruim','gosto forte',
  'gosto de defumado','gosto de queimado','gosto de mofo','gosto de azedo',
  'sabor diferente','sabor estranho','sabor ruim','sabor forte',
  'sabor de defumado','sabor de queimado',
  'defumado','queimado','rançoso','ranço',
  'não estamos conseguindo comer','nao estamos conseguindo comer',
  'não conseguindo comer','nao conseguindo comer',
  'não consigo comer','nao consigo comer',
  'não dá pra comer','nao da pra comer',
  'impróprio para consumo','improprio para consumo',
  'azedo','vencido','validade','impróprio','improprio',
  'sujeira','sujo','osso','casca','pedra','areia','terra','corpo estranho',
  'fora do padrão','fora do padrao','produto estragado','produto impróprio',
  'nunca comi nenhum','nunca comemos assim','nunca tinha visto isso',
];

const KW_RECLAMACAO = [
  'grosseiro','mal educado','mal-educado','rude','absurdo',
  'reembolso','estorno','devolução','devolucao','cobrar','cobrança','cobranca',
  'errado','faltou','faltando','não veio','nao veio',
  'cancelar','cancelamento','quero cancelar','reclamar','reclame aqui','procon',
  'nunca mais','última vez','ultima vez','não volto','nao volto',
  'péssimo','pessimo','horrível','horrivel','decepcionada','decepcionado',
];

const SYSTEM_PROMPT = `Classifique mensagens de WhatsApp de clientes de empresa brasileira de panificados congelados.

CATEGORIAS:
QUALIDADE: qualquer problema com o produto em si — contaminação/corpo estranho (cabelo, plástico, inseto, mofo), sabor ou gosto estranho/diferente do esperado (defumado, queimado, azedo, rançoso), cheiro diferente, textura estranha, produto que não pode ser consumido, produto fora do padrão sensorial esperado
LOGÍSTICA: problema exclusivamente na entrega (não chegou, atrasou, endereço errado, item faltando na caixa) — NÃO classifique como logística se houver reclamação sobre sabor/qualidade do produto
RECLAMAÇÃO: insatisfação explícita com atendimento/cobrança (reembolso, grosseria, cobrança errada, "nunca mais")
PEDIDO: compra, consulta de preço, cardápio, fazer pedido, quantidade de itens
DÚVIDA: preparo, horário, pagamento, localização
ELOGIO: satisfação, agradecimento, feedback positivo CLARO — não confunda elogio com ironia ou relato de sabor estranho
OUTROS: saudação, confirmação, endereço, número, CEP, mensagem sem contexto suficiente

ATENÇÃO ESPECIAL:
- Mensagens sobre gosto diferente, sabor estranho ou inaptidão para comer o produto são SEMPRE QUALIDADE, mesmo que o cliente não use palavras técnicas
- "Gosto de defumado", "sabor diferente", "não conseguimos comer" = QUALIDADE
- "Nunca comi um biscoito de queijo com esse sabor" = QUALIDADE (não é elogio)
- ELOGIO só se a mensagem for claramente positiva e sem ressalvas
- Expressões de quantidade ou variedade ("um de cada", "dois de cada", "um de cada tipo") = PEDIDO
- Endereço, CEP, complemento, número de apartamento = OUTROS
- Confirmações simples ("sim", "ok", "certo", "tá bom", "tudo ótimo") = OUTROS

EXEMPLOS:
"Veio um cabelo no produto" → QUALIDADE
"O produto tem gosto de defumado, não estamos conseguindo comer" → QUALIDADE
"Nunca comi biscoito de queijo com esse sabor, muito estranho" → QUALIDADE
"O biscoito chegou com cheiro esquisito" → QUALIDADE
"Meu pedido não chegou" → LOGÍSTICA
"Péssimo atendimento, nunca mais compro" → RECLAMAÇÃO
"Quero fazer um pedido" → PEDIDO
"Um de cada" → PEDIDO
"Quero 2 de cada tipo" → PEDIDO
"Desses q eu circulei" → PEDIDO
"Como asso o pão de queijo?" → DÚVIDA
"Adorei, muito gostoso!" → ELOGIO
"Ok, obrigada" → OUTROS
"Td ótimo" → OUTROS
"Rua 1064, n 30, ap 2101" → OUTROS

Responda SOMENTE JSON: {"categoria":"...","resumo":"até 5 palavras","confianca":"ALTA|MEDIA|BAIXA"}`;

const EMOJI_ONLY = /^[\p{Emoji}\s\p{P}]+$/u;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const body = await req.json();
    const msg  = body.data || body;

    const chatId = msg.chatId || msg.from || '';
    if (
      msg.isFromMe ||
      msg.isGroup  ||
      chatId.includes('@g.us') ||
      (msg.type !== 'chat' && msg.type !== 'text')
    ) {
      return new Response('skipped', { status: 200 });
    }

    const texto = (msg.text || msg.body || '').trim();
    if (!texto) return new Response('no_text', { status: 200 });

    const serviceId = msg.serviceId || body.serviceId || '';
    const cfg: ConnConfig = CONNECTIONS[serviceId] ?? CONNECTIONS['27a84876-386b-41ed-b5f9-8aba351a30c0'];

    let telefone = (
      msg.contact?.data?.number || msg.contact?.number ||
      chatId.split('@')[0]       ||
      body.contact?.data?.number || body.contact?.number  || msg.number || ''
    ).toString().replace(/\D/g, '');

    const nomeCandidatos = [
      msg.contact?.name, msg.pushName, body.contact?.name,
      body.sender?.name, msg.contact?.data?.pushName,
    ];
    let nome = nomeCandidatos.find(n => n && n !== telefone) || '';

    const msgId     = msg.id    || null;
    const contactId = msg.contactId || msg.contact?.id || body.contactId || null;

    if ((!nome || !telefone) && contactId) {
      try {
        const contactRes = await fetch(`${cfg.api_url}/contacts/${contactId}`, {
          headers: { 'Authorization': `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        });
        if (contactRes.ok) {
          const contact = await contactRes.json();
          if (!nome     && contact.name)           nome     = contact.name;
          if (!telefone && contact.data?.number)   telefone = contact.data.number.replace(/\D/g, '');
          if (!telefone && contact.number)         telefone = contact.number.replace(/\D/g, '');
        }
      } catch (_) { /* best-effort */ }
    }

    if (!nome)     nome     = telefone || 'Não Identificado';
    if (!telefone) telefone = contactId ? 'ID:' + contactId.substring(0, 12) : 'Sem Número';

    const sistemaMarcadores = ['🚨','⚠️','🌟','*Lumar Alimentos','*Cantina em Casa','#### NOVO PEDIDO'];
    if (sistemaMarcadores.some(m => texto.includes(m))) return new Response('system_msg', { status: 200 });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: inserted, error: insertErr } = await sb
      .from('crm_conversations')
      .insert({
        received_at: new Date().toISOString(),
        conexao: cfg.conexao, nome, telefone, texto,
        msg_type: msg.type || 'chat',
        msg_id: msgId, contact_id: contactId,
        rota_origem: serviceId ? 'serviceId' : 'default',
      })
      .select('id').single();

    if (insertErr) {
      if (insertErr.code === '23505') return new Response('duplicate', { status: 200 });
      throw insertErr;
    }
    const id = inserted.id;

    if (ENTREGADORES.has(telefone)) {
      await sb.from('crm_conversations').update({ status_ia: 'EQUIPE', categoria: 'EQUIPE' }).eq('id', id);
      return new Response('ok_equipe', { status: 200 });
    }

    if (texto.length < 5 || EMOJI_ONLY.test(texto)) {
      await sb.from('crm_conversations').update({ status_ia: 'OK', categoria: 'OUTROS', resumo: 'Msg muito curta', confianca: 'BAIXA' }).eq('id', id);
      return new Response('ok_short', { status: 200 });
    }

    let categoria = 'OUTROS', resumo = 'Sem resumo', confianca = 'BAIXA';
    try {
      const result = await classificarComRetry(texto);
      categoria = result.categoria;
      resumo    = result.resumo;
      confianca = result.confianca;

      const tl = texto.toLowerCase();

      // Se a IA classifica como QUALIDADE mas NENHUMA keyword bate → sempre reverte para OUTROS.
      // Isso previne alucinações onde a IA infere qualidade sem evidência textual.
      if (categoria === 'QUALIDADE' && !KW_QUALIDADE.some(k => tl.includes(k))) {
        categoria = 'OUTROS';
        resumo    = '[kw-miss] ' + resumo;
        confianca = 'BAIXA';
      }

      if (categoria === 'RECLAMAÇÃO' && !KW_RECLAMACAO.some(k => tl.includes(k))) {
        categoria = 'OUTROS';
        resumo    = '[kw-miss] ' + resumo;
        confianca = 'BAIXA';
      }

      await sb.from('crm_conversations').update({ status_ia: 'OK', categoria, resumo, confianca }).eq('id', id);
    } catch (aiErr) {
      // O cron de reprocess-conversations reanalisará esta mensagem em até 5 minutos
      console.error('AI error for id', id, ':', aiErr);
      await sb.from('crm_conversations').update({ status_ia: 'error' }).eq('id', id);
      return new Response(JSON.stringify({ id, status: 'error_ia' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const criticas = ['QUALIDADE','LOGÍSTICA','RECLAMAÇÃO'];
    if (criticas.includes(categoria) && confianca !== 'BAIXA') {
      const pref  = confianca === 'ALTA' ? '🚨' : '⚠️';
      const suf   = confianca === 'ALTA' ? '' : ' (verificar)';
      const label = cfg.conexao === 'CANTINA' ? 'Cantina em Casa' : 'Lumar Alimentos';
      const titulo = `${pref} ${label}: ${categoria}${suf}`;
      const dest: string[] = categoria === 'QUALIDADE' ? ALERTAS.NUTRICIONISTA : categoria === 'LOGÍSTICA' ? ALERTAS.LOGISTICA : ALERTAS.SUPERVISOR;
      await enviarAlertas(dest, nome, telefone, resumo, texto, titulo, cfg);
      await sb.from('crm_conversations').update({ alerta_enviado: true }).eq('id', id);
    } else if (categoria === 'ELOGIO' && confianca !== 'BAIXA') {
      const label = cfg.conexao === 'CANTINA' ? 'Cantina em Casa' : 'Lumar Alimentos';
      await enviarAlertas(ALERTAS.SUPERVISOR, nome, telefone, resumo, texto, `🌟 ${label}: ELOGIO recebido!`, cfg);
      await sb.from('crm_conversations').update({ alerta_enviado: true }).eq('id', id);
    }

    return new Response(JSON.stringify({ id, categoria, confianca }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('digisac-webhook:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

function parseAIResponse(raw: string): { categoria: string; resumo: string; confianca: string } {
  try {
    const p = JSON.parse(raw);
    return { categoria: p.categoria || 'OUTROS', resumo: p.resumo || 'Sem resumo', confianca: p.confianca || 'MEDIA' };
  } catch {
    const match = raw.match(/\{[^{}]+\}/);
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        return { categoria: p.categoria || 'OUTROS', resumo: p.resumo || 'Sem resumo', confianca: p.confianca || 'MEDIA' };
      } catch { /* fall through */ }
    }
    return { categoria: 'OUTROS', resumo: 'Erro ao interpretar IA', confianca: 'BAIXA' };
  }
}

// Até 3 tentativas (backoff 700ms/1400ms) — evita marcar 'error' por instabilidade momentânea da API
async function classificarComRetry(texto: string): Promise<{ categoria: string; resumo: string; confianca: string }> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 700 * Math.pow(2, attempt - 1)));
    try {
      return AI_PROVIDER === 'GEMINI' ? await classificarGemini(texto) : await classificarAnthropic(texto);
    } catch (err) {
      lastErr = err;
      console.warn(`Classificação tentativa ${attempt + 1}/3 falhou:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr;
}

async function classificarAnthropic(texto: string): Promise<{ categoria: string; resumo: string; confianca: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      temperature: 0,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user',      content: texto },
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const rawText = '{' + (json.content?.[0]?.text?.trim() || '"categoria":"OUTROS","resumo":"Sem resumo","confianca":"BAIXA"}');
  return parseAIResponse(rawText);
}

async function classificarGemini(texto: string): Promise<{ categoria: string; resumo: string; confianca: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: texto }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 80, responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return parseAIResponse(rawText);
}

async function enviarAlertas(dest: string[], nome: string, tel: string, resumo: string, msgOrig: string, titulo: string, cfg: ConnConfig) {
  const link  = tel.match(/^\d+$/) ? `https://wa.me/${tel}` : tel;
  const corpo = `*${titulo}*\n\n👤 *Cliente:* ${nome}\n📝 *Resumo:* ${resumo}\n🔗 *Contato:* ${link}\n\n💬 *Mensagem:* ${msgOrig}`;
  await Promise.allSettled(dest.map(num =>
    fetch(`${cfg.api_url}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.token}` },
      body: JSON.stringify({ number: num, text: corpo, type: 'chat', serviceId: cfg.service_id }),
    })
  ));
}
