// Chinese or English (home.config.js `languages`). With both, the visitor's
// browser decides (Chinese for any zh-*, English for everything else) until
// they press the 中/EN switch, which is remembered; a ?lang=en or ?lang=zh
// link picks one for that visit. With one, that is the only language.
// index.html carries both. Long text, written twice, sits in lang="zh-CN" and
// lang="en" blocks and <html lang> shows one (style.css). A short label is
// written in one language in the markup with the other beside it: data-en
// (or data-zh when the markup is English) for the text, data-en-label,
// -placeholder, -alt or -src for that attribute.
import { config } from './config.js';

const KEY = 'homecraft-lang';
const LANGS = (config.languages || ['zh', 'en']).filter(v => v === 'zh' || v === 'en');
const valid = v => LANGS.includes(v);
export const bilingual = LANGS.length > 1;

function initial() {
  if (!bilingual) return LANGS[0] || 'zh';
  const asked = new URLSearchParams(location.search).get('lang');
  if (valid(asked)) return asked;
  try { const saved = localStorage.getItem(KEY); if (valid(saved)) return saved; } catch {}
  return (navigator.languages?.[0] || navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export let lang = initial();
export const t = (zh, en) => lang === 'en' ? en : zh;
// A station's name: `name` is Chinese, `en` its English.
export const nameOf = s => lang === 'en' && s.en || s.name;

// data-en-* or data-zh-* holds the language the markup isn't written in; the
// markup's own is kept in the other attribute on the first switch, so copies
// of a page (the open panel) switch the same way.
const PARTS = { '': null, '-label': 'aria-label', '-placeholder': 'placeholder', '-alt': 'alt', '-src': 'src' };
export function applyLang() {
  document.documentElement.lang = t('zh-CN', 'en');
  const other = lang === 'en' ? 'zh' : 'en';
  for (const [part, attr] of Object.entries(PARTS)) {
    const want = `data-${lang}${part}`, keep = `data-${other}${part}`;
    for (const el of document.querySelectorAll(`[${want}], [${keep}]`)) {
      // Without the wanted attribute the markup is already in that language.
      if (!el.hasAttribute(want)) continue;
      if (!el.hasAttribute(keep)) el.setAttribute(keep, attr ? el.getAttribute(attr) ?? '' : el.textContent);
      const value = el.getAttribute(want);
      if (attr) el.setAttribute(attr, value); else el.textContent = value;
    }
  }
}

const listeners = [];
export const onLang = fn => listeners.push(fn);
export function setLang(next) {
  if (!valid(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch {}
  // A ?lang link no longer says what is showing.
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); history.replaceState(history.state, '', url); }
  applyLang();
  for (const fn of listeners) fn(lang);
}

// The switch names the other language: EN while Chinese shows, 中 while English does.
export function langSwitch() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lang-switch';
  b.hidden = !bilingual;
  const show = () => {
    b.textContent = t('EN', '中');
    b.setAttribute('aria-label', t('English', '中文'));
  };
  b.addEventListener('click', () => setLang(t('en', 'zh')));
  onLang(show);
  show();
  return b;
}
