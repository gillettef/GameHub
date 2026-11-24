# Sightline AWS(EC2) 수동 재배포 스크립트. 평소에는 main push 시 GitHub Actions 가 배포하므로 push 없이 재배포할 때만 쓴다.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-aws.ps1
#
# 로컬에서 테스트·빌드를 하고 dist·scripts/aws(serve.mjs, deploy-remote.sh)만 ssh로 전송한 뒤,
# 서버에서 scripts/aws/deploy-remote.sh 가 systemd 서비스(sightline, 포트 8102) 재시작·헬스체크를 한다.
# EC2(t4g.nano, 0.5GB)에서는 빌드하지 않는다.
#
# 사전 조건: SSH 키와 Elastic IP 파일. 공용 인스턴스라 Rootbound 와 같은 것을 쓴다.
#   .dev/astraltab-key.pem, .dev/aws-public-ip.txt (git 제외) — 없으면 ../Rootbound/.dev 의 것을 쓴다.
# 인스턴스 준비 절차는 scripts/aws/provision.sh, scripts/aws/units.sh 참고.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Find-DevFile([string]$name) {
    foreach ($dir in @((Join-Path $root '.dev'), (Join-Path $root '..\Rootbound\.dev'))) {
        $p = Join-Path $dir $name
        if (Test-Path $p) { return (Resolve-Path $p).Path }
    }
    throw "$name 이 없습니다: .dev/ 또는 ../Rootbound/.dev/ 에 두세요"
}

$keyPath = Find-DevFile 'astraltab-key.pem'
$ip      = (Get-Content (Find-DevFile 'aws-public-ip.txt') -Raw).Trim()
$target  = "ec2-user@$ip"
$sshOpts = @('-i', $keyPath, '-o', 'StrictHostKeyChecking=accept-new')

if (-not (Test-Path (Join-Path $root "package.json"))) { throw "package.json 이 없습니다: 디지털 프로토타입을 만든 뒤에 배포할 수 있습니다" }

Push-Location $root
try {
    Write-Host "[deploy-aws] 테스트 중 ..."
    & npm test
    if ($LASTEXITCODE -ne 0) { throw "테스트 실패 (exit $LASTEXITCODE)" }

    Write-Host "[deploy-aws] 빌드 중 ..."
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "빌드 실패 (exit $LASTEXITCODE)" }

    Write-Host "[deploy-aws] $target 로 dist·scripts/aws 전송 중 ..."
    # PowerShell 5.1 파이프는 바이너리를 깨뜨리므로 cmd 파이프를 쓴다
    $tarCmd = "rm -rf ~/sightline/dist && mkdir -p ~/sightline && tar -x -C ~/sightline"
    cmd /c "tar -c dist scripts/aws | ssh $($sshOpts -join ' ') $target `"$tarCmd`""
    if ($LASTEXITCODE -ne 0) { throw "전송 실패 (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "[deploy-aws] 서버에서 재시작·헬스체크 중 ..."
& ssh @sshOpts $target "bash ~/sightline/scripts/aws/deploy-remote.sh"
if ($LASTEXITCODE -ne 0) { throw "원격 배포 실패 (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "=== 배포 완료 ==="
Write-Host "접속: http://${ip}:8102"
