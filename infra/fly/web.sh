#!/bin/sh
# The `web` process group (fly.toml, ADR-0008): the Next.js server on the port Fly's proxy sends traffic to.
set -eu
cd /app/apps/web
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
