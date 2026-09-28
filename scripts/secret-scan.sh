#!/bin/sh
# Secret scan with gitleaks (docs/SECURITY.md).
#   sh scripts/secret-scan.sh --staged   staged changes only (pre-commit hook)
#   sh scripts/secret-scan.sh            full git history (CI)
# Uses a local gitleaks binary if installed, otherwise the pinned Docker image.
set -eu

GITLEAKS_IMAGE="ghcr.io/gitleaks/gitleaks:v8.30.1"

if [ "${1:-}" = "--staged" ]; then
  set -- git --pre-commit --staged --redact --no-banner
else
  set -- git --redact --no-banner
fi

if command -v gitleaks >/dev/null 2>&1; then
  exec gitleaks "$@" .
fi

if docker info >/dev/null 2>&1; then
  exec docker run --rm -v "$PWD:/repo" -w /repo \
    -e GIT_CONFIG_COUNT=1 -e GIT_CONFIG_KEY_0=safe.directory -e GIT_CONFIG_VALUE_0=/repo \
    "$GITLEAKS_IMAGE" "$@" /repo
fi

echo "secret-scan: gitleaks not installed and Docker not running; skipped locally (CI always scans)." >&2
exit 0
