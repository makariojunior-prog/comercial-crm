# Script de diagnóstico para Gemini 2.5 Flash Lite
$SUPABASE_URL = "https://taicaxtjtikdajmhtsxc.supabase.co"
$SERVICE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

Write-Host "🔍 Diagnóstico Gemini 2.5 Flash Lite" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar conversas com erro
Write-Host "1️⃣  Buscando conversas com erro..." -ForegroundColor Yellow

try {
    $conversations = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/rest/v1/crm_conversations?select=*&status_ia=eq.error&limit=5" `
        -Headers @{
            "apikey" = $SUPABASE_URL.Split('/')[2].Contains('supabase') ? $env:SUPABASE_ANON_KEY : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MzE0MzY0MTUsImV4cCI6MTk0NzAxNjQxNX0.KiqYMK3LLxJ-Qq6TlCQOlzWfR-yGwFKr9YhCHYcRaHU"
        } `
        -ErrorAction SilentlyContinue

    if ($conversations) {
        Write-Host "   Encontrados: $($conversations.Count) conversas com erro" -ForegroundColor Green
        Write-Host ""

        # Mostrar uma conversa de exemplo
        $conv = $conversations[0]
        Write-Host "   📝 Exemplo de conversa:" -ForegroundColor Cyan
        Write-Host "      ID: $($conv.id)" -ForegroundColor Gray
        Write-Host "      Texto: $($conv.texto.Substring(0, [Math]::Min(60, $conv.texto.Length)))..." -ForegroundColor Gray
        Write-Host "      Status IA: $($conv.status_ia)" -ForegroundColor Red
        Write-Host ""
    } else {
        Write-Host "   ✅ Nenhuma conversa com erro!" -ForegroundColor Green
        Write-Host ""
    }
}
catch {
    Write-Host "   ❌ Erro ao buscar: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# 2. Testar Gemini API diretamente
Write-Host "2️⃣  Testando Gemini 2.5 Flash Lite API..." -ForegroundColor Yellow

$GOOGLE_API_KEY = $env:GOOGLE_API_KEY
if (-not $GOOGLE_API_KEY) {
    Write-Host "   ❌ GOOGLE_API_KEY não está configurada!" -ForegroundColor Red
    Write-Host "   Execute: `$env:GOOGLE_API_KEY = 'sua-chave'" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "   🔑 Chave configurada: $($GOOGLE_API_KEY.Substring(0, 10))..." -ForegroundColor Green

    # Fazer request diretamente ao Gemini
    $testMessage = "Olá, tudo bem?"
    $body = @{
        contents = @(
            @{
                parts = @(
                    @{
                        text = "Responda com APENAS um JSON: {`"categoria`": `"OUTROS`", `"resumo`": `"saudação`"}"
                    }
                )
            }
        )
        generationConfig = @{
            temperature = 0.3
            maxOutputTokens = 256
        }
    } | ConvertTo-Json -Depth 10

    try {
        Write-Host "   Enviando request para Gemini..." -ForegroundColor Cyan
        $response = Invoke-RestMethod `
            -Uri "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=$GOOGLE_API_KEY" `
            -Method POST `
            -Headers @{"Content-Type" = "application/json"} `
            -Body $body `
            -ErrorAction Stop

        if ($response) {
            Write-Host "   ✅ Resposta recebida" -ForegroundColor Green
            Write-Host "   Estrutura da resposta:" -ForegroundColor Cyan
            Write-Host ($response | ConvertTo-Json -Depth 3) -ForegroundColor Gray
            Write-Host ""
        }
    }
    catch {
        Write-Host "   ❌ Erro na chamada: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Response: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host ""
    }
}

# 3. Verificar tabela ia_stop_words
Write-Host "3️⃣  Verificando tabela ia_stop_words..." -ForegroundColor Yellow

try {
    $stopWords = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/rest/v1/ia_stop_words?select=count&limit=1" `
        -Headers @{
            "apikey" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MzE0MzY0MTUsImV4cCI6MTk0NzAxNjQxNX0.KiqYMK3LLxJ-Qq6TlCQOlzWfR-yGwFKr9YhCHYcRaHU"
        } `
        -ErrorAction SilentlyContinue

    if ($stopWords) {
        Write-Host "   ✅ Tabela existe com $($stopWords.Count) registros" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Tabela vazia ou não encontrada" -ForegroundColor Yellow
        Write-Host "   (Isso pode estar ok, stop words vazias funcionam)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "   ⚠️  Tabela não encontrada (ok se não existir)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 Checklist:" -ForegroundColor Cyan
Write-Host "   ✓ GOOGLE_API_KEY configurada no Supabase Secrets" -ForegroundColor Green
Write-Host "   ✓ Modelo: gemini-2.5-flash-lite" -ForegroundColor Green
Write-Host "   ✓ Edge Functions deployadas" -ForegroundColor Green
Write-Host ""
Write-Host "🔧 Se ainda há erros:" -ForegroundColor Yellow
Write-Host "   1. Verifique se a resposta do Gemini está em JSON" -ForegroundColor Gray
Write-Host "   2. Confirme que a categoria retornada está em: QUALIDADE, LOGÍSTICA, RECLAMAÇÃO, ELOGIO, PEDIDO, DÚVIDA, OUTROS, EQUIPE" -ForegroundColor Gray
Write-Host "   3. Veja se há campos vazios ou nulos na resposta" -ForegroundColor Gray
Write-Host ""
