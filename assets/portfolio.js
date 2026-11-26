import { publicContacts } from './contact-links.js';

const email = publicContacts[0][2].slice('mailto:'.length);
const links = document.querySelector('[data-contact-links]');
const form = document.querySelector('[data-contact-form]');

for (const [app, label, url] of publicContacts) {
  const item = document.createElement('li');
  item.dataset.app = app;
  const name = document.createElement('span');
  name.textContent = label;
  item.append(name);
  const link = document.createElement('a');
  if (url) {
    link.href = url;
    link.textContent = 'Open ' + label;
    item.append(link);
  }
  links.append(item);
}

if (email) {
  form.querySelector('button').disabled = false;
  form.querySelector('[data-contact-status]').textContent = 'Your message opens as a draft in your email app.';
}

document.addEventListener('click', event => {
  const world = window.__home;
  if (event.target.closest('[data-stand-oonjal]') && world) {
    world.extras.standFromFurniture();
    return;
  }
  if (event.target.closest('[data-seated-tv]') && world) {
    world.openPage('tv');
    return;
  }
  const room = event.target.closest('[data-room]');
  if (!room || !world) return;
  event.preventDefault();
  world.go(room.dataset.room);
});

document.addEventListener('submit', event => {
  if (!event.target.matches('[data-contact-form]')) return;
  event.preventDefault();
  if (!email) return;
  const data = new FormData(event.target);
  location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(data.get('subject'))
    + '&body=' + encodeURIComponent(data.get('message'));
});
