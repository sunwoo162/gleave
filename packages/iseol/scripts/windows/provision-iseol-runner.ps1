#Requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$RepoRoot,
  [string]$WorkspaceRoot = "$env:ProgramData\Iseol\workspace",
  [Parameter(Mandatory)][string]$AgentUrl,
  [Parameter(Mandatory)][securestring]$AgentToken,
  [Parameter(Mandatory)][securestring]$RunnerPassword,
  [string]$RunnerUser = "IseolRunner",
  [string]$AgentId = "agent-live",
  [string[]]$PolicyRoots = @(),
  [string]$ProtectedProfileRoot = $env:USERPROFILE,
  [string]$InstallRoot = "$env:ProgramData\Iseol\agent",
  [string]$TaskName = "Iseol Desktop Agent"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsUnderPath([string]$Child, [string]$Parent) {
  $childFull = [IO.Path]::GetFullPath($Child).TrimEnd('\')
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
  return $childFull.StartsWith($parentFull + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $childFull.Equals($parentFull, [StringComparison]::OrdinalIgnoreCase)
}
function ConvertFrom-SecureValue([securestring]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

if (-not ("Iseol.NativeLsa" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
namespace Iseol { public static class NativeLsa {
  [StructLayout(LayoutKind.Sequential)] struct LSA_OBJECT_ATTRIBUTES { public uint Length; public IntPtr RootDirectory; public IntPtr ObjectName; public uint Attributes; public IntPtr SecurityDescriptor; public IntPtr SecurityQualityOfService; }
  [StructLayout(LayoutKind.Sequential)] struct LSA_UNICODE_STRING { public ushort Length; public ushort MaximumLength; public IntPtr Buffer; }
  [DllImport("advapi32.dll")] static extern uint LsaOpenPolicy(IntPtr SystemName, ref LSA_OBJECT_ATTRIBUTES ObjectAttributes, uint DesiredAccess, out IntPtr PolicyHandle);
  [DllImport("advapi32.dll")] static extern uint LsaAddAccountRights(IntPtr PolicyHandle, IntPtr AccountSid, LSA_UNICODE_STRING[] UserRights, uint CountOfRights);
  [DllImport("advapi32.dll")] static extern uint LsaNtStatusToWinError(uint Status); [DllImport("advapi32.dll")] static extern uint LsaClose(IntPtr PolicyHandle);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LogonUser(string username, string domain, string password, int logonType, int logonProvider, out IntPtr token);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  const int LOGON32_LOGON_BATCH = 4;
  public static void AddAccountRight(string sidValue, string right) { var sid = new SecurityIdentifier(sidValue); var bytes = new byte[sid.BinaryLength]; sid.GetBinaryForm(bytes,0); var pin = GCHandle.Alloc(bytes,GCHandleType.Pinned); IntPtr policy = IntPtr.Zero, text = IntPtr.Zero; try { var oa = new LSA_OBJECT_ATTRIBUTES(); oa.Length=(uint)Marshal.SizeOf(oa); uint status=LsaOpenPolicy(IntPtr.Zero,ref oa,0x00000810,out policy); if(status!=0) throw new Win32Exception((int)LsaNtStatusToWinError(status)); text=Marshal.StringToHGlobalUni(right); var u=new LSA_UNICODE_STRING{Length=(ushort)(right.Length*2),MaximumLength=(ushort)((right.Length+1)*2),Buffer=text}; status=LsaAddAccountRights(policy,pin.AddrOfPinnedObject(),new[]{u},1); if(status!=0) throw new Win32Exception((int)LsaNtStatusToWinError(status)); } finally { if(text!=IntPtr.Zero) Marshal.FreeHGlobal(text); if(policy!=IntPtr.Zero) LsaClose(policy); if(pin.IsAllocated) pin.Free(); } }
  public static void AssertBatchLogon(string username, string domain, string password) { IntPtr token = IntPtr.Zero; try { if(!LogonUser(username, domain, password, LOGON32_LOGON_BATCH, 0, out token)) throw new Win32Exception(Marshal.GetLastWin32Error()); } finally { if(token != IntPtr.Zero) CloseHandle(token); } }
} }
'@
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$ProtectedProfileRoot = (Resolve-Path -LiteralPath $ProtectedProfileRoot).Path
$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$IseolRoot = Split-Path -Parent $WorkspaceRoot
if (-not (Test-IsUnderPath $InstallRoot $IseolRoot)) {
  throw "InstallRoot must stay under IseolRoot: $IseolRoot"
}
if (Test-IsUnderPath $WorkspaceRoot $ProtectedProfileRoot) {
  throw "WorkspaceRoot must be outside the protected user profile: $ProtectedProfileRoot"
}
if (Test-IsUnderPath $InstallRoot $ProtectedProfileRoot) {
  throw "InstallRoot must be outside the protected user profile: $ProtectedProfileRoot"
}
if ($RunnerUser -ieq $env:USERNAME) {
  throw "RunnerUser must be a dedicated account, not the interactive user"
}

$distSource = Join-Path $RepoRoot "dist"
$packageSource = Join-Path $RepoRoot "package.json"
$lockSource = Join-Path $RepoRoot "package-lock.json"
$globalPolicy = Join-Path $RepoRoot "docs\HARNESS_ENGINEERING.md"
if (-not (Test-Path -LiteralPath (Join-Path $distSource "desktop-agent\main.js") -PathType Leaf)) {
  throw "Build the repository before provisioning; dist/desktop-agent/main.js is missing"
}
if (-not (Test-Path -LiteralPath $packageSource -PathType Leaf) -or
    -not (Test-Path -LiteralPath $lockSource -PathType Leaf)) {
  throw "package.json and package-lock.json are required"
}

$principal = "$env:COMPUTERNAME\$RunnerUser"
$runner = Get-LocalUser -Name $RunnerUser -ErrorAction SilentlyContinue
if (-not $runner) {
  if (-not $PSCmdlet.ShouldProcess($RunnerUser, "Create least-privilege local runner account")) { return }
  New-LocalUser -Name $RunnerUser -Password $RunnerPassword -PasswordNeverExpires `
    -UserMayNotChangePassword -Description "Iseol least-privilege Desktop Agent runner" | Out-Null
} elseif ($PSCmdlet.ShouldProcess($RunnerUser, "Rotate runner account password")) {
  Set-LocalUser -Name $RunnerUser -Password $RunnerPassword -PasswordNeverExpires $true
}
$runner = Get-LocalUser -Name $RunnerUser -ErrorAction Stop
$runnerSid = $runner.SID.Value
if ($PSCmdlet.ShouldProcess($principal, "Grant SeBatchLogonRight for scheduled task execution")) {
  [Iseol.NativeLsa]::AddAccountRight($runnerSid, "SeBatchLogonRight")
}
$batchPasswordPlain = ConvertFrom-SecureValue $RunnerPassword
try {
  [Iseol.NativeLsa]::AssertBatchLogon($RunnerUser, $env:COMPUTERNAME, $batchPasswordPlain)
} finally {
  $batchPasswordPlain = $null
}

$privilegedGroupSids = @("S-1-5-32-544", "S-1-5-32-547", "S-1-5-32-551")
foreach ($groupSid in $privilegedGroupSids) {
  $group = Get-LocalGroup -SID $groupSid -ErrorAction Stop
  $member = Get-LocalGroupMember -Group $group.Name -ErrorAction Stop |
    Where-Object { $_.SID.Value -eq $runnerSid }
  if ($member -and $PSCmdlet.ShouldProcess($principal, "Remove from privileged group $($group.Name)")) {
    Remove-LocalGroupMember -Group $group.Name -Member $principal
  }
}
$usersGroup = Get-LocalGroup -SID "S-1-5-32-545"
$userMember = Get-LocalGroupMember -Group $usersGroup.Name -ErrorAction Stop |
  Where-Object { $_.SID.Value -eq $runnerSid }
if (-not $userMember -and $PSCmdlet.ShouldProcess($principal, "Add to standard Users group")) {
  Add-LocalGroupMember -Group $usersGroup.Name -Member $principal
}

$unsafeProfileSids = @($runnerSid, "S-1-5-32-545", "S-1-5-11", "S-1-1-0")
$profileAcl = Get-Acl -LiteralPath $ProtectedProfileRoot
foreach ($rule in $profileAcl.Access) {
  try {
    $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  } catch {
    continue
  }
  if ($unsafeProfileSids -contains $sid -and
      $rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow) {
    throw "Protected user profile is not default-deny for the runner: $($rule.IdentityReference)"
  }
}

$ownerPrincipal = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($PSCmdlet.ShouldProcess($IseolRoot, "Lock Iseol container and grant runner traverse-only access")) {
  New-Item -ItemType Directory -Force -Path $IseolRoot | Out-Null
  & icacls.exe $IseolRoot /inheritance:r | Out-Null
  & icacls.exe $IseolRoot /grant:r `
    "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "${ownerPrincipal}:(OI)(CI)F" "${principal}:(RX)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to lock Iseol container ACL" }
}
if ($PSCmdlet.ShouldProcess($WorkspaceRoot, "Create restricted workspace and grant runner Modify access")) {
  New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null
  & icacls.exe $WorkspaceRoot /inheritance:r | Out-Null
  & icacls.exe $WorkspaceRoot /grant:r `
    "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" `
    "${ownerPrincipal}:(OI)(CI)F" "${principal}:(OI)(CI)M" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to grant bounded workspace ACL" }
}
$allPolicyRoots = @($PolicyRoots)
if (Test-Path -LiteralPath $globalPolicy -PathType Leaf) { $allPolicyRoots += $globalPolicy }
$resolvedPolicyRoots = @()
foreach ($policyRoot in ($allPolicyRoots | Select-Object -Unique)) {
  $resolvedPolicy = (Resolve-Path -LiteralPath $policyRoot).Path
  $isFile = Test-Path -LiteralPath $resolvedPolicy -PathType Leaf
  if ((Test-IsUnderPath $resolvedPolicy $ProtectedProfileRoot) -and -not $isFile) {
    throw "Policy access inside the protected user profile must target an exact file: $resolvedPolicy"
  }
  if ($PSCmdlet.ShouldProcess($resolvedPolicy, "Grant bounded runner policy read access")) {
    if ($isFile) {
      & icacls.exe $resolvedPolicy /grant:r "${principal}:R" /C | Out-Null
    } else {
      & icacls.exe $resolvedPolicy /grant:r "${principal}:(OI)(CI)RX" /T /C | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw "Failed to grant policy ACL: $resolvedPolicy" }
  }
  $resolvedPolicyRoots += $resolvedPolicy
}

if ($PSCmdlet.ShouldProcess($InstallRoot, "Install isolated Desktop Agent runtime")) {
  New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
  $distTarget = Join-Path $InstallRoot "dist"
  if (Test-Path -LiteralPath $distTarget) { Remove-Item -LiteralPath $distTarget -Recurse -Force }
  Copy-Item -LiteralPath $distSource -Destination $distTarget -Recurse -Force
  Copy-Item -LiteralPath $packageSource -Destination (Join-Path $InstallRoot "package.json") -Force
  Copy-Item -LiteralPath $lockSource -Destination (Join-Path $InstallRoot "package-lock.json") -Force
  Copy-Item -LiteralPath (Join-Path $RepoRoot "scripts\windows\start-iseol-agent.ps1") `
    -Destination (Join-Path $InstallRoot "start-iseol-agent.ps1") -Force
}
$npm = Get-Command npm.cmd -ErrorAction Stop
Push-Location $InstallRoot
try {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $npmOutput = & $npm.Source ci --omit=dev --ignore-scripts --no-audit --no-fund 2>&1
    $npmExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $npmOutput | ForEach-Object { Write-Output $_ }
  if ($npmExitCode -ne 0) { throw "npm ci for isolated Agent runtime failed" }
} finally {
  Pop-Location
}

$tokenPlain = ConvertFrom-SecureValue $AgentToken
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ($tokenPlain.Contains("`r") -or $tokenPlain.Contains("`n")) {
  throw "Agent token must be single-line"
}
$configLines = @(
  "ISEOL_DESKTOP_AGENT_URL=$AgentUrl",
  "ISEOL_DESKTOP_AGENT_TOKEN=$tokenPlain",
  "ISEOL_DESKTOP_AGENT_ID=$AgentId",
  "ISEOL_DESKTOP_AGENT_WORKSPACE_ROOTS=$WorkspaceRoot",
  "ISEOL_DESKTOP_AGENT_POLICY_ROOTS=$($resolvedPolicyRoots -join ';')",
  "ISEOL_DESKTOP_AGENT_REQUIRED_OS_USER=$RunnerUser",
  "ISEOL_NODE_EXE=$node"
)
$configPath = Join-Path $InstallRoot "agent.env"
if ($PSCmdlet.ShouldProcess($configPath, "Write restricted Agent configuration")) {
  [IO.File]::WriteAllLines($configPath, $configLines, [Text.UTF8Encoding]::new($false))
}
$tokenPlain = $null
if ($PSCmdlet.ShouldProcess($InstallRoot, "Lock Agent install ACL")) {
  & icacls.exe $InstallRoot /inheritance:r | Out-Null
  & icacls.exe $InstallRoot /grant:r `
    "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" `
    "${ownerPrincipal}:(OI)(CI)F" "${principal}:(OI)(CI)RX" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to lock Agent install ACL" }
}

$launcher = Join-Path $InstallRoot "start-iseol-agent.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$runnerPlain = ConvertFrom-SecureValue $RunnerPassword
try {
  if ($PSCmdlet.ShouldProcess($TaskName, "Register limited runner scheduled task")) {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
      -User $principal -Password $runnerPlain -RunLevel Limited -Force | Out-Null
  }
} finally {
  $runnerPlain = $null
}
if ($PSCmdlet.ShouldProcess($RunnerUser, "Enable runner account")) {
  Enable-LocalUser -Name $RunnerUser
}
foreach ($groupSid in $privilegedGroupSids) {
  $group = Get-LocalGroup -SID $groupSid -ErrorAction Stop
  if (Get-LocalGroupMember -Group $group.Name -ErrorAction Stop |
      Where-Object { $_.SID.Value -eq $runnerSid }) {
    throw "Runner must not be a member of privileged group: $($group.Name)"
  }
}
if ($PSCmdlet.ShouldProcess($TaskName, "Start least-privilege Desktop Agent")) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $taskStopped = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if ($task.State -ne "Running") { $taskStopped = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $taskStopped) { throw "Desktop Agent scheduled task did not stop before restart" }
  Start-ScheduledTask -TaskName $TaskName
  $taskRunning = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if ($task.State -eq "Running") {
      $taskRunning = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $taskRunning) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction Stop
    throw "Desktop Agent scheduled task failed to stay Running; State=$($task.State); LogonType=$($task.Principal.LogonType); DisallowStartIfOnBatteries=$($task.Settings.DisallowStartIfOnBatteries); StopIfGoingOnBatteries=$($task.Settings.StopIfGoingOnBatteries); LastTaskResult=$($taskInfo.LastTaskResult)"
  }
}

Write-Output "ISEOL_RUNNER_USER=$principal"
Write-Output "ISEOL_RUNNER_WORKSPACE=$WorkspaceRoot"
Write-Output "ISEOL_RUNNER_INSTALL=$InstallRoot"
Write-Output "ISEOL_RUNNER_TASK=$TaskName"
Write-Output "ISEOL_RUNNER_PROFILE_PROTECTED=$ProtectedProfileRoot"
Write-Output "ISEOL_RUNNER_READY=true"
