# Homecraft multiplayer protocol v1

One JSON text frame per message over a WebSocket. The server is a dumb,
stateless relay between the visitors of one room (rooms are separated by the
connection's Origin); it stores nothing. Versioned like the door protocol:
fields may be added, existing fields never change meaning.

## Client → Server

| type | fields | notes |
|---|---|---|
| `join` | `id`, `name`, `skin` | once per connection, and again after every reconnect. `id` is the visitor's own random hex (8–40 chars). `skin` is `{k:'seed', s}` (a 32-bit recipe painted locally), `{k:'png', d}` (a base64url 64×64 PNG ≤ 24000 chars, validated client-side) or `{k:'default'}`. |
| `s` | `x`, `y`, `z`, `ry`, `m`, `sp`, `f` | movement tick at ~10 Hz, sent only on change (moved > 5 cm, turned > 3°, mode or flags changed), else a heartbeat every ~3 s. `m`: 0 ground, 1 air, 2 fly, 3 swim, 4 zip. `f` bits: 1 run, 2 phone out, 4 at the swim surface. |
| `c` | `t` | chat, ≤ 120 characters after trimming. |
| `p` | `t` | application-level ping; answered with `po`. |

## Server → Client

| type | fields | notes |
|---|---|---|
| `welcome` | `id`, `players` | sent on join. `players` is everyone already in the room (the newcomer excluded), each `{id, name, skin, state}` — `state` is their last tick or `null`. |
| `join` | `p` | `{id, name, skin, state}` of a newcomer, to everyone else. |
| `leave` | `id` | a socket closed (cleanly or not). |
| `s` | `id`, tick fields | relayed to everyone except the sender. |
| `c` | `id`, `t` | relayed to everyone **including** the speaker (one render path per line). |
| `po` | `t` | ping echo. |
| `kick` | `code` | `replaced` (same id rejoined elsewhere), `full` (room at MAX_PLAYERS), `slow` (rate limits). The client stops reconnecting and stays quietly single-player. |

## Server rules

- The upgrade request's Origin must match the configured `SITE` allow-list
  (`*` accepts all). Rooms are keyed by Origin, so sites never see each other.
- Rate limits per connection: `s` ≤ 24/s, `c` ≤ 4/10 s, `join` ≤ 6/min,
  frames ≤ 32 KB. Violations answer `kick: slow`.
- Same `id` rejoining closes the older socket with `kick: replaced` — the
  newest tab wins.
- Protocol-level pings sweep dead sockets every 15 s.

## Compatibility

`v:1` rides on every client message. Additive changes only: new fields, new
`m` modes appended at the end, new `f` bits at the high end. Servers may
forward unknown fields untouched; clients must ignore fields they don't know.
