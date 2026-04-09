param(
  [string]$ComposeFile = "docker-compose.dev.yml",
  [switch]$RebuildCore
)

$ErrorActionPreference = "Stop"

Write-Host "[docker-recover] Stopping Docker Desktop processes..."
$targets = @("Docker Desktop", "com.docker.backend", "com.docker.proxy")
Get-Process | Where-Object { $targets -contains $_.ProcessName } | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "[docker-recover] Shutting down WSL..."
wsl --shutdown

Write-Host "[docker-recover] Starting Docker Desktop..."
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

Write-Host "[docker-recover] Waiting for Docker daemon..."
$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  & docker version | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 3
}

if (-not $ready) {
  throw "Docker daemon did not become ready in time."
}

if ($RebuildCore) {
  Write-Host "[docker-recover] Rebuilding and starting plataforma-api..."
  & docker compose -f $ComposeFile up -d --build plataforma-api
} else {
  Write-Host "[docker-recover] Starting stack..."
  & docker compose -f $ComposeFile up -d
}
if ($LASTEXITCODE -ne 0) {
  throw "Failed to start compose stack ($ComposeFile)."
}

Write-Host "[docker-recover] Current stack status:"
& docker compose -f $ComposeFile ps
if ($LASTEXITCODE -ne 0) {
  throw "Failed to get compose status ($ComposeFile)."
}
