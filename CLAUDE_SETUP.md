# Migração de Gemini para Claude Haiku - Setup

Este documento descreve como configurar a análise de mensagens do Digisac com Claude Haiku 4.5 em lugar de Gemini.

## ✅ O Que Foi Feito

- Edge Functions atualizadas para usar Claude Haiku 4.5 (v20241022)
- Código compatível com ANTHROPIC_API_KEY
- Funções deployadas com sucesso no Supabase

## 🔧 Configuração Necessária

### 1. Configurar ANTHROPIC_API_KEY no Supabase

Você precisa adicionar a chave de API do Anthropic nos secrets do Supabase:

#### Opção A: Via Painel Supabase (Recomendado)

1. Acesse: https://supabase.com/dashboard/project/taicaxtjtikdajmhtsxc/settings/functions
2. Clique em **Secrets**
3. Clique em **Add new secret**
4. Nome: `ANTHROPIC_API_KEY`
5. Valor: Cole sua chave de API do Anthropic (sk-ant-v4-...)
6. Clique em **Create secret**

#### Opção B: Via CLI (requer autenticação)

```bash
cd C:\Users\Makário Orozimbo\OneDrive\Github\comercial-crm

# Se ainda não estiver logado:
supabase login

# Adicionar secret
supabase secrets set ANTHROPIC_API_KEY="sk-ant-v4-sua-chave-aqui" --project-ref taicaxtjtikdajmhtsxc
```

## 📋 Verificação

Após configurar a chave, teste assim:

### Via App

1. Vá para a página **Conversações**
2. Se houver mensagens com ⚠️ **Erro IA**, clique em **"Reprocessar Erros"**
3. As mensagens devem ser analisadas e mostrar categorias como QUALIDADE, LOGÍSTICA, etc.

### Via Logs

```bash
supabase functions logs process-conversations --project-ref taicaxtjtikdajmhtsxc
supabase functions logs reprocess-conversations --project-ref taicaxtjtikdajmhtsxc
```

## 📊 Fluxo de Funcionamento

```
Nova mensagem do Digisac em crm_conversations
        ↓
Trigger marca como status_ia = 'pending'
        ↓
Edge Function process-conversations executa
        ↓
Claude Haiku analisa texto e retorna categoria + resumo
        ↓
status_ia muda para 'OK' + campos categoria/resumo preenchidos
```

Caso haja erro (por ex: chave não configurada):
- `status_ia` = 'error'
- Clique em **Reprocessar Erros** para tentar novamente

## 📚 Categorias de Análise

O Claude classificará as mensagens em uma destas categorias:

- **QUALIDADE** - Problemas ou elogios sobre qualidade
- **LOGÍSTICA** - Questões de entrega/transporte
- **RECLAMAÇÃO** - Reclamações dos clientes
- **ELOGIO** - Elogios e feedback positivo
- **PEDIDO** - Novos pedidos ou pedidos de orçamento
- **DÚVIDA** - Dúvidas gerais
- **EQUIPE** - Mensagens internas de equipe
- **OUTROS** - Outros assuntos

## 🔗 Relacionados

- [GEMINI_SETUP.md](./GEMINI_SETUP.md) - Setup anterior com Gemini (referência)
- [DEPLOY_RAPIDO.md](./DEPLOY_RAPIDO.md) - Deploy rápido
- **Conversações Page:** `/conversacoes`

## ⚠️ Troubleshooting

### "ANTHROPIC_API_KEY not configured"

Se receber este erro, significa que a chave não foi adicionada aos secrets do Supabase:

1. Verifique se a chave foi adicionada em Project Settings → Functions → Secrets
2. Aguarde alguns segundos para a chave ser sincronizada
3. Tente novamente clicando em "Reprocessar Erros"

### Conversas continuam com "⏳ Processando"

- A chave está configurada mas as mensagens ainda não foram processadas
- Clique manualmente em "Reprocessar Erros" ou aguarde que o cron automático processe

### Erros de parsing JSON

Se o Claude retornar JSON inválido:
1. Verifique os logs: `supabase functions logs process-conversations`
2. O prompt está configurado para ser muito claro, erros são raros

---

**Última atualização:** 8 de junho de 2026
**Status:** Pronto para configuração
