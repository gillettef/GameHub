# AstralTab local dev launcher.
# Starts server (3001), client (5173) and the Python AI service (8000) as
# detached background processes, writes PIDs to .dev/*.pid and logs to
# .dev/*.log. Stop them with scripts/dev-stop.ps1.

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null

# Python 3.11 is installed but not on PATH on this machine.
$pythonCandidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
)

function Find-Python {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notmatch 'WindowsApps') { return $cmd.Source }
    foreach ($c in $pythonCandidates) { if (Test-Path $c) { return $c } }
    return $null
}

function Test-Port([int]$port) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $ar = $c.BeginConnect('127.0.0.1', $port, $null, $null)
        $ok = $ar.AsyncWaitHandle.WaitOne(300)
        if ($ok) { $c.EndConnect($ar) }
        $c.Close()
        return $ok
    } catch { return $false }
}

function Ensure-NodeDeps([string]$dir) {
    $rootPkg = Join-Path $root 'package.json'
    if ((Test-Path (Join-Path $root 'node_modules')) -or (Test-Path (Join-Path $dir 'node_modules'))) { return }
    if (Test-Path $rootPkg) { Write-Host "[deps] npm install (root workspaces)..."; Push-Location $root }
    else                    { Write-Host "[deps] npm install ($dir)...";           Push-Location $dir }
    try { cmd /c npm install } finally { Pop-Location }
}

function Ensure-PyDeps([string]$dir) {
    $venvPy = Join-Path $dir '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPy)) {
        $py = Find-Python
        if (-not $py) { throw "Python not found. Install Python 3.11+ or add it to `$pythonCandidates in scripts/dev.ps1." }
        Write-Host "[deps] creating venv with $py ..."
        & $py -m venv (Join-Path $dir '.venv')
    }
    $req   = Join-Path $dir 'requirements.txt'
    $stamp = Join-Path $dir '.venv\.requirements.stamp'
    $needInstall = $true
    if ((Test-Path $stamp) -and (Test-Path $req)) {
        $needInstall = (Get-Item $req).LastWriteTime -gt (Get-Item $stamp).LastWriteTime
    }
    if ($needInstall -and (Test-Path $req)) {
        Write-Host "[deps] pip install -r ai/requirements.txt ..."
        & $venvPy -m pip install -q -r $req
        Get-Date | Set-Content $stamp
    }
    return $venvPy
}

function Wait-Started([System.Diagnostics.Process]$p, [string]$name, [int]$port, [string]$pidFile, [string]$out, [string]$err) {
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        if ($p.HasExited) {
            Write-Host "[$name] exited early (code $($p.ExitCode)). Last log lines:"
            if (Test-Path $err) { Get-Content $err -Tail 20 }
            if (Test-Path $out) { Get-Content $out -Tail 20 }
            Remove-Item $pidFile -Force
            return
        }
        if (Test-Port $port) { break }
        Start-Sleep -Milliseconds 500
    }
    if (Test-Port $port) {
        Write-Host "[$name] started PID $($p.Id) -> http://localhost:$port  (log: .dev\$name.log)"
    } else {
        Write-Host "[$name] started PID $($p.Id) but port $port not open yet. Check .dev\$name.log"
    }
}

# Returns the pid file path when the service should be started, otherwise $null.
function Pre-Start([string]$name, [string]$dir, [int]$port, [string]$marker) {
    $pidFile = Join-Path $devDir "$name.pid"
    if (Test-Path $pidFile) {
        $old = Get-Content $pidFile
        if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
            Write-Host "[$name] already running (PID $old) -> http://localhost:$port"
            return $null
        }
        Remove-Item $pidFile -Force
    }
    if (Test-Port $port) {
        Write-Host "[$name] port $port is already in use by another process. Run scripts/dev-stop.ps1 first."
        return $null
    }
    if (-not (Test-Path (Join-Path $dir $marker))) {
        Write-Host "[$name] $dir\$marker not found - skipping (not scaffolded yet)"
        return $null
    }
    return $pidFile
}

function Start-Node([string]$name, [string]$dir, [int]$port) {
    $pidFile = Pre-Start $name $dir $port 'package.json'
    if (-not $pidFile) { return }
    Ensure-NodeDeps $dir
    $out = Join-Path $devDir "$name.log"; $err = Join-Path $devDir "$name.err.log"
    if (Test-Path $out) { Clear-Content $out }; if (Test-Path $err) { Clear-Content $err }
    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'run', 'dev' `
        -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $p.Id | Set-Content $pidFile
    Wait-Started $p $name $port $pidFile $out $err
}

function Start-PythonAI([string]$name, [string]$dir, [int]$port) {
    $pidFile = Pre-Start $name $dir $port 'requirements.txt'
    if (-not $pidFile) { return }
    $venvPy = Ensure-PyDeps $dir
    $out = Join-Path $devDir "$name.log"; $err = Join-Path $devDir "$name.err.log"
    if (Test-Path $out) { Clear-Content $out }; if (Test-Path $err) { Clear-Content $err }
    $p = Start-Process -FilePath $venvPy `
        -ArgumentList '-m', 'uvicorn', 'astral_ai.main:app', '--host', '127.0.0.1', '--port', "$port", '--reload' `
        -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $p.Id | Set-Content $pidFile
    Wait-Started $p $name $port $pidFile $out $err
}

Start-Node     'server' (Join-Path $root 'server') 3001
Start-Node     'client' (Join-Path $root 'client') 5173
Start-PythonAI 'ai'     (Join-Path $root 'ai')     8000

Write-Host ""
Write-Host "Client : http://localhost:5173"
Write-Host "Server : http://localhost:3001"
Write-Host "AI     : http://localhost:8000"
Write-Host "Stop   : scripts/dev-stop.ps1"
