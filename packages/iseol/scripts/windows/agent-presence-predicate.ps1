function Test-AgentPresenceSnapshot {
  param(
    [AllowNull()]
    [object]$Candidate
  )

  if ($null -eq $Candidate) { return $false }
  return $Candidate.status -eq 'online' -and
    -not [string]::IsNullOrWhiteSpace([string]$Candidate.connectionId) -and
    -not [string]::IsNullOrWhiteSpace([string]$Candidate.lastHeartbeatAt)
}
