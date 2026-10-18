# Online room server deployment samples

These files are examples. No service, container, DNS record, certificate, public endpoint or firewall change has been installed by this work.

## One endpoint, multiple room workers

`server/room-cluster.mjs` is the deployment entrypoint. A lightweight primary process owns the single HTTP/WebSocket listener. It sends each new WebSocket connection to the least-connected ready worker, reserving capacity before the handoff. After the handshake, that worker owns the socket directly: gameplay packets do not pass through the primary and are not broadcast across workers. Workers have no listening ports. The same `/ws` URL works with one or several workers; nginx needs one upstream, no sticky-session cookies and no worker URL routing.

Each worker owns its own in-memory rooms, players and seat maps. Room capacity remains 20. Room and player IDs include a unique worker-incarnation ID, and rooms are never merged across processes. With several workers there can be a partially filled room on each worker. Do not expect one globally packed room list.

The supplied production configuration is four workers, each capped at 500 connections and 25 rooms: a configured ceiling of 2,000 connections and 100 rooms. These caps are admission limits, not demonstrated throughput, RAM, CPU or bandwidth capacity. The primary adds one process, so the example starts five Node processes. Size the worker count and limits for measured resources on the target machine; four workers do not imply that a one-core VPS can serve four times as much load.

| Variable | Development default | Production example | Meaning |
| --- | ---: | ---: | --- |
| `HOST` | `127.0.0.1` | `127.0.0.1` | Single primary listener; Docker overrides to `0.0.0.0` inside its container only |
| `PORT` | `8082` | `8081` | Single HTTP/WSS-upstream port |
| `WORKERS` | `1` | `4` | Worker processes, integer 1–64 |
| `MAX_CONNECTIONS_PER_WORKER` | `500` | `500` | Open WebSockets, including clients that have not joined yet |
| `MAX_ROOMS_PER_WORKER` | `25` | `25` | Process-local rooms, at most 20 players each |
| `ALLOWED_ORIGINS` | empty | actual game origins | Comma-separated allowed browser origins |

Use these per-worker variables with the launcher. The standalone `server/room-server.mjs` / `npm run server:single` entrypoint remains available for focused tests and diagnostics; its legacy `MAX_CONNECTIONS` and `MAX_ROOMS` variables are not launcher configuration. Do not combine the two sets of caps.

### Disconnects and failure recovery

Room state is ephemeral. Every reconnect creates a new player identity and joins any available room, possibly on a different worker. It does not resume a previous room, display number or desk reservation. Existing client recovery must request a desk again; the old socket releases its desk on disconnect/heartbeat timeout. There is no account/session resume token and no cross-worker room migration.

A crashed worker disconnects its own players and loses its own rooms. The primary leaves other workers' sockets running and starts a replacement with a new worker ID. Restart attempts back off up to five seconds to avoid a tight crash loop. A primary/service restart disconnects everyone. Worker shutdown is bounded; normal service termination asks workers to close, then kills unresponsive children after five seconds. systemd/Docker give the primary 15 seconds before their own forced cleanup.

`GET /health` is served by the primary and refreshes worker counters over IPC. It returns aggregate `players`, `rooms`, `connections`, the 20-player room `capacity`, `configuredWorkers`, `readyWorkers`, per-worker counts/availability, and configured limits. HTTP 200 means all configured workers are responsive; HTTP 503 means shutdown, an unavailable worker, or an IPC metrics timeout. Healthy workers can still accept connections during a replacement. A full but healthy service still returns health 200 and rejects new upgrades with HTTP 503. Worker counters describe snapshots observed independently, not one atomic cross-process transaction. While a worker is unavailable, `partial` is true, its player/room counts are null, and the aggregate player/room totals cover responsive workers only; connection counts retain known socket reservations until close/exit. No shell, deployment, save, economy or global leaderboard API is exposed.

## Native Node + systemd

Use supported Node 22 and install production dependencies with `npm ci --omit=dev --ignore-scripts`. Copy the project to `/opt/obby-cargo-delivery`, create a system account named `obby-online`, and allow it to read the directory. Copy `obby-online.env.example` to `/etc/obby-online.env` and set the actual game origins, host, port and desired worker count. Copy `obby-online.service` to `/etc/systemd/system/`, then review the paths before enabling the unit. It uses the same cluster entrypoint as `npm run server` and Docker.

The sample binds only `127.0.0.1:8081`. `ALLOWED_ORIGINS` accepts exact origins such as `https://game.example.com` or scheme-bound subdomain patterns such as `https://*.hosting.example.com`. Do not include paths or trailing slashes. For a Yandex draft or portal build, inspect the actual game's iframe origin and explicitly add the required hosting origin/suffix. Do not put account credentials or purchase keys in this file. An empty list disables browser-origin filtering for local development; set a nonempty list in production. Requests without an Origin header are accepted for native clients; origin filtering is not account authentication.

Use `nginx-online.conf` at nginx `http {}` scope, replacing the domain, certificate paths and static build root. The public game endpoint is `wss://YOUR_DOMAIN/ws`; nginx terminates TLS and forwards Upgrade to the one private primary listener. Set `PUBLIC_MULTIPLAYER_URL` to that public endpoint when building the game. Keep the same endpoint for both Yandex and VK builds when they should use the same room service. The VK purchase API remains an independent service and database; do not run that API through the room-worker launcher.

Example foreground invocation after reviewing the environment file:

```sh
node --env-file=/etc/obby-online.env server/room-cluster.mjs
```

Local development stays `npm run server` with one worker on loopback port 8082. To exercise the production process layout without opening a public port:

```sh
HOST=127.0.0.1 PORT=8082 WORKERS=4 MAX_CONNECTIONS_PER_WORKER=500 MAX_ROOMS_PER_WORKER=25 npm run server
```

Validate before enabling any service:

```sh
npm run test:online:hosting
npm run test:online
nginx -t
systemd-analyze verify deployment/obby-online.service
```

After a separately approved installation, verify `/health`, establish a real WSS browser session, and check roster updates, room isolation, seats, disconnect/reconnect and browser console errors. The templates and loopback tests do not prove public TLS/network reachability.

## Optional Docker

Copy the sample environment to `deployment/obby-online.env` and update origins and limits. Review, then build/start with `docker compose -f deployment/compose.online.yaml up --build -d`. The image starts the same primary and worker processes as systemd. Its listener binds inside the container, while Compose publishes only `127.0.0.1:8081` on the host. The same host nginx sample handles TLS; no per-worker port mappings are necessary.

The image includes production dependencies, the two room-service entrypoint modules, and all shared top-level `dist/*.js` modules. Copying shared JavaScript as a set avoids an incomplete hand-maintained import allowlist; browser models, textures and audio are not included. A build-time import smoke check verifies the server dependency graph. The room service no longer imports the server drift verifier. `tests/online-server-packaging.mjs` creates an isolated Docker-equivalent module tree, starts real workers and checks health, WebSocket join and shutdown. That test does not substitute for an actual Docker build on a Docker-capable host.

## Measured load and limits

Run the local harness with the options documented in its current report; `npm run stress:online` runs the configured load levels. Store the command, server process count, client mix, versions, duration and host conditions with the results. Separate primary/worker CPU and RSS from load-generator CPU and RSS. Count complete binary state updates and roster/full-baseline messages separately, and compare actual delivered cadence with the intended adaptive cadence.

Use the fresh results under [qa/network-optimization](../qa/network-optimization/) when available. The older [online-release report](../qa/online-release/README.md) measured the former full-JSON, single-process implementation and is historical evidence, not a benchmark for this architecture. No local test establishes a public VPS capacity guarantee. In particular, 2,000 configured connections require target-host and realistic-network testing before being treated as a production limit.

All workers retain bounded payloads, message-rate limits, join/heartbeat timeouts, and outbound-backpressure controls from the room server. Compression remains disabled. Watch health, per-worker saturation, restart logs, event-loop delay, message/byte rates and slow-client disconnects when choosing deployment caps. Raising a connection or room cap does not add CPU, memory or network capacity.
