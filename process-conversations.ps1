# Script para processar todas as conversas pendentes e com erro
# Uso: .\process-conversations.ps1

$SUPABASE_URL = "https://taicaxtjtikdajmhtsxc.supabase.co"
$SUPABASE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_KEY) {
    Write-Host "❌ SUPABASE_SERVICE_ROLE_KEY não está configurada" -ForegroundColor Red
    Write-Host "Execute primeiro: `$env:SUPABASE_SERVICE_ROLE_KEY = 'sua-chave-aqui'" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔍 Verificando conversas pendentes..." -ForegroundColor Cyan
Write-Host ""

# Buscar count de conversas pendentes
$pendingResp = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/rest/v1/crm_conversations?select=id&status_ia=eq.pending" `
    -Headers @{
        "Authorization" = "Bearer $SUPABASE_KEY"
        "apikey" = $SUPABASE_KEY
    } `
    -ErrorAction SilentlyContinue

$pendingCount = @($pendingResp).Count

# Buscar count de conversas com erro
$errorResp = Invoke-RestMethod `
    -Uri "$SUPABASE_URL/rest/v1/crm_conversations?select=id&status_ia=eq.error" `
    -Headers @{
        "Authorization" = "Bearer $SUPABASE_KEY"
        "apikey" = $SUPABASE_KEY
    } `
    -ErrorAction SilentlyContinue

$errorCount = @($errorResp).Count

Write-Host "📊 Status atual:" -ForegroundColor Cyan
Write-Host "   • Pendentes: $pendingCount" -ForegroundColor Yellow
Write-Host "   • Com erro: $errorCount" -ForegroundColor Red
Write-Host "   • Total a processar: $($pendingCount + $errorCount)" -ForegroundColor Magenta
Write-Host ""

if ($pendingCount -eq 0 -and $errorCount -eq 0) {
    Write-Host "✅ Nenhuma conversa para processar!" -ForegroundColor Green
    exit 0
}

# Processar pendentes
if ($pendingCount -gt 0) {
    Write-Host "⏳ Processando $pendingCount conversas pendentes..." -ForegroundColor Yellow

    $body = @{} | ConvertTo-Json

    $result = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/functions/v1/process-conversations" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $SUPABASE_KEY"
        } `
        -Body $body `
        -ErrorAction SilentlyContinue

    if ($result) {
        Write-Host "   ✓ Processadas: $($result.ok)/$($result.total)" -ForegroundColor Green
        if ($result.failed -gt 0) {
            Write-Host "   ✗ Falhadas: $($result.failed)" -ForegroundColor Red
        }
        if ($result.errors -and $result.errors.Count -gt 0) {
            Write-Host "   Erros (primeiros 3):" -ForegroundColor Yellow
            $result.errors | Select-Object -First 3 | ForEach-Object {
                $id = $_.id.Substring(0, [Math]::Min(8, $_.id.Length))
                $err = $_.error.Substring(0, [Math]::Min(60, $_.error.Length))
                Write-Host "      • $id`: $err" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "   ❌ Erro ao chamar função" -ForegroundColor Red
    }
    Write-Host ""
}

# Reprocessar com erro
if ($errorCount -gt 0) {
    Write-Host "🔄 Reprocessando $errorCount conversas com erro..." -ForegroundColor Yellow

    $body = @{} | ConvertTo-Json

    $result = Invoke-RestMethod `
        -Uri "$SUPABASE_URL/functions/v1/reprocess-conversations" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $SUPABASE_KEY"
        } `
        -Body $body `
        -ErrorAction SilentlyContinue

    if ($result) {
        Write-Host "   ✓ Reprocessadas: $($result.ok)/$($result.total)" -ForegroundColor Green
        if ($result.failed -gt 0) {
            Write-Host "   ✗ Falhadas: $($result.failed)" -ForegroundColor Red
        }
    } else {
        Write-Host "   ❌ Erro ao chamar função" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "✅ Processamento concluído!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Dica: Recarregue a página Conversações para ver as atualizações" -ForegroundColor Cyan
