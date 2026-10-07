#!/bin/bash

# Deploy script for Gemini Integration
# Usage: ./deploy-gemini.sh

set -e

echo "🚀 Iniciando deploy da integração Gemini..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI não está instalado"
    echo "Instale com: npm install -g supabase"
    exit 1
fi

# Check if logged in
echo "🔐 Verificando autenticação..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Não autenticado no Supabase"
    echo "Execute: supabase login"
    exit 1
fi

echo "✅ Autenticado"
echo ""

# Deploy Edge Functions
echo "📦 Deployando Edge Functions..."
echo ""

echo "→ Deployando process-conversations..."
supabase functions deploy process-conversations

echo ""
echo "→ Deployando reprocess-conversations..."
supabase functions deploy reprocess-conversations

echo ""
echo "✅ Edge Functions deployadas com sucesso!"
echo ""

# Verify environment variables
echo "🔧 Configurando variáveis de ambiente..."

GOOGLE_API_KEY=$(grep "GOOGLE_API_KEY=" supabase/.env.local | cut -d'=' -f2 || echo "")

if [ -z "$GOOGLE_API_KEY" ]; then
    echo "⚠️  GOOGLE_API_KEY não encontrada em supabase/.env.local"
    echo "Configure-a manualmente no Painel do Supabase:"
    echo "Project Settings → Functions → Secrets"
else
    echo "✅ GOOGLE_API_KEY está configurada"
fi

echo ""
echo "📚 Aplicando migrations..."
supabase db push

echo ""
echo "✅ Deploy completo!"
echo ""
echo "📖 Próximos passos:"
echo "1. Teste a integração via painel do Supabase ou API"
echo "2. Acesse a página Conversações e verifique se funciona"
echo "3. Para monitores logs: supabase functions logs process-conversations"
echo ""
echo "Para mais informações, veja: GEMINI_SETUP.md"
