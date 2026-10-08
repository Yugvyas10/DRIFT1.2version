#!/bin/sh
# The worker container (ADR-0009). Arguments are passed on: `worker.sh --check` probes the database, Redis and
# storage and exits.
set -eu
cd /app/apps/worker
exec node dist/main.js "$@"
