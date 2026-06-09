Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PMO - GitHub Actions Runner Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1: Get your token from GitHub:" -ForegroundColor Yellow
Write-Host "  Open this URL in your browser:" -ForegroundColor White
Write-Host "  https://github.com/tojiboyevahmadjon927-wq/pmo-control-center/settings/actions/runners/new" -ForegroundColor Green
Write-Host ""
Write-Host "  On that page, find the token in the 'Configure' section." -ForegroundColor White
Write-Host "  It looks like: AXXXXXXXXXXXXXXXXXXXXXXXXX" -ForegroundColor White
Write-Host ""
$token = Read-Host "Paste your token here"

if (-not $token) {
    Write-Host "No token entered. Exiting." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[1/5] Creating runner folder..." -ForegroundColor Yellow
$runnerDir = "C:\actions-runner"
New-Item -ItemType Directory -Force -Path $runnerDir | Out-Null

Write-Host "[2/5] Downloading GitHub Actions Runner..." -ForegroundColor Yellow
$url = "https://github.com/actions/runner/releases/download/v2.316.1/actions-runner-win-x64-2.316.1.zip"
$zip = "$runnerDir\runner.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $runnerDir -Force
Remove-Item $zip

Write-Host "[3/5] Configuring runner..." -ForegroundColor Yellow
Set-Location $runnerDir
.\config.cmd --url https://github.com/tojiboyevahmadjon927-wq/pmo-control-center --token $token --name "pmo-local-runner" --work "_work" --unattended --replace

Write-Host "[4/5] Installing as Windows service..." -ForegroundColor Yellow
.\svc.sh install 2>$null
if ($LASTEXITCODE -ne 0) {
    .\config.cmd --runasservice 2>$null
}

Write-Host "[5/5] Starting service..." -ForegroundColor Yellow
.\svc.sh start 2>$null
Start-Service -Name "actions.runner.*" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Runner installed and running!" -ForegroundColor Green
Write-Host "  Every git push will auto-deploy." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close"
