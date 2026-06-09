# Diagnóstico do status das conversas

$SUPABASE_URL = "https://taicaxtjtikdajmhtsxc.supabase.co"
$SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYzMTQzNjQxNSwiZXhwIjoxOTQ3MDE2NDE1fQ.dS6tPrXkQvA5jzD_M8OGt1lGq_gXRgEH0VmjQGPtYNc"

Write-Host "📊 Diagnóstico de Status de Conversas" -ForegroundColor Cyan
Write-Host ""

# Contar por status
@("pending", "OK", "error") | ForEach-Object {
    $status = $_
    $uri = $SUPABASE_URL + '/rest/v1/crm_conversations?select=id&status_ia=eq.' + $status

    try {
        $resp = Invoke-RestMethod -Uri $uri -Headers @{
            "Authorization" = "Bearer $SERVICE_KEY"
            "apikey" = $SERVICE_KEY
        } -ErrorAction Stop

        $count = $resp.Count
        if ($count -eq 1 -and $resp.id) { $count = 1 }
        elseif (-not $resp) { $count = 0 }

        $color = if ($status -eq "error") { "Red" } elseif ($status -eq "OK") { "Green" } else { "Yellow" }
        Write-Host "  $status`: $count conversas" -ForegroundColor $color
    }
    catch {
        Write-Host "  $status`: Erro ao contar" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "📋 Últimas 5 conversas com erro (se existirem):" -ForegroundColor Cyan

$uri = $SUPABASE_URL + '/rest/v1/crm_conversations?select=id,texto,status_ia,created_at&status_ia=eq.error&order=created_at.desc&limit=5'

try {
    $errors = Invoke-RestMethod -Uri $uri -Headers @{
        "Authorization" = "Bearer $SERVICE_KEY"
        "apikey" = $SERVICE_KEY
    } -ErrorAction Stop

    if ($errors -and @($errors).Count -gt 0) {
        @($errors) | ForEach-Object {
            $id = $_.id.Substring(0, 8)
            $text = $_.texto.Substring(0, 50)
            $created = $_.created_at.Substring(0, 10)
            Write-Host "  • $id - $created - '$text...'" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✅ Nenhuma conversa com erro" -ForegroundColor Green
    }
}
catch {
    Write-Host "  ❌ Erro ao buscar" -ForegroundColor Red
    Write-Host "     $_"
}
