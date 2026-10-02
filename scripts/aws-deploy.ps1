# AWS EC2(서버3, 게임 3종 공용 t4g.nano)에 Eleven 최신 빌드를 반영한다.
# 이 PC에서 빌드한 산출물을 ssh+tar 로 올리고 서비스(eleven)를 재시작한다.
# 사용법: powershell -NoProfile -ExecutionPolicy Bypass -File .\scriptsws-deploy.ps1
# 사전 조건: ~/.ssh/games-key.pem (관리자 SSH 키), ~/.ssh/games-server.env (IP=... 줄). 22번은 관리자 IP 만 열려 있다.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$key = Join-Path $env:USERPROFILE ".ssh\games-key.pem"
$envFile = Join-Path $env:USERPROFILE ".ssh\games-server.env"
if (-not (Test-Path $key)) { throw "SSH 키가 없습니다: $key" }
$ip = ((Get-Content $envFile | Where-Object { $_ -like "IP=*" }) -replace "^IP=", "").Trim()
if (-not $ip) { throw "IP 를 찾지 못했습니다: $envFile" }
$sshOpts = "-i `"$key`" -o StrictHostKeyChecking=accept-new"
$target = "ec2-user@$ip"

Write-Host "[1/3] 로컬 빌드 (npm run build)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "빌드 실패" }

Write-Host "[2/3] 산출물 업로드"
$up = "rm -rf ~/eleven/server/dist ~/eleven/client/dist && mkdir -p ~/eleven && tar -x -C ~/eleven"
cmd /c "tar -c package.json package-lock.json server/package.json client/package.json server/dist client/dist | ssh $sshOpts $target `"$up`""
if ($LASTEXITCODE -ne 0) { throw "업로드 실패 — 서버는 이전 버전 그대로 실행 중" }

Write-Host "[3/3] 의존성 설치 + 재시작 + 헬스체크"
cmd /c "ssh $sshOpts $target `"set -e; cd ~/eleven && npm install --omit=dev --workspace server --no-audit --no-fund && sudo systemctl restart eleven && sleep 2 && curl -sf http://localhost:3001/health`""
if ($LASTEXITCODE -ne 0) { throw "재시작/헬스체크 실패" }

Write-Host ""
Write-Host "=== 배포 완료 ==="
Write-Host "접속: http://${ip}:3001"
