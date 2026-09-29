# AstralTab local dev stopper.
# Kills the process trees recorded in .dev/server.pid, client.pid, ai.pid. As a fallback it
# looks at listeners on ports 3101 / 5173 / 8000, but only kills a process started from THIS
# project directory. Anything else (e.g. Eleven on port 3001) is left alone and reported.

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

Stop-Services @('server', 'client', 'ai') @(3101, 5173, 8000)
Write-Host "Done."
