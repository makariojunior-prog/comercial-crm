#!/bin/bash

SUPABASE_URL="https://taicaxtjtikdajmhtsxc.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYzMTQzNjQxNSwiZXhwIjoxOTQ3MDE2NDE1fQ.dS6tPrXkQvA5jzD_M8OGt1lGq_gXRgEH0VmjQGPtYNc"

echo "📊 Diagnóstico de Status de Conversas"
echo ""

# Função para contar conversas por status
count_by_status() {
    local status=$1
    local uri="${SUPABASE_URL}/rest/v1/crm_conversations?select=id&status_ia=eq.${status}"

    local result=$(curl -s -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" "$uri")

    # Contar elementos no array JSON
    if [[ "$result" == "["* ]]; then
        local count=$(echo "$result" | grep -o '"id"' | wc -l)
        echo "  $status: $count conversas"
    else
        echo "  $status: 0 conversas (ou erro na API)"
    fi
}

echo "Status atual:"
count_by_status "pending"
count_by_status "OK"
count_by_status "error"

echo ""
echo "📋 Últimas 5 conversas com erro:"

uri="${SUPABASE_URL}/rest/v1/crm_conversations?select=id,texto,status_ia,created_at&status_ia=eq.error&order=created_at.desc&limit=5"
result=$(curl -s -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" "$uri")

if [[ "$result" == "["* ]]; then
    echo "$result" | grep -o '"id":"[^"]*"' | head -5 | sed 's/"id":"/  • /' | sed 's/"//'
else
    echo "  Erro ao buscar ou nenhuma conversa com erro"
fi
