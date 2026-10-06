$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$helper = Join-Path $PSScriptRoot '..\..\scripts\windows\agent-presence-predicate.ps1'
. $helper

$agentStartedAt = [DateTimeOffset]'2026-09-23T03:00:00.000Z'
$first = [pscustomobject]@{
  status = 'online'
  connectionId = 'connection-1'
  lastHeartbeatAt = '2026-09-23T02:59:59.000Z'
}
$second = [pscustomobject]@{
  status = 'online'
  connectionId = 'connection-1'
  lastHeartbeatAt = '2026-09-23T03:00:05.000Z'
}

# The old process-start timestamp gate rejects this online presence even
# though the official registry is about to publish a newer heartbeat.
$oldAccepted = $first.status -eq 'online' -and
  -not [string]::IsNullOrWhiteSpace([string]$first.connectionId) -and
  -not [string]::IsNullOrWhiteSpace([string]$first.lastHeartbeatAt) -and
  ([DateTimeOffset]::Parse($first.lastHeartbeatAt) -gt $agentStartedAt)
if ($oldAccepted) { throw 'regression fixture did not exercise the old timestamp rejection' }

if (-not (Test-AgentPresenceSnapshot $first)) { throw 'online presence was rejected' }
if (-not (Test-AgentPresenceSnapshot $second)) { throw 'advanced online presence was rejected' }
if ($first.connectionId -ne $second.connectionId) { throw 'connection identity changed in fixture' }
if ([DateTimeOffset]::Parse($second.lastHeartbeatAt) -le [DateTimeOffset]::Parse($first.lastHeartbeatAt)) {
  throw 'heartbeat did not advance in fixture'
}

foreach ($invalid in @(
  [pscustomobject]@{ status = 'offline'; connectionId = 'connection-1'; lastHeartbeatAt = $second.lastHeartbeatAt },
  [pscustomobject]@{ status = 'online'; connectionId = ''; lastHeartbeatAt = $second.lastHeartbeatAt },
  [pscustomobject]@{ status = 'online'; connectionId = 'connection-1'; lastHeartbeatAt = '' }
)) {
  if (Test-AgentPresenceSnapshot $invalid) { throw 'invalid presence was accepted' }
}

Write-Output 'PASS: Agent presence validation does not require heartbeat newer than process start and still requires online identity fields.'
