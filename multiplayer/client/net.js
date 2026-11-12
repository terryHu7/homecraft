// The socket: JSON text frames out, events in. Losing the server never
// surfaces as an error anywhere — the module goes quiet and keeps trying with
// a backoff, so the site behaves exactly as it does without multiplayer.
export function createNet({ endpoint, join, onMessage, onStatus }) {
  let ws = null;       // the socket that has opened
  let pending = null;  // the socket currently opening
  let retry = 0, timer = 0, dead = false;

  const send = obj => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

  const schedule = () => {
    if (dead || timer) return;
    const wait = Math.min(8000, 1000 * 2 ** Math.min(retry++, 3)) + Math.random() * 600;
    timer = setTimeout(() => { timer = 0; connect(); }, wait);
  };

  const detach = socket => {
    if (pending === socket) pending = null;
    if (ws === socket) { ws = null; onStatus?.('down'); }
    schedule();
  };

  const connect = () => {
    if (dead) return;
    let socket;
    try { socket = new WebSocket(endpoint); } catch { schedule(); return; }
    pending = socket;
    socket.onopen = () => {
      pending = null;
      retry = 0;
      ws = socket;
      onStatus?.('up');
      send(join());
    };
    socket.onmessage = e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg && typeof msg === 'object') onMessage(msg);
    };
    socket.onclose = () => detach(socket);
    socket.onerror = () => detach(socket);
  };

  connect();

  return {
    send,
    chat: text => send({ v: 1, type: 'c', t: text }),
    // A refusal from the room itself (full, replaced, flooded): stop trying.
    stop() {
      dead = true;
      clearTimeout(timer); timer = 0;
      onStatus?.('offline');
      for (const socket of [pending, ws]) {
        if (!socket) continue;
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        try { socket.close(); } catch {}
      }
      pending = ws = null;
    },
    get connected() { return !!ws; },
  };
}
