param(
  [int]$Port = 0,
  [switch]$SkipBuild,
  [switch]$Reload,
  [ValidatePattern('^[a-z0-9]+$')][string]$Slot = 'main'
)
# 내 PC에서 게임 서버를 배포 모드로 띄우고 Cloudflare 빠른 터널(계정 불필요)로 공개 URL을 만든다.
# 다른 네트워크의 친구는 출력된 https://….trycloudflare.com 주소로 접속하면 된다. 종료는 scripts/dev-stop.ps1.
# -Reload: 터널(cloudflared)은 그대로 두고 빌드 후 게임 서버(node)만 교체한다 → 공개 주소가 바뀌지 않는다.
#          (주소는 cloudflared 프로세스에 묶여 있고 서버와 무관하다. 진행 중인 판은 서버 메모리라 사라진다)
# -Slot:   서버를 여러 벌 띄운다. main(기본, 포트 3001) = 친구들과 쓰는 안정 서버, test(포트 3002) = 새 수정을 시험하는 서버.
#          슬롯마다 터널·공개 주소·pid/로그 파일이 따로이고, 빌드 결과를 .dev/slots/<slot>/ 에 복사해 그 사본으로 실행한다
#          → 한 슬롯을 새로 빌드해도 다른 슬롯의 서버·정적 파일은 바뀌지 않는다. 그 밖의 이름은 포트를 -Port 로 지정.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null
if ($Port -eq 0) {
  if ($Slot -eq 'main') { $Port = 3001 }
  elseif ($Slot -eq 'test') { $Port = 3002 }
  else { Write-Host "슬롯 '$Slot' 은 -Port 를 함께 지정하세요."; exit 1 }
}
# main 슬롯은 예전 파일 이름 그대로(tunnel-pids.json 등), 다른 슬롯은 tunnel-<slot>-pids.json 등
$tag = if ($Slot -eq 'main') { '' } else { "-$Slot" }
$pidFile = Join-Path $devDir "tunnel$tag-pids.json"
$urlFile = Join-Path $devDir "tunnel$tag-url.txt"
$srvOut = Join-Path $devDir "serve$tag.log"
$srvErr = Join-Path $devDir "serve$tag.err.log"
$slotDir = Join-Path (Join-Path $devDir 'slots') $Slot
$reloadHint = if ($Slot -eq 'main') { '-Reload' } else { "-Reload -Slot $Slot" }

function Invoke-Build {
  Write-Host "빌드 중 (npm run build) ..."
  $buildLog = Join-Path $devDir 'build.log'
  $buildErr = Join-Path $devDir 'build.err.log'
  $b = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'build' -WorkingDirectory $root `
    -RedirectStandardOutput $buildLog -RedirectStandardError $buildErr -PassThru -WindowStyle Hidden -Wait
  if ($b.ExitCode -ne 0) {
    Write-Host "빌드 실패 (.dev/build.err.log):"
    foreach ($f in @($buildLog, $buildErr)) { if (Test-Path $f) { Get-Content $f -Tail 15 | ForEach-Object { "    $_" } } }
    exit 1
  }
  Get-Content $buildLog -Tail 2 | ForEach-Object { "    $_" }
}

# 지금의 빌드 결과(server/dist, client/dist)를 슬롯 폴더로 복사한다. 서버는 이 사본으로 돌기 때문에 이후의 빌드에 영향받지 않는다.
# (index.js 는 자기 위치 기준 ../../client/dist 를 서빙하고, external 인 ws 는 상위 폴더의 node_modules 에서 찾는다)
function Copy-Snapshot {
  foreach ($rel in @('server', 'client')) {
    $src = Join-Path (Join-Path $root $rel) 'dist'
    if (-not (Test-Path $src)) { Write-Host "$rel/dist 가 없습니다. -SkipBuild 없이 다시 실행하세요."; exit 1 }
    $parent = Join-Path $slotDir $rel
    $dst = Join-Path $parent 'dist'
    if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
    New-Item -ItemType Directory -Force $parent | Out-Null
    Copy-Item -Recurse $src $dst
  }
  Write-Host "[$Slot] 빌드 사본: $slotDir"
}

function Start-Serve {
  $env:PORT = "$Port"
  $srv = Start-Process -FilePath 'node' -ArgumentList 'server/dist/index.js' -WorkingDirectory $slotDir `
    -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr -PassThru -WindowStyle Hidden
  Write-Host "[serve:$Slot] 시작 pid=$($srv.Id) http://localhost:$Port log=$srvOut"
  return $srv.Id
}

function Wait-Listening([bool]$expect, [int]$tries = 40) {
  for ($i = 0; $i -lt $tries; $i++) {
    $l = $null
    try { $l = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch {}
    if ([bool]$l -eq $expect) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

# ---------- -Reload: 터널은 두고 서버만 교체 ----------
if ($Reload) {
  if (-not (Test-Path $pidFile)) { Write-Host "[$Slot] 터널이 떠 있지 않습니다 ($pidFile 없음). -Reload 없이 실행하세요."; exit 1 }
  $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
  $tunPid = [int]$pids.tunnel
  $srvPid = [int]$pids.serve
  $tun = $null
  try { $tun = Get-Process -Id $tunPid -ErrorAction Stop } catch {}
  if (-not $tun -or $tun.ProcessName -ne 'cloudflared') {
    Write-Host "[$Slot] 터널 프로세스(pid=$tunPid)가 살아 있지 않습니다. scripts/dev-stop.ps1 후 -Reload 없이 다시 실행하세요."
    exit 1
  }
  if (-not $SkipBuild) { Invoke-Build }
  $srv = $null
  try { $srv = Get-Process -Id $srvPid -ErrorAction Stop } catch {}
  if ($srv -and $srv.ProcessName -eq 'node') {
    taskkill /PID $srvPid /T /F 2>$null | Out-Null
    Write-Host "[serve:$Slot] 이전 서버 종료 pid=$srvPid"
  } else {
    Write-Host "[serve:$Slot] 이전 서버(pid=$srvPid)는 이미 없음"
  }
  if (-not (Wait-Listening $false)) { Write-Host "포트 $Port 가 비지 않습니다."; exit 1 }
  Copy-Snapshot
  $newPid = Start-Serve
  $pids.serve = $newPid
  $pids | ConvertTo-Json | Set-Content -Encoding utf8 $pidFile
  if (-not (Wait-Listening $true)) {
    Write-Host "[serve:$Slot] 포트 $Port 가 열리지 않았습니다. 로그:"
    foreach ($f in @($srvOut, $srvErr)) { if (Test-Path $f) { Get-Content $f -Tail 10 | ForEach-Object { "    $_" } } }
    exit 1
  }
  $publicUrl = if (Test-Path $urlFile) { (Get-Content $urlFile -Raw).Trim() } else { '(알 수 없음)' }
  Write-Host ""
  Write-Host "[$Slot] 서버만 교체했습니다. 공개 주소는 그대로: $publicUrl"
  exit 0
}

# ---------- 처음부터: 서버 + 터널 ----------
if (Test-Path $pidFile) {
  Write-Host "[$Slot] 터널 프로세스 기록($pidFile)이 이미 있습니다. 서버만 새 빌드로 바꾸려면 $reloadHint, 내리려면 scripts/dev-stop.ps1."
  exit 1
}
$held = $null
try { $held = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch {}
if ($held) {
  Write-Host "포트 $Port 를 pid=$(($held | Select-Object -First 1).OwningProcess) 프로세스가 이미 사용 중입니다. 개발 서버(/dev)가 떠 있다면 /dev-stop 으로 먼저 내리세요."
  exit 1
}

# 1) cloudflared 준비 (PATH → .dev/cloudflared.exe → 다운로드)
$cloudflared = $null
$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cmd) { $cloudflared = $cmd.Source }
else {
  $cloudflared = Join-Path $devDir 'cloudflared.exe'
  if (-not (Test-Path $cloudflared)) {
    Write-Host "cloudflared 다운로드 중 (.dev/cloudflared.exe) ..."
    $url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    Invoke-WebRequest -Uri $url -OutFile $cloudflared -UseBasicParsing
  }
}

# 2) 빌드 (client → dist, server → dist/index.js) 후 슬롯 폴더로 사본
if (-not $SkipBuild) { Invoke-Build }
Copy-Snapshot

# 3) 배포 모드 서버 시작
$pids = @{}
$pids['serve'] = Start-Serve

# 4) 터널 시작 — URL 은 stderr 로그에 찍힌다
$tunOut = Join-Path $devDir "tunnel$tag.log"
$tunErr = Join-Path $devDir "tunnel$tag.err.log"
$tun = Start-Process -FilePath $cloudflared -ArgumentList 'tunnel', '--no-autoupdate', '--url', "http://localhost:$Port" `
  -RedirectStandardOutput $tunOut -RedirectStandardError $tunErr -PassThru -WindowStyle Hidden
$pids['tunnel'] = $tun.Id
$pids | ConvertTo-Json | Set-Content -Encoding utf8 $pidFile

$publicUrl = $null
for ($i = 0; $i -lt 40 -and -not $publicUrl; $i++) {
  Start-Sleep -Milliseconds 750
  foreach ($f in @($tunErr, $tunOut)) {
    if (Test-Path $f) {
      $m = Select-String -Path $f -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
      if ($m) { $publicUrl = $m.Matches[0].Value; break }
    }
  }
  if ($tun.HasExited) { break }
}

if (-not (Wait-Listening $true 4)) {
  Write-Host "[serve:$Slot] 포트 $Port 가 열리지 않았습니다. 로그:"
  foreach ($f in @($srvOut, $srvErr)) { if (Test-Path $f) { Get-Content $f -Tail 10 | ForEach-Object { "    $_" } } }
}
if ($publicUrl) {
  Write-Host ""
  Write-Host "[$Slot] 공개 주소: $publicUrl"
  Write-Host "친구에게 이 주소를 보내고, 방 코드로 입장하게 하세요. 이 PC와 터널이 켜져 있는 동안만 유효합니다."
  Write-Host "새 빌드 반영(주소 유지): scripts/tunnel.ps1 $reloadHint · 종료: scripts/dev-stop.ps1 (/dev-stop)"
  Set-Content -Encoding utf8 $urlFile $publicUrl
} else {
  Write-Host "터널 URL 을 얻지 못했습니다. 로그 마지막 줄:"
  foreach ($f in @($tunErr, $tunOut)) { if (Test-Path $f) { Get-Content $f -Tail 10 | ForEach-Object { "    $_" } } }
  exit 1
}
