$root = Split-Path -Parent $PSScriptRoot
$devDir = Join-Path $root '.dev'
$pidFile = Join-Path $devDir 'pids.json'

function Stop-Tree($name, $procId) {
  $alive = $null
  try { $alive = Get-Process -Id $procId -ErrorAction Stop } catch {}
  if ($alive) {
    taskkill /PID $procId /T /F | Out-Null
    Write-Host "[$name] 종료 pid=$procId (자식 프로세스 포함)"
  } else {
    Write-Host "[$name] 이미 종료됨 pid=$procId"
  }
}

# 봇 프로세스 (scripts/bots.ps1 이 남긴 pid 파일)
Get-ChildItem -Path $devDir -Filter 'bots-*.pid' -ErrorAction SilentlyContinue | ForEach-Object {
  $procId = [int](Get-Content $_.FullName -Raw).Trim()
  Stop-Tree $_.BaseName $procId
  Remove-Item $_.FullName -Force
}

if (-not (Test-Path $pidFile)) {
  Write-Host "실행 중인 dev 프로세스 기록이 없습니다 (.dev/pids.json 없음)."
  foreach ($port in @(3001, 5173)) {
    $conn = $null
    try { $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop } catch {}
    if ($conn) {
      $owner = ($conn | Select-Object -First 1).OwningProcess
      Write-Host "  참고: 포트 $port 를 pid=$owner 프로세스가 사용 중입니다 (이 스크립트가 시작한 것이 아니므로 종료하지 않음)."
    }
  }
  exit 0
}

$pids = Get-Content $pidFile -Raw | ConvertFrom-Json
foreach ($prop in $pids.PSObject.Properties) {
  Stop-Tree $prop.Name ([int]$prop.Value)
}
Remove-Item $pidFile -Force
Write-Host "완료."
