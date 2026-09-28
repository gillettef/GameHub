# AWS EC2(서버3, .dev/aws-instance.json에 기록된 인스턴스)에 최신 빌드를 반영한다.
# GitHub 저장소가 비공개라 인스턴스에서 git clone/pull이 안 되므로, 이 PC에서 빌드한 결과물
# (client/dist, server/dist, package.json류)을 scp로 올리고 npm ci --omit=dev 후 서비스를 재시작한다.
# 사용법: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\aws-deploy.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$info = Get-Content ".dev/aws-instance.json" | ConvertFrom-Json
$key = $info.keyPath
$hostAddr = "$($info.sshUser)@$($info.publicIp)"
$sshOpts = @("-i", $key, "-o", "StrictHostKeyChecking=no")

Write-Host "[1/4] 로컬 빌드 (npm run build)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }

Write-Host "[2/4] 서버 정지 (배포 중 이전 코드가 뜨지 않게)"
& ssh @sshOpts $hostAddr "sudo systemctl stop eleven"

Write-Host "[3/4] 산출물 업로드 (package.json류 + dist)"
& scp @sshOpts package.json package-lock.json "${hostAddr}:/opt/eleven/"
& scp @sshOpts server/package.json "${hostAddr}:/opt/eleven/server/package.json"
& scp @sshOpts client/package.json "${hostAddr}:/opt/eleven/client/package.json"
& scp @sshOpts -r server/dist "${hostAddr}:/opt/eleven/server/dist"
& scp @sshOpts -r client/dist "${hostAddr}:/opt/eleven/client/dist"

Write-Host "[4/4] 의존성 설치 + 서비스 재시작"
& ssh @sshOpts $hostAddr "cd /opt/eleven && npm ci --omit=dev && sudo systemctl restart eleven && sleep 1 && curl -sf -m 5 http://localhost:3001/health && echo ' -> 정상'"

Write-Host ""
Write-Host "완료. 공개 주소: http://$($info.publicIp):$($info.port)"
Write-Host "진행 중이던 판은 서버 재시작으로 유실됩니다."

