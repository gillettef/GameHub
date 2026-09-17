param(
  [int]$Port = 3001,
  [switch]$SkipBuild
)
# 내 PC에서 게임 서버를 배포 모드로 띄우고 Cloudflare 빠른 터널(계정 불필요)로 공개 URL을 만든다.
# 다른 네트워크의 친구는 출력된 https://….trycloudflare.com 주소로 접속하면 된다. 종료는 scripts/dev-stop.ps1.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null
$pidFile = Join-Path $devDir 'tunnel-pids.json'

if (Test-Path $pidFile) {
  Write-Host "터널 프로세스 기록(.dev/tunnel-pids.json)이 이미 있습니다. 먼저 scripts/dev-stop.ps1 을 실행하세요."
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

# 2) 빌드 (client → dist, server → dist/index.js)
if (-not $SkipBuild) {
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
if (-not (Test-Path (Join-Path $root 'server\dist\index.js'))) { Write-Host "server/dist/index.js 가 없습니다. -SkipBuild 없이 다시 실행하세요."; exit 1 }

# 3) 배포 모드 서버 시작
$pids = @{}
$env:PORT = "$Port"
$srvOut = Join-Path $devDir 'serve.log'
$srvErr = Join-Path $devDir 'serve.err.log'
$srv = Start-Process -FilePath 'node' -ArgumentList 'server/dist/index.js' -WorkingDirectory $root `
  -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr -PassThru -WindowStyle Hidden
$pids['serve'] = $srv.Id
Write-Host "[serve] 시작 pid=$($srv.Id) http://localhost:$Port log=$srvOut"

# 4) 터널 시작 — URL 은 stderr 로그에 찍힌다
$tunOut = Join-Path $devDir 'tunnel.log'
$tunErr = Join-Path $devDir 'tunnel.err.log'
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

$listening = $null
try { $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop } catch {}
if (-not $listening) {
  Write-Host "[serve] 포트 $Port 가 열리지 않았습니다. 로그:"
  foreach ($f in @($srvOut, $srvErr)) { if (Test-Path $f) { Get-Content $f -Tail 10 | ForEach-Object { "    $_" } } }
}
if ($publicUrl) {
  Write-Host ""
  Write-Host "공개 주소: $publicUrl"
  Write-Host "친구에게 이 주소를 보내고, 방 코드로 입장하게 하세요. 이 PC와 터널이 켜져 있는 동안만 유효합니다."
  Write-Host "종료: scripts/dev-stop.ps1 (/dev-stop)"
  Set-Content -Encoding utf8 (Join-Path $devDir 'tunnel-url.txt') $publicUrl
} else {
  Write-Host "터널 URL 을 얻지 못했습니다. 로그 마지막 줄:"
  foreach ($f in @($tunErr, $tunOut)) { if (Test-Path $f) { Get-Content $f -Tail 10 | ForEach-Object { "    $_" } } }
  exit 1
}
