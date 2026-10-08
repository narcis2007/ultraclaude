param([Parameter(Mandatory = $true)][int]$TargetProcessId)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class UltraclaudeJob {
  [StructLayout(LayoutKind.Sequential)] public struct Basic {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Io {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Extended {
    public Basic BasicLimitInformation;
    public Io IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job, int info, ref Extended data, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$taskJobHandle = [UltraclaudeJob]::CreateJobObject([IntPtr]::Zero, $null)
$taskProcessHandle = [IntPtr]::Zero
try {
  if ($taskJobHandle -eq [IntPtr]::Zero) { throw 'CreateJobObject failed' }
  $taskLimits = New-Object UltraclaudeJob+Extended
  $taskBasicLimits = $taskLimits.BasicLimitInformation
  $taskBasicLimits.LimitFlags = 0x2000
  $taskLimits.BasicLimitInformation = $taskBasicLimits
  $taskSize = [Runtime.InteropServices.Marshal]::SizeOf($taskLimits)
  if (-not [UltraclaudeJob]::SetInformationJobObject($taskJobHandle, 9, [ref]$taskLimits, $taskSize)) { throw 'SetInformationJobObject failed' }
  $taskProcessHandle = [UltraclaudeJob]::OpenProcess(0x0101, $false, $TargetProcessId)
  if ($taskProcessHandle -eq [IntPtr]::Zero -or -not [UltraclaudeJob]::AssignProcessToJobObject($taskJobHandle, $taskProcessHandle)) { throw 'AssignProcessToJobObject failed' }
  [Console]::Out.WriteLine('READY')
  [Console]::Out.Flush()
  [Console]::In.ReadToEnd() | Out-Null
} finally {
  if ($taskProcessHandle -ne [IntPtr]::Zero) { [UltraclaudeJob]::CloseHandle($taskProcessHandle) | Out-Null }
  if ($taskJobHandle -ne [IntPtr]::Zero) { [UltraclaudeJob]::CloseHandle($taskJobHandle) | Out-Null }
}
