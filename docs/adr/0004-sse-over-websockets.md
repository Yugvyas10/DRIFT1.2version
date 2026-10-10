# ADR-0004: Server-Sent Events instead of WebSockets for live runs

Status: Accepted (2026-09-26)
Date: 2026-09-26
Owner: P3

## Context

Deck objective 5 asks for real-time pipeline state and names WebSockets. The traffic is one-way (server → browser: stage started/finished, metrics, logs). The web app may run on hosts that do not support long-lived WebSocket upgrades.

## Decision

- **SSE** at `GET /api/v1/runs/{id}/events`, with the same auth and org scoping as every other route.
- **Fan-out:** the worker publishes run events to Redis pub/sub channel `run:{id}`. Each web instance holds one subscriber connection and fans out to its SSE clients.
- **Resume:** each event is also appended to a Redis Stream `run:{id}:events` (capped with `MAXLEN`, TTL after the run ends). Stream entry ids are the SSE `id:`. On reconnect, the browser sends `Last-Event-ID`. The server replays newer entries with `XRANGE`, then switches to live pub/sub. Pub/sub alone has no history, so the Stream is what makes resume possible.
- Heartbeat comments every ~15 s keep proxies from closing idle connections.

## Alternatives considered

- **WebSockets.** Bidirectional, which we do not need. They need upgrade support on the host and our own reconnect/resume logic.
- **Polling.** Simple, but it lags and multiplies DB load.
- **Redis Streams only (`XREAD BLOCK` per client).** Each client would hold a blocking Redis connection, so the design does not scale with viewers.

## Consequences

- Browsers reconnect automatically (`EventSource`) and resume without gaps.
- Commands (e.g. "re-run stage") are ordinary authenticated POSTs, not socket messages.

## Questions an examiner might ask

- _What happens if the web server restarts mid-run?_ The browser reconnects with `Last-Event-ID`, and missed events are replayed from the Stream.
- _Why both pub/sub and a Stream?_ Pub/sub gives cheap live fan-out; the Stream gives replay for reconnects.
