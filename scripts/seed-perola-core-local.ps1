param(
  [string]$ContainerName = "omnichannel-mvp-postgres-1",
  [string]$DbUser = "omnichannel",
  [string]$Database = "omnichannel"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$env:PGCLIENTENCODING = "UTF8"

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$sqlPath = Join-Path $rootDir "scripts\sql\seed-perola-core.sql"

if (-not (Test-Path $sqlPath)) {
  throw "Arquivo SQL do seed da Pérola nao encontrado em $sqlPath"
}

$sqlContent = Get-Content -Raw -Encoding UTF8 $sqlPath

if ([string]::IsNullOrWhiteSpace($sqlContent)) {
  throw "O arquivo SQL do seed da Pérola esta vazio."
}

$sqlContent | docker exec -i $ContainerName psql -U $DbUser -d $Database -v ON_ERROR_STOP=1

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao aplicar o seed local da Pérola no container $ContainerName"
}

Write-Host "Seed local da Pérola aplicado com sucesso."
Write-Host "Cliente legado: 3"
Write-Host "Slug do tenant: perola-core"
Write-Host "Senha temporaria padrao dos 24 usuarios: Perola@2026!"
