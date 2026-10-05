#!/bin/sh
# The `worker` process group (fly.toml, ADR-0008). Arguments are passed on: `worker.sh --check` probes the
# database, Redis and storage and exits.
set -eu
cd /app/apps/worker
exec node dist/main.js "$@"
