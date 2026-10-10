#!/bin/sh
# The web container (ADR-0009): the Next.js server on the port the platform's ingress sends traffic to.
set -eu
cd /app/apps/web
exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
