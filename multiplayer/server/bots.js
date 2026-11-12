// Rehearsal bots: fake players for trying a client out on your own, started
// with `node server.js --bots 12`. Each bot strolls a slow loop around a home
// point on the lawn and stands still now and then. They are state only — no
// chat, no roster games — and they vanish with their room.
const STATE_EVERY = 100; // ms, matching what real clients send

export function botCount(argv) {
  const i = argv.indexOf('--bots');
  const n = Number(i >= 0 ? argv[i + 1] : NaN);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 60) : 0;
}

export function spawnBots(room, count, rect) {
  if (!count) return [];
  // The stroll rectangle, as [x0, z0, x1, z1]; each bot loops inside it.
  const [x0, z0, x1, z1] = rect && rect.length === 4 && rect.every(Number.isFinite) ? rect : [-4, 4, 4, -4];
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
  const bots = [];
  for (let i = 0; i < count; i++) {
    const id = `bot${String(i).padStart(4, '0')}`;
    const fx = count > 1 ? i / (count - 1) : 0.5;
    bots.push({
      id,
      name: `Bot-${i + 1}`,
      // Each bot a different outfit: seeds spread over the palette space.
      skin: { k: 'seed', s: (0x9e3779b9 * (i + 1)) >>> 0 },
      state: null,
      home: [minX + (maxX - minX) * fx, minZ + (maxZ - minZ) * ((i * 0.618) % 1)],
      radius: 1.2 + (i % 4) * 0.7,
      speed: 0.35 + (i % 4) * 0.12,
      phase: i * 1.7,
      rest: 0,
    });
  }
  room.bots = bots;
  return bots;
}

// One room, one interval: bots march around their loops and push the same
// state messages a real client would, through the same broadcast path.
export function startBots(room) {
  const bots = room.bots;
  if (!bots.length) return null;
  let last = Date.now();
  return setInterval(() => {
    const now = Date.now(), dt = Math.min(0.5, (now - last) / 1000);
    last = now;
    for (const bot of bots) {
      if (bot.rest > 0) {
        bot.rest -= dt;
      } else if (Math.random() < 0.004) {
        bot.rest = 1 + Math.random() * 3;
      } else {
        bot.phase += dt * bot.speed;
      }
      const moving = bot.rest <= 0;
      const [hx, hz] = bot.home;
      const x = hx + Math.cos(bot.phase) * bot.radius;
      const z = hz + Math.sin(bot.phase) * bot.radius;
      const ry = (bot.phase + Math.PI / 2) % (Math.PI * 2);
      const sp = moving ? 1.4 : 0;
      bot.state = { x, y: 0, z, ry, m: 0, sp, f: 0 };
      room.broadcast({ v: 1, type: 's', id: bot.id, ...bot.state });
    }
  }, STATE_EVERY);
}

export function stopBots(timer) { if (timer) clearInterval(timer); }
