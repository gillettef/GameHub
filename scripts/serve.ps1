# AstralTab 운영(prod) / 테스트(test) 서버 실행기.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Env prod
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Env test [-NoBuild] [-NoTunnel]
#
# dev 와 달리 Vite 개발 서버를 띄우지 않는다. 클라이언트를 빌드해 Node 서버가 같은 포트에서
# 정적 서빙하므로 친구는 주소 하나만 알면 된다. 인터넷 공개는 Cloudflare 빠른 터널
# (.dev/bin/cloudflared.exe, 계정 불필요, 시작할 때마다 *.trycloudflare.com 주소가 바뀐다).
#
#   env   server  ai     client build        pid/log 접두어
#   prod  3201    8001   client/dist/prod    .dev/prod-*
#   test  3301    8002   client/dist/test    .dev/test-*
# 종료: scripts/serve-stop.ps1 -Env prod|test

param(
    [Parameter(Mandatory = $true)][ValidateSet('prod', 'test')][string]$Env,
    [switch]$NoBuild,
    [switch]$NoTunnel
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg        = Get-EnvConfig $Env
$serverDir  = Join-Path $root 'server'
$clientDir  = Join-Path $root 'client'
$aiDir      = Join-Path $root 'ai'
$clientDist = Join-Path $clientDir "dist\$Env"
$dataDir    = Join-Path $serverDir "data\$Env"
$binDir     = Join-Path $devDir 'bin'
$urlFile    = Join-Path $devDir "$Env-url.txt"

Ensure-NodeDeps
New-Item -ItemType Directory -Force $dataDir, $binDir | Out-Null

# 1) 클라이언트 빌드 (환경별 디렉터리)
if (-not $NoBuild -or -not (Test-Path (Join-Path $clientDist 'index.html'))) {
    Write-Host "[$Env] building client -> client\dist\$Env ..."
    Push-Location $clientDir
    try {
        cmd /c "npx vite build --outDir dist\$Env --emptyOutDir" | Select-Object -Last 4
        if ($LASTEXITCODE -ne 0) { throw "client build failed" }
    } finally { Pop-Location }
}

# 2) Python AI 서비스 (리로드 없음)
$venvPy = Ensure-PyDeps $aiDir
Start-Detached "$Env-ai" $venvPy @('-m', 'uvicorn', 'astral_ai.main:app', '--host', '127.0.0.1', '--port', "$($cfg.AiPort)") $aiDir $cfg.AiPort | Out-Null

# 3) Node 서버 (클라이언트 정적 서빙 포함)
$serverEnv = @{
    APP_ENV     = $Env
    PORT        = $cfg.ServerPort
    HOST        = '0.0.0.0'
    CLIENT_DIST = $clientDist
    DATA_DIR    = $dataDir
    AI_BASE_URL = "http://127.0.0.1:$($cfg.AiPort)"
}
$serverOk = Start-Detached "$Env-server" 'cmd.exe' @('/c', 'npx', 'tsx', 'src/index.ts') $serverDir $cfg.ServerPort $serverEnv

# 4) Cloudflare 빠른 터널 (인터넷 공개)
$publicUrl = $null
if (-not $NoTunnel -and $serverOk) {
    $cf = Join-Path $binDir 'cloudflared.exe'
    if (-not (Test-Path $cf)) {
        Write-Host "[$Env] downloading cloudflared (portable, .dev\bin) ..."
        $src = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
        try { Invoke-WebRequest -Uri $src -OutFile $cf -UseBasicParsing }
        catch { Write-Host "[$Env] cloudflared download failed: $($_.Exception.Message). LAN only."; $cf = $null }
    }
    if ($cf) {
        $tunnelName = "$Env-tunnel"
        $started = Start-Detached $tunnelName $cf @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$($cfg.ServerPort)") $root 0
        if ($started) {
            $errLog = Join-Path $devDir "$tunnelName.err.log"
            $deadline = (Get-Date).AddSeconds(45)
            while ((Get-Date) -lt $deadline -and -not $publicUrl) {
                Start-Sleep -Milliseconds 800
                if (Test-Path $errLog) {
                    $m = Select-String -Path $errLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches | Select-Object -First 1
                    if ($m) { $publicUrl = $m.Matches[0].Value }
                }
            }
            if ($publicUrl) { $publicUrl | Set-Content $urlFile }
            else { Write-Host "[$Env] tunnel URL not found yet. Check .dev\$tunnelName.err.log" }
        }
    }
}

# 5) 접속 주소 안내
$lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "=== AstralTab [$Env] ==="
Write-Host "Local  : http://localhost:$($cfg.ServerPort)"
foreach ($ip in $lanIps) { Write-Host "LAN    : http://${ip}:$($cfg.ServerPort)" }
if ($publicUrl) { Write-Host "Public : $publicUrl   (share this with friends)" }
elseif (-not $NoTunnel) { Write-Host "Public : (none)" }
Write-Host "AI     : http://127.0.0.1:$($cfg.AiPort)"
Write-Host "Logs   : .dev\$Env-server.log  .dev\$Env-ai.err.log  .dev\$Env-tunnel.err.log"
Write-Host "Stop   : scripts/serve-stop.ps1 -Env $Env"
