# AstralTab 실행 스크립트 공용 함수. dev.ps1 / serve.ps1 / *-stop.ps1 이 dot-source 한다.
#   . (Join-Path $PSScriptRoot 'common.ps1')
# $root, $devDir 를 정의하고 포트 확인·의존성 설치·프로세스 시작/종료 헬퍼를 제공한다.

$script:root   = Split-Path -Parent $PSScriptRoot
$script:devDir = Join-Path $script:root '.dev'
New-Item -ItemType Directory -Force $script:devDir | Out-Null

# Python 3.11 is installed but not on PATH on this machine.
$script:pythonCandidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe"
)

function Find-Python {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notmatch 'WindowsApps') { return $cmd.Source }
    foreach ($c in $script:pythonCandidates) { if (Test-Path $c) { return $c } }
    return $null
}

# Vite (Node 22) listens on ::1 by default, uvicorn/express on 127.0.0.1 - probe both.
function Test-Port([int]$port) {
    foreach ($addr in @('127.0.0.1', '::1')) {
        try {
            $family = if ($addr -eq '::1') { [Net.Sockets.AddressFamily]::InterNetworkV6 } else { [Net.Sockets.AddressFamily]::InterNetwork }
            $c = New-Object Net.Sockets.TcpClient($family)
            $ar = $c.BeginConnect($addr, $port, $null, $null)
            $ok = $ar.AsyncWaitHandle.WaitOne(300)
            if ($ok) { try { $c.EndConnect($ar) } catch { $ok = $false } }
            $c.Close()
            if ($ok) { return $true }
        } catch {}
    }
    return $false
}

function Ensure-NodeDeps {
    if (Test-Path (Join-Path $script:root 'node_modules')) { return }
    Write-Host "[deps] npm install (root workspaces)..."
    Push-Location $script:root
    try { cmd /c npm install } finally { Pop-Location }
}

function Ensure-PyDeps([string]$dir) {
    $venvPy = Join-Path $dir '.venv\Scripts\python.exe'
    if (-not (Test-Path $venvPy)) {
        $py = Find-Python
        if (-not $py) { throw "Python not found. Install Python 3.11+ or add it to `$pythonCandidates in scripts/common.ps1." }
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

# 이미 실행 중이거나 포트가 점유됐으면 $null, 아니면 pid 파일 경로를 돌려준다.
function Pre-Start([string]$name, [int]$port) {
    $pidFile = Join-Path $script:devDir "$name.pid"
    if (Test-Path $pidFile) {
        $old = Get-Content $pidFile
        if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
            $suffix = if ($port) { " -> http://localhost:$port" } else { '' }
            Write-Host "[$name] already running (PID $old)$suffix"
            return $null
        }
        Remove-Item $pidFile -Force
    }
    if ($port -and (Test-Port $port)) {
        Write-Host "[$name] port $port is already in use by another process. Stop it first (never kill port 3001 - that is Eleven)."
        return $null
    }
    return $pidFile
}

function Wait-Started([System.Diagnostics.Process]$p, [string]$name, [int]$port, [string]$pidFile, [string]$out, [string]$err) {
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        if ($p.HasExited) {
            Write-Host "[$name] exited early (code $($p.ExitCode)). Last log lines:"
            if (Test-Path $err) { Get-Content $err -Tail 20 }
            if (Test-Path $out) { Get-Content $out -Tail 20 }
            Remove-Item $pidFile -Force
            return $false
        }
        if (Test-Port $port) { break }
        Start-Sleep -Milliseconds 500
    }
    if (Test-Port $port) {
        Write-Host "[$name] started PID $($p.Id) -> http://localhost:$port  (log: .dev\$name.log)"
        return $true
    }
    Write-Host "[$name] started PID $($p.Id) but port $port not open yet. Check .dev\$name.log"
    return $false
}

# 분리된 백그라운드 프로세스로 시작하고 pid 파일을 쓴다. 환경 변수는 $envVars 해시로 전달한다.
function Start-Detached([string]$name, [string]$file, [string[]]$argList, [string]$workDir, [int]$port, [hashtable]$envVars = @{}) {
    $pidFile = Pre-Start $name $port
    if (-not $pidFile) { return $false }
    $out = Join-Path $script:devDir "$name.log"; $err = Join-Path $script:devDir "$name.err.log"
    if (Test-Path $out) { Clear-Content $out }; if (Test-Path $err) { Clear-Content $err }
    $saved = @{}
    foreach ($k in $envVars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, [string]$envVars[$k]) }
    try {
        $p = Start-Process -FilePath $file -ArgumentList $argList -WorkingDirectory $workDir -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $out -RedirectStandardError $err
    } finally {
        foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
    }
    $p.Id | Set-Content $pidFile
    if ($port) { return (Wait-Started $p $name $port $pidFile $out $err) }
    Write-Host "[$name] started PID $($p.Id) (log: .dev\$name.log)"
    return $true
}

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

# 이 프로젝트 디렉터리에서 띄운 node/cmd/python/cloudflared 프로세스인지 확인한다.
# 무관한 프로세스(예: 포트 3001 의 Eleven)는 절대 죽이지 않는다.
function Is-ProjectProcess([int]$procId) {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($proc.ProcessName -notin @('node', 'cmd', 'python', 'cloudflared')) { return $false }
    $cl = Get-CmdLine $procId
    if ($cl -and $cl.ToLower().Contains($script:root.ToLower())) { return $true }
    try {
        $parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $procId").ParentProcessId
        if ($parentId) {
            $pcl = Get-CmdLine ([int]$parentId)
            if ($pcl -and $pcl.ToLower().Contains($script:root.ToLower())) { return $true }
        }
    } catch {}
    return $false
}

# pid 파일 기준 종료 + 포트 폴백(프로젝트 프로세스만).
function Stop-Services([string[]]$names, [int[]]$ports) {
    foreach ($name in $names) {
        $pidFile = Join-Path $script:devDir "$name.pid"
        if (Test-Path $pidFile) {
            $procId = Get-Content $pidFile
            if ($procId) { Stop-Tree ([int]$procId) $name }
            Remove-Item $pidFile -Force
        } else {
            Write-Host "[$name] no pid file"
        }
    }
    foreach ($port in $ports) {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
            $procId = [int]$c.OwningProcess
            if (Is-ProjectProcess $procId) {
                Stop-Tree $procId "port $port"
            } else {
                $pname = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
                Write-Host "[port $port] in use by PID $procId ($pname) - NOT from this project, left running"
            }
        }
    }
}

# 운영/테스트 환경 설정표. dev 는 dev.ps1 이 따로 관리한다 (3101 / 5173 / 8000).
function Get-EnvConfig([string]$envName) {
    switch ($envName) {
        'prod' { return @{ Name = 'prod'; ServerPort = 3201; AiPort = 8001 } }
        'test' { return @{ Name = 'test'; ServerPort = 3301; AiPort = 8002 } }
        default { throw "unknown env: $envName (prod | test)" }
    }
}
