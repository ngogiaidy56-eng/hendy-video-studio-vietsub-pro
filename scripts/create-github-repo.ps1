param(
  [ValidateSet('public','private')][string]$Visibility = 'private',
  [string]$Owner = 'ngogiaidy56-eng',
  [string]$Repository = 'hendy-server-video-studio-pro'
)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) is not installed. Install from https://cli.github.com/ and retry.' }
$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Run: gh auth login' }
if (-not (Test-Path '.git')) { git init -b main; if ($LASTEXITCODE -ne 0) { throw 'git init failed' } }
if ((git status --short) -or ((git log -1 2>$null) -eq $null)) {
  git add .
  if ($LASTEXITCODE -ne 0) { throw 'git add failed' }
  git commit -m 'feat: bootstrap Hendy Server Video Studio Pro monorepo'
  if ($LASTEXITCODE -ne 0) { throw 'git commit failed; configure user.name and user.email in Git first if required' }
}
$visibilityFlag = if ($Visibility -eq 'public') { '--public' } else { '--private' }
$remote = "https://github.com/$Owner/$Repository.git"
$exists = gh repo view "$Owner/$Repository" 2>$null
if ($LASTEXITCODE -eq 0) { throw "Repository $Owner/$Repository already exists; refusing to overwrite it." }
$create = gh repo create "$Owner/$Repository" $visibilityFlag --source=. --remote=origin --push
if ($LASTEXITCODE -ne 0) { throw 'gh repo create/push failed. Review the error above; existing remote content will not be deleted.' }
Write-Host "Repository created and pushed: https://github.com/$Owner/$Repository" -ForegroundColor Green
