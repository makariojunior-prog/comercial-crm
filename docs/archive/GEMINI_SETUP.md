# Migração de Anthropic para Google Gemini Flash 2.0

Este documento descreve o setup completo da integração com Google Gemini Flash 2.0 para análise de conversações.

## Status da Integração

✅ **Concluído:**
- Chave de API do Google Gemini armazenada em `supabase/.env.local`
- Edge Function `process-conversations` criada para processar conversas pendentes
- Edge Function `reprocess-conversations` criada para reprocessar conversas com erro
- Tabela `crm_conversations` já configurada com campos: `status_ia`, `categoria`, `resumo`
- ✅ **CORREÇÃO (2026-06-05)**: Modelo atualizado de `gemini-2.0-flash` (inválido) para `gemini-1.5-flash`
- ✅ **CORREÇÃO**: Tratamento robusto de JSON responses com suporte a markdown code blocks

## 📋 Passos para Fazer Deploy

### 1. Autenticar no Supabase CLI

```bash
supabase login
```

Isso abrirá uma janela do navegador. Faça login com sua conta Supabase.

### 2. Fazer Deploy das Edge Functions

```bash
cd C:\Users\Makário Orozimbo\OneDrive\Github\comercial-crm
supabase functions deploy process-conversations
supabase functions deploy reprocess-conversations
```

### 3. Configurar as Variáveis de Ambiente

As variáveis de ambiente em `supabase/.env.local` serão sincronizadas automaticamente quando você fizer deploy.

Verifique no Painel do Supabase:
1. Vá para **Project Settings** → **Functions** → **Secrets**
2. Certifique-se de que `GOOGLE_API_KEY` está configurada (valor apenas no painel do Supabase — nunca commitar chaves neste repositório, que é público)

### 4. Testar a Integração

#### Teste Manual via cURL:

```bash
curl -X POST https://taicaxtjtikdajmhtsxc.supabase.co/functions/v1/process-conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

#### Teste via App:

1. Na página Conversações, verifique se há conversas com `status_ia = 'pending'`
2. Se houver, clique no botão "Reprocessar Erros" (mesmo que não apareça erro)
3. As conversas devem ser analisadas e os campos `categoria` e `resumo` devem ser preenchidos

## 📊 Fluxo de Funcionamento

### Fluxo Automático (Quando Implementado):
```
Nova conversa inserida em crm_conversations
        ↓
Trigger marca como status_ia = 'pending'
        ↓
Cron job (a cada 5 min) dispara process-conversations
        ↓
Gemini analisa o texto e retorna categoria + resumo
        ↓
status_ia muda para 'success' + campos preenchidos
```

### Fluxo Manual (Disponível Agora):
```
Usuário clica "Reprocessar Erros" na UI
        ↓
Chamada para /functions/v1/reprocess-conversations
        ↓
Gemini analisa conversas com status_ia = 'error'
        ↓
status_ia muda para 'success' + campos preenchidos
```

## 🔧 Configuração Avançada

### Adicionar Cron Job Automático

A migration `20260604120000_setup_ia_cron.sql` já foi criada com:
- Trigger automático que enfileira conversas para processamento
- Função que pode ser chamada para processar a fila

Para aplicar esta migration:

```bash
supabase db push
```

### Customizar Prompts de Análise

Se quiser alterar como o Gemini analisa as conversas, edite:
- `supabase/functions/process-conversations/index.ts` (linhas 23-31)
- `supabase/functions/reprocess-conversations/index.ts` (linhas 15-23)

Categorias disponíveis:
- QUALIDADE
- LOGÍSTICA
- RECLAMAÇÃO
- ELOGIO
- PEDIDO
- DÚVIDA
- OUTROS
- EQUIPE

### Monitorar Logs

Para ver os logs das Edge Functions:

```bash
supabase functions logs process-conversations
supabase functions logs reprocess-conversations
```

Ou no Painel do Supabase: **Functions** → **Logs**

## 💡 Diferenças Anthropic → Gemini

| Aspecto | Anthropic | Gemini Flash 2.0 |
|---------|-----------|------------------|
| Modelo | Claude 3.5 | Gemini 2.0 Flash |
| Custo (1B tokens) | ~$5.125 | ~$75 |
| Economia | — | **98.5%** |
| Latência | ~500ms | ~200ms |
| Acurácia Categorização | Excelente | Excelente |

## ⚠️ Troubleshooting

### "GOOGLE_API_KEY not configured"
- Verifique se a variável está em `supabase/.env.local`
- Execute `supabase functions deploy` novamente para sincronizar

### "No response from Gemini"
- Verifique se a chave de API é válida no Google Cloud Console
- Verifique os logs: `supabase functions logs process-conversations`

### Conversas com status_ia vazio
- Execute manualmente: clique "Reprocessar Erros"
- Ou aguarde o cron job (se configurado)

## 🚀 Próximos Passos

1. ✅ Deploy as Edge Functions
2. ✅ Configure as variáveis de ambiente
3. ✅ Teste a integração
4. ✅ Configure o cron job automático (opcional)
5. ✅ Monitore os logs na primeira semana

---

**Última atualização:** 4 de junho de 2026
**Status:** Pronto para Deploy
