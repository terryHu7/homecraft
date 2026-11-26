import { STATIONS } from './layout.js';

document.title = 'Swarga';
document.querySelector('#world').setAttribute('aria-label', 'Swarga');
const title = document.createElement('h1');
title.className = 'plain-title';
title.textContent = 'Swarga';
document.querySelector('#pages').replaceChildren(title, ...STATIONS.map(({ id, name, description }) => {
  const article = document.createElement('article');
  article.className = 'page';
  article.dataset.station = id;
  const heading = document.createElement('h2');
  heading.textContent = name;
  const text = document.createElement('p');
  text.textContent = description;
  article.append(heading, text);
  return article;
}));
