param([Parameter(Mandatory=$true)][string]$PipelineResultJson)
$data = Get-Content $PipelineResultJson -Raw | ConvertFrom-Json
if ($data.status -ne 'NOMINAL' -or $data.verdict -ne 'RELEASE_UNLOCKED') { throw "RELEASE BLOCKED: status=$($data.status) verdict=$($data.verdict)" }
Write-Host 'RELEASE GATE: NOMINAL / RELEASE_UNLOCKED'
