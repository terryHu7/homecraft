// Everything is an environment variable so the same file runs locally, in
// Docker and on a VPS without edits. Start like:
//   PORT=8787 SITE='https://island.example.com' node server.js
const env = process.env;

export const config = {
  port: Number(env.PORT) || 8787,
  // Comma-separated origins allowed to open a socket. '*' opens the server to
  // any site (rooms are still separated by origin, so sites never see each
  // other). Example: SITE='https://island.example.com,http://127.0.0.1:4192'
  site: (env.SITE || '*').split(',').map(s => s.trim()).filter(Boolean),
  // A room holds at most this many players; further joins are refused with
  // `full` and the visitor keeps browsing the site as a single player.
  maxPlayers: Math.min(200, Math.max(2, Number(env.MAX_PLAYERS) || 50)),
  // Where rehearsal bots stroll, as `x0,z0,x1,z1` in world blocks — pick a
  // stretch of lawn inside your island, e.g. BOTS_RECT='-30,8,-14,22'.
  botsRect: (env.BOTS_RECT || '-4,4,4,-4').split(',').map(Number),
  // Largest accepted frame: state ticks are ~100 bytes of JSON, join (with a
  // carried PNG skin) stays under 25 KB. Anything bigger is a bug or abuse.
  maxFrame: 32768,
  // Relay-side flood protection, per connection.
  limits: { statePerSec: 24, chatPer10s: 4, joinPerMin: 6 },
};
