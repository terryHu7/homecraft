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

  // A handheld selfie needs a close, wide lens. The raised hand stays in the
  // foreground instead of pulling back into a conventional portrait camera.
  const defaultFov = () => (innerHeight > innerWidth * 1.1 ? 58 : 46);
  function applyLens() {
    const want = open && angle === 'selfie' ? (ratio === '9:16' ? 68 : 58) : defaultFov();
    const cam = stage.camera;
    if (Math.abs(cam.fov - want) > 0.01) { cam.fov = want; cam.updateProjectionMatrix(); }
  }

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
      const lens = avatar?.selfieAnchors?.();
      if (lens) {
        const isPortrait = ratio === '9:16' || (ratio === '1:1' && innerHeight > innerWidth);
        const { face, forward, right } = lens;
        // Stay close to the face and on the raised-hand side. A wide lens and
        // a slightly downward look keep the outstretched arm at the lower
        // foreground edge while leaving half the frame for a group or view.
        const pos = face.clone()
          .addScaledVector(forward, isPortrait ? 1.15 : 0.92)
          .addScaledVector(right, isPortrait ? -0.50 : -0.26);
        pos.y = face.y + 0.20;
        const look = face.clone()
          .addScaledVector(forward, -0.10)
          .addScaledVector(right, isPortrait ? -0.04 : -0.08);
        look.y = face.y - 0.06;
        return { pos: pos.toArray(), look: look.toArray() };
      }
      // No avatar pose available: keep a close front-facing fallback.
      const h = player.heading;
      const px = player.pos.x, py = player.y, pz = player.pos.z;
      const dist = 1.5, side = -0.35;
      return {
        pos: [px + Math.sin(h) * dist + Math.cos(h) * side, py + 1.72, pz + Math.cos(h) * dist - Math.sin(h) * side],
        look: [px, py + 1.55, pz],
      };
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

  const quickFlipBtn = document.getElementById('photoQuickFlip');
  function updateQuickFlipBtn() {
    if (!quickFlipBtn) return;
    const isSelfie = angle === 'selfie';
    const label = isSelfie ? t('切回场景视角', 'Switch to scene') : t('切换自拍视角', 'Switch to selfie');
    quickFlipBtn.classList.toggle('is-selfie', isSelfie);
    quickFlipBtn.setAttribute('title', label);
    quickFlipBtn.setAttribute('aria-label', label);
  }

  function applyAngle(id) {
    angle = id;
    applyLens();
    updateQuickFlipBtn();
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

  function setRatioLabel(r) {
    ratio = r;
    for (const b of root.querySelectorAll('[data-ratio]')) {
      const active = b.dataset.ratio === r;
      b.setAttribute('aria-checked', String(active));
      b.classList.toggle('on', active);
    }
    const capRatioText = document.getElementById('capRatioText');
    if (capRatioText) {
      if (r === 'free') capRatioText.textContent = t('自由', 'Free');
      else capRatioText.textContent = r;
    }
    root.dataset.ratio = r;
  }

  function applyRatio(r) {
    setRatioLabel(r);
    applyLens();
    if (r !== 'free') {
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      const isMobile = sw < 640;
      const bottomReserved = isMobile ? 140 : 120;
      const topReserved = isMobile ? 40 : 0;
      const availH = sh - bottomReserved - topReserved;
      const availW = sw * (isMobile ? 0.92 : 0.88);

      let targetW, targetH;
      if (r === '16:9') {
        targetW = Math.min(availW, availH * (16 / 9));
        targetH = targetW / (16 / 9);
      } else if (r === '9:16') {
        targetH = Math.min(availH, availW * (16 / 9));
        targetW = targetH * (9 / 16);
      } else { // 1:1
        const size = Math.min(availW, availH);
        targetW = size;
        targetH = size;
      }

      // Preserve current frame center if already valid
      let centerX = (frameW > 0 && frameX >= 0) ? (frameX + frameW / 2) : (sw / 2);
      let centerY = (frameH > 0 && frameY >= 0) ? (frameY + frameH / 2) : (topReserved + availH / 2);
      if (centerX < targetW / 2) centerX = targetW / 2;
      if (centerX > sw - targetW / 2) centerX = sw - targetW / 2;
      if (centerY < topReserved + targetH / 2) centerY = topReserved + targetH / 2;
      if (centerY > sh - bottomReserved - targetH / 2) centerY = sh - bottomReserved - targetH / 2;

      frameW = Math.round(targetW);
      frameH = Math.round(targetH);
      frameX = Math.round(centerX - frameW / 2);
      frameY = Math.round(centerY - frameH / 2);
      applyCropFrame();
    }
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

  // Draw authentic macOS window bar (100% WYSIWYG proportional rendering)
  function drawMacWindowBar(ctx, width, height, domainText, s = 1) {
    // 1. Sleek macOS dark mode background
    ctx.fillStyle = '#2a2a2c';
    ctx.fillRect(0, 0, width, height);

    // Subtle bottom border
    const borderH = Math.max(1, Math.round(1 * s));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, height - borderH, width, borderH);

    // 2. Traffic light dots (Apple Retina colors & subtle border)
    // On screen baseline: left: 14px, dot diameter: 11px (r = 5.5px), gap: 7px
    const cy = Math.round(height / 2);
    const r = Math.max(3.5, Math.round(5.5 * s));
    const startX = Math.round(14 * s) + r;
    const gap = Math.round(7 * s) + r * 2;

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
      ctx.lineWidth = Math.max(1, Math.round(0.6 * s));
      ctx.strokeStyle = dot.stroke;
      ctx.stroke();
    });

    // 3. Centered address capsule
    // On screen baseline: height: 26px, padding: 0 16px, border-radius: 6px, font: 12.5px
    const capsuleH = Math.round(26 * s);
    const capsuleY = Math.round((height - capsuleH) / 2);
    const fontSize = Math.max(11, Math.round(12.5 * s));
    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`;
    const textW = ctx.measureText(domainText).width;
    const padX = Math.round(16 * s);
    const capsuleW = Math.min(Math.round(width * 0.52), Math.round(textW + padX * 2));
    const capsuleX = Math.round((width - capsuleW) / 2);
    const radius = Math.round(6 * s);

    ctx.beginPath();
    ctx.roundRect(capsuleX, capsuleY, capsuleW, capsuleH, radius);
    ctx.fillStyle = '#38383a';
    ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(1 * s));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // 4. Centered domain text inside capsule
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(250, 250, 255, 0.94)';
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

  // ---------- Homecraft Logo Watermark (matching live viewfinder, 100% WYSIWYG) ----------
  function drawWatermark(ctx, width, height, s = 1) {
    // On screen baseline: height: 22px, right: 12px, bottom: 12px, logo: 13px, font: 11px, pad: 6px/9px, gap: 5px
    const badgeH = Math.round(22 * s);
    const padLeft = Math.round(6 * s);
    const padRight = Math.round(9 * s);
    const gap = Math.round(5 * s);
    const iconSize = Math.round(13 * s);
    const fontSize = Math.max(10, Math.round(11 * s));
    const marginRight = Math.round(12 * s);
    const marginBottom = Math.round(12 * s);

    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif`;
    const label = 'homecraft';
    const textWidth = ctx.measureText(label).width;

    const pillW = padLeft + iconSize + gap + textWidth + padRight;
    const pillH = badgeH;
    const x = width - pillW - marginRight;
    const y = height - pillH - marginBottom;

    // Semi-transparent dark rounded badge matching minimap credit
    ctx.beginPath();
    ctx.roundRect(x, y, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(10, 12, 14, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = Math.max(1, Math.round(1 * s));
    ctx.stroke();

    // 3D Block Logo
    if (homecraftLogoImg && homecraftLogoImg.complete && homecraftLogoImg.naturalWidth) {
      const iconY = y + Math.round((pillH - iconSize) / 2);
      ctx.drawImage(homecraftLogoImg, x + padLeft, iconY, iconSize, iconSize);
    }

    // Text: homecraft
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + padLeft + iconSize + gap, y + pillH / 2);
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

    // Precise WYSIWYG crop coordinates based on crop frame on screen
    const cropFrame = root.querySelector('.photo-crop-frame');
    const cRect = source.getBoundingClientRect();
    const fRect = cropFrame ? cropFrame.getBoundingClientRect() : cRect;

    const frameW = fRect.width || cRect.width;
    const frameH = fRect.height || cRect.height;

    // Target dimensions: high-resolution export preserving the EXACT aspect ratio and size of whatever the user framed
    const maxDim = Math.max(frameW, frameH);
    const exportScale = Math.max(1.5, Math.min(3.0, 1920 / maxDim));
    const targetW = Math.round(frameW * exportScale);
    const targetH = Math.round(frameH * exportScale);
    const scale = targetW / frameW;

    // Scale UI elements based on live crop frame scale factor
    const uiScale = parseFloat(cropFrame?.style.getPropertyValue('--photo-ui-scale')) || 1.0;
    const effectiveScale = uiScale * scale;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = targetW;
    outCanvas.height = targetH;
    const ctx = outCanvas.getContext('2d');

    // Scale from client screen pixels to high-res WebGL canvas pixels
    const scaleX = sw / cRect.width;
    const scaleY = sh / cRect.height;

    const frameLeft = fRect.left - cRect.left;
    const frameTop = fRect.top - cRect.top;

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

    // Target export coordinates (maintains exact 1:1 pixel mapping with crop frame)
    const destX = Math.round(((visibleLeft - frameLeft) / frameW) * targetW);
    const destY = Math.round(((visibleTop - frameTop) / frameH) * targetH);
    const destW = Math.round((visibleW / frameW) * targetW);
    const destH = Math.round((visibleH / frameH) * targetH);

    // Fill background with fog/theme color if frame extends beyond canvas
    ctx.fillStyle = `#${stage.fogTarget ? stage.fogTarget.getHexString() : '2a2d31'}`;
    ctx.fillRect(0, 0, targetW, targetH);

    // 1. Draw 3D scene (exact 1:1 match with crop frame view)
    if (sWidth > 0 && sHeight > 0 && destW > 0 && destH > 0) {
      ctx.drawImage(source, sx, sy, sWidth, sHeight, destX, destY, destW, destH);
    }

    // 2. Draw Mac bar if enabled (proportionally scaled to match on-screen viewfinder)
    if (withMacFrame) {
      const liveBar = root.querySelector('.photo-live-mac-bar');
      const liveBarH = (liveBar && liveBar.getBoundingClientRect().height) || (38 * uiScale);
      const exportBarH = Math.round(liveBarH * scale);
      drawMacWindowBar(ctx, targetW, exportBarH, getSiteDomain(), effectiveScale);
    }

    // 3. Draw branding watermark (proportionally scaled to match on-screen viewfinder)
    await loadHomecraftLogo();
    drawWatermark(ctx, targetW, targetH, effectiveScale);

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

  // ---------- Resizable & Draggable Viewfinder Crop Frame ----------
  const cropFrame = root.querySelector('.photo-crop-frame');
  let frameX = -1, frameY = -1, frameW = 0, frameH = 0;

  function updateCropFrameScale() {
    if (!cropFrame) return;
    const baseRef = ratio === '9:16' ? 440 : 960;
    const uiScale = Math.max(0.65, Math.min(2.0, frameW / baseRef));
    const barH = Math.round(38 * uiScale);
    cropFrame.style.setProperty('--photo-ui-scale', uiScale.toFixed(3));
    cropFrame.style.setProperty('--photo-bar-h', `${barH}px`);
  }

  function getViewportSize() {
    const rect = viewfinder?.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect?.width || window.innerWidth)),
      height: Math.max(1, Math.round(rect?.height || window.innerHeight)),
    };
  }

  function applyCropFrame() {
    if (!cropFrame) return;
    // Every resize path ends here, so wheel, pinch, handles, dragging and
    // orientation changes all share the same on-screen boundary.
    const viewport = getViewportSize();
    const minW = Math.min(120, viewport.width);
    const minH = Math.min(80, viewport.height);
    frameW = Math.round(Math.max(minW, Math.min(viewport.width, frameW)));
    frameH = Math.round(Math.max(minH, Math.min(viewport.height, frameH)));
    frameX = Math.round(Math.max(0, Math.min(viewport.width - frameW, frameX)));
    frameY = Math.round(Math.max(0, Math.min(viewport.height - frameH, frameY)));
    cropFrame.style.width = `${frameW}px`;
    cropFrame.style.height = `${frameH}px`;
    cropFrame.style.transform = `translate3d(${frameX}px, ${frameY}px, 0)`;
    updateCropFrameScale();
  }

  function resetCropFramePosition() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const isMobile = sw < 640;
    const aspect = ratio === '16:9' ? (16 / 9) : (ratio === '9:16' ? (9 / 16) : 1);
    const bottomReserved = isMobile ? 140 : 120;
    const topReserved = isMobile ? 40 : 0;
    const availH = sh - bottomReserved - topReserved;
    const availW = sw * (isMobile ? 0.92 : 0.88);

    let w, h;
    if (ratio === '16:9') {
      w = Math.min(availW, availH * (16 / 9));
      h = w / (16 / 9);
    } else if (ratio === '9:16') {
      h = Math.min(availH, availW * (16 / 9));
      w = h * (9 / 16);
    } else {
      const size = Math.min(availW, availH);
      w = size; h = size;
    }
    frameW = Math.round(w);
    frameH = Math.round(h);
    frameX = Math.round((sw - frameW) / 2);
    frameY = Math.round(topReserved + (availH - frameH) / 2);
    applyCropFrame();
  }

  // Corner & Edge 8-handle resize state
  let isResizing = false;
  let resizeHandle = null; // 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'
  let resizeStartPointerX = 0, resizeStartPointerY = 0;
  let resizeStartFrameX = 0, resizeStartFrameY = 0;
  let resizeStartW = 0, resizeStartH = 0;
  let resizeStartAspect = 1;

  function onResizePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target.closest('.p-corner, .p-edge');
    if (!target || !cropFrame) return;

    e.preventDefault();
    e.stopPropagation();

    isResizing = true;
    if (target.classList.contains('tl')) resizeHandle = 'tl';
    else if (target.classList.contains('tr')) resizeHandle = 'tr';
    else if (target.classList.contains('bl')) resizeHandle = 'bl';
    else if (target.classList.contains('br')) resizeHandle = 'br';
    else if (target.classList.contains('t')) resizeHandle = 't';
    else if (target.classList.contains('b')) resizeHandle = 'b';
    else if (target.classList.contains('l')) resizeHandle = 'l';
    else if (target.classList.contains('r')) resizeHandle = 'r';

    resizeStartPointerX = e.clientX;
    resizeStartPointerY = e.clientY;
    resizeStartFrameX = frameX;
    resizeStartFrameY = frameY;
    resizeStartW = frameW;
    resizeStartH = frameH;
    resizeStartAspect = (frameW > 0 && frameH > 0) ? (frameW / frameH) : (16 / 9);

    cropFrame.classList.add('is-resizing');
    target.setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e) {
    if (!isResizing || !cropFrame || !resizeHandle) return;

    const dx = e.clientX - resizeStartPointerX;
    const dy = e.clientY - resizeStartPointerY;

    const minW = 120;
    const minH = 80;
    const viewport = getViewportSize();
    const maxW = viewport.width;
    const maxH = viewport.height;

    let newX = resizeStartFrameX;
    let newY = resizeStartFrameY;
    let newW = resizeStartW;
    let newH = resizeStartH;

    const lockAspect = e.shiftKey; // Hold shift to lock aspect ratio, otherwise freeform arbitrary sizing

    if (resizeHandle === 'r') {
      newW = Math.max(minW, Math.min(maxW, resizeStartW + dx));
    } else if (resizeHandle === 'l') {
      newW = Math.max(minW, Math.min(maxW, resizeStartW - dx));
      newX = (resizeStartFrameX + resizeStartW) - newW;
    } else if (resizeHandle === 'b') {
      newH = Math.max(minH, Math.min(maxH, resizeStartH + dy));
    } else if (resizeHandle === 't') {
      newH = Math.max(minH, Math.min(maxH, resizeStartH - dy));
      newY = (resizeStartFrameY + resizeStartH) - newH;
    } else if (resizeHandle === 'br') {
      if (lockAspect) {
        const a = resizeStartAspect;
        const s = (dx * a + dy) / (a * a + 1);
        newW = Math.max(minW, Math.min(maxW, resizeStartW + s * a));
        newH = Math.max(minH, Math.min(maxH, newW / a));
      } else {
        newW = Math.max(minW, Math.min(maxW, resizeStartW + dx));
        newH = Math.max(minH, Math.min(maxH, resizeStartH + dy));
      }
    } else if (resizeHandle === 'tr') {
      if (lockAspect) {
        const a = resizeStartAspect;
        const s = (dx * a - dy) / (a * a + 1);
        newW = Math.max(minW, Math.min(maxW, resizeStartW + s * a));
        newH = Math.max(minH, Math.min(maxH, newW / a));
        newY = (resizeStartFrameY + resizeStartH) - newH;
      } else {
        newW = Math.max(minW, Math.min(maxW, resizeStartW + dx));
        newH = Math.max(minH, Math.min(maxH, resizeStartH - dy));
        newY = (resizeStartFrameY + resizeStartH) - newH;
      }
    } else if (resizeHandle === 'bl') {
      if (lockAspect) {
        const a = resizeStartAspect;
        const s = (-dx * a + dy) / (a * a + 1);
        newW = Math.max(minW, Math.min(maxW, resizeStartW + s * a));
        newH = Math.max(minH, Math.min(maxH, newW / a));
        newX = (resizeStartFrameX + resizeStartW) - newW;
      } else {
        newW = Math.max(minW, Math.min(maxW, resizeStartW - dx));
        newH = Math.max(minH, Math.min(maxH, resizeStartH + dy));
        newX = (resizeStartFrameX + resizeStartW) - newW;
      }
    } else if (resizeHandle === 'tl') {
      if (lockAspect) {
        const a = resizeStartAspect;
        const s = (-dx * a - dy) / (a * a + 1);
        newW = Math.max(minW, Math.min(maxW, resizeStartW + s * a));
        newH = Math.max(minH, Math.min(maxH, newW / a));
        newX = (resizeStartFrameX + resizeStartW) - newW;
        newY = (resizeStartFrameY + resizeStartH) - newH;
      } else {
        newW = Math.max(minW, Math.min(maxW, resizeStartW - dx));
        newH = Math.max(minH, Math.min(maxH, resizeStartH - dy));
        newX = (resizeStartFrameX + resizeStartW) - newW;
        newY = (resizeStartFrameY + resizeStartH) - newH;
      }
    }

    if (lockAspect) {
      const a = resizeStartAspect;
      const lockedMaxW = Math.min(maxW, maxH * a);
      const lockedMinW = Math.min(lockedMaxW, Math.max(minW, minH * a));
      newW = Math.max(lockedMinW, Math.min(lockedMaxW, newW));
      newH = newW / a;
      if (resizeHandle.includes('l')) newX = resizeStartFrameX + resizeStartW - newW;
      if (resizeHandle.includes('t')) newY = resizeStartFrameY + resizeStartH - newH;
    }

    frameX = Math.round(newX);
    frameY = Math.round(newY);
    frameW = Math.round(newW);
    frameH = Math.round(newH);

    // Switch ratio state to 'free' when freely resized
    if (ratio !== 'free') {
      setRatioLabel('free');
    }

    applyCropFrame();
  }

  function onResizePointerUp(e) {
    if (!isResizing) return;
    isResizing = false;
    resizeHandle = null;
    cropFrame?.classList.remove('is-resizing');
    try { e.target.releasePointerCapture(e.pointerId); } catch {}
  }

  // Moving / Panning the frame
  let isMovingFrame = false;
  let moveStartX = 0, moveStartY = 0;
  let moveStartFrameX = 0, moveStartFrameY = 0;

  function onFramePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('.p-corner, .p-edge, .live-mac-traffic, button, a')) return;

    isMovingFrame = true;
    moveStartX = e.clientX;
    moveStartY = e.clientY;
    moveStartFrameX = frameX;
    moveStartFrameY = frameY;
    cropFrame?.classList.add('is-moving');
    cropFrame?.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onFramePointerMove(e) {
    if (!isMovingFrame || isResizing || !cropFrame) return;
    const dx = e.clientX - moveStartX;
    const dy = e.clientY - moveStartY;
    frameX = Math.round(moveStartFrameX + dx);
    frameY = Math.round(moveStartFrameY + dy);
    applyCropFrame();
  }

  function onFramePointerUp(e) {
    if (!isMovingFrame || !cropFrame) return;
    isMovingFrame = false;
    cropFrame.classList.remove('is-moving');
    try { cropFrame.releasePointerCapture(e.pointerId); } catch {}
  }

  function onFrameWheel(e) {
    if ((e.ctrlKey || e.metaKey || e.altKey) && cropFrame) {
      e.preventDefault();
      const currentAspect = (frameW > 0 && frameH > 0) ? (frameW / frameH) : (16 / 9);
      const factor = e.deltaY < 0 ? 1.05 : 0.95;
      const minW = 120;
      const viewport = getViewportSize();
      const maxW = Math.min(viewport.width, viewport.height * currentAspect);
      const newW = Math.max(minW, Math.min(maxW, frameW * factor));
      const newH = newW / currentAspect;
      const centerX = frameX + frameW / 2;
      const centerY = frameY + frameH / 2;
      frameW = Math.round(newW);
      frameH = Math.round(newH);
      frameX = Math.round(centerX - frameW / 2);
      frameY = Math.round(centerY - frameH / 2);
      applyCropFrame();
    }
  }

  // Touch pinch-to-zoom on crop frame
  let touchPinchDist = 0;
  let touchStartW = 0;
  let touchStartCenterX = 0;
  let touchStartCenterY = 0;

  function onTouchStart(e) {
    if (e.touches.length === 2 && cropFrame) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      touchPinchDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      touchStartW = frameW;
      touchStartCenterX = frameX + frameW / 2;
      touchStartCenterY = frameY + frameH / 2;
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && cropFrame && touchPinchDist > 0) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentAspect = (frameW > 0 && frameH > 0) ? (frameW / frameH) : (16 / 9);
      const minW = 120;
      const viewport = getViewportSize();
      const maxW = Math.min(viewport.width, viewport.height * currentAspect);
      const scaleFactor = dist / touchPinchDist;
      const newW = Math.max(minW, Math.min(maxW, touchStartW * scaleFactor));
      const newH = newW / currentAspect;
      frameW = Math.round(newW);
      frameH = Math.round(newH);
      frameX = Math.round(touchStartCenterX - frameW / 2);
      frameY = Math.round(touchStartCenterY - frameH / 2);
      applyCropFrame();
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length < 2) {
      touchPinchDist = 0;
    }
  }

  if (cropFrame) {
    cropFrame.addEventListener('pointerdown', onFramePointerDown);
    cropFrame.addEventListener('pointermove', onFramePointerMove);
    cropFrame.addEventListener('pointerup', onFramePointerUp);
    cropFrame.addEventListener('pointercancel', onFramePointerUp);
    cropFrame.addEventListener('dblclick', () => resetCropFramePosition());
    cropFrame.addEventListener('wheel', onFrameWheel, { passive: false });
    cropFrame.addEventListener('touchstart', onTouchStart, { passive: true });
    cropFrame.addEventListener('touchmove', onTouchMove, { passive: false });
    cropFrame.addEventListener('touchend', onTouchEnd, { passive: true });

    for (const handleEl of cropFrame.querySelectorAll('.p-corner, .p-edge')) {
      handleEl.addEventListener('pointerdown', onResizePointerDown);
      handleEl.addEventListener('pointermove', onResizePointerMove);
      handleEl.addEventListener('pointerup', onResizePointerUp);
      handleEl.addEventListener('pointercancel', onResizePointerUp);
    }
  }

  // ---------- Draggable Control Bar ----------
  const bar = root.querySelector('.photo-bar');
  const handle = root.querySelector('.photo-drag-handle');
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let curOffsetX = 0, curOffsetY = 0;

  function onPointerDown(e) {
    if (window.innerWidth < 640) return;
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
    applyLens();
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

  quickFlipBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = angle === 'selfie' ? 'current' : 'selfie';
    applyAngle(next);
    sound?.play('click');
  });

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
      updateQuickFlipBtn();
    }
  });

  window.addEventListener('resize', () => {
    if (open) {
      applyLens();
      applyCropFrame();
      updateLiveMacBar();
    }
  });

  return {
    open: openStudio,
    close: closeStudio,
    toggle: toggleStudio,
    isOpen: () => open,
    captureBlob,
  };
}
