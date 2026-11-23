// One loading screen for startup, world selection and return journeys.
import { loadingLogoReady, disposeLoadingLogo } from './loading-logo.js';
import { t, onLang } from '../lang.js';

let dismissTimer = null, loadingSequence = 0, lastPercent = null;

// The status line under the bar: 加载中 42% / Loading 42%. The markup carries
// both languages and style.css shows the one <html lang> picked, so the line
// is right from the first frame; every update writes both copies.
function setStatus(value) {
  lastPercent = value;
  const status = document.querySelector('#loading .loading-status');
  if (!status) return;
  const parts = status.querySelectorAll('[lang]');
  if (!parts.length) { status.textContent = `${t('加载中', 'Loading')} ${value}%`; return; }
  for (const part of parts) part.textContent = part.lang === 'en' ? `Loading ${value}%` : `加载中 ${value}%`;
}
onLang(() => { if (lastPercent !== null) setStatus(lastPercent); });

// `image` is a picture of where a portal leads (the destination's preview),
// shown above the bar while the next world loads; a broken one just goes.
export function showLoading(label = '', fraction = .08, image = null) {
  loadingSequence++;
  clearTimeout(dismissTimer);
  let root = document.getElementById('loading');
  if (!root) {
    root = document.createElement('div'); root.id = 'loading';
    root.innerHTML = '<div class="bar"><i></i></div><span class="loading-status" aria-hidden="true"><span lang="zh-CN"></span><span lang="en"></span></span>';
    document.body.append(root);
  }
  root.classList.remove('done');
  let status = root.querySelector('.loading-label');
  if (label && !status) {
    status = document.createElement('p'); status.className = 'loading-label';
    status.setAttribute('role', 'status'); root.append(status);
  }
  if (status) { status.textContent = label; status.hidden = !label; }
  let picture = root.querySelector('.loading-preview');
  if (image) {
    if (!picture) {
      picture = Object.assign(new Image(), { className: 'loading-preview', alt: '', decoding: 'async', referrerPolicy: 'no-referrer' });
      picture.addEventListener('error', () => picture.remove());
      root.prepend(picture);
    }
    picture.src = image;
  } else picture?.remove();
  setLoadingProgress(fraction);
}

export function setLoadingProgress(fraction) {
  const bar = document.querySelector('#loading .bar');
  if (!bar) return;
  const value = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  bar.querySelector('i').style.width = `${value}%`;
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', t('加载世界', 'Loading world'));
  bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', String(value));
  setStatus(value);
}

export async function finishLoading() {
  clearTimeout(dismissTimer);
  const root = document.getElementById('loading');
  if (!root) return;
  const sequence = loadingSequence;
  setLoadingProgress(1);
  // Resource/startup progress and the one-shot camera reveal are independent.
  // A slow world keeps the orbiting logo and a real progress bar; a fast world
  // waits for the reveal, then leaves once. The orbit never restarts the reveal.
  await loadingLogoReady();
  if (sequence !== loadingSequence || !root.isConnected) return;
  root.classList.add('done');
  dismissTimer = setTimeout(() => {
    root.remove();
    disposeLoadingLogo();
  }, 600);
}

export function hideLoading() {
  loadingSequence++;
  clearTimeout(dismissTimer);
  document.getElementById('loading')?.remove();
  disposeLoadingLogo();
}
