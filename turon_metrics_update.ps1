$ErrorActionPreference = "Stop"
$base = "http://localhost:8300"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadPath = Join-Path $scriptDir "turon_metrics_payload.json"

Write-Host "Loading payload..."
$payload = Get-Content -Raw -Path $payloadPath | ConvertFrom-Json

Write-Host "Fetching current data from $base/api/data ..."
$data = Invoke-RestMethod -Uri "$base/api/data" -Method Get

$proj = $data.projects | Where-Object { $_.id -eq 1 }
if (-not $proj) {
    Write-Host "ERROR: Project id=1 (Турон Телеком — Интернет) not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Found project: $($proj.name)"
$proj | Add-Member -NotePropertyName metrics -NotePropertyValue $payload.metrics -Force
$proj | Add-Member -NotePropertyName metricData -NotePropertyValue $payload.metricData -Force

Write-Host "Posting updated data back to server..."
$body = $data | ConvertTo-Json -Depth 20
$resp = Invoke-RestMethod -Uri "$base/api/data" -Method Post -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

if ($resp.ok) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  Метрики Турон Телеком успешно обновлены!" -ForegroundColor Green
    Write-Host "  Откройте вкладку Метрики и обновите страницу." -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
} else {
    Write-Host "Server responded with error: $($resp | ConvertTo-Json)" -ForegroundColor Red
}

Read-Host "Press Enter to close"
