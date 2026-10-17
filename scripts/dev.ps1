# Rootbound local dev launcher.
# Starts server (3101), client (5173, Vite) and the Python AI service (8000) as
# detached background processes, writes PIDs to .dev/*.pid and logs to
# .dev/*.log. Stop them with scripts/dev-stop.ps1.
# 운영 서버는 AWS EC2 에서 상시 실행된다(main push 시 GitHub Actions 자동 배포).

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

function Start-Node([string]$name, [string]$dir, [int]$port) {
    if (-not (Test-Path (Join-Path $dir 'package.json'))) {
        Write-Host "[$name] $dir\package.json not found - skipping (not scaffolded yet)"
        return
    }
    Ensure-NodeDeps
    $envVars = @{ APP_ENV = 'dev'; PORT = $port; HOST = '0.0.0.0'; AI_BASE_URL = 'http://127.0.0.1:8000' }
    Start-Detached $name 'cmd.exe' @('/c', 'npm', 'run', 'dev') $dir $port $envVars | Out-Null
}

function Start-PythonAI([string]$name, [string]$dir, [int]$port) {
    if (-not (Test-Path (Join-Path $dir 'requirements.txt'))) {
        Write-Host "[$name] $dir\requirements.txt not found - skipping (not scaffolded yet)"
        return
    }
    $venvPy = Ensure-PyDeps $dir
    Start-Detached $name $venvPy @('-m', 'uvicorn', 'astral_ai.main:app', '--host', '127.0.0.1', '--port', "$port", '--reload') $dir $port | Out-Null
}

Start-Node     'server' (Join-Path $root 'server') 3101
Start-Node     'client' (Join-Path $root 'client') 5173
Start-PythonAI 'ai'     (Join-Path $root 'ai')     8000

Write-Host ""
Write-Host "Client : http://localhost:5173"
Write-Host "Server : http://localhost:3101"
Write-Host "AI     : http://localhost:8000"

# 같은 네트워크의 다른 기기(휴대폰·다른 PC)용 주소: 기본 게이트웨이가 있는 어댑터의 IPv4.
# Vite(5173)만 열면 된다 - /api·/socket.io 는 Vite 가 이 PC 안에서 3101 로 넘긴다.
$lanIps = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address.IPAddress })
foreach ($ip in $lanIps) { Write-Host "LAN    : http://${ip}:5173  (same Wi-Fi / network)" }
if ($lanIps.Count -eq 0) { Write-Host "LAN    : no network adapter with a gateway found" }

# Windows 방화벽: 5173 인바운드 허용 규칙이 없으면 다른 기기에서 접속이 막힌다(규칙 추가는 관리자 권한)
$fwRule = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq '5173' } |
    Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' }
if (-not $fwRule) {
    Write-Host "Firewall: no inbound rule for TCP 5173. Run once in an admin PowerShell:"
    Write-Host "  New-NetFirewallRule -DisplayName 'Rootbound dev 5173' -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private"
}
# 공용(Public) 네트워크로 잡힌 와이파이에는 Private 규칙이 적용되지 않는다
foreach ($prof in @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })) {
    Write-Host "Network: '$($prof.Name)' ($($prof.InterfaceAlias)) is Public - set it to Private in Windows Settings > Network so the firewall rule applies"
}
Write-Host "Stop   : scripts/dev-stop.ps1"
