# Online room server deployment samples

These files are examples; no service, container, DNS, certificate or public endpoint has been installed. The room server stores presence and seat ownership in memory only. Restarting it disconnects players, and reconnecting assigns a new identity and an available room. Run one server process for this deployment; independently balanced processes do not share rooms or seat maps.

## Native Node + systemd

Use supported Node 22 and install production dependencies with `npm ci --omit=dev --ignore-scripts`. Copy the project to `/opt/obby-cargo-delivery`, create a system account named `obby-online`, and allow it to read the directory. Copy `obby-online.env.example` to `/etc/obby-online.env` and set the actual game origins, host and port. Copy `obby-online.service` to `/etc/systemd/system/`, then review the paths before enabling the unit.

The sample binds `127.0.0.1:8081`. `ALLOWED_ORIGINS` is comma-separated and accepts exact origins such as `https://game.example.com` or scheme-bound subdomain patterns such as `https://*.hosting.example.com`. Do not include paths or trailing slashes. For a Yandex draft or portal build, inspect the actual game's iframe origin and explicitly add the required hosting origin/suffix for that environment. Do not put account credentials or Yandex purchase keys in this file. An empty list disables browser-origin filtering for local development; set a nonempty list in production. Requests without an Origin header are accepted for native clients; origin filtering is not account authentication.

Use `nginx-online.conf` at nginx `http {}` scope, after replacing the domain, certificate paths and static build root. The game endpoint is `wss://YOUR_DOMAIN/ws`; the reverse proxy terminates TLS and forwards WebSocket Upgrade to the private Node listener. Set the browser game's online URL to this public endpoint. The process answers `GET /health` with public readiness, player and room counts. No shell, deployment, save or economy API is exposed.

Validate before enabling any service:

```sh
node --test tests/online-server.mjs
node tests/online-server-stress.mjs
nginx -t
systemd-analyze verify deployment/obby-online.service
```

After the reviewed installation, verify `/health`, establish a real WSS browser session, and check room snapshots, seats, reconnects and browser console errors. The templates do not prove public TLS/network reachability.

## Optional Docker

Copy the sample environment to `deployment/obby-online.env` and update the allowed origins, then build/start `docker compose -f deployment/compose.online.yaml up --build -d`. The image contains only server code, runtime protocol/catalog modules and production dependencies. It exposes its listener to the host loopback interface; the same host nginx sample handles TLS. Docker is optional and is not needed for the native unit.

## Measured local load

```sh
node scripts/stress-online.mjs --users=100,200,500,1000 --duration=15
```

`--duration` is measured seconds at each level, excluding connection/seat setup; reconnect settling can extend the level slightly. User counts must be multiples of 20, with a maximum of 2000. Each level starts a separate server process and separate load-generator processes, with 100 clients per generator by default, fills exactly 20-player rooms, claims all seats to check uniqueness, then keeps twenty percent of players studying while others walk or drive. Parallel connections can distribute those studying players unevenly between rooms. Moving states update at 10 Hz. The script deliberately reconnects at least one player (one percent at larger levels), validates room/seat counts, and reports errors, server CPU percentage, RSS, event-loop delay, tick work, receive gaps, snapshot delivery and bytes/messages per second as JSON lines. Percentiles use bounded reservoirs for long runs; maximum gaps are exact. Add `--clients-per-worker=100` to set a generator batch size (multiples of 20, up to 200), and `--metrics-timeout-ms=30000` to set the control-plane timeout. The lightweight parent process collects metrics independently of the clients. Failed steps emit JSON error reports and the remaining levels still run, preserving earlier reports. Progress records are also JSON lines. Reports distinguish `ok` (protocol, reconnect, room and seat checks) from `targetMet` (at least 95 percent of the intended 10 Hz client input and snapshot delivery). A completed run can pass structural checks while falling below the timing target.

CPU/RSS and server event-loop measurements exclude the load generators. Generator CPU/RSS, generator event-loop delay, host load, swap use and other top CPU consumers are recorded separately. Sum of per-process peak RSS is an upper bound on simultaneous generator memory. Each generator parses every snapshot it receives, which still shares the host's CPU/network resources. CPU percent is relative to one CPU core. This is a loopback process benchmark, not a production capacity guarantee. A 1000-client level means 50 full rooms. Use a representative remote host/network before setting a public capacity limit.

Default server limits: 20 players per room, 10 snapshots/second, 4096-byte incoming payload, 40 messages/second per socket (token bucket), 5-second join timeout, 15-second ping interval, disconnect on an unanswered next ping, 256 KiB soft and 1 MiB hard outbound socket backlog, and ten skipped snapshots before removing a persistently slow receiver. Compression is disabled. `MAX_CONNECTIONS` and `MAX_ROOMS` are deployment caps, not measured capacity.
