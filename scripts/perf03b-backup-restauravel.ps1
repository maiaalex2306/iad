#requires -Version 5.1
<#
.SYNOPSIS
  Exporta backup lógico IaD CRM com Supabase CLI, sem modificar produção.
.DESCRIPTION
  Requer SUPABASE CLI e IAD_PROD_DB_URL definido APENAS no terminal local.
  Salva roles/schema/data SQL, hashes SHA-256 e manifesto; NÃO envia ao GitHub.
  A verificação de RESTAURAÇÃO deve ocorrer depois em PostgreSQL descartável.
  Requer destino em volume criptografado e seguro.
.EXAMPLE
  $env:IAD_PROD_DB_URL = 'postgresql://...'
  .\scripts\perf03b-backup-restauravel.ps1 -Destino 'D:\IAD-Backups'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Destino
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ExpectedRef = 'drhonmdffhnwamwzynrs'
$DbUrl = $env:IAD_PROD_DB_URL

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  throw 'IAD_PROD_DB_URL ausente. Configure a URL no terminal privado; nunca em chat, GitHub ou arquivo .env commitado.'
}
if (-not $DbUrl.Contains($ExpectedRef)) {
  throw 'URL não corresponde ao projeto de PRODUÇÃO esperado (drhonmdffhnwamwzynrs). Abortado.'
}
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw 'Supabase CLI não encontrado no PATH. Instale/atualize e confira com: supabase --version.'
}
$utc = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$Folder = Join-Path $Destino ("iad-crm-" + $ExpectedRef + "-" + $utc)
$null = New-Item -ItemType Directory -Path $Folder -Force
$files = @(
  @{ file = 'roles.sql'; args = @('--role-only') },
  @{ file = 'schema.sql'; args = @() },
  @{ file = 'data.sql'; args = @('--use-copy', '--data-only') }
)
try {
  foreach ($entry in $files) {
    $output = Join-Path $Folder $entry.file
    Write-Host ("Exportando {0} (NUNCA imprimir URL/senha)..." -f $entry.file)
    $commandArgs = @('db', 'dump', '--db-url', $DbUrl, '-f', $output) + $entry.args
    & supabase @commandArgs
    if ($LASTEXITCODE -ne 0) {
      throw ("Falha no dump {0}; código {1}" -f $entry.file, $LASTEXITCODE)
    }
    if (-not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -lt 100) {
      throw ("Arquivo ausente/incompleto: {0}" -f $entry.file)
    }
  }
  $checks = foreach ($entry in $files) {
    $item = Get-Item (Join-Path $Folder $entry.file)
    $sha = Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName
    [PSCustomObject]@{ Name = $entry.file; Bytes = $item.Length; SHA256 = $sha.Hash }
  }
  $manifest = [ordered]@{
    project_ref = $ExpectedRef
    created_utc = $utc
    method = 'supabase db dump: roles + schema + data'
    files = @($checks)
    restore_verified = $false
    note = 'Hash e formato verificados. RESTAURAÇÃO NÃO FOI EXECUTADA neste script.'
    important = 'Dados pessoais e comerciais: guardar fora do repositório em volume criptografado.'
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Folder 'manifesto.json')
  Write-Host "Backup exportado. Compare hashes e faça restauração de ensaio em banco ISOLADO antes de aprovar produção."
  Write-Host ("Pasta: {0}" -f $Folder)
} catch {
  Write-Error 'Backup NÃO certificado. Se houver arquivos parciais, NÃO os trate como restauráveis.'
  throw
}
