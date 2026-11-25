# Rootbound local dev launcher.
# Starts server (3101, AI 포함) and client (5173, Vite) as
# detached background processes, writes PIDs to .dev/*.pid and logs to
# .dev/*.log. Stop them with scripts/dev-stop.ps1.
# 다른 기기(휴대폰·친구 PC)에서도 열 수 있게 Vite(5173)를 Cloudflare 빠른 터널로 공개한다
# (.dev/bin/cloudflared.exe, 계정 불필요, 터널을 새로 띄울 때마다 *.trycloudflare.com 주소가 바뀐다).
# 터널 없이 띄우려면 -NoTunnel.
# 운영 서버는 AWS EC2 에서 상시 실행된다(main push 시 GitHub Actions 자동 배포).

param([switch]$NoTunnel)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Start-Node([string]$name, [string]$dir, [int]$port) {
    if (-not (Test-Path (Join-Path $dir 'package.json'))) {
        Write-Host "[$name] $dir\package.json not found - skipping (not scaffolded yet)"
        return
    }
    Ensure-NodeDeps
    $envVars = @{ APP_ENV = 'dev'; PORT = $port; HOST = '0.0.0.0' }
    Start-Detached $name 'cmd.exe' @('/c', 'npm', 'run', 'dev') $dir $port $envVars | Out-Null
}

# Cloudflare 빠른 터널 -> Vite(5173). /api·/socket.io 는 Vite 프록시가 이 PC 안에서 3101 로 넘긴다.
# 공개 주소는 .dev/tunnel-url.txt 에 남긴다(이미 떠 있으면 그 주소를 다시 보여 준다).
function Start-Tunnel([int]$port) {
    $urlFile = Join-Path $devDir 'tunnel-url.txt'
    $cf = Join-Path $devDir 'bin\cloudflared.exe'
    if (-not (Test-Path $cf)) {
        Write-Host "[tunnel] downloading cloudflared (portable, .dev\bin) ..."
        New-Item -ItemType Directory -Force (Split-Path $cf) | Out-Null
        $src = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
        try { Invoke-WebRequest -Uri $src -OutFile $cf -UseBasicParsing }
        catch { Write-Host "[tunnel] cloudflared download failed: $($_.Exception.Message). Local only."; return $null }
    }
    $pidFile = Pre-Start 'tunnel' 0
    if (-not $pidFile) {
        if (Test-Path $urlFile) { return (Get-Content $urlFile -First 1) }
        return $null
    }
    if (Test-Path $urlFile) { Remove-Item $urlFile -Force }
    $started = Start-Detached 'tunnel' $cf @('tunnel', '--no-autoupdate', '--url', "http://localhost:$port") $root 0
    if (-not $started) { return $null }
    $errLog = Join-Path $devDir 'tunnel.err.log'
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 800
        if (Test-Path $errLog) {
            $m = Select-String -Path $errLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($m) {
                $url = $m.Matches[0].Value
                $url | Set-Content $urlFile
                return $url
            }
        }
    }
    Write-Host "[tunnel] URL not found yet. Check .dev\tunnel.err.log"
    return $null
}

Start-Node     'server' (Join-Path $root 'server') 3101
Start-Node     'client' (Join-Path $root 'client') 5173
$publicUrl = if ($NoTunnel) { $null } else { Start-Tunnel 5173 }

Write-Host ""
Write-Host "Client : http://localhost:5173"
Write-Host "Server : http://localhost:3101"
if ($publicUrl) { Write-Host "Public : $publicUrl   (other devices / friends; changes each time the tunnel restarts)" }
elseif (-not $NoTunnel) { Write-Host "Public : (none) - check .dev\tunnel.err.log" }
Write-Host "Stop   : scripts/dev-stop.ps1"
