# Redis for the DRIFT platform (ADR-0009): a sidecar of the web and worker containers, at the version of local
# development (infra/docker-compose.yml), pinned by digest (SECURITY T2).
FROM redis:8.8.3-alpine@sha256:0b2b77d3ea5078274795e3177cdbdada8b96316684a38911d528534ed679b5ec
COPY --chmod=0755 start.sh /usr/local/bin/drift-redis-start
CMD ["drift-redis-start"]
