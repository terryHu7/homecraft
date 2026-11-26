const video = document.createElement('video');
video.controls = true;
video.playsInline = true;
video.preload = 'metadata';
let directURL = '';
let projectable = true;
let embed = null;
let message = '';

function submitURL(input) {
  let url;
  try { url = new URL(input, location.href); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let youtube;
  if (host === 'youtu.be') youtube = parts[0];
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    youtube = parts[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '';
  }
  if (youtube && /^[\w-]{11}$/.test(youtube)) {
    return { embed: 'https://www.youtube-nocookie.com/embed/' + youtube + '?autoplay=1' };
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const id = parts[0] === 'video' ? parts[1] : parts[0];
    if (/^\d+$/.test(id || '')) {
      const hash = url.searchParams.get('h') || (parts[0] === 'video' ? '' : parts[1]);
      return { embed: 'https://player.vimeo.com/video/' + id + '?autoplay=1' +
        (hash && /^[a-z0-9]+$/i.test(hash) ? '&h=' + hash : '') };
    }
  }
  if (youtube !== undefined || /^(?:www\.|player\.)?vimeo\.com$/.test(host) || host === 'youtu.be') return null;
  return { direct: url.href };
}

function panel() {
  return document.querySelector('#panel[open] [data-tv-stage]')?.closest('dialog');
}
function refresh() {
  const dialog = panel();
  if (!dialog) return;
  const preview = dialog.querySelector('[data-tv-stage]');
  const media = embed || (directURL ? video : null);
  if (preview.firstChild !== media) preview.replaceChildren(...(media ? [media] : []));
  const status = dialog.querySelector('[data-tv-status]');
  if (status.textContent !== message) status.textContent = message;
  const room = dialog.querySelector('[data-tv-room]');
  room.hidden = !directURL || !projectable || video.readyState < 2;
}

function updateCRT(source) {
  window.__home?.extras.showTVVideo(source);
}

function stop() {
  directURL = '';
  video.pause();
  video.removeAttribute('src');
  video.load();
  embed?.remove();
  embed = null;
  updateCRT(null);
}

function play() {
  video.play().catch(error => {
    if (error.name !== 'NotAllowedError') return;
    message = 'Press Play in the video controls to start playback.';
    refresh();
  });
}

video.addEventListener('loadeddata', () => {
  if (!directURL) return;
  if (projectable) updateCRT(video);
  message = projectable ? '' : 'This host allows playback here only. Use the controls below the video.';
  refresh();
});

video.addEventListener('error', () => {
  if (!directURL) return;
  if (!projectable) {
    message = 'This video could not be played. Check the URL and try again.';
  } else {
    // Some hosts allow media playback but forbid using their frames in WebGL.
    projectable = false;
    updateCRT(null);
    video.removeAttribute('crossorigin');
    video.src = directURL;
    play();
  }
  refresh();
});

document.addEventListener('submit', event => {
  if (!event.target.matches('[data-tv-form]')) return;
  event.preventDefault();
  const source = submitURL(new FormData(event.target).get('video'));
  if (!source) {
    message = 'Enter a valid direct video, YouTube, or Vimeo URL.';
    refresh();
    return;
  }
  stop();
  message = '';
  if (source.embed) {
    embed = document.createElement('iframe');
    embed.title = 'Television video player';
    embed.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    embed.allowFullscreen = true;
    embed.src = source.embed;
    message = 'Use the player controls here for this video.';
  } else {
    directURL = source.direct;
    projectable = true;
    video.crossOrigin = 'anonymous';
    video.muted = false;
    video.src = directURL;
    play();
  }
  refresh();
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-tv-stop]')) {
    stop();
    message = 'Television off.';
    refresh();
  } else if (event.target.closest('[data-tv-room]') && directURL && projectable) {
    play();
    panel()?.close();
  }
});

document.addEventListener('close', event => {
  if (event.target.id !== 'panel' || !event.target.querySelector('[data-tv-stage]')) return;
  if (embed || (directURL && !projectable)) stop();
}, true);

const observePanel = new MutationObserver(refresh);
const findPanel = new MutationObserver(() => {
  const container = document.querySelector('#panel');
  if (!container) return;
  findPanel.disconnect();
  observePanel.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  refresh();
});
findPanel.observe(document.body, { subtree: true, childList: true });
