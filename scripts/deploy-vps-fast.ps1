param(
  [string]$TargetHost = "root@85.31.62.33",
  [string]$KeyPath = "~/.ssh/vps_deploy",
  [string]$RemotePath = "/opt/omnichannel",
  [string[]]$Services = @("painel-web"),
  [switch]$SkipGitPull,
  [switch]$WithDeps,
  [switch]$ForceRecreate
)

$ErrorActionPreference = "Stop"

if (-not $Services -or $Services.Count -lt 1) {
  throw "Informe pelo menos um servico em -Services."
}

$serviceList = ($Services | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "
if ([string]::IsNullOrWhiteSpace($serviceList)) {
  throw "A lista de servicos ficou vazia apos normalizacao."
}

$composeBase = "docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile channels --env-file .env.prod"
$gitStep = if ($SkipGitPull) {
@"
echo 'Skip git sync'
"@
} else {
@"
git fetch --prune origin
git checkout main
git reset --hard origin/main
"@
}
$upFlags = @("up", "-d")

if (-not $WithDeps) {
  $upFlags += "--no-deps"
}

if ($ForceRecreate) {
  $upFlags += "--force-recreate"
}

$upCommand = "$composeBase $($upFlags -join ' ') $serviceList"
$buildCommand = "$composeBase build $serviceList"
$psCommand = "$composeBase ps $serviceList"

$remoteScript = @"
set -e
cd $RemotePath
$gitStep
$buildCommand
$upCommand
$psCommand
"@

Write-Host "Deploy rapido na VPS"
Write-Host "Host: $TargetHost"
Write-Host "Servicos: $serviceList"

ssh -i $KeyPath $TargetHost $remoteScript
