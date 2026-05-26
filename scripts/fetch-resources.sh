#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

clone_if_missing() {
  local dir="$1"
  local url="$2"
  if [[ -d "$dir/.git" ]]; then
    echo "skip $dir (already cloned)"
    return
  fi
  if [[ -e "$dir" ]]; then
    echo "error: $dir exists but is not a git clone; remove it and re-run" >&2
    exit 1
  fi
  echo "cloning $url -> $dir"
  git clone --depth 1 "$url" "$dir"
}

clone_if_missing workers-sdk https://github.com/cloudflare/workers-sdk.git
clone_if_missing baseten-cli https://github.com/basetenlabs/baseten-cli.git
clone_if_missing baseten-skills https://github.com/basetenlabs/baseten-skills.git

echo "done — see resources/README.md"
