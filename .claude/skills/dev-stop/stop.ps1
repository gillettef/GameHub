# /dev 로 띄운 서버와 터널 종료
$root = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$state = Join-Path $root '.dev'
$pidFile = Join-Path $state 'pids.json'
if (-not (Test-Path $pidFile)) { Write-Host '실행 중인 /dev 서버가 없습니다.'; exit 0 }
$p = Get-Content $pidFile -Raw | ConvertFrom-Json
foreach ($id in $p.tunnel, $p.server) {
  if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) { taskkill /PID $id /T /F | Out-Null; Write-Host "종료: PID $id" }
}
Remove-Item $pidFile, (Join-Path $state 'url.txt') -ErrorAction SilentlyContinue
Write-Host '서버와 터널을 종료했습니다.'
