// Photo & Share Studio: captures pristine screenshots framed in a macOS
// window bar with traffic lights, address capsule, and subtle branding.
// Offers three bulletproof camera angles (aerial island, spawn entrance, current view)
// and social aspect ratios (16:9 landscape, 9:16 portrait, 1:1 square).
import * as THREE from 'three';
import * as L from '@world/layout.js';
import { t, onLang } from '../lang.js';

export function createPhotoStudio({ stage, world, rig, player, avatar = null, sound, setTimeMode, getTimeMode, setWeatherMode, getWeatherMode, config = {} }) {
  const root = document.getElementById('photoStudio');
  const trigger = document.getElementById('photoButton');
  if (!root || !trigger) return { open() {}, close() {}, isOpen: () => false };

  const viewfinder = root.querySelector('.photo-viewfinder');
  const toast = root.getElementById ? root.getElementById('photoToast') : document.getElementById('photoToast');
  const saveBtn = document.getElementById('photoSnapSave');
  const closeBtn = document.getElementById('photoClose');

  let open = false;
  let angle = 'current';
  let ratio = innerHeight > innerWidth * 1.1 ? '9:16' : '16:9';
  let activeTime = 'current';
  let activeWeather = 'current';
  let activePopover = null;
  let withMacFrame = true;

  let savedTimeMode = 'day';
  let savedWeatherMode = 'clear';
  let savedView = null;
  let flashEl = null;

  // ---------- Camera Angle Calculator ----------
  const B = L.ISLAND;
  const span = Math.min(120, Math.max(B.x1 - B.x0, B.z1 - B.z0));
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  const defaultIntro = {
    pos: [cx + span * 0.62, span * 0.48, cz + span * 0.78],
    portrait: [cx + span, span * 0.78, cz + span * 1.3],
    look: [cx, 0, cz],
  };
  const intro = L.INTRO || defaultIntro;

  function getAnglePreset(id) {
    const isPortrait = ratio === '9:16' || (ratio === '1:1' && innerHeight > innerWidth);
    if (id === 'aerial') {
      const pos = isPortrait && intro.portrait ? intro.portrait : intro.pos;
      const look = intro.look;
      return { pos, look };
    }
    if (id === 'selfie') {
      const isPortrait = ratio === '9:16' || (ratio === '1:1' && innerHeight > innerWidth);
      const px = player.pos.x, py = player.y, pz = player.pos.z;
      const h = player.heading; // player yaw orientation
      const dist = isPortrait ? 2.4 : 3.0;
      const side = isPortrait ? 0.2 : 0.62; // classic rule-of-thirds selfie framing
      const lift = isPortrait ? 0.25 : 0.2; // elevated phone angle looking slightly down

      // Forward vector facing player front (+z when heading=0)
      const forwardX = Math.sin(h);
      const forwardZ = Math.cos(h);
      const rightX = Math.cos(h);
      const rightZ = -Math.sin(h);

      const camX = px + forwardX * dist + rightX * side;
      const camY = py + 1.4 + lift;
      const camZ = pz + forwardZ * dist + rightZ * side;

      // Focus on the player's chest/face
      const lookX = px;
      const lookY = py + 1.15;
      const lookZ = pz;

      return { pos: [camX, camY, camZ], look: [lookX, lookY, lookZ] };
    }
    if (id === 'spawn') {
      const isPortrait = ratio === '9:16' || (ratio === '1:1' && innerHeight > innerWidth);
      const [yaw, pitch, distance] = isPortrait ? [0.12, 0.44, 9.5] : [0.12, 0.38, 8.2];
      const sx = L.SPAWN?.x ?? 0.5;
      const sz = L.SPAWN?.z ?? 0;
      const sy = L.floorAt ? L.floorAt(sx, sz) : 0;
      const focusX = sx, focusY = sy + 1.25, focusZ = sz;
      const cp = Math.cos(pitch);
      const camX = focusX + Math.sin(yaw) * cp * distance;
      const camY = focusY + Math.sin(pitch) * distance;
      const camZ = focusZ + Math.cos(yaw) * cp * distance;
      return { pos: [camX, camY, camZ], look: [focusX, focusY, focusZ] };
    }
    if (id === 'current' && savedView) {
      return savedView;
    }
    return null;
  }

  // ---------- Popover Sheet State ----------
  function closeAllPopovers() {
    activePopover = null;
    for (const p of root.querySelectorAll('.photo-popover')) p.hidden = true;
    for (const c of root.querySelectorAll('.photo-capsule')) {
      c.classList.remove('active');
      c.setAttribute('aria-expanded', 'false');
    }
  }

  function togglePopover(id) {
    const target = root.querySelector(`.photo-popover[data-popover-for="${id}"]`);
    const triggerBtn = root.querySelector(`.photo-capsule[data-trigger-popover="${id}"]`);
    if (!target) return;
    const willOpen = target.hidden;
    closeAllPopovers();
    if (willOpen) {
      target.hidden = false;
      triggerBtn?.classList.add('active');
      triggerBtn?.setAttribute('aria-expanded', 'true');
      activePopover = id;
      sound?.play('click');
    }
  }

  const angleLabelMap = {
    current: { zh: '当前', en: 'Current' },
    aerial: { zh: '鸟瞰', en: "Bird's-eye" },
    selfie: { zh: '自拍', en: 'Selfie' },
    spawn: { zh: '默认', en: 'Default' },
  };

  function updateSceneCapsule() {
    const iconEl = document.getElementById('capSceneIcon');
    const textEl = document.getElementById('capSceneText');
    if (!iconEl || !textEl) return;

    let icon = '🎛️';
    let zh = '场景';
    let en = 'Scene';

    if (activeWeather === 'snow') icon = '❄️';
    else if (activeWeather === 'rain') icon = '🌧️';
    else if (activeWeather === 'clear') icon = '☀️';
    else if (activeTime === 'night') icon = '🌙';
    else if (activeTime === 'dusk') icon = '🌅';
    else if (angle === 'aerial') icon = '🏝️';
    else if (angle === 'selfie') icon = '🤳';

    iconEl.textContent = icon;
    textEl.textContent = t(zh, en);
  }

  function applyAngle(id) {
    angle = id;
    for (const b of root.querySelectorAll('[data-angle]')) {
      const active = b.dataset.angle === id;
      b.setAttribute('aria-checked', String(active));
      b.classList.toggle('on', active);
    }
    updateSceneCapsule();
    if (id === 'selfie') {
      avatar?.poseSelfie?.(true);
    } else {
      avatar?.poseSelfie?.(false);
    }
    if (id === 'current') {
      rig.skipIntro?.();
      rig.recenter(player);
    } else {
      if (id === 'spawn') {
        player.teleport(L.SPAWN?.x ?? 0.5, L.SPAWN?.z ?? 0, { heading: L.SPAWN?.heading ?? Math.PI });
      }
      const preset = getAnglePreset(id);
      if (preset) {
        rig.showcase(preset.pos, preset.look);
      }
    }
  }

  function applyRatio(r) {
    ratio = r;
    for (const b of root.querySelectorAll('[data-ratio]')) {
      const active = b.dataset.ratio === r;
      b.setAttribute('aria-checked', String(active));
      b.classList.toggle('on', active);
    }
    const capRatioText = document.getElementById('capRatioText');
    if (capRatioText) capRatioText.textContent = r;
    root.dataset.ratio = r;
    resetCropFramePosition();
    if (angle === 'aerial' || angle === 'selfie' || angle === 'spawn') {
      const preset = getAnglePreset(angle);
      if (preset) rig.showcase(preset.pos, preset.look);
    }
    requestAnimationFrame(updateLiveMacBar);
    closeAllPopovers();
  }

  function applyTime(tMode) {
    activeTime = tMode;
    for (const b of root.querySelectorAll('[data-photo-time]')) {
      const active = b.dataset.photoTime === tMode;
      b.setAttribute('aria-checked', String(active));
      b.classList.toggle('on', active);
    }
    if (tMode === 'current') {
      if (setTimeMode && savedTimeMode) setTimeMode(savedTimeMode);
    } else {
      if (setTimeMode) setTimeMode(tMode);
    }
    updateSceneCapsule();
  }

  function applyWeather(wMode) {
    activeWeather = wMode;
    for (const b of root.querySelectorAll('[data-photo-weather]')) {
      const active = b.dataset.photoWeather === wMode;
      b.setAttribute('aria-checked', String(active));
      b.classList.toggle('on', active);
    }
    if (wMode === 'current') {
      if (setWeatherMode && savedWeatherMode) setWeatherMode(savedWeatherMode);
    } else {
      if (setWeatherMode) setWeatherMode(wMode);
    }
    updateSceneCapsule();
  }

  function resetScene() {
    applyAngle('current');
    applyTime('current');
    applyWeather('current');
    sound?.play('click');
  }

  const HOMECRAFT_LOGO_URL = new URL('../assets/homecraft-logo.png', import.meta.url).href;
  let homecraftLogoImg = null;

  function loadHomecraftLogo() {
    if (homecraftLogoImg && homecraftLogoImg.complete && homecraftLogoImg.naturalWidth) return Promise.resolve(homecraftLogoImg);
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { homecraftLogoImg = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = HOMECRAFT_LOGO_URL;
    });
  }

  // Preload logo immediately
  loadHomecraftLogo();

  function getSiteDomain() {
    try {
      const url = new URL(location.href);
      let path = url.pathname;
      if (path === '/') path = '';
      return `${url.host}${path}`;
    } catch {
      return location.host || location.hostname || '127.0.0.1:4192';
    }
  }

  // Draw authentic slender macOS window bar
  function drawMacWindowBar(ctx, width, height, domainText) {
    // 1. Sleek macOS dark mode background
    ctx.fillStyle = '#2a2a2c';
    ctx.fillRect(0, 0, width, height);

    // Subtle bottom border
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, height - 1, width, 1);

    // 2. Traffic light dots (Apple Retina colors & subtle border)
    const cy = Math.round(height / 2);
    const r = Math.max(3.5, Math.round(height * 0.11));
    const startX = Math.round(height * 0.42);
    const gap = Math.round(height * 0.38);

    const dots = [
      { fill: '#ff5f57', stroke: '#e0443e' },
      { fill: '#febc2e', stroke: '#dea123' },
      { fill: '#28c840', stroke: '#1aab29' },
    ];
    dots.forEach((dot, i) => {
      const cx = startX + i * gap;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = dot.fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = dot.stroke;
      ctx.stroke();
    });

    // 3. Centered address capsule
    const capsuleH = Math.round(height * 0.62);
    const capsuleW = Math.min(Math.round(width * 0.35), 480);
    const capsuleX = Math.round((width - capsuleW) / 2);
    const capsuleY = Math.round((height - capsuleH) / 2);
    ctx.beginPath();
    ctx.roundRect(capsuleX, capsuleY, capsuleW, capsuleH, 4);
    ctx.fillStyle = '#38383a';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.stroke();

    // 4. Centered domain text inside capsule
    const fontSize = Math.max(12, Math.round(capsuleH * 0.54));
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(250, 250, 255, 0.92)';
    ctx.fillText(domainText, width / 2, height / 2);
  }

  function updateLiveMacBar() {
    const liveBar = root.querySelector('.photo-live-mac-bar');
    if (!liveBar) return;
    liveBar.hidden = !withMacFrame;
    const domainSpan = root.querySelector('.live-mac-domain');
    if (domainSpan) domainSpan.textContent = getSiteDomain();
  }

  function updateLiveWatermark() {
    const wmLogo = root.querySelector('.live-wm-logo');
    if (wmLogo && (!wmLogo.src || !wmLogo.src.includes('homecraft-logo'))) {
      wmLogo.src = HOMECRAFT_LOGO_URL;
    }
  }

  function applyFrame(on) {
    withMacFrame = on;
    const toggleBtn = root.querySelector('[data-toggle-frame="mac"]');
    if (toggleBtn) {
      toggleBtn.classList.toggle('on', on);
      toggleBtn.setAttribute('aria-pressed', String(on));
    }
    updateLiveMacBar();
  }

  // ---------- Viewfinder Mask ----------
  function updateViewfinder() {
    if (!viewfinder) return;
    // Visual crop guide updated via CSS data-ratio attribute
  }

  // ---------- Flash & Toast ----------
  function flash() {
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.className = 'photo-flash';
      document.body.appendChild(flashEl);
    }
    flashEl.classList.remove('active');
    void flashEl.offsetWidth;
    flashEl.classList.add('active');
  }

  let toastTimer = null;
  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  // ---------- Homecraft Logo Watermark (matching minimap credit, ultra-discreet) ----------
  function drawWatermark(ctx, width, height) {
    const badgeH = Math.max(18, Math.min(24, Math.round(height * 0.022)));
    const fontSize = Math.round(badgeH * 0.44);
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;

    const label = 'homecraft';
    const textWidth = ctx.measureText(label).width;

    const pad = Math.round(badgeH * 0.22);
    const gap = Math.round(badgeH * 0.18);
    const iconSize = badgeH - pad * 2;
    const pillW = pad + iconSize + gap + textWidth + Math.round(pad * 1.5);
    const pillH = badgeH;

    const margin = Math.round(Math.min(width, height) * 0.024);
    const x = width - pillW - margin;
    const y = height - pillH - margin;

    // Semi-transparent dark rounded badge matching minimap credit
    ctx.beginPath();
    ctx.roundRect(x, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(10, 12, 14, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3D Block Logo
    if (homecraftLogoImg && homecraftLogoImg.complete && homecraftLogoImg.naturalWidth) {
      ctx.drawImage(homecraftLogoImg, x + pad, y + pad, iconSize, iconSize);
    }

    // Text: homecraft
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + pad + iconSize + gap, y + pillH / 2);
  }

  // ---------- Capture & Composite ----------
  async function captureBlob() {
    // Hide studio controls during actual frame render
    root.classList.add('capturing');
    await new Promise(r => requestAnimationFrame(r));

    // Force stage render for crisp frame
    stage.render();
    const source = stage.renderer.domElement;
    const sw = source.width;
    const sh = source.height;

    // Target dimensions
    let targetW, targetH;
    if (ratio === '16:9') {
      targetW = 1920; targetH = 1080;
    } else if (ratio === '9:16') {
      targetW = 1080; targetH = 1920;
    } else {
      targetW = 1440; targetH = 1440;
    }

    // Precise WYSIWYG crop coordinates based on crop frame on screen
    const cropFrame = root.querySelector('.photo-crop-frame');
    const cRect = source.getBoundingClientRect();
    const fRect = cropFrame ? cropFrame.getBoundingClientRect() : cRect;

    const barHeight = withMacFrame ? (ratio === '9:16' ? 28 : ratio === '1:1' ? 30 : 34) : 0;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH + barHeight;
    const ctx = outCanvas.getContext('2d');

    // Scale from client screen pixels to high-res WebGL canvas pixels
    const scaleX = sw / cRect.width;
    const scaleY = sh / cRect.height;

    const frameLeft = fRect.left - cRect.left;
    const frameTop = fRect.top - cRect.top;
    const frameW = fRect.width;
    const frameH = fRect.height;

    // Overlap region between crop frame and 3D canvas
    const visibleLeft = Math.max(0, frameLeft);
    const visibleTop = Math.max(0, frameTop);
    const visibleRight = Math.min(cRect.width, frameLeft + frameW);
    const visibleBottom = Math.min(cRect.height, frameTop + frameH);

    const visibleW = Math.max(0, visibleRight - visibleLeft);
    const visibleH = Math.max(0, visibleBottom - visibleTop);

    // Source WebGL pixels to crop
    const sx = Math.round(visibleLeft * scaleX);
    const sy = Math.round(visibleTop * scaleY);
    const sWidth = Math.round(visibleW * scaleX);
    const sHeight = Math.round(visibleH * scaleY);

    // Target export coordinates (maintains exact pixel mapping without distortion)
    const destX = Math.round(((visibleLeft - frameLeft) / frameW) * targetW);
    const destY = Math.round(((visibleTop - frameTop) / frameH) * targetH) + barHeight;
    const destW = Math.round((visibleW / frameW) * targetW);
    const destH = Math.round((visibleH / frameH) * targetH);

    // Fill background with fog/theme color if frame extends beyond canvas
    ctx.fillStyle = `#${stage.fogTarget ? stage.fogTarget.getHexString() : '2a2d31'}`;
    ctx.fillRect(0, barHeight, targetW, targetH);

    // 1. Draw 3D scene
    if (sWidth > 0 && sHeight > 0 && destW > 0 && destH > 0) {
      ctx.drawImage(source, sx, sy, sWidth, sHeight, destX, destY, destW, destH);
    }

    // 2. Draw Mac bar if enabled
    if (withMacFrame) {
      drawMacWindowBar(ctx, targetW, barHeight, getSiteDomain());
    }

    // 3. Draw branding watermark
    await loadHomecraftLogo();
    drawWatermark(ctx, targetW, targetH + barHeight);

    root.classList.remove('capturing');

    return new Promise(resolve => outCanvas.toBlob(resolve, 'image/png'));
  }

  // ---------- Action Handlers ----------
  async function handleSave() {
    sound?.play('click');
    flash();
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('Capture failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `homecraft-${angle}-${ratio.replace(':', 'x')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast(t('📸已保存截图', '📸 Screenshot saved'));
    } catch (err) {
      console.error('Save screenshot failed:', err);
      showToast(t('保存失败，请重试', 'Failed to save, please retry'));
    }
  }

  async function handleCopy() {
    sound?.play('click');
    flash();
    try {
      const blob = await captureBlob();
      if (!blob) throw new Error('Capture failed');

      // Native mobile share fallback if clipboard not available
      if (navigator.share && /mobile|iphone|android|ipad/i.test(navigator.userAgent)) {
        const file = new File([blob], `homecraft-${angle}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: document.title || 'Homecraft',
            text: t('欢迎来我的 3D 网站逛逛！', 'Welcome to my 3D website!'),
            files: [file],
          });
          showToast(t('分享成功！', 'Shared successfully!'));
          return;
        }
      }

      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast(t('📋 已复制到剪贴板！', '📋 Copied to clipboard!'));
      } else {
        // Fallback to direct download
        handleSave();
      }
    } catch (err) {
      console.warn('Clipboard write failed, downloading instead:', err);
      handleSave();
    }
  }

  // ---------- Draggable Viewfinder Crop Frame ----------
  const cropFrame = root.querySelector('.photo-crop-frame');
  let isMovingFrame = false;
  let frameStartX = 0, frameStartY = 0;
  let frameOffsetX = 0, frameOffsetY = 0;

  function onFramePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.live-mac-traffic, button, a')) return;

    isMovingFrame = true;
    frameStartX = e.clientX - frameOffsetX;
    frameStartY = e.clientY - frameOffsetY;
    cropFrame?.classList.add('is-moving');
    cropFrame?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onFramePointerMove(e) {
    if (!isMovingFrame || !cropFrame) return;
    const rawX = e.clientX - frameStartX;
    const rawY = e.clientY - frameStartY;

    const fRect = cropFrame.getBoundingClientRect();
    const baseLeft = fRect.left - frameOffsetX;
    const baseTop = fRect.top - frameOffsetY;
    const baseRight = fRect.right - frameOffsetX;
    const baseBottom = fRect.bottom - frameOffsetY;
    const frameW = baseRight - baseLeft;
    const frameH = baseBottom - baseTop;

    // Fluid free motion anywhere across the entire page (up, down, left, right)
    // Keep at least 60px visible on-screen so the user can easily grab it from any edge
    const minX = -(baseLeft + frameW - 60);
    const maxX = (window.innerWidth - baseLeft - 60);
    const minY = -(baseTop + frameH - 60);
    const maxY = (window.innerHeight - baseTop - 60);

    frameOffsetX = Math.max(minX, Math.min(maxX, rawX));
    frameOffsetY = Math.max(minY, Math.min(maxY, rawY));

    cropFrame.style.transform = `translate3d(${Math.round(frameOffsetX)}px, ${Math.round(frameOffsetY)}px, 0)`;
  }

  function onFramePointerUp(e) {
    if (!isMovingFrame || !cropFrame) return;
    isMovingFrame = false;
    cropFrame.classList.remove('is-moving');
    try { cropFrame.releasePointerCapture(e.pointerId); } catch {}
  }

  function resetCropFramePosition() {
    frameOffsetX = 0;
    frameOffsetY = 0;
    if (cropFrame) cropFrame.style.transform = '';
  }

  if (cropFrame) {
    cropFrame.addEventListener('pointerdown', onFramePointerDown);
    cropFrame.addEventListener('pointermove', onFramePointerMove);
    cropFrame.addEventListener('pointerup', onFramePointerUp);
    cropFrame.addEventListener('pointercancel', onFramePointerUp);
    cropFrame.addEventListener('dblclick', () => resetCropFramePosition());
  }

  // ---------- Draggable Control Bar ----------
  const bar = root.querySelector('.photo-bar');
  const handle = root.querySelector('.photo-drag-handle');
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let curOffsetX = 0, curOffsetY = 0;

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, input, select')) return;

    isDragging = true;
    dragStartX = e.clientX - curOffsetX;
    dragStartY = e.clientY - curOffsetY;
    bar?.classList.add('is-dragging');
    bar?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging || !bar) return;
    const rawX = e.clientX - dragStartX;
    const rawY = e.clientY - dragStartY;

    const rect = bar.getBoundingClientRect();
    const halfW = rect.width / 2;
    const maxOffsetLeft = -(window.innerWidth / 2 - halfW - 12);
    const maxOffsetRight = window.innerWidth / 2 - halfW - 12;

    const maxOffsetTop = -(window.innerHeight - rect.height - 40);
    const maxOffsetBottom = 12;

    curOffsetX = Math.max(maxOffsetLeft, Math.min(maxOffsetRight, rawX));
    curOffsetY = Math.max(maxOffsetTop, Math.min(maxOffsetBottom, rawY));

    bar.style.transform = `translate3d(calc(-50% + ${Math.round(curOffsetX)}px), ${Math.round(curOffsetY)}px, 0)`;
  }

  function onPointerUp(e) {
    if (!isDragging || !bar) return;
    isDragging = false;
    bar.classList.remove('is-dragging');
    try { bar.releasePointerCapture(e.pointerId); } catch {}
  }

  function resetBarPosition() {
    curOffsetX = 0;
    curOffsetY = 0;
    if (bar) bar.style.transform = '';
  }

  if (bar) {
    bar.addEventListener('pointerdown', onPointerDown);
    bar.addEventListener('pointermove', onPointerMove);
    bar.addEventListener('pointerup', onPointerUp);
    bar.addEventListener('pointercancel', onPointerUp);
  }
  handle?.addEventListener('dblclick', e => {
    e.stopPropagation();
    resetBarPosition();
  });

  // ---------- Lifecycle ----------
  function openStudio() {
    if (open) return;
    open = true;
    closeAllPopovers();
    savedTimeMode = getTimeMode ? getTimeMode() : 'day';
    savedWeatherMode = getWeatherMode ? getWeatherMode() : 'clear';
    savedView = {
      pos: stage.camera.position.toArray(),
      look: [player.pos.x, player.y + 1.25, player.pos.z],
    };

    document.body.classList.add('photo-mode');
    root.hidden = false;
    trigger.setAttribute('aria-pressed', 'true');
    trigger.classList.add('on');

    applyRatio(ratio);
    applyTime('current');
    applyWeather('current');
    applyFrame(withMacFrame);
    applyAngle('current');
    updateSceneCapsule();
    updateLiveWatermark();
    requestAnimationFrame(updateLiveMacBar);
    sound?.play('click');
  }

  function closeStudio() {
    if (!open) return;
    open = false;
    avatar?.poseSelfie?.(false);
    closeAllPopovers();
    document.body.classList.remove('photo-mode');
    root.hidden = true;
    trigger.setAttribute('aria-pressed', 'false');
    trigger.classList.remove('on');

    // Restore camera and lighting
    rig.recenter(player);
    if (setTimeMode && savedTimeMode) setTimeMode(savedTimeMode);
    if (setWeatherMode && savedWeatherMode) setWeatherMode(savedWeatherMode);
    resetBarPosition();
    resetCropFramePosition();
    sound?.play('click');
  }

  function toggleStudio(force) {
    const next = force !== undefined ? force : !open;
    if (next) openStudio(); else closeStudio();
  }

  // ---------- Event Listeners ----------
  trigger.addEventListener('click', () => toggleStudio());
  closeBtn?.addEventListener('click', closeStudio);
  saveBtn?.addEventListener('click', handleSave);

  const frameToggle = root.querySelector('[data-toggle-frame="mac"]');
  frameToggle?.addEventListener('click', () => {
    applyFrame(!withMacFrame);
    sound?.play('click');
  });

  // Capsule Popover triggers
  for (const btn of root.querySelectorAll('[data-trigger-popover]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(btn.dataset.triggerPopover);
    });
  }

  // Prevent interactions inside popovers from bubbling to document click-outside
  for (const p of root.querySelectorAll('.photo-popover')) {
    p.addEventListener('pointerdown', e => e.stopPropagation());
    p.addEventListener('click', e => e.stopPropagation());
  }

  // Dismiss open popover when clicking anywhere outside the control bar
  document.addEventListener('pointerdown', (e) => {
    if (!open || !activePopover) return;
    if (e.target.closest('.photo-bar')) return;
    closeAllPopovers();
  });

  for (const b of root.querySelectorAll('[data-angle]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyAngle(b.dataset.angle);
      sound?.play('click');
    });
  }
  for (const b of root.querySelectorAll('[data-ratio]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyRatio(b.dataset.ratio);
      sound?.play('click');
    });
  }
  for (const b of root.querySelectorAll('[data-photo-time]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyTime(b.dataset.photoTime);
      sound?.play('click');
    });
  }
  for (const b of root.querySelectorAll('[data-photo-weather]')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      applyWeather(b.dataset.photoWeather);
      sound?.play('click');
    });
  }

  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C') && open) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (activePopover) {
        closeAllPopovers();
        sound?.play('click');
      } else {
        closeStudio();
      }
    }
  });

  document.getElementById('sceneResetBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    resetScene();
  });

  onLang(() => {
    if (open) {
      updateSceneCapsule();
    }
  });

  window.addEventListener('resize', () => {
    if (open) updateLiveMacBar();
  });

  return {
    open: openStudio,
    close: closeStudio,
    toggle: toggleStudio,
    isOpen: () => open,
    captureBlob,
  };
}
