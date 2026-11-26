export function setupBilliards() {
  const dialog = document.querySelector('#billiards');
  if (!dialog) return null;
  const canvas = dialog.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const status = dialog.querySelector('output');
  const left = 25, right = 615, top = 25, bottom = 315, radius = 9;
  const pockets = [left, 320, right].flatMap(x => [{ x, y: top }, { x, y: bottom }]);
  const colors = ['#f5ca49', '#527bdc', '#df5752', '#9878d4', '#eb923d', '#5db99e', '#a44643'];
  let balls, moving = false, frame = 0;
  const ball = (x, y, color) => ({ x, y, color, vx: 0, vy: 0, pocketed: false });
  function circle(x, y, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  function draw() {
    ctx.fillStyle = '#67442c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#22694f';
    ctx.fillRect(left, top, right - left, bottom - top);
    for (const pocket of pockets) circle(pocket.x, pocket.y, 18, '#161916');
    for (const b of balls) if (!b.pocketed) {
      circle(b.x, b.y, radius, b.color);
      circle(b.x - 2.5, b.y - 2.5, 2.6, '#ffffff65');
    }
  }
  function reset() {
    cancelAnimationFrame(frame);
    moving = false;
    balls = [ball(166, 170, '#f9f5e8')];
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
      const color = balls.length === 5 ? '#202020' : colors[(balls.length - 1) % colors.length];
      balls.push(ball(400 + row * 16.5, 170 + (i - row / 2) * 19, color));
    }
    status.textContent = '0 / 15';
    draw();
  }
  function advance() {
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.992;
      b.vy *= 0.992;
      if (pockets.some(p => Math.hypot(b.x - p.x, b.y - p.y) < 19)) {
        b.pocketed = true;
        continue;
      }
      if (b.x < left + radius || b.x > right - radius) {
        b.x = Math.min(right - radius, Math.max(left + radius, b.x));
        b.vx *= -0.87;
      }
      if (b.y < top + radius || b.y > bottom - radius) {
        b.y = Math.min(bottom - radius, Math.max(top + radius, b.y));
        b.vy *= -0.87;
      }
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.pocketed || b.pocketed) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= radius * 2 || d < 0.001) continue;
      const nx = dx / d, ny = dy / d;
      const overlap = (radius * 2 - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const impulse = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (impulse <= 0) continue;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
  function tick() {
    advance();
    advance();
    moving = balls.some(b => !b.pocketed && Math.hypot(b.vx, b.vy) > 0.07);
    if (moving && dialog.open) frame = requestAnimationFrame(tick);
    else {
      for (const b of balls) b.vx = b.vy = 0;
      moving = false;
      if (balls[0].pocketed) {
        let x = 166;
        while (balls.slice(1).some(b => !b.pocketed && Math.hypot(b.x - x, b.y - 170) < 19)) x -= 20;
        if (x < left + radius) reset();
        else balls[0] = ball(x, 170, '#f9f5e8');
      }
      const score = balls.slice(1).filter(b => b.pocketed).length;
      status.textContent = score === 15 ? 'Rack cleared' : score + ' / 15';
    }
    draw();
  }
  canvas.addEventListener('pointerdown', event => {
    if (moving) return;
    const rect = canvas.getBoundingClientRect();
    const cue = balls[0];
    const dx = (event.clientX - rect.left) * canvas.width / rect.width - cue.x;
    const dy = (event.clientY - rect.top) * canvas.height / rect.height - cue.y;
    const d = Math.hypot(dx, dy);
    if (d < 5) return;
    const speed = Math.min(12, 1 + d / 27);
    cue.vx = dx / d * speed;
    cue.vy = dy / d * speed;
    moving = true;
    frame = requestAnimationFrame(tick);
  });
  dialog.querySelector('[data-rack]').addEventListener('click', reset);
  dialog.addEventListener('close', reset);
  reset();
  return dialog;
}
