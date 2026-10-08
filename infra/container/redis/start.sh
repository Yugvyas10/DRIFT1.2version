#!/bin/sh
# Starts Redis as a sidecar of the web and worker containers (ADR-0009, SECURITY T42). It listens on the loopback
# interface only, which the containers of one app share. The password comes from REDIS_PASSWORD and goes into a
# config file only the redis user can read, never onto the command line, where `ps` shows it.
set -eu

if [ -z "${REDIS_PASSWORD:-}" ]; then
  echo "REDIS_PASSWORD is not set (openssl rand -hex 32)" >&2
  exit 1
fi
case "$REDIS_PASSWORD" in
  *[!0-9A-Za-z]*)
    echo "REDIS_PASSWORD must be letters and digits only (openssl rand -hex 32)" >&2
    exit 1
    ;;
esac
if [ "${#REDIS_PASSWORD}" -lt 32 ]; then
  echo "REDIS_PASSWORD must be at least 32 characters (openssl rand -hex 32)" >&2
  exit 1
fi

conf=/tmp/redis.conf
umask 077
cat >"$conf" <<CONF
# Written at start by drift-redis-start (infra/container/redis/start.sh).
# Loopback only: the web and worker containers of the same app reach it at 127.0.0.1; nothing else can.
bind 127.0.0.1 -::1
port 6379
requirepass $REDIS_PASSWORD
# No persistence: the container has no lasting disk, and Redis holds only the queue, recent run events, rate
# limits and worker slots. Results live in Postgres and object storage.
save ""
appendonly no
# BullMQ needs every key kept: at the limit Redis refuses writes rather than evicting jobs.
maxmemory ${REDIS_MAXMEMORY:-256mb}
maxmemory-policy noeviction
CONF
chown redis:redis "$conf"
# The image's entrypoint drops to the redis user.
exec docker-entrypoint.sh redis-server "$conf"
