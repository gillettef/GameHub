# Rootbound 운영(EC2, GameHub 허브 안 실행) 수동 재배포 스크립트. 평소 배포는 GameHub 저장소의 Deploy 워크플로가 한다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1
#
# 2026-11-25부터 rootbound 는 GameHub 허브(systemd gamehub, :80) 안에서 실행된다(~/rootbound/scripts/aws/hub-entry.mjs).
# 이 스크립트는 .github/workflows/deploy-rootbound.yml 과 같은 일을 로컬에서 한다:
#   클라이언트(vite)·서버(esbuild 단일 번들) 로컬 빌드 → server/dist client/dist/prod scripts/aws 만 ~/rootbound 로 전송
#   → 서버에서 scripts/aws/deploy-remote.sh 가 허브 재시작·헬스체크(허브 안 다른 게임의 진행 중인 방은 사라진다).
#
# 사전 조건: .dev/astraltab-key.pem (SSH 키), .dev/aws-public-ip.txt (Elastic IP) 존재.

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$keyPath = Join-Path $root '.dev\astraltab-key.pem'
$ipFile  = Join-Path $root '.dev\aws-public-ip.txt'

if (-not (Test-Path $keyPath)) { throw "SSH 키가 없습니다: $keyPath" }
if (-not (Test-Path $ipFile))  { throw "EC2 공인 IP 파일이 없습니다: $ipFile" }

$ip     = (Get-Content $ipFile -Raw).Trim()
$target = "ec2-user@$ip"
$sshOpts = @('-i', $keyPath, '-o', 'StrictHostKeyChecking=accept-new')

Write-Host "[deploy-aws] 클라이언트·서버 로컬 빌드 중 ..."
Push-Location (Join-Path $root 'client')
try {
    & npx vite build --outDir dist/prod --emptyOutDir
    if ($LASTEXITCODE -ne 0) { throw "클라이언트 빌드 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }
Push-Location $root
try {
    & npm run build -w '@rootbound/server'
    if ($LASTEXITCODE -ne 0) { throw "서버 번들 빌드 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 산출물 전송 중 (server/dist, client/dist/prod, scripts/aws) ..."
Push-Location $root
try {
    $untar = "rm -rf ~/rootbound/server/dist ~/rootbound/client/dist ~/rootbound/scripts && mkdir -p ~/rootbound && tar -x -C ~/rootbound"
    cmd /c "tar -c server/dist client/dist/prod scripts/aws | ssh $($sshOpts -join ' ') $target `"$untar`""
    if ($LASTEXITCODE -ne 0) { throw "산출물 전송 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 서버에서 허브 재시작·헬스체크 중 ..."
& ssh @sshOpts $target "bash ~/rootbound/scripts/aws/deploy-remote.sh"
if ($LASTEXITCODE -ne 0) { throw "원격 배포 실패 (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "=== 배포 완료 ==="
Write-Host "접속: http://${ip}/rootbound/"
