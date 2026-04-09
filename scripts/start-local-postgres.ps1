param(
  [int]$Port = 55432,
  [string]$DataDir = "S:\\whats-test-postgres",
  [string]$LogFile = "S:\\whats-test-postgres\\postgres.log",
  [string]$AppUser = "lista_da_vez",
  [string]$AppPassword = "lista_da_vez_dev",
  [string]$AppDatabase = "lista_da_vez"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$initdb = Join-Path $pgBin "initdb.exe"
$pgCtl = Join-Path $pgBin "pg_ctl.exe"
$psql = Join-Path $pgBin "psql.exe"

if (-not (Test-Path $initdb)) {
  throw "initdb.exe nao encontrado em $initdb"
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogFile) | Out-Null

if (-not (Test-Path (Join-Path $DataDir "PG_VERSION"))) {
  & $initdb -D $DataDir -A trust -U postgres -E UTF8 --locale=C 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao inicializar o cluster PostgreSQL local em $DataDir"
  }
}

$statusOutput = & $pgCtl -D $DataDir status 2>&1
$running = $statusOutput -match "server is running"

if (-not $running) {
  & $pgCtl -D $DataDir -l $LogFile -o "-p $Port -h 127.0.0.1" start 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao iniciar o PostgreSQL local na porta $Port"
  }
}

$ready = $false
for ($index = 0; $index -lt 40; $index++) {
  Start-Sleep -Milliseconds 500
  try {
    & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -c "select 1;" 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
  } catch {
  }
}

if (-not $ready) {
  throw "O PostgreSQL local nao ficou pronto na porta $Port"
}

$roleExists = & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "select 1 from pg_roles where rolname = '$AppUser';"
if ($roleExists -ne "1") {
  & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -c "create role $AppUser login password '$AppPassword';" 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar a role $AppUser no PostgreSQL local"
  }
} else {
  & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -c "alter role $AppUser with login password '$AppPassword';" 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao atualizar a role $AppUser no PostgreSQL local"
  }
}

$dbExists = & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "select 1 from pg_database where datname = '$AppDatabase';"
if ($dbExists -ne "1") {
  & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -c "create database $AppDatabase owner $AppUser;" 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar o database $AppDatabase no PostgreSQL local"
  }
}

Write-Host "PostgreSQL local iniciado."
Write-Host "Porta: $Port"
Write-Host "DataDir: $DataDir"
Write-Host "Database: $AppDatabase"
Write-Host "Usuario: $AppUser"
Write-Host "Log: $LogFile"
