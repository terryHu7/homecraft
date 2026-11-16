// Multiplayer, as one setup() module: anyone who opens the site walks in as
// a named, skinned character among everyone else here, and can chat. The
// server is optional — no endpoint, no reachability, no problem: the site is
// exactly the single-player island it always was, and the module keeps its
// quiet reconnect loop to itself.
import { wornSkin } from '@engine/traveller.js';
import { SWIM_PIVOT } from '@engine/world/avatar.js';
import { identity, hueOf } from './identity.js';
import { seedCanvas } from './skins.js';
import { createNet } from './net.js';
import { createChat } from './chat.js';
import { createRemotes } from './remote.js';

const SEND_EVERY = 100;      // sample the player at 10 Hz
const HEARTBEAT = 3000;      // stand still and the island is told anyway
const RUN_SPEED = 3.7;       // just above the walk speed: anything faster reads as a run

// `app` is what the engine hands world setup(): { stage, world, nav, player,
// avatar, sound, rig, quality, config }.
export function createMultiplayer(app) {
  const { stage, world, nav, player, avatar, rig, quality, config } = app;
  const cfg = { ...(config.multiplayer || {}) };
  // `?mp=` overrides the endpoint (a ws:// URL to try another room server,
  // `off` to browse solo); mostly for checks and quick trials.
  try {
    const override = new URL(location.href).searchParams.get('mp');
    if (override !== null) cfg.endpoint = override === 'off' ? '' : override;
  } catch {}
  if (!cfg.endpoint) return null;

  const me = identity();
  const remotes = createRemotes({ stage, world, nav, cap: cfg.maxRemote ?? (quality?.mobile ? 4 : 6) });
  const chat = createChat({ onSend: text => net.chat(text), selfId: me.uid });
  chat.track(me.uid, me.name, hueOf(me.uid));
  let net;

  // One face on every screen: a skin carried through a portal (or the owner's
  // config.skin) travels as a PNG and everyone wears it; otherwise everyone —
  // including the visitor's own body, which the engine would otherwise paint
  // with the plain default skin — wears their seed-painted character.
  let carried = null;
  wornSkin().then(w => {
    if (w?.value && w.value !== 'default') {
      carried = w.value;
      return;
    }
    try {
      const canvas = avatar?.material?.map?.image;
      if (canvas?.getContext) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(seedCanvas(me.seed), 0, 0);
        avatar.material.map.needsUpdate = true;
      }
    } catch {}
  }).catch(() => {});
  const skinMsg = () => (carried ? { k: 'png', d: carried } : { k: 'seed', s: me.seed });

  let online = 1;
  net = createNet({
    endpoint: cfg.endpoint,
    join: () => ({ v: 1, type: 'join', id: me.uid, name: me.name, skin: skinMsg() }),
    onMessage(msg) {
      switch (msg.type) {
        case 'welcome': {
          const others = msg.players || [];
          remotes.replaceAll(others);
          online = 1 + others.length;
          chat.presence(online);
          for (const p of others) if (p.name) chat.track(p.id, p.name, hueOf(p.id));
          break;
        }
        case 'join': {
          const p = msg.p || msg;
          if (!p?.id) break;
          remotes.join(p);
          chat.track(p.id, p.name || `Token-${p.id.slice(-4)}`, hueOf(p.id));
          chat.system(`${p.name} 来了`);
          online += 1;
          chat.presence(online);
          break;
        }
        case 'leave': {
          const who = remotes.info(msg.id);
          remotes.leave(msg.id);
          chat.untrack(msg.id);
          if (who) chat.system(`${who.name} 走了`);
          online = Math.max(1, online - 1);
          chat.presence(online);
          break;
        }
        case 's': remotes.state(msg); break;
        case 'c': {
          const text = String(msg.t || '').slice(0, 120);
          const who = msg.id === me.uid
            ? { name: me.name, hue: hueOf(me.uid) }
            : remotes.info(msg.id) || { name: `Token-${String(msg.id || '').slice(-4)}`, hue: hueOf(String(msg.id || '')) };
          chat.track(msg.id, who.name, who.hue);
          chat.line(msg.id, text);
          chat.sayBubble(msg.id, text);
          break;
        }
        case 'kick': net.stop(); break;
      }
    },
    onStatus(s) {
      chat.status(s);
      if (s === 'down') {
        remotes.grace();
        // The roster is about to empty itself; the count follows.
        online = 1;
        chat.presence(online);
      }
      if (s === 'offline') {
        remotes.clear();
        chat.clear();
        online = 1;
        chat.presence(online);
      }
    },
  });

  // ---------- sending our own state ----------
  const last = { x: NaN, y: 0, z: 0, ry: 0, m: -1, f: -1 };
  let lastX = 0, lastZ = 0, speed = 0, lastSend = 0;
  const modeOf = () => (player.swimming ? 3 : player.flying ? 2 : player.zipping ? 4 : player.mode === 'air' ? 1 : 0);
  const flagsOf = () => (speed > RUN_SPEED && modeOf() === 0 ? 1 : 0)
    | (document.body.classList.contains('phone-on') ? 2 : 0)
    | (player.swim?.surface ? 4 : 0);
  const message = (x, y, z, ry, m, f) => ({
    v: 1, type: 's', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2),
    ry: +ry.toFixed(3), m, sp: +speed.toFixed(1), f,
  });

  setInterval(() => {
    if (!net.connected) return;
    const x = player.pos.x, y = player.y, z = player.pos.z, ry = player.heading;
    const instant = Math.hypot(x - lastX, z - lastZ) / (SEND_EVERY / 1000);
    speed += (instant - speed) * 0.35;
    lastX = x; lastZ = z;
    const m = modeOf(), f = flagsOf(), now = performance.now();
    const moved = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z) > 0.05
      || Math.abs(ry - last.ry) > 0.05 || m !== last.m || f !== last.f;
    if (!moved && now - lastSend < HEARTBEAT) return;
    net.send(message(x, y, z, ry, m, f));
    last.x = x; last.y = y; last.z = z; last.ry = ry; last.m = m; last.f = f;
    lastSend = now;
  }, SEND_EVERY);

  // ---------- the frame ----------
  // Head anchors for tags and bubbles. The self one is a reused object; the
  // engine places the local body itself, and while swimming it hangs from the
  // swim pivot like the avatar does.
  const selfAnchor = { x: 0, y: 0, z: 0 };
  const anchorOf = id => {
    if (id !== me.uid) return remotes.anchorOf(id);
    if (rig.firstPerson) return null;
    if (player.swimming) {
      const s = player.swim;
      selfAnchor.x = s.x; selfAnchor.y = s.c - SWIM_PIVOT; selfAnchor.z = s.z;
    } else {
      selfAnchor.x = player.pos.x; selfAnchor.y = player.y; selfAnchor.z = player.pos.z;
    }
    return selfAnchor;
  };

  return {
    update(dt, elapsed, now) {
      remotes.update(dt, now, player.pos.x, player.pos.z);
      chat.update(now, stage.camera, anchorOf);
    },
    // Runs after the engine's baked-lighting pass but before its shaders
    // compile: the pool wraps its skin-array sampling around the lighting
    // patch here.
    warmup() { remotes.prime(); },
  };
}
