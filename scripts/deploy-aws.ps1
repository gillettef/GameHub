# AstralTab AWS(EC2) 재배포 스크립트.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1
#
# GitHub 저장소가 비공개라 EC2에서 직접 git clone/pull 하지 않는다. 대신 로컬 워킹트리를
# `git archive`로 패키징해 ssh로 전송한 뒤, 서버에서 scripts/aws/deploy-remote.sh 가
# npm install → pip install → systemd 서비스 재시작을 수행한다. 클라이언트 빌드(vite)는
# EC2(t3.micro, 1GB)에서 하지 않고 이 스크립트가 로컬에서 미리 해서 client/dist/prod 만 전송한다.
#
# 사전 조건: .dev/astraltab-key.pem (SSH 키), .dev/aws-public-ip.txt (Elastic IP) 존재.
# 인스턴스 자체를 새로 만드는 절차는 scripts/aws/provision.sh, scripts/aws/units.sh 참고.

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$keyPath = Join-Path $root '.dev\astraltab-key.pem'
$ipFile  = Join-Path $root '.dev\aws-public-ip.txt'

if (-not (Test-Path $keyPath)) { throw "SSH 키가 없습니다: $keyPath" }
if (-not (Test-Path $ipFile))  { throw "EC2 공인 IP 파일이 없습니다: $ipFile" }

$ip     = (Get-Content $ipFile -Raw).Trim()
$target = "ec2-user@$ip"
$sshOpts = @('-i', $keyPath, '-o', 'StrictHostKeyChecking=accept-new')

Write-Host "[deploy-aws] $target 로 최신 코드 전송 중 (git archive)..."
Push-Location $root
try {
    $archiveCmd = "git archive HEAD"
    $tarCmd     = "mkdir -p ~/AstralTab && tar -x -C ~/AstralTab"
    cmd /c "$archiveCmd | ssh $($sshOpts -join ' ') $target `"$tarCmd`""
    if ($LASTEXITCODE -ne 0) { throw "소스 전송 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 클라이언트 로컬 빌드 중 ..."
Push-Location (Join-Path $root 'client')
try {
    & npx vite build --outDir dist/prod --emptyOutDir
    if ($LASTEXITCODE -ne 0) { throw "클라이언트 빌드 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 빌드 결과(client/dist/prod) 전송 중 ..."
Push-Location (Join-Path $root 'client\dist')
try {
    $distCmd = "rm -rf ~/AstralTab/client/dist/prod && mkdir -p ~/AstralTab/client/dist && tar -x -C ~/AstralTab/client/dist"
    cmd /c "tar -c prod | ssh $($sshOpts -join ' ') $target `"$distCmd`""
    if ($LASTEXITCODE -ne 0) { throw "빌드 결과 전송 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 서버에서 의존성 설치·재시작 중 ..."
& ssh @sshOpts $target "bash ~/AstralTab/scripts/aws/deploy-remote.sh"
if ($LASTEXITCODE -ne 0) { throw "원격 배포 실패 (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "=== 배포 완료 ==="
Write-Host "접속: http://${ip}:3201"
