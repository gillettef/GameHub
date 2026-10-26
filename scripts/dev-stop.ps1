# 로컬 개발 서버 종료 (/dev 로 띄운 것):
#   vite 개발 서버(5180) + 온라인 대전 서버 tsx watch(8091)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-stop.ps1
# 이 프로젝트 폴더에서 실행된 vite·tsx node 프로세스만 트리째 끈다.
# 포트를 다른 프로그램(다른 프로젝트의 vite 등)이 잡고 있으면 끄지 않고 알리기만 한다.
$ErrorActionPreference = 'SilentlyContinue'
$root = (Resolve-Path "$PSScriptRoot\..").Path
$ports = @(5180, 8091)

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.CommandLine -match 'vite|tsx')
}

if (-not $procs) {
  Write-Output '실행 중인 개발 서버가 없습니다.'
} else {
  foreach ($p in $procs) {
    taskkill /PID $p.ProcessId /T /F *> $null
    $kind = if ($p.CommandLine -match 'vite') { 'vite' } else { 'tsx 서버' }
    Write-Output "종료: PID $($p.ProcessId) ($kind)"
  }
  Start-Sleep -Milliseconds 500
}

$left = foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen }
if ($left) {
  foreach ($c in $left) {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)").CommandLine
    Write-Output "아직 열려 있는 포트 $($c.LocalPort): PID $($c.OwningProcess) $cmd"
  }
  exit 1
}
Write-Output '포트 5180·8091 모두 해제됨.'
