# Troubleshooting - Gemini API não funciona

## 🔍 Diagnóstico Rápido

Se está vendo **⚠️ Erro IA** nas mensagens, siga esta checklist:

### 1. ✅ Verificar se GOOGLE_API_KEY está configurada no Supabase

**Via Painel Supabase:**
1. Acesse: https://supabase.com/dashboard/project/taicaxtjtikdajmhtsxc/settings/functions
2. Clique em **Secrets**
3. Procure por `GOOGLE_API_KEY`
4. Se não existir ou estiver vazia, adicione/atualize:
   - Nome: `GOOGLE_API_KEY`
   - Valor: Sua chave de API do Google Gemini

### 2. ✅ Verificar se a chave é válida

Teste sua chave acessando o Google AI Studio:
- https://aistudio.google.com/

Se conseguir usar o Gemini lá, a chave é válida.

### 3. ✅ Verificar a URL do modelo

O modelo usado é: **`gemini-1.5-flash`** (não gemini-2.0-flash nem outro)

URL correta: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=YOUR_KEY`

### 4. ✅ Verificar os logs das Edge Functions

```bash
supabase functions logs process-conversations --project-ref taicaxtjtikdajmhtsxc
supabase functions logs reprocess-conversations --project-ref taicaxtjtikdajmhtsxc
```

Procure por:
- `GOOGLE_API_KEY not configured` → Adicione a chave nos secrets
- `Gemini API error: 401` → Chave inválida ou expirada
- `Gemini API error: 403` → Projeto desativado ou quota excedida
- `No response from Gemini` → Resposta malformada

### 5. ✅ Testar Reprocessamento Manual

1. Vá para a página **Conversações** no app
2. Se houver mensagens com ⚠️ **Erro IA**, clique em **"Reprocessar Erros"**
3. Aguarde alguns segundos
4. Verifique os logs enquanto processa

---

## 🔧 Passo a Passo para Configurar

### Se GOOGLE_API_KEY está ausente ou incorreta:

#### Opção A: Via Painel Supabase (Recomendado)

1. Vá para: https://supabase.com/dashboard/project/taicaxtjtikdajmhtsxc/settings/functions
2. Clique em **Secrets**
3. Clique em **Add new secret** (ou selecione GOOGLE_API_KEY existente)
4. Cole sua chave: `AIza...` (começa com AIza)
5. Clique em **Create secret** ou **Update secret**
6. Aguarde sincronização (poucos segundos)
7. Teste novamente clicando "Reprocessar Erros"

#### Opção B: Via supabase/.env.local (desenvolvimento local)

1. Abra: `supabase/.env.local`
2. Atualize o valor:
   ```
   GOOGLE_API_KEY=sua-chave-aqui
   ```
3. Salve o arquivo
4. Deploy novamente: `supabase functions deploy process-conversations`

---

## 💡 Erros Comuns

### "GOOGLE_API_KEY not configured"
- A chave não foi adicionada aos secrets do Supabase
- **Solução:** Adicione em Project Settings → Functions → Secrets

### "Gemini API error: 401"
- Chave de API inválida, expirada ou revogada
- **Solução:** Gere uma nova chave em https://aistudio.google.com/

### "Gemini API error: 403"
- Projeto Google Cloud está desativado ou quota excedida
- **Solução:** Verifique créditos e limites em Google Cloud Console

### "Conversas continuam com ⏳ Processando"
- A chave está configurada mas ainda não foram processadas
- **Solução:** Clique manualmente "Reprocessar Erros" ou aguarde cron

### "JSON parse error"
- Resposta do Gemini em formato inesperado
- **Solução:** Verifique os logs para ver a resposta completa

---

## 📚 Informações Técnicas

**Modelo:** Google Gemini 1.5 Flash
**Endpoint:** `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent`
**Temperatura:** 0.3 (respostas determinísticas)
**Max tokens:** 256
**Timeout por retry:** exponencial (500ms × 2^attempt)
**Max retries:** 3

---

## 🚀 Verificação Final

Após configurar a chave:

1. ✅ GOOGLE_API_KEY adicionada nos Secrets do Supabase
2. ✅ Mensagens começam a ser analisadas (status muda de "Processando" para categoria)
3. ✅ Não há mais ⚠️ **Erro IA** nas mensagens
4. ✅ Clique "Reprocessar Erros" processa com sucesso

Se ainda houver problemas, verifique os logs das Edge Functions.

---

**Última atualização:** 8 de junho de 2026
**Status:** Troubleshooting v1.0
