# Start a bounded, local-only diagnostic session. No automatic startup is installed.
[CmdletBinding()]
param([ValidateRange(1, 1440)][int]$Minutes = 240)
$ErrorActionPreference = 'Stop'
$collector = Join-Path $PSScriptRoot 'Collect-Memory.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $collector + '" -Minutes ' + $Minutes
$child = Start-Process -FilePath $powershell -ArgumentList $arguments -WindowStyle Hidden -PassThru
try { Write-Output ('Collector requested (PID {0}), up to {1} minutes. Logs: %LOCALAPPDATA%\KotobaStudy\Diagnostics. Use Collect-Memory.ps1 -Stop to stop.' -f $child.Id, $Minutes) }
finally { $child.Dispose() }
