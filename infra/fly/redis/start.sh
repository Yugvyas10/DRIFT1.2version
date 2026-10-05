#!/bin/sh
# Starts Redis for the DRIFT platform (ADR-0008, SECURITY T42). The password comes from the REDIS_PASSWORD secret
# and goes into a config file only the redis user can read, never onto the command line, where `ps` shows it.
set -eu

if [ -z "${REDIS_PASSWORD:-}" ]; then
  echo "REDIS_PASSWORD is not set. Set it with: fly secrets set REDIS_PASSWORD=\$(openssl rand -hex 32)" >&2
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
# Written at start by drift-redis-start (infra/fly/redis/start.sh).
# Every interface, IPv4 and IPv6: Fly's private network is IPv6. The app has no public service.
bind * -::*
port 6379
requirepass $REDIS_PASSWORD
# On the Fly volume, so the queue and the event history survive a restart.
dir /data
appendonly yes
appendfsync everysec
# BullMQ needs every key kept: at the limit Redis refuses writes rather than evicting jobs.
maxmemory ${REDIS_MAXMEMORY:-256mb}
maxmemory-policy noeviction
CONF
chown redis:redis "$conf"
# The image's entrypoint takes ownership of /data and drops to the redis user.
exec docker-entrypoint.sh redis-server "$conf"
