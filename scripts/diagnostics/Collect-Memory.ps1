#requires -Version 5.1
<#
.SYNOPSIS
Records bounded Windows memory diagnostics without inspecting user content.
.DESCRIPTION
Default: one sample every 10 seconds for four hours. Records only system memory,
process IDs/names, private bytes and working sets. No command lines, URLs, file
contents, scheduled tasks, startup entries, or automatic process termination.
Use -Stop (and the same -OutputDirectory, if customized) to request a stop.
Files memory-00.jsonl through memory-07.jsonl form a 32 MiB circular log.
Every JSONL record is flushed through FileStream.Flush(true).
.EXAMPLE
.\Collect-Memory.ps1 -Once
.EXAMPLE
.\Collect-Memory.ps1 -Minutes 30 -IntervalSeconds 10
.EXAMPLE
.\Collect-Memory.ps1 -Stop
#>
[CmdletBinding()]
param(
    [ValidateRange(0.01, 1440)]
    [double]$Minutes = 240,
    [ValidateRange(1, 300)]
    [int]$IntervalSeconds = 10,
    [string]$OutputDirectory = (Join-Path $env:LOCALAPPDATA 'KotobaStudy\Diagnostics'),
    [switch]$Once,
    [switch]$Stop
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
if ($Once -and $Stop) { throw 'Use either -Once or -Stop.' }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'This collector requires Windows.'
}

$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$stopPath = Join-Path $OutputDirectory 'stop.marker'
$utf8 = New-Object Text.UTF8Encoding($false)
if ($Stop) {
    $bytes = $utf8.GetBytes([DateTime]::UtcNow.ToString('o'))
    $marker = [IO.File]::Open($stopPath, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
        $marker.Write($bytes, 0, $bytes.Length)
        $marker.Flush($true)
    } finally { $marker.Dispose() }
    Write-Output 'Stop requested. The collector checks the marker at least twice per second between samples.'
    exit 0
}

$mutex = New-Object Threading.Mutex($false, 'Local\KotobaStudy.MemoryCollector.v1')
$acquired = $false
try { $acquired = $mutex.WaitOne(0) }
catch [Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) {
    $mutex.Dispose()
    Write-Output 'A Kotoba memory collector is already running. No second collector was started.'
    exit 3
}

$script:logStream = $null
$script:logIndex = 0
$maxFileBytes = 4 * 1024 * 1024
$maxFiles = 8
$privateLimitBytes = 256 * 1024 * 1024
$samples = 0
$reason = 'error'
$exitCode = 0
$clock = [Diagnostics.Stopwatch]::StartNew()

function ConvertTo-MiB([double]$Bytes) {
    return [Math]::Round($Bytes / 1048576, 2)
}

function Open-Log([int]$Index, [bool]$Truncate) {
    if ($null -ne $script:logStream) {
        $script:logStream.Dispose()
        $script:logStream = $null
    }
    $script:logIndex = $Index
    $path = Join-Path $OutputDirectory ('memory-{0:D2}.jsonl' -f $Index)
    $mode = [IO.FileMode]::OpenOrCreate
    if ($Truncate) { $mode = [IO.FileMode]::Create }
    $script:logStream = [IO.File]::Open($path, $mode, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    [void]$script:logStream.Seek(0, [IO.SeekOrigin]::End)
    # A power failure could leave a partial final record. Discard only that
    # incomplete tail, preserving every complete newline-terminated record.
    if ($script:logStream.Length -gt 0) {
        $position = $script:logStream.Length - 1
        [void]$script:logStream.Seek($position, [IO.SeekOrigin]::Begin)
        if ($script:logStream.ReadByte() -ne 10) {
            $buffer = New-Object byte[] 4096
            $end = $script:logStream.Length
            $completeLength = [long]0
            $foundNewline = $false
            while ($end -gt 0 -and -not $foundNewline) {
                $start = [Math]::Max(0, $end - $buffer.Length)
                [void]$script:logStream.Seek($start, [IO.SeekOrigin]::Begin)
                $read = $script:logStream.Read($buffer, 0, [int]($end - $start))
                for ($j = $read - 1; $j -ge 0; $j--) {
                    if ($buffer[$j] -eq 10) {
                        $completeLength = $start + $j + 1
                        $foundNewline = $true
                        break
                    }
                }
                $end = $start
            }
            $script:logStream.SetLength($completeLength)
            $script:logStream.Flush($true)
        }
    }
    [void]$script:logStream.Seek(0, [IO.SeekOrigin]::End)
}

function Write-Record($Record) {
    $line = ($Record | ConvertTo-Json -Depth 8 -Compress) + "`n"
    $bytes = $utf8.GetBytes($line)
    if ($bytes.Length -gt $maxFileBytes) { throw 'A diagnostic record exceeded the file-size limit.' }
    if ($script:logStream.Length + $bytes.Length -gt $maxFileBytes) {
        Open-Log (($script:logIndex + 1) % $maxFiles) $true
    }
    $script:logStream.Write($bytes, 0, $bytes.Length)
    $script:logStream.Flush($true)
}

function Get-SelfPrivateBytes {
    $self = [Diagnostics.Process]::GetCurrentProcess()
    try { return $self.PrivateMemorySize64 }
    finally { $self.Dispose() }
}

function Get-MemorySample {
    $native = [KotobaDiagnostics.NativeMemory]::Read()
    $page = [double]$native.PageSize.ToUInt64()
    $commit = [double]$native.CommitTotal.ToUInt64() * $page
    $commitLimit = [double]$native.CommitLimit.ToUInt64() * $page
    $available = [double]$native.PhysicalAvailable.ToUInt64() * $page
    $physical = [double]$native.PhysicalTotal.ToUInt64() * $page
    $ratio = 0
    if ($commitLimit -gt 0) { $ratio = $commit / $commitLimit }
    $physicalThreshold = [Math]::Max(512 * 1048576, $physical * 0.05)
    $rows = New-Object 'Collections.Generic.List[object]'
    $grouped = @{}
    $unreadable = 0
    $processes = [Diagnostics.Process]::GetProcesses()
    foreach ($process in $processes) {
        try {
            $processId = $process.Id
            $name = $process.ProcessName
            $privateBytes = $process.PrivateMemorySize64
            $workingBytes = $process.WorkingSet64
            $rows.Add([pscustomobject]@{
                pid = $processId; name = $name
                privateMiB = (ConvertTo-MiB $privateBytes)
                workingMiB = (ConvertTo-MiB $workingBytes)
            })
            if (-not $grouped.ContainsKey($name)) {
                $grouped[$name] = [pscustomobject]@{ name = $name; count = 0; privateBytes = [long]0; workingBytes = [long]0 }
            }
            $grouped[$name].count++
            $grouped[$name].privateBytes += $privateBytes
            $grouped[$name].workingBytes += $workingBytes
        } catch { $unreadable++ }
        finally { $process.Dispose() }
    }
    $processes = $null
    $byName = @($grouped.Values | Sort-Object privateBytes -Descending | ForEach-Object {
        [pscustomobject]@{
            name = $_.name; count = $_.count
            privateMiB = (ConvertTo-MiB $_.privateBytes)
            workingMiB = (ConvertTo-MiB $_.workingBytes)
        }
    })
    return [pscustomobject]@{
        schema = 1; kind = 'sample'; utc = [DateTime]::UtcNow.ToString('o')
        elapsedSeconds = [Math]::Round($clock.Elapsed.TotalSeconds, 2)
        system = [pscustomobject]@{
            commitMiB = (ConvertTo-MiB $commit)
            commitLimitMiB = (ConvertTo-MiB $commitLimit)
            commitPercent = [Math]::Round($ratio * 100, 2)
            commitPeakMiB = (ConvertTo-MiB ([double]$native.CommitPeak.ToUInt64() * $page))
            availablePhysicalMiB = (ConvertTo-MiB $available)
            totalPhysicalMiB = (ConvertTo-MiB $physical)
            systemCacheMiB = (ConvertTo-MiB ([double]$native.SystemCache.ToUInt64() * $page))
            kernelTotalMiB = (ConvertTo-MiB ([double]$native.KernelTotal.ToUInt64() * $page))
            kernelPagedMiB = (ConvertTo-MiB ([double]$native.KernelPaged.ToUInt64() * $page))
            kernelNonpagedMiB = (ConvertTo-MiB ([double]$native.KernelNonpaged.ToUInt64() * $page))
            processCount = $native.ProcessCount; handleCount = $native.HandleCount; threadCount = $native.ThreadCount
        }
        memoryPressure = [pscustomobject]@{
            flagged = (($ratio -ge 0.90) -or ($available -lt $physicalThreshold))
            highCommit = ($ratio -ge 0.90); lowPhysical = ($available -lt $physicalThreshold)
            commitThresholdPercent = 90; availableThresholdMiB = (ConvertTo-MiB $physicalThreshold)
            action = 'record-only'
        }
        processes = [pscustomobject]@{
            observed = $rows.Count; unreadable = $unreadable
            topPrivate = @($rows | Sort-Object privateMiB -Descending | Select-Object -First 20)
            byName = $byName
            workingSetSumsMayDoubleCountSharedPages = $true
        }
        collector = [pscustomobject]@{
            pid = $PID; privateMiB = (ConvertTo-MiB (Get-SelfPrivateBytes))
            privateLimitMiB = 256; intervalSeconds = $IntervalSeconds
            powershellVersion = $PSVersionTable.PSVersion.ToString()
            is64BitProcess = [Environment]::Is64BitProcess
        }
    }
}

try {
    if (Test-Path -LiteralPath $stopPath) { Remove-Item -LiteralPath $stopPath -Force }
    if (-not ('KotobaDiagnostics.NativeMemory' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace KotobaDiagnostics {
    [StructLayout(LayoutKind.Sequential)]
    public struct PerformanceInfo {
        public uint cb;
        public UIntPtr CommitTotal, CommitLimit, CommitPeak;
        public UIntPtr PhysicalTotal, PhysicalAvailable, SystemCache;
        public UIntPtr KernelTotal, KernelPaged, KernelNonpaged, PageSize;
        public uint HandleCount, ProcessCount, ThreadCount;
    }
    public static class NativeMemory {
        [DllImport("psapi.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetPerformanceInfo(out PerformanceInfo info, uint size);
        public static PerformanceInfo Read() {
            PerformanceInfo info;
            uint size = (uint)Marshal.SizeOf(typeof(PerformanceInfo));
            if (!GetPerformanceInfo(out info, size)) throw new Win32Exception(Marshal.GetLastWin32Error());
            return info;
        }
    }
}
'@
    }
    $latest = $null
    for ($i = 0; $i -lt $maxFiles; $i++) {
        $path = Join-Path $OutputDirectory ('memory-{0:D2}.jsonl' -f $i)
        if ([IO.File]::Exists($path)) {
            $item = Get-Item -LiteralPath $path
            if (($null -eq $latest) -or ($item.LastWriteTimeUtc -gt $latest.time)) {
                $latest = [pscustomobject]@{ index = $i; time = $item.LastWriteTimeUtc; length = $item.Length }
            }
        }
    }
    if ($null -eq $latest) { Open-Log 0 $false }
    else { Open-Log $latest.index ($latest.length -gt $maxFileBytes) }
    $clock.Restart()
    $durationSeconds = $Minutes * 60
    $nextSample = 0.0
    while ($true) {
        if (Test-Path -LiteralPath $stopPath) { $reason = 'stop-marker'; break }
        if ($samples -gt 0 -and $clock.Elapsed.TotalSeconds -ge $durationSeconds) { $reason = 'duration'; break }
        if ((Get-SelfPrivateBytes) -gt $privateLimitBytes) { $reason = 'collector-private-limit'; break }
        $record = Get-MemorySample
        Write-Record $record
        $samples++
        if ($record.collector.privateMiB -gt 256) { $reason = 'collector-private-limit'; break }
        $record = $null
        if ($Once) { $reason = 'once'; break }
        $nextSample = [Math]::Max($nextSample + $IntervalSeconds, $clock.Elapsed.TotalSeconds)
        while ($clock.Elapsed.TotalSeconds -lt $nextSample -and $clock.Elapsed.TotalSeconds -lt $durationSeconds) {
            if (Test-Path -LiteralPath $stopPath) { break }
            $remainingMs = ($nextSample - $clock.Elapsed.TotalSeconds) * 1000
            Start-Sleep -Milliseconds ([int][Math]::Max(1, [Math]::Min(500, $remainingMs)))
        }
    }
    Write-Record ([pscustomobject]@{ schema = 1; kind = 'stopped'; utc = [DateTime]::UtcNow.ToString('o'); reason = $reason; samples = $samples })
    Write-Output ('Collector stopped: {0}; samples: {1}; output: {2}' -f $reason, $samples, $OutputDirectory)
} catch {
    $exitCode = 1
    if ($null -ne $script:logStream) {
        try {
            Write-Record ([pscustomobject]@{ schema = 1; kind = 'stopped'; utc = [DateTime]::UtcNow.ToString('o'); reason = 'error'; errorType = $_.Exception.GetType().Name; samples = $samples })
        } catch { }
    }
    Write-Output 'Collector stopped after an error. No user process was terminated.'
} finally {
    if ($null -ne $script:logStream) { $script:logStream.Dispose() }
    $clock.Stop()
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
exit $exitCode
