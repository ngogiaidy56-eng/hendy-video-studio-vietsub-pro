#!/usr/bin/env bash
set -euo pipefail
OWNER="${GITHUB_OWNER:-ngogiaidy56-eng}"
REPO="${GITHUB_REPO:-hendy-server-video-studio-pro}"
VISIBILITY="${1:-private}"
case "$VISIBILITY" in public) FLAG=--public ;; private) FLAG=--private ;; *) echo 'Usage: scripts/create-github-repo.sh [public|private]' >&2; exit 2 ;; esac
command -v gh >/dev/null || { echo 'Install GitHub CLI: https://cli.github.com/' >&2; exit 1; }
gh auth status >/dev/null
gh repo view "$OWNER/$REPO" >/dev/null 2>&1 && { echo "Repository $OWNER/$REPO already exists; refusing to overwrite." >&2; exit 1; } || true
if [[ ! -d .git ]]; then git init -b main; fi
git add .
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then git commit -m 'feat: bootstrap Hendy Server Video Studio Pro monorepo'; fi
gh repo create "$OWNER/$REPO" "$FLAG" --source=. --remote=origin --push
echo "Created https://github.com/$OWNER/$REPO"
