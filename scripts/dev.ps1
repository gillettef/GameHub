# AstralTab local dev launcher.
# Starts server (port 3001) and client (port 5173) as detached background
# processes, writes PIDs to .dev/*.pid and logs to .dev/*.log.
# Stop them with scripts/dev-stop.ps1.

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
New-Item -ItemType Directory -Force $devDir | Out-Null

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

function Ensure-Deps([string]$dir) {
    $rootPkg = Join-Path $root 'package.json'
    $hasRootNm = Test-Path (Join-Path $root 'node_modules')
    $hasDirNm  = Test-Path (Join-Path $dir 'node_modules')
    if ($hasRootNm -or $hasDirNm) { return }
    if (Test-Path $rootPkg) {
        Write-Host "[deps] npm install (root workspaces)..."
        Push-Location $root
    } else {
        Write-Host "[deps] npm install ($dir)..."
        Push-Location $dir
    }
    try { cmd /c npm install } finally { Pop-Location }
}

function Start-Dev([string]$name, [string]$dir, [int]$port) {
    $pidFile = Join-Path $devDir "$name.pid"

    if (Test-Path $pidFile) {
        $old = Get-Content $pidFile
        if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
            Write-Host "[$name] already running (PID $old) -> http://localhost:$port"
            return
        }
        Remove-Item $pidFile -Force
    }

    if (Test-Port $port) {
        Write-Host "[$name] port $port is already in use by another process. Run scripts/dev-stop.ps1 first."
        return
    }

    if (-not (Test-Path (Join-Path $dir 'package.json'))) {
        Write-Host "[$name] $dir\package.json not found - skipping (not scaffolded yet)"
        return
    }

    Ensure-Deps $dir

    $out = Join-Path $devDir "$name.log"
    $err = Join-Path $devDir "$name.err.log"
    if (Test-Path $out) { Clear-Content $out }
    if (Test-Path $err) { Clear-Content $err }

    $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'run', 'dev' `
        -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $p.Id | Set-Content $pidFile

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

Start-Dev 'server' (Join-Path $root 'server') 3001
Start-Dev 'client' (Join-Path $root 'client') 5173

Write-Host ""
Write-Host "Client : http://localhost:5173"
Write-Host "Server : http://localhost:3001"
Write-Host "Stop   : scripts/dev-stop.ps1"
