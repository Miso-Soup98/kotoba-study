# Windows-only launcher. It owns only the process tree that it creates.
# No service, scheduled task, registry change or global process-name termination.
[CmdletBinding()]
param(
  [string]$Executable,
  [string]$WorkingDirectory,
  [string[]]$ArgumentList = @(),
  [string]$LogDirectory,
  [ValidateRange(128, 16384)][int]$MaxPrivateMiB = 4096,
  [ValidateRange(0, 1048576)][int]$MinAvailableMiB = 2048,
  [ValidateRange(1, 99)][double]$MaxCommitPercent = 85,
  [ValidateRange(1, 30)][int]$SampleSeconds = 5,
  [ValidateRange(1, 86400)][int]$TimeoutSeconds = 1800,
  [ValidateRange(1, 256)][int]$MaxOutputMiB = 64,
  [ValidateRange(0, 2147483647)][int]$ParentProcessId = 0,
  [switch]$ConfigFromStdin
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows is required.' }
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell.' }
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ($ConfigFromStdin) {
  $inputConfigText = [Console]::In.ReadToEnd()
  if ($inputConfigText.Length -gt 65536) { throw 'Launcher configuration is too large.' }
  $inputConfig = $inputConfigText | ConvertFrom-Json
  $allowedKeys = @('Executable','WorkingDirectory','ArgumentList','LogDirectory','MaxPrivateMiB','MinAvailableMiB','MaxCommitPercent','SampleSeconds','TimeoutSeconds','MaxOutputMiB','ParentProcessId')
  foreach ($property in $inputConfig.PSObject.Properties) {
    if ($allowedKeys -notcontains $property.Name) { throw ('Unknown launcher setting: '+$property.Name) }
    Set-Variable -Name $property.Name -Value $property.Value
  }
  if ($MaxPrivateMiB -lt 128 -or $MaxPrivateMiB -gt 16384 -or $MinAvailableMiB -lt 0 -or $MinAvailableMiB -gt 1048576 -or $MaxCommitPercent -lt 1 -or $MaxCommitPercent -gt 99 -or $SampleSeconds -lt 1 -or $SampleSeconds -gt 30 -or $TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 86400 -or $MaxOutputMiB -lt 1 -or $MaxOutputMiB -gt 256 -or $ParentProcessId -lt 0) { throw 'Invalid launcher limits.' }
}
if (-not $Executable -or -not $WorkingDirectory -or -not $LogDirectory) { throw 'Executable, WorkingDirectory and LogDirectory are required.' }
$runExecutable = (Resolve-Path -LiteralPath $Executable).Path
$runDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path
if (-not (Test-Path -LiteralPath $runExecutable -PathType Leaf) -or [IO.Path]::GetExtension($runExecutable) -ne '.exe') { throw 'Executable must be a resolved .exe file.' }
if (-not (Test-Path -LiteralPath $runDirectory -PathType Container)) { throw 'Working directory does not exist.' }
$runLogDirectory = [IO.Path]::GetFullPath($LogDirectory)
[void][IO.Directory]::CreateDirectory($runLogDirectory)
$runId = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$runLogPath = Join-Path $runLogDirectory ($runId + '.jsonl')
$runOutputPath = Join-Path $runLogDirectory ($runId + '-output.log')

# The native job handle is non-inheritable. Kill-on-close also works if this
# PowerShell process is force-terminated: Windows closes its owned handle.
if (-not ('KotobaBoundedRunV1.Job' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Linq;
using System.ComponentModel;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace KotobaBoundedRunV1 {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A,B,C,D,E,F; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic;
    public IoCounters Io;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public int cb; public string reserved, desktop, title;
    public uint x,y,xSize,ySize,xCountChars,yCountChars,fillAttribute,flags;
    public short showWindow,reserved2; public IntPtr reserved2Ptr,stdInput,stdOutput,stdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct FileTime { public uint low,high; public long Value { get { return ((long)high << 32) | low; } } }
  [StructLayout(LayoutKind.Sequential)] struct MemoryCounters {
    public uint cb, pageFaultCount;
    public UIntPtr peakWorkingSet, workingSet, quotaPeakPagedPool, quotaPagedPool, quotaPeakNonPagedPool, quotaNonPagedPool, pagefileUsage, peakPagefileUsage, privateUsage;
  }
  [StructLayout(LayoutKind.Sequential)] struct PerformanceInfo {
    public uint cb;
    public UIntPtr commitTotal,commitLimit,commitPeak,physicalTotal,physicalAvailable,systemCache,kernelTotal,kernelPaged,kernelNonPaged,pageSize;
    public uint handleCount,processCount,threadCount;
  }
  public sealed class SystemSample { public ulong CommitBytes,CommitLimitBytes,AvailableBytes,PhysicalBytes; public double CommitPercent; }
  public sealed class Member { public uint Pid; public long CreatedFileTime; public string CreatedUtc; public ulong PrivateBytes; }
  public sealed class Job : IDisposable {
    const uint JOB_MEMORY = 0x200, KILL_ON_CLOSE = 0x2000;
    IntPtr job=IntPtr.Zero, process=IntPtr.Zero, inputWrite=IntPtr.Zero,parent=IntPtr.Zero;
    public uint Pid { get; private set; }
    public long CreatedFileTime { get; private set; }
    public ulong MemoryLimitBytes { get; private set; }
    public uint ParentPid { get; private set; }
    public long ParentCreatedFileTime { get; private set; }
    public string CreatedUtc { get { return DateTime.FromFileTimeUtc(CreatedFileTime).ToString("o"); } }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int infoClass,ref ExtendedLimits info,uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int infoClass,IntPtr info,uint size,out uint returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processAttrs,IntPtr threadAttrs,bool inherit,uint flags,IntPtr environment,string cwd,ref StartupInfo startup,out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out FileTime created,out FileTime exited,out FileTime kernel,out FileTime user);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SecurityAttributes attributes,uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string path,uint access,uint share,ref SecurityAttributes attrs,uint creation,uint flags,IntPtr template);
    [DllImport("psapi.dll", SetLastError=true)] static extern bool GetProcessMemoryInfo(IntPtr process,ref MemoryCounters counters,uint size);
    [DllImport("psapi.dll", SetLastError=true)] static extern bool GetPerformanceInfo(ref PerformanceInfo info,uint size);
    static Exception Error(string action) { return new Win32Exception(Marshal.GetLastWin32Error(),action); }
    static void Check(bool ok,string action) { if(!ok) throw Error(action); }
    static long CreationTime(IntPtr handle) { FileTime created,exited,kernel,user; Check(GetProcessTimes(handle,out created,out exited,out kernel,out user),"GetProcessTimes"); return created.Value; }
    // Windows CRT quoting, including trailing backslashes and embedded quotes.
    public static string Quote(string value) {
      if(value==null) throw new ArgumentNullException("value");
      if(value.IndexOf('\0')>=0) throw new ArgumentException("Command arguments cannot contain NUL.");
      var result=new StringBuilder("\""); int slashes=0;
      foreach(char ch in value) {
        if(ch=='\\') { slashes++; continue; }
        if(ch=='\"') { result.Append('\\',slashes*2+1); result.Append(ch); }
        else { result.Append('\\',slashes); result.Append(ch); }
        slashes=0;
      }
      result.Append('\\',slashes*2); result.Append('\"'); return result.ToString();
    }
    public static SystemSample ReadSystem() {
      var p=new PerformanceInfo(); p.cb=(uint)Marshal.SizeOf(p);
      Check(GetPerformanceInfo(ref p,p.cb),"GetPerformanceInfo");
      ulong size=p.pageSize.ToUInt64();
      return new SystemSample { CommitBytes=p.commitTotal.ToUInt64()*size, CommitLimitBytes=p.commitLimit.ToUInt64()*size,
        AvailableBytes=p.physicalAvailable.ToUInt64()*size,PhysicalBytes=p.physicalTotal.ToUInt64()*size,
        CommitPercent=p.commitLimit.ToUInt64()==0 ? 100 : 100.0*p.commitTotal.ToUInt64()/p.commitLimit.ToUInt64() };
    }
    public static void AppendDurable(string path,string text) {
      byte[] bytes=new UTF8Encoding(false).GetBytes(text+Environment.NewLine);
      using(var file=new FileStream(path,FileMode.Append,FileAccess.Write,FileShare.Read)) { file.Write(bytes,0,bytes.Length); file.Flush(true); }
    }
    public static Job Start(string executable,string[] arguments,string cwd,string outputPath,ulong memoryLimit,uint parentPid) {
      var owned=new Job(); IntPtr inputRead=IntPtr.Zero,output=IntPtr.Zero; ProcessInfo child=new ProcessInfo();
      try {
        if(parentPid!=0) {
          owned.parent=OpenProcess(0x100000|0x1000,false,parentPid); if(owned.parent==IntPtr.Zero) throw Error("Open launcher parent");
          owned.ParentPid=parentPid; owned.ParentCreatedFileTime=CreationTime(owned.parent);
          if(WaitForSingleObject(owned.parent,0)==0) throw new InvalidOperationException("Launcher parent already exited.");
        }
        owned.job=CreateJobObject(IntPtr.Zero,null); if(owned.job==IntPtr.Zero) throw Error("CreateJobObject");
        var limits=new ExtendedLimits(); limits.Basic.LimitFlags=JOB_MEMORY|KILL_ON_CLOSE; limits.JobMemoryLimit=new UIntPtr(memoryLimit);
        Check(SetInformationJobObject(owned.job,9,ref limits,(uint)Marshal.SizeOf(limits)),"SetInformationJobObject");
        owned.MemoryLimitBytes=memoryLimit;
        var security=new SecurityAttributes { Length=Marshal.SizeOf(typeof(SecurityAttributes)),Inherit=true };
        Check(CreatePipe(out inputRead,out owned.inputWrite,ref security,0),"CreatePipe");
        Check(SetHandleInformation(owned.inputWrite,1,0),"SetHandleInformation");
        output=CreateFileW(outputPath,0x40000000,3,ref security,1,0x80,IntPtr.Zero);
        if(output==new IntPtr(-1)) { output=IntPtr.Zero; throw Error("CreateFile output"); }
        var startup=new StartupInfo { cb=Marshal.SizeOf(typeof(StartupInfo)),flags=0x100,stdInput=inputRead,stdOutput=output,stdError=output };
        string command=Quote(executable)+String.Concat((arguments??new string[0]).Select(a=>" "+Quote(a)));
        // No breakaway flags; children inherit job membership. Suspended launch
        // removes the race where a child could spawn before being restricted.
        Check(CreateProcessW(executable,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x4|0x08000000,IntPtr.Zero,cwd,ref startup,out child),"CreateProcess");
        owned.process=child.process; owned.Pid=child.pid;
        owned.CreatedFileTime=CreationTime(child.process);
        Check(AssignProcessToJobObject(owned.job,child.process),"AssignProcessToJobObject; no unguarded fallback is allowed");
        if(ResumeThread(child.thread)==0xffffffff) throw Error("ResumeThread");
        return owned;
      } catch {
        // This handle is the exact newly-created suspended process, never a PID search.
        if(child.process!=IntPtr.Zero) { TerminateProcess(child.process,125); WaitForSingleObject(child.process,3000); }
        owned.Dispose(); throw;
      } finally {
        if(child.thread!=IntPtr.Zero) CloseHandle(child.thread);
        if(inputRead!=IntPtr.Zero) CloseHandle(inputRead);
        if(output!=IntPtr.Zero) CloseHandle(output);
      }
    }
    public bool RootExited { get { return WaitForSingleObject(process,0)==0; } }
    public bool ParentExited { get { return parent!=IntPtr.Zero && WaitForSingleObject(parent,0)==0; } }
    public int RootExitCode { get { uint code; Check(GetExitCodeProcess(process,out code),"GetExitCodeProcess"); return unchecked((int)code); } }
    public Member[] Members() {
      if(job==IntPtr.Zero) throw new ObjectDisposedException("Job");
      int capacity=64;
      while(capacity<=4096) {
        int size=8+capacity*IntPtr.Size; IntPtr buffer=Marshal.AllocHGlobal(size);
        try {
          uint returned; bool ok=QueryInformationJobObject(job,3,buffer,(uint)size,out returned);
          if(!ok) { if(Marshal.GetLastWin32Error()==234) { capacity*=2; continue; } throw Error("QueryInformationJobObject"); }
          int assigned=Marshal.ReadInt32(buffer),count=Marshal.ReadInt32(buffer,4);
          if(count>capacity || assigned>capacity) { capacity*=2; continue; }
          var result=new List<Member>();
          for(int index=0;index<count;index++) {
            uint pid=(uint)Marshal.ReadIntPtr(buffer,8+index*IntPtr.Size).ToInt64();
            IntPtr member=OpenProcess(0x1000,false,pid); if(member==IntPtr.Zero) continue;
            try {
              bool belongs; if(!IsProcessInJob(member,job,out belongs)||!belongs) continue;
              long created=CreationTime(member); if(created<CreatedFileTime) continue;
              var memory=new MemoryCounters(); memory.cb=(uint)Marshal.SizeOf(memory);
              Check(GetProcessMemoryInfo(member,ref memory,memory.cb),"GetProcessMemoryInfo");
              result.Add(new Member { Pid=pid,CreatedFileTime=created,CreatedUtc=DateTime.FromFileTimeUtc(created).ToString("o"),PrivateBytes=memory.privateUsage.ToUInt64() });
            } finally { CloseHandle(member); }
          }
          return result.ToArray();
        } finally { Marshal.FreeHGlobal(buffer); }
      }
      throw new InvalidOperationException("Job contains more than 4096 processes; stopping for safety.");
    }
    public void Stop(uint exitCode) { if(job!=IntPtr.Zero) Check(TerminateJobObject(job,exitCode),"TerminateJobObject"); }
    public void Dispose() {
      // Close the job first so no descendant survives even if the root exited.
      if(job!=IntPtr.Zero) { CloseHandle(job); job=IntPtr.Zero; }
      if(inputWrite!=IntPtr.Zero) { CloseHandle(inputWrite); inputWrite=IntPtr.Zero; }
      if(process!=IntPtr.Zero) { WaitForSingleObject(process,3000); CloseHandle(process); process=IntPtr.Zero; }
      if(parent!=IntPtr.Zero) { CloseHandle(parent); parent=IntPtr.Zero; }
    }
  }
}
'@
}
function Write-RunEvent([string]$Kind, $Payload) {
  $record = [ordered]@{ utc=[DateTime]::UtcNow.ToString('o'); kind=$Kind; data=$Payload }
  [KotobaBoundedRunV1.Job]::AppendDurable($runLogPath, ($record | ConvertTo-Json -Depth 8 -Compress))
}
$outputOffset = [long]0
$outputDecoder = [Text.Encoding]::UTF8.GetDecoder()
function Write-IncrementalOutput {
  if (-not (Test-Path -LiteralPath $runOutputPath -PathType Leaf)) { return }
  $outputReader = [IO.FileStream]::new($runOutputPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
  try {
    $availableOutput = $outputReader.Length - $script:outputOffset
    if ($availableOutput -le 0) { return }
    # The complete stream remains on disk. Console output is bounded per sample.
    if ($availableOutput -gt 16384) {
      $script:outputOffset=$outputReader.Length-16384
      $script:outputDecoder.Reset()
      Write-Host '[Earlier process output omitted from console; retained in output.log.]'
    }
    $outputReader.Position=$script:outputOffset
    $outputBuffer=[byte[]]::new(16384)
    $outputRead=$outputReader.Read($outputBuffer,0,$outputBuffer.Length)
    $script:outputOffset+=$outputRead
    $outputChars=[char[]]::new(16384)
    $outputCharCount=$script:outputDecoder.GetChars($outputBuffer,0,$outputRead,$outputChars,0,$false)
    [Console]::Write([string]::new($outputChars,0,$outputCharCount))
  } finally { $outputReader.Dispose() }
}
$ownedJob = $null
$runExitCode = 0
$runStopReason = 'not-started'
try {
  $systemBefore = [KotobaBoundedRunV1.Job]::ReadSystem()
  Write-RunEvent 'preflight' @{ system=$systemBefore; executable=[IO.Path]::GetFileName($runExecutable); argumentCount=$ArgumentList.Count; limits=@{ privateMiB=$MaxPrivateMiB; minAvailableMiB=$MinAvailableMiB; maxCommitPercent=$MaxCommitPercent; timeoutSeconds=$TimeoutSeconds; maxOutputMiB=$MaxOutputMiB } }
  if ($systemBefore.AvailableBytes -lt ([uint64]$MinAvailableMiB * 1MB) -or $systemBefore.CommitPercent -ge $MaxCommitPercent) {
    $runStopReason = 'system-pressure-before-start'
    $runExitCode = 125
    Write-RunEvent 'refused' @{ reason=$runStopReason }
  } else {
    $ownedJob = [KotobaBoundedRunV1.Job]::Start($runExecutable,$ArgumentList,$runDirectory,$runOutputPath,([uint64]$MaxPrivateMiB * 1MB),[uint32]$ParentProcessId)
    Write-RunEvent 'started' @{ pid=$ownedJob.Pid; createdUtc=$ownedJob.CreatedUtc; createdFileTime=$ownedJob.CreatedFileTime; jobMemoryLimitBytes=$ownedJob.MemoryLimitBytes; parentPid=$ownedJob.ParentPid; parentCreatedFileTime=$ownedJob.ParentCreatedFileTime }
    Write-Host "Bounded process $($ownedJob.Pid) started; memory log: $runLogPath"
    Write-Host "Process output: $runOutputPath"
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($true) {
      Write-IncrementalOutput
      $systemSample = [KotobaBoundedRunV1.Job]::ReadSystem()
      $members = @($ownedJob.Members())
      [uint64]$privateBytes = 0
      foreach ($member in $members) { $privateBytes += $member.PrivateBytes }
      Write-RunEvent 'sample' @{ elapsedSeconds=[math]::Round($timer.Elapsed.TotalSeconds,2); system=$systemSample; privateBytes=$privateBytes; processes=$members }
      if ($ownedJob.RootExited) { $runStopReason='root-exited'; $runExitCode=[int]$ownedJob.RootExitCode; break }
      if ($ownedJob.ParentExited) { $runStopReason='launcher-parent-exited'; $runExitCode=124; break }
      if ((Get-Item -LiteralPath $runOutputPath).Length -ge ([long]$MaxOutputMiB * 1MB)) { $runStopReason='output-log-limit'; $runExitCode=124; break }
      if ((Get-Item -LiteralPath $runLogPath).Length -ge 16MB) { $runStopReason='diagnostic-log-limit'; $runExitCode=124; break }
      if ($privateBytes -ge ([uint64]$MaxPrivateMiB * 1MB * 0.95)) { $runStopReason='job-memory-near-limit'; $runExitCode=124; break }
      if ($systemSample.CommitPercent -ge $MaxCommitPercent) { $runStopReason='system-commit-threshold'; $runExitCode=124; break }
      if ($systemSample.AvailableBytes -lt ([uint64]$MinAvailableMiB * 1MB)) { $runStopReason='system-available-threshold'; $runExitCode=124; break }
      if ($timer.Elapsed.TotalSeconds -ge $TimeoutSeconds) { $runStopReason='timeout'; $runExitCode=124; break }
      Start-Sleep -Milliseconds ([int][math]::Min($SampleSeconds * 1000,[math]::Max(50,($TimeoutSeconds-$timer.Elapsed.TotalSeconds)*1000)))
    }
    # Flush reason before termination; no unowned processes are touched.
    Write-RunEvent 'stopping' @{ reason=$runStopReason; exitCode=$runExitCode }
    $ownedJob.Stop([uint32]124)
  }
} catch {
  $runExitCode = 125
  $runStopReason = 'guard-error'
  try { Write-RunEvent 'error' @{ reason=$runStopReason; message=$_.Exception.Message } } catch { }
  Write-Error -ErrorRecord $_ -ErrorAction Continue
} finally {
  if ($null -ne $ownedJob) { $ownedJob.Dispose() }
  try { Write-IncrementalOutput } catch { }
  # Sampling may overshoot the output ceiling briefly. Once our job is closed,
  # retain at most the configured number of bytes without reading it into RAM.
  try {
    if (Test-Path -LiteralPath $runOutputPath -PathType Leaf) {
      $finalOutput=[IO.FileStream]::new($runOutputPath,[IO.FileMode]::Open,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
      try {
        if ($finalOutput.Length -gt ([long]$MaxOutputMiB * 1MB)) {
          $originalOutputBytes=$finalOutput.Length
          $finalOutput.SetLength([long]$MaxOutputMiB * 1MB)
          $finalOutput.Flush($true)
          Write-RunEvent 'output-truncated' @{ originalBytes=$originalOutputBytes; retainedBytes=([long]$MaxOutputMiB*1MB) }
        }
      } finally { $finalOutput.Dispose() }
    }
  } catch { }
  try { Write-RunEvent 'closed' @{ reason=$runStopReason; exitCode=$runExitCode } } catch { }
}
Write-Host "Bounded run ended: $runStopReason (exit $runExitCode)."
exit $runExitCode
