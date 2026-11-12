#!/usr/bin/env node
// The Homecraft room server: relays presence, movement and chat between the
// visitors of one site. Rooms are separated by Origin, so one deployment can
// serve several sites (or the whole world, with SITE='*') without them ever
// seeing each other. Nothing is stored: stop the process and the islands
// simply go back to being single-player.
//
//   npm install && node server.js              # http://127.0.0.1:8787
//   SITE='https://island.example.com' node server.js
//   node server.js --bots 12                   # rehearsal bots for testing
//
// Run it behind a TLS-terminating proxy (Caddy, Nginx, a tunnel) so the site
// can reach it as wss://. See multiplayer/README.md.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { Room, limiter } from './room.js';
import { botCount, spawnBots, startBots, stopBots } from './bots.js';

// SITE entries may be written as full origins or bare hosts.
const originOf = entry => {
  try { return new URL(entry.includes('://') ? entry : `https://${entry}`).origin; } catch { return null; }
};
const allowed = new Set(config.site.flatMap(s => s === '*' ? ['*'] : [originOf(s)]).filter(Boolean));

const rooms = new Map();
const botTimers = new Map();
const bots = botCount(process.argv);

function roomFor(origin) {
  let room = rooms.get(origin);
  if (!room) {
    room = new Room(origin, { maxPlayers: config.maxPlayers, onEmpty: r => { stopBots(botTimers.get(r)); botTimers.delete(r); rooms.delete(r.key); } });
    rooms.set(origin, room);
    if (bots) {
      spawnBots(room, bots, config.botsRect);
      botTimers.set(room, startBots(room));
    }
  }
  return room;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`ok, ${rooms.size} room(s)\n`);
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxFrame });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin || '';
  if (!allowed.has('*') && (!origin || !allowed.has(originOf(origin)))) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  const room = roomFor(req.headers.origin || 'unknown');
  ws.isAlive = true;
  ws.limitState = limiter(config.limits.statePerSec, 1000);
  ws.limitChat = limiter(config.limits.chatPer10s, 10000);
  ws.limitJoin = limiter(config.limits.joinPerMin, 60000);

  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'join':
        if (ws.limitJoin()) room.join(ws, msg);
        else room.send(ws, { v: 1, type: 'kick', code: 'slow' });
        break;
      case 's':
        if (ws.limitState()) room.state(ws, msg);
        else room.send(ws, { v: 1, type: 'kick', code: 'slow' });
        break;
      case 'c':
        if (ws.limitChat()) room.chat(ws, msg);
        break;
      case 'p':
        room.send(ws, { v: 1, type: 'po', t: msg.t });
        break;
    }
  });
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => room.leave(ws));
  ws.on('error', () => {});
});

// Protocol-level pings: browsers answer on their own, and any socket that
// misses one is dead (a closed laptop lid, a dropped train tunnel).
const sweep = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
sweep.unref();

server.listen(config.port, () => {
  const who = allowed.has('*') ? 'any origin' : [...allowed].join(', ');
  console.log(`homecraft room server on :${config.port} — ${who}${bots ? `, ${bots} bots` : ''}`);
});

// A clean goodbye: browsers see the close, drop to single-player at once and
// start their quiet reconnect loop.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(sweep);
    for (const timer of botTimers.values()) stopBots(timer);
    for (const ws of wss.clients) ws.close(1001, 'server stopping');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
