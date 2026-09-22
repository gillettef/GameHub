# AstralTab 운영(prod) / 테스트(test) 서버 종료기.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve-stop.ps1 -Env prod|test
# .dev/<env>-server.pid, <env>-ai.pid, <env>-tunnel.pid 의 프로세스 트리를 종료한다.
# 포트 폴백은 이 프로젝트에서 띄운 프로세스만 대상으로 한다 (포트 3001 의 Eleven 등 무관한 앱은 건드리지 않는다).

param([Parameter(Mandatory = $true)][ValidateSet('prod', 'test')][string]$Env)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

$cfg = Get-EnvConfig $Env
Stop-Services @("$Env-tunnel", "$Env-server", "$Env-ai") @($cfg.ServerPort, $cfg.AiPort)

$urlFile = Join-Path $devDir "$Env-url.txt"
if (Test-Path $urlFile) { Remove-Item $urlFile -Force }
Write-Host "Done."
