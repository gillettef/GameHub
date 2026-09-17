$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null
$pidFile = Join-Path $devDir 'pids.json'

if (Test-Path $pidFile) {
  Write-Host "dev 프로세스 기록(.dev/pids.json)이 이미 있습니다. 먼저 scripts/dev-stop.ps1 을 실행하세요."
  exit 1
}

$targets = @(
  @{ name = 'server'; dir = (Join-Path $root 'server'); port = 3001 },
  @{ name = 'client'; dir = (Join-Path $root 'client'); port = 5173 }
)

$pids = @{}
foreach ($t in $targets) {
  if (-not (Test-Path (Join-Path $t.dir 'package.json'))) {
    Write-Host "[$($t.name)] $($t.dir)\package.json 없음 - 아직 스캐폴딩되지 않았습니다. 건너뜀."
    continue
  }
  $out = Join-Path $devDir "$($t.name).log"
  $err = Join-Path $devDir "$($t.name).err.log"
  $p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $t.dir `
    -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  $pids[$t.name] = $p.Id
  Write-Host "[$($t.name)] 시작 pid=$($p.Id) port=$($t.port) log=$out"
}

if ($pids.Count -eq 0) {
  Write-Host "시작할 대상이 없습니다."
  exit 1
}

$pids | ConvertTo-Json | Set-Content -Encoding utf8 $pidFile

Start-Sleep -Seconds 4
foreach ($t in $targets) {
  if (-not $pids.ContainsKey($t.name)) { continue }
  $listening = $null
  try { $listening = Get-NetTCPConnection -LocalPort $t.port -State Listen -ErrorAction Stop } catch {}
  if ($listening) {
    Write-Host "[$($t.name)] http://localhost:$($t.port) 응답 대기 중(LISTEN)"
  } else {
    Write-Host "[$($t.name)] 포트 $($t.port) 아직 열리지 않음. 로그 마지막 20줄:"
    foreach ($f in @((Join-Path $devDir "$($t.name).log"), (Join-Path $devDir "$($t.name).err.log"))) {
      if (Test-Path $f) { Get-Content $f -Tail 20 | ForEach-Object { "    $_" } }
    }
  }
}
