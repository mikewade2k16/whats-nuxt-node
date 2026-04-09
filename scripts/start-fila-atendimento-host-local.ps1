param(
  [int]$PainelPort = 3010,
  [int]$AtendimentoApiPort = 4010,
  [int]$PlataformaApiPort = 4110,
  [int]$FilaApiPort = 8080,
  [int]$FilaWebPort = 3003,
  [int]$PostgresPort = 55432
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$postgresScript = Join-Path $rootDir "scripts\start-local-postgres.ps1"
$plataformaScript = Join-Path $rootDir "apps\plataforma-api\scripts\start-local.ps1"
$atendimentoScript = Join-Path $rootDir "apps\atendimento-online-api\scripts\start-local.ps1"
$filaApiScript = Join-Path $rootDir "incubadora\fila-atendimento\back\scripts\api\start-local.ps1"
$filaWebScript = Join-Path $rootDir "incubadora\fila-atendimento\web\scripts\start-local.ps1"
$painelScript = Join-Path $rootDir "apps\painel-web\scripts\start-local.ps1"
$bridgeSecret = "fila-atendimento-shell-bridge-dev"
$sharedDatabaseUrl = "postgres://lista_da_vez:lista_da_vez_dev@localhost:$PostgresPort/lista_da_vez?sslmode=disable"
$sharedPrismaDatabaseUrl = "postgresql://lista_da_vez:lista_da_vez_dev@localhost:$PostgresPort/lista_da_vez?schema=atendimento_online"

powershell -ExecutionPolicy Bypass -File $postgresScript `
  -Port $PostgresPort

powershell -ExecutionPolicy Bypass -File $plataformaScript `
  -Port $PlataformaApiPort `
  -DatabaseUrl $sharedDatabaseUrl `
  -AllowedOrigins "http://localhost:$PainelPort,http://127.0.0.1:$PainelPort,http://localhost:$FilaWebPort,http://127.0.0.1:$FilaWebPort"

powershell -ExecutionPolicy Bypass -File $atendimentoScript `
  -Port $AtendimentoApiPort `
  -DatabaseUrl $sharedPrismaDatabaseUrl `
  -CoreApiBaseUrl "http://127.0.0.1:$PlataformaApiPort" `
  -CorsOrigin "http://localhost:$PainelPort,http://127.0.0.1:$PainelPort"

powershell -ExecutionPolicy Bypass -File $filaApiScript `
  -Port $FilaApiPort `
  -DatabaseUrl $sharedDatabaseUrl `
  -ShellBridgeSecret $bridgeSecret

powershell -ExecutionPolicy Bypass -File $filaWebScript `
  -Port $FilaWebPort `
  -ApiBase "http://127.0.0.1:$FilaApiPort"

powershell -ExecutionPolicy Bypass -File $painelScript `
  -Port $PainelPort `
  -ApiInternalBase "http://127.0.0.1:$AtendimentoApiPort" `
  -CoreApiInternalBase "http://127.0.0.1:$PlataformaApiPort" `
  -FilaAtendimentoApiBase "http://127.0.0.1:$FilaApiPort" `
  -FilaAtendimentoWebBase "http://127.0.0.1:$FilaWebPort" `
  -FilaAtendimentoShellBridgeSecret $bridgeSecret

Write-Host ""
Write-Host "Stack local pronta."
Write-Host "Painel: http://127.0.0.1:$PainelPort/admin/login"
Write-Host "Fila web: http://127.0.0.1:$FilaWebPort/auth/login"
Write-Host "Fila API: http://127.0.0.1:$FilaApiPort/healthz"
Write-Host "Plataforma API: http://127.0.0.1:$PlataformaApiPort/health"
Write-Host "Atendimento online API: http://127.0.0.1:$AtendimentoApiPort/health"
Write-Host "PostgreSQL local: localhost:$PostgresPort"
