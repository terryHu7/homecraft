// A room is one site's island: every socket that arrived with the same Origin
// sees the same people. The server only relays — the roster lives in this
// object's memory, nothing is ever written to disk, and a restart just means
// everyone quietly rejoins.

// A fixed-window counter: `max` events per window, then drop until it resets.
// Strictness does not matter, only that one socket cannot flood a room.
export function limiter(max, windowMs) {
  let start = 0, count = 0;
  return () => {
    const now = Date.now();
    if (now - start >= windowMs) { start = now; count = 0; }
    return count++ < max;
  };
}

const HEX = /^[0-9a-f]{8,40}$/;
const B64URL = /^[A-Za-z0-9_-]{1,24000}$/;

function cleanName(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 24) : '';
}

// A skin travels as a seeded recipe (a number) or an already validated PNG
// data value, never as code or a URL the client would fetch.
function cleanSkin(raw) {
  if (!raw || typeof raw !== 'object') return { k: 'default' };
  if (raw.k === 'seed' && Number.isInteger(raw.s) && raw.s >= 0 && raw.s < 2 ** 32) return { k: 'seed', s: raw.s };
  if (raw.k === 'png' && typeof raw.d === 'string' && B64URL.test(raw.d)) return { k: 'png', d: raw.d };
  return { k: 'default' };
}

const clamp = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    x: clamp(Number(raw.x), -1e4, 1e4, 0),
    y: clamp(Number(raw.y), -100, 1e4, 0),
    z: clamp(Number(raw.z), -1e4, 1e4, 0),
    ry: clamp(Number(raw.ry), -10, 10, 0),
    m: Math.round(clamp(Number(raw.m), 0, 4, 0)) | 0, // 0 ground, 1 air, 2 fly, 3 swim, 4 zip
    sp: clamp(Number(raw.sp), 0, 20, 0),
    f: Math.round(clamp(Number(raw.f), 0, 7, 0)) | 0, // bit 1 run, 2 phone, 4 swim surface
  };
}

const pack = p => ({ id: p.id, name: p.name, skin: p.skin, state: p.state });

export class Room {
  constructor(key, { maxPlayers, onEmpty }) {
    this.key = key;
    this.maxPlayers = maxPlayers;
    this.onEmpty = onEmpty;
    this.players = new Map(); // id → { id, name, skin, state, conn }
    this.bots = [];
  }

  // Real players only: bots are rehearsal props and never take a seat.
  get size() { return this.players.size; }

  send(conn, obj) { if (conn.readyState === 1) conn.send(JSON.stringify(obj)); }

  broadcast(obj, except) {
    const data = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.conn !== except && p.conn.readyState === 1) p.conn.send(data);
    }
  }

  join(conn, msg) {
    const id = typeof msg.id === 'string' && HEX.test(msg.id) ? msg.id : null;
    if (!id) return false;
    const known = this.players.get(id);
    if (!known && this.size >= this.maxPlayers) { this.send(conn, { v: 1, type: 'kick', code: 'full' }); return false; }
    if (known) {
      // Same identity, new tab or a reconnect: the newest socket wins.
      this.send(known.conn, { v: 1, type: 'kick', code: 'replaced' });
      known.conn.close(1000, 'replaced');
    }
    const player = {
      id,
      name: cleanName(msg.name) || `Token-${id.slice(-4)}`,
      skin: cleanSkin(msg.skin),
      state: known?.state || null,
      conn,
    };
    this.players.set(id, player);
    conn.player = player;
    // The roster for the newcomer: everyone already here, not themselves.
    this.send(conn, {
      v: 1, type: 'welcome', id,
      players: [...this.players.values(), ...this.bots].filter(p => p.conn !== conn).map(pack),
    });
    if (!known) this.broadcast({ v: 1, type: 'join', p: pack(player) }, conn);
    return true;
  }

  state(conn, msg) {
    const player = conn.player;
    const s = cleanState(msg);
    if (!player || !s) return;
    player.state = s;
    this.broadcast({ v: 1, type: 's', id: player.id, ...s }, conn);
  }

  chat(conn, msg) {
    const player = conn.player;
    const text = typeof msg.t === 'string' ? msg.t.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!player || !text) return;
    // To everyone including the speaker: one path renders every line.
    this.broadcast({ v: 1, type: 'c', id: player.id, t: text });
  }

  leave(conn) {
    const player = conn.player;
    if (!player || this.players.get(player.id) !== player) return;
    this.players.delete(player.id);
    conn.player = null;
    this.broadcast({ v: 1, type: 'leave', id: player.id });
    if (!this.size && this.onEmpty) this.onEmpty(this);
  }
}
