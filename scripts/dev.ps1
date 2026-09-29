# AstralTab local dev launcher.
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
Write-Host "Stop   : scripts/dev-stop.ps1"
