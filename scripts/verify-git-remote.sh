#!/usr/bin/env bash
# Fail fast if this directory is not the canonical hackathon repo.
set -euo pipefail

EXPECTED="https://github.com/rohannagpure45/hack-cloudflare-workers-starter.git"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git repository (cwd: $ROOT)" >&2
  echo "hint: open/clone https://github.com/rohannagpure45/hack-cloudflare-workers-starter" >&2
  exit 1
fi

URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ "$URL" != "$EXPECTED" ]]; then
  echo "error: origin is '$URL'" >&2
  echo "expected: $EXPECTED" >&2
  exit 1
fi

echo "ok: git root=$ROOT origin=$URL"
