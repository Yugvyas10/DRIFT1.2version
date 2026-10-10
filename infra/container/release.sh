#!/bin/sh
# The migration job (ADR-0009): applies the committed migrations. infra/azure/deploy.sh runs it, and waits for it
# to succeed, before it rolls out the new image.
set -eu
cd /app/packages/db
exec ./node_modules/.bin/prisma migrate deploy
