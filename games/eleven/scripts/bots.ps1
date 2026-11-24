param(
  [string]$Code = '',
  [int]$Count = 3,
  [int]$Delay = 400,
  [switch]$Create,
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null

if (-not $Create -and -not $Code) {
  Write-Host "-Code <방코드> 또는 -Create 가 필요합니다."
  exit 1
}

$args = @('run', 'bots', '-w', 'server', '--', '--count', "$Count", '--delay', "$Delay")
if ($Create) { $args += '--create'; if ($Start) { $args += '--start' } }
else { $args += @('--code', $Code) }

$tag = if ($Create) { 'create' } else { $Code }
$out = Join-Path $devDir "bots-$tag.log"
$err = Join-Path $devDir "bots-$tag.err.log"
$p = Start-Process -FilePath 'npm.cmd' -ArgumentList $args -WorkingDirectory $root `
  -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
$pidFile = Join-Path $devDir "bots-$tag.pid"
Set-Content -Encoding utf8 $pidFile "$($p.Id)"
Write-Host "봇 프로세스 시작 pid=$($p.Id) log=$out"
Start-Sleep -Seconds 3
if (Test-Path $out) { Get-Content $out -Encoding utf8 -Tail 8 | ForEach-Object { "    $_" } }
