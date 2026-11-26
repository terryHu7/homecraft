import { getOffice } from './office-content.js';
import { publicContacts } from './contact-links.js';

const display = document.querySelector('#office-monitor');
const body = display.querySelector('[data-office-body]');
let selected = 'resume';
let content;
let resumeImage;

function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}
function resumePreview(data) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1450;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fcf8ee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#214c3a'; ctx.fillRect(0, 0, canvas.width, 22);
  let y = 90;
  function paragraph(value, size, weight, color, spacing = size * 1.3) {
    ctx.font = weight + ' ' + size + 'px system-ui, sans-serif';
    ctx.fillStyle = color;
    for (const line of value.split('\n')) {
      let part = '';
      for (const word of line.split(/\s+/)) {
        const next = part ? part + ' ' + word : word;
        if (part && ctx.measureText(next).width > 864) { ctx.fillText(part, 68, y); y += spacing; part = word; }
        else part = next;
      }
      if (part) ctx.fillText(part, 68, y);
      y += spacing;
    }
  }
  paragraph(data.resume.title, 49, 'bold', '#162b21');
  paragraph(data.resume.subtitle, 26, 'bold', '#45604b');
  y += 17;
  paragraph(data.resume.summary, 21, 'normal', '#29362d');
  for (const [title, entries] of [['Experience', data.experience], ['Technical skills', data.skills],
    ['Projects', data.projects], ['Education', [{ title: data.resume.education, detail: '' }]]]) {
    y += 18;
    paragraph(title.toUpperCase(), 23, 'bold', '#2d674d');
    for (const item of entries) {
      paragraph(item.title, 21, 'bold', '#192d23');
      if (item.detail) paragraph(item.detail, 19, 'normal', '#29362d');
      y += 7;
    }
  }
  return canvas.toDataURL('image/png');
}
function render() {
  for (const button of display.querySelectorAll('[data-office-tab]')) {
    button.setAttribute('aria-pressed', String(button.dataset.officeTab === selected));
  }
  body.replaceChildren();
  body.scrollTop = 0;
  if (selected === 'contact') {
    for (const [id, label, url] of publicContacts) {
      const row = element('article', '', body);
      element('h3', label, row);
      const link = element('a', url.replace(/^(mailto:|https:\/\/)/, ''), row);
      link.href = url;
      if (id !== 'mail') { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
    return;
  }
  if (!content) { element('p', 'Loading portfolio…', body); return; }
  if (selected === 'resume') {
    element('h3', content.resume.title, body);
    element('p', content.resume.subtitle, body);
    const img = element('img', '', body);
    img.src = resumeImage ||= content.resume.image || resumePreview(content);
    img.alt = 'Résumé for ' + content.resume.title;
    img.onerror = () => {
      if (img.src !== content.resume.image && !content.resume.image) return;
      img.onerror = null;
      img.src = resumeImage = resumePreview(content);
    };
    element('p', content.resume.summary, body);
    element('p', content.resume.education, body);
    return;
  }
  if (!content[selected].length) element('p', 'No entries yet.', body);
  for (const entry of content[selected]) {
    const card = element('article', '', body);
    element('h3', entry.title, card);
    element('p', entry.detail, card);
    if (entry.link) {
      const link = element('a', 'Visit project', card);
      link.href = entry.link;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
    }
  }
}
display.addEventListener('click', event => {
  const button = event.target.closest('[data-office-tab]');
  if (button) { selected = button.dataset.officeTab; render(); }
  if (event.target.closest('[data-office-exit]')) display.close();
});
display.addEventListener('close', () => window.__home?.extras.leaveOffice());
document.addEventListener('office:open', async () => {
  selected = 'resume';
  if (!display.open) display.showModal();
  render();
  content = await getOffice();
  resumeImage = '';
  if (display.open) render();
});
