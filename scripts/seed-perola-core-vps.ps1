param(
  [string]$TargetHost = "root@85.31.62.33",
  [string]$KeyPath = "~/.ssh/vps_deploy",
  [string]$RemotePath = "/opt/omnichannel",
  [string]$RemoteContainerName = "omnichannel-mvp-postgres-1",
  [string]$DbUser = "omnichannel",
  [string]$Database = "omnichannel",
  [int]$LegacyId = 3,
  [string]$ExpectedTenantName = "Perola",
  [switch]$Apply,
  [switch]$AllowTenantNameMismatch
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$env:PGCLIENTENCODING = "UTF8"

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$localSqlPath = Join-Path $rootDir "scripts\sql\seed-perola-core.sql"
$remoteSqlPath = "$RemotePath/scripts/sql/seed-perola-core.sql"

if (-not (Test-Path $localSqlPath)) {
  throw "Arquivo SQL do seed da Perola nao encontrado em $localSqlPath"
}

function Invoke-RemoteShell {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  & ssh -i $KeyPath $TargetHost $Script

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao executar comando remoto em $TargetHost"
  }
}

function Invoke-RemoteSqlScalar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Query
  )

  $remoteScript = @"
set -e
cd $RemotePath
cat <<'SQL' | docker exec -i $RemoteContainerName psql -U $DbUser -d $Database -tA
$Query
SQL
"@

  $result = Invoke-RemoteShell -Script $remoteScript
  return ($result | Out-String).Trim()
}

function Invoke-RemoteSqlTable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Query
  )

  $remoteScript = @"
set -e
cd $RemotePath
cat <<'SQL' | docker exec -i $RemoteContainerName psql -U $DbUser -d $Database -F '|' -A
$Query
SQL
"@

  return Invoke-RemoteShell -Script $remoteScript
}

function Normalize-ComparisonText {
  param(
    [AllowNull()]
    [string]$Value
  )

  $rawValue = if ($null -eq $Value) { "" } else { $Value }
  $normalized = $rawValue.Trim().Normalize([Text.NormalizationForm]::FormD)
  $builder = [System.Text.StringBuilder]::new()

  foreach ($char in $normalized.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return $builder.ToString().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
}

Write-Host "Preparando seed da Perola na VPS..."
Write-Host "Host: $TargetHost"
Write-Host "Container Postgres: $RemoteContainerName"
Write-Host "Legacy ID alvo: $LegacyId"

Invoke-RemoteShell -Script @"
set -e
mkdir -p $RemotePath/scripts/sql
"@

& scp -i $KeyPath $localSqlPath "${TargetHost}:$remoteSqlPath"

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao enviar o seed da Perola para $TargetHost"
}

$tenantRow = Invoke-RemoteSqlScalar -Query @"
select coalesce(legacy_id::text, '') || '|' || coalesce(slug, '') || '|' || coalesce(name, '') || '|' || coalesce(status::text, '')
from platform_core.tenants
where legacy_id = $LegacyId
limit 1;
"@

$tenantUserCount = Invoke-RemoteSqlScalar -Query @"
select count(*)::text
from platform_core.tenant_users
where tenant_id = (
  select id
  from platform_core.tenants
  where legacy_id = $LegacyId
  limit 1
);
"@

$storeCount = Invoke-RemoteSqlScalar -Query @"
select count(*)::text
from platform_core.tenant_stores
where tenant_id = (
  select id
  from platform_core.tenants
  where legacy_id = $LegacyId
  limit 1
)
  and is_active = true;
"@

if ([string]::IsNullOrWhiteSpace($tenantRow)) {
  throw "Nenhum tenant com legacy_id = $LegacyId foi encontrado na VPS. Seed abortado para evitar escrita inesperada."
}

$tenantParts = $tenantRow.Split('|')
$tenantSlug = if ($tenantParts.Count -ge 2) { $tenantParts[1].Trim() } else { "" }
$tenantName = if ($tenantParts.Count -ge 3) { $tenantParts[2].Trim() } else { "" }
$tenantStatus = if ($tenantParts.Count -ge 4) { $tenantParts[3].Trim() } else { "" }

Write-Host "Tenant remoto atual: $tenantName ($tenantSlug) status=$tenantStatus"
Write-Host "Usuarios atuais do tenant: $tenantUserCount"
Write-Host "Lojas atuais do tenant: $storeCount"
Write-Host "Arquivo remoto atualizado em: $remoteSqlPath"

if (-not $AllowTenantNameMismatch -and -not [string]::IsNullOrWhiteSpace($ExpectedTenantName)) {
  if ((Normalize-ComparisonText $tenantName) -ne (Normalize-ComparisonText $ExpectedTenantName)) {
    throw "O tenant remoto do legacy_id $LegacyId e '$tenantName', diferente de '$ExpectedTenantName'. Use -AllowTenantNameMismatch somente se quiser sobrescrever mesmo assim."
  }
}

if (-not $Apply) {
  Write-Host "Modo seguro: seed apenas enviado para a VPS."
  Write-Host "Para aplicar no banco remoto, rode novamente com -Apply."
  return
}

Write-Host "Aplicando seed da Perola na VPS..."

Invoke-RemoteShell -Script @"
set -e
export PGCLIENTENCODING=UTF8
cd $RemotePath
docker exec -i $RemoteContainerName psql -U $DbUser -d $Database -v ON_ERROR_STOP=1 < $remoteSqlPath
"@

Write-Host "Validando resultado remoto..."

$postValidation = Invoke-RemoteSqlTable -Query @"
select t.legacy_id, t.slug, t.name, t.status::text, t.user_count, t.project_count, t.monthly_payment_amount
from platform_core.tenants t
where t.legacy_id = $LegacyId;

select business_role, count(*)::text
from platform_core.tenant_users
where tenant_id = (
  select id
  from platform_core.tenants
  where legacy_id = $LegacyId
  limit 1
)
group by business_role
order by business_role;

select count(*)::text as store_count
from platform_core.tenant_stores
where tenant_id = (
  select id
  from platform_core.tenants
  where legacy_id = $LegacyId
  limit 1
)
  and is_active = true;
"@

Write-Host $postValidation
Write-Host "Seed da Perola aplicado com sucesso na VPS."
Write-Host "Senha temporaria padrao dos 24 usuarios: Perola@2026!"
