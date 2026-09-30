# 마법학교 외부 공개 개발 서버 실행: 클라이언트 빌드 -> Express 서버 -> Cloudflare 퀵 터널
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$state = Join-Path $root '.dev'
$port = 8080
New-Item -ItemType Directory -Force $state | Out-Null

# 이미 실행 중이면 기존 주소만 안내
$urlFile = Join-Path $state 'url.txt'
$pidFile = Join-Path $state 'pids.json'
if (Test-Path $pidFile) {
  $old = Get-Content $pidFile -Raw | ConvertFrom-Json
  if (Get-Process -Id $old.server -ErrorAction SilentlyContinue) {
    Write-Host '이미 실행 중입니다. 종료하려면 /dev-stop'
    if (Test-Path $urlFile) { Write-Host ('친구 접속 주소: ' + (Get-Content $urlFile -Raw).Trim()) }
    exit 0
  }
}

# cloudflared 확인/다운로드 (PATH 우선, 없으면 .dev/bin 에 공식 릴리스 exe를 받는다)
$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cfCmd) { $cf = $cfCmd.Source } else {
  $cf = Join-Path $state 'bin/cloudflared.exe'
  if (-not (Test-Path $cf)) {
    Write-Host 'cloudflared 다운로드 중...'
    New-Item -ItemType Directory -Force (Split-Path $cf) | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cf -UseBasicParsing
  }
}

# 의존성 설치 + 클라이언트 빌드
foreach ($d in 'server', 'client') {
  if (-not (Test-Path (Join-Path $root "$d/node_modules"))) { npm --prefix (Join-Path $root $d) install | Out-Host }
}
Write-Host '클라이언트 빌드 중...'
npm --prefix (Join-Path $root 'client') run build | Out-Host
if ($LASTEXITCODE -ne 0) { throw '클라이언트 빌드 실패' }

# 서버 실행 (기존 8080 점유 프로세스가 있으면 중단)
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
  throw "포트 $port 를 이미 다른 프로세스가 사용 중입니다."
}
$serverLog = Join-Path $state 'server.log'
$serverProc = Start-Process node -ArgumentList 'node_modules/tsx/dist/cli.mjs', 'src/index.ts' `
  -WorkingDirectory (Join-Path $root 'server') -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $serverLog -RedirectStandardError (Join-Path $state 'server.err.log')
for ($i = 0; $i -lt 30; $i++) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { break }
  if ($serverProc.HasExited) { throw ('서버가 종료되었습니다. ' + $serverLog + ' 확인') }
  Start-Sleep -Milliseconds 500
}

# 터널 실행 후 공개 주소 파싱
$tunnelErr = Join-Path $state 'tunnel.log'
Remove-Item $tunnelErr, $urlFile -ErrorAction SilentlyContinue
$tunnelProc = Start-Process $cf -ArgumentList 'tunnel', '--url', "http://localhost:$port", '--no-autoupdate' `
  -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $state 'tunnel.out.log') -RedirectStandardError $tunnelErr
@{ server = $serverProc.Id; tunnel = $tunnelProc.Id } | ConvertTo-Json | Set-Content $pidFile

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $tunnelErr) {
    $m = Select-String -Path $tunnelErr -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
  if ($tunnelProc.HasExited) { throw ('터널이 종료되었습니다. ' + $tunnelErr + ' 확인') }
}
if (-not $url) { throw ('터널 주소를 얻지 못했습니다. ' + $tunnelErr + ' 확인') }
Set-Content $urlFile $url
Write-Host ''
Write-Host "친구 접속 주소: $url"
Write-Host '종료하려면 /dev-stop'
