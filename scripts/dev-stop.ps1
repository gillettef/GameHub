# AstralTab local dev stopper.
# Kills the process trees recorded in .dev/*.pid. As a fallback it looks at
# listeners on ports 3001 / 5173 / 8000, but only kills a node/cmd/python
# process whose command line points at THIS project directory. Anything else
# is left alone and reported, so unrelated apps on those ports are never killed.

$ErrorActionPreference = 'Continue'
$root   = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'

function Stop-Tree([int]$procId, [string]$label) {
    if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) {
        Write-Host "[$label] PID $procId not running"
        return
    }
    cmd /c "taskkill /PID $procId /T /F" | Out-Null
    Write-Host "[$label] stopped PID $procId (with children)"
}

function Get-CmdLine([int]$procId) {
    try {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction Stop
        if ($p) { return [string]$p.CommandLine }
    } catch {}
    return ''
}

function Is-ProjectDevProcess([int]$procId) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($proc.ProcessName -notin @('node', 'cmd', 'python')) { return $false }
    $cl = Get-CmdLine $procId
    if ($cl -and $cl.ToLower().Contains($root.ToLower())) { return $true }
    try {
        $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $procId").ParentProcessId
        if ($parentId) {
            $pcl = Get-CmdLine ([int]$parentId)
            if ($pcl -and $pcl.ToLower().Contains($root.ToLower())) { return $true }
        }
    } catch {}
    return $false
}

# 1) Kill by pid file (primary path)
foreach ($name in @('server', 'client', 'ai')) {
    $pidFile = Join-Path $devDir "$name.pid"
    if (Test-Path $pidFile) {
        $procId = Get-Content $pidFile
        if ($procId) { Stop-Tree ([int]$procId) $name }
        Remove-Item $pidFile -Force
    } else {
        Write-Host "[$name] no pid file"
    }
}

# 2) Fallback: only this project's dev processes still holding our ports
foreach ($port in @(3001, 5173, 8000)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $procId = [int]$c.OwningProcess
        if (Is-ProjectDevProcess $procId) {
            Stop-Tree $procId "port $port"
        } else {
            $pname = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
            Write-Host "[port $port] in use by PID $procId ($pname) - NOT from this project, left running"
        }
    }
}

Write-Host "Done."
