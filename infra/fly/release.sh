#!/bin/sh
# Fly's release command (fly.toml, ADR-0008): applies the committed migrations before any Machine runs the new
# image. A failure stops the deploy.
set -eu
cd /app/packages/db
exec ./node_modules/.bin/prisma migrate deploy
