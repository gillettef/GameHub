# 운영(prod)/테스트(test) 서버에 최신 코드를 반영하되, 이미 떠 있는 Cloudflare 터널은
# 건드리지 않아 공개 주소(*.trycloudflare.com)를 그대로 유지한다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/redeploy-keep-url.ps1 -Env prod
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/redeploy-keep-url.ps1 -Env test
#
# serve.ps1 과 달리 cloudflared 는 전혀 건드리지 않는다: 이미 켜져 있는 "$Env-tunnel" 프로세스는
# 그대로 두고, Node 서버·Python AI 만 같은 포트로 내려받았다 다시 올린다. 터널은 로컬 포트로
# 포워딩만 할 뿐이라 그 뒤의 서버 프로세스가 바뀌어도 주소는 그대로 유지된다.
# 전제: scripts/serve.ps1 -Env <env> 로 이미 한 번 켜져 있어야 한다(터널이 이미 떠 있어야 함).

param(
    [Parameter(Mandatory = $true)][ValidateSet('prod', 'test')][string]$Env
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg        = Get-EnvConfig $Env
$serverDir  = Join-Path $root 'server'
$clientDir  = Join-Path $root 'client'
$aiDir      = Join-Path $root 'ai'
$clientDist = Join-Path $clientDir "dist\$Env"
$dataDir    = Join-Path $serverDir "data\$Env"
$urlFile    = Join-Path $devDir "$Env-url.txt"

if (-not (Test-Path (Join-Path $devDir "$Env-tunnel.pid"))) {
    Write-Host "[$Env] 터널 pid 파일이 없습니다. 먼저 scripts/serve.ps1 -Env $Env 로 켜세요."
    exit 1
}

Ensure-NodeDeps
New-Item -ItemType Directory -Force $dataDir | Out-Null

# 1) 클라이언트 재빌드
Write-Host "[$Env] building client -> client\dist\$Env ..."
Push-Location $clientDir
try {
    cmd /c "npx vite build --outDir dist\$Env --emptyOutDir" | Select-Object -Last 4
    if ($LASTEXITCODE -ne 0) { throw "client build failed" }
} finally { Pop-Location }

# 2) 서버·AI 프로세스만 종료 (터널은 절대 건드리지 않는다 -> 공개 주소 유지)
Stop-Services @("$Env-server", "$Env-ai") @($cfg.ServerPort, $cfg.AiPort)

# 3) Python AI 재기동 (venv 는 이미 있다고 가정 - 처음 셋업은 scripts/dev.ps1 이나 serve.ps1 이 담당)
$venvPy = Join-Path $aiDir '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) { throw "$venvPy 가 없습니다. 먼저 scripts/serve.ps1 -Env $Env 로 한 번 켜서 venv 를 만드세요." }
Start-Detached "$Env-ai" $venvPy @('-m', 'uvicorn', 'astral_ai.main:app', '--host', '127.0.0.1', '--port', "$($cfg.AiPort)") $aiDir $cfg.AiPort | Out-Null

# 4) Node 서버 재기동 (같은 포트 -> 기존 cloudflared 터널이 그대로 이 포트로 포워딩한다)
$serverEnv = @{
    APP_ENV     = $Env
    PORT        = $cfg.ServerPort
    HOST        = '0.0.0.0'
    CLIENT_DIST = $clientDist
    DATA_DIR    = $dataDir
    AI_BASE_URL = "http://127.0.0.1:$($cfg.AiPort)"
}
$serverOk = Start-Detached "$Env-server" 'cmd.exe' @('/c', 'npx', 'tsx', 'src/index.ts') $serverDir $cfg.ServerPort $serverEnv

$publicUrl = if (Test-Path $urlFile) { Get-Content $urlFile } else { $null }
Write-Host ""
Write-Host "=== AstralTab [$Env] 재배포 완료 (주소 유지) ==="
Write-Host "Local  : http://localhost:$($cfg.ServerPort)"
if ($publicUrl) { Write-Host "Public : $publicUrl   (기존 주소 그대로)" }
if (-not $serverOk) { Write-Host "[$Env] 서버 기동 실패. .dev\$Env-server.log 확인" }
