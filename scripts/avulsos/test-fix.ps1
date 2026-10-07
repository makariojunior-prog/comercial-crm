# Test script para verificar o processamento corrigido

$SUPABASE_URL = "https://taicaxtjtikdajmhtsxc.supabase.co"
$SUPABASE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_KEY) {
    Write-Host "❌ SUPABASE_SERVICE_ROLE_KEY não está configurada" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Testando processo corrigido..." -ForegroundColor Cyan
Write-Host ""

# Buscar conversas com erro para reprocessar
$uri = $SUPABASE_URL + '/rest/v1/crm_conversations?select=id,texto&status_ia=eq.error&limit=5'
$errorResp = Invoke-RestMethod -Uri $uri -Headers @{
    "Authorization" = "Bearer $SUPABASE_KEY"
    "apikey" = $SUPABASE_KEY
} -ErrorAction SilentlyContinue

Write-Host "Encontradas $(($errorResp | Measure-Object).Count) conversas com erro" -ForegroundColor Yellow
Write-Host ""

# Chamar reprocess-conversations
Write-Host "⏳ Reprocessando conversas com erro..." -ForegroundColor Yellow
$reprocessUri = $SUPABASE_URL + '/functions/v1/reprocess-conversations'
$result = Invoke-RestMethod `
    -Uri $reprocessUri `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $SUPABASE_KEY"
    } `
    -Body "{}" `
    -ErrorAction SilentlyContinue

Write-Host "✓ Reprocessadas: $($result.ok)/$($result.total)" -ForegroundColor Green
if ($result.failed -gt 0) {
    Write-Host "✗ Falhadas: $($result.failed)" -ForegroundColor Red
    if ($result.errors -and $result.errors.Count -gt 0) {
        Write-Host "Primeiros 3 erros:" -ForegroundColor Yellow
        $result.errors | Select-Object -First 3 | ForEach-Object {
            $id = $_.id.Substring(0, [Math]::Min(8, $_.id.Length))
            $err = $_.error.Substring(0, [Math]::Min(100, $_.error.Length))
            Write-Host "   • $id``: $err" -ForegroundColor Red
        }
    }
}
