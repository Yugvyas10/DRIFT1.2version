# Redis for the DRIFT platform on Fly.io (ADR-0008): the version of local development (infra/docker-compose.yml),
# pinned by digest (SECURITY T2), with its data on a Fly volume and its password from a Fly secret.
FROM redis:8.8.3-alpine@sha256:0b2b77d3ea5078274795e3177cdbdada8b96316684a38911d528534ed679b5ec
COPY --chmod=0755 start.sh /usr/local/bin/drift-redis-start
CMD ["drift-redis-start"]
