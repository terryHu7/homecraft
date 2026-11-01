// Configurable mailbox Worker: verify every delivery, send through Email
// Routing, and retain only daily quota counters. Keys stay in Worker secrets.
import { EmailMessage } from 'cloudflare:email';

const MAX_SUBJECT = 80, MAX_NOTE = 1000, MAX_CONTACT = 120, PER_SENDER = 5, PER_DAY = 100;

// What the plain page (no JavaScript) shows after its form posts here.
const WORDS = {
  sent: ['已发送。', 'Sent.'],
  limit: ['今天发送次数太多，明天再试。', 'Too many notes today. Try again tomorrow.'],
  bad: ['发送失败：内容为空或太长。', 'Could not send: your note is empty or a field is too long.'],
  subject: ['请填写单行主题，最多 80 字。', 'Please enter a single-line subject (up to 80 characters).'],
  contact: ['请填写联系方式。', 'Please leave a way to reach you.'],
  verify: ['请完成真人验证后再发送。验证过期时请重新验证。', 'Please complete verification before sending. If it has expired, verify again.'],
  unavailable: ['验证暂不可用，请稍后重试。', 'Verification is unavailable. Try again later.'],
  fail: ['发送失败，请稍后再试。', 'Could not send. Please try again later.'],
  forbidden: ['这个信箱只收它自己网站上的留言。', 'This mailbox only accepts notes from its own site.'],
};

export default {
  async fetch(request, env) {
    const SITE = String(env.SITE || '').split(',').map(v => v.trim()).filter(Boolean);
    const hosts = SITE.map(value => { try { return new URL(value).hostname; } catch { return ''; } }).filter(Boolean);
    const origin = request.headers.get('Origin');
    const cors = SITE.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
      } });
    }
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') return new Response('Not found', { status: 404 });

    // The site's script sends JSON; the plain page posts an ordinary form.
    const form = (request.headers.get('Content-Type') || '').includes('form');
    let language = (request.headers.get('Accept-Language') || '').split(',')[0].trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const answer = (status, code) => form ? page(env, status, code, language) : Response.json({ ok: code === 'sent', code }, { status, headers: cors });
    if (origin && !SITE.includes(origin)) return answer(403, 'forbidden');
    let data;
    try { data = form ? Object.fromEntries(await request.formData()) : await request.json(); } catch { return answer(400, 'bad'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return answer(400, 'bad');
    if (data.lang === 'zh' || data.lang === 'en') language = data.lang;
    // Bots fill in the hidden field; they are told it went.
    if (String(data.website ?? '')) return answer(200, 'sent');
    const subject = typeof data.subject === 'string' ? data.subject.trim() : '';
    const note = typeof data.message === 'string' ? data.message.trim() : '';
    const contact = typeof data.contact === 'string' ? data.contact.trim() : '';
    if (!subject || subject.length > MAX_SUBJECT || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(data.subject)) return answer(400, 'subject');
    if (!contact) return answer(400, 'contact');
    if (!note || note.length > MAX_NOTE || contact.length > MAX_CONTACT) return answer(400, 'bad');

    const token = data['cf-turnstile-response'];
    if (typeof token !== 'string' || !token.trim() || token.length > 2048) return answer(403, 'verify');
    const verification = await verifyTurnstile(token, request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET_KEY, hosts);
    if (verification) return answer(verification === 'unavailable' ? 503 : 403, verification);

    const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // the date in China
    const sender = `s:${day}:${await digest(`${env.SALT}:${request.headers.get('CF-Connecting-IP')}:${day}`)}`;
    const total = `t:${day}`;
    const [mine, all] = (await Promise.all([env.LIMITS.get(sender), env.LIMITS.get(total)])).map(n => Number(n) || 0);
    if (mine >= PER_SENDER || all >= PER_DAY) return answer(429, 'limit');

    try {
      await env.MAIL.send(new EmailMessage(env.FROM, env.TO, letter(env, subject, note, contact)));
    } catch (error) {
      console.error('send failed', error);
      return answer(502, 'fail');
    }
    const keep = { expirationTtl: 2 * 86400 };
    await Promise.all([env.LIMITS.put(sender, String(mine + 1), keep), env.LIMITS.put(total, String(all + 1), keep)]);
    return answer(200, 'sent');
  },
};

// Every delivery, including ordinary form POSTs, needs a fresh token for this
// site's mailbox. Network/configuration failures never fall through to email.
async function verifyTurnstile(token, ip, secret, hosts) {
  if (!secret || !hosts.length) return 'unavailable';
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    if (result.success !== true || !hosts.includes(result.hostname) || result.action !== 'mailbox') return 'verify';
    return null;
  } catch {
    return 'unavailable';
  }
}

const b64 = text => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
// Fold headers into encoded words of at most 75 characters (RFC 2047),
// without splitting a Unicode code point or truncating the visitor's subject.
const encoded = text => {
  const words = [];
  let chunk = '', size = 0;
  for (const char of text) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 45) { words.push(`=?UTF-8?B?${b64(chunk)}?=`); chunk = ''; size = 0; }
    chunk += char; size += bytes;
  }
  if (chunk) words.push(`=?UTF-8?B?${b64(chunk)}?=`);
  return words.join('\r\n ');
};

// A plain-text email: the note, then the contact on its own line if one was
// left. The contact goes in Reply-To when it is an address, so answering the
// email answers the visitor.
function letter(env, subject, note, contact) {
  const body = contact ? `${note}\n\n${contact}` : note;
  const address = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact);
  return [
    `From: ${encoded(env.NAME || "Mailbox")} <${env.FROM}>`,
    `To: <${env.TO}>`,
    ...(address ? [`Reply-To: <${contact}>`] : []),
    `Subject: ${encoded(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${String(env.FROM).split('@')[1]}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(body).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
}

async function digest(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function page(env, status, code, language) {
  const en = language === 'en', lang = en ? 'en' : 'zh-CN';
  const name = escapeHTML(env.NAME || '');
  let back = '';
  try {
    const url = new URL(env.HOME);
    if (['https:', 'http:'].includes(url.protocol)) {
      url.searchParams.set('lang', language);
      back = `<p><a href="${escapeHTML(url.href)}">${en ? 'Back to the site' : '返回网站'}</a></p>`;
    }
  } catch {}
  const html = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${en ? 'Mailbox' : '信箱'}${name ? ' · ' + name : ''}</title>`
    + `<body style="font:16px/1.6 -apple-system,'PingFang SC',sans-serif;max-width:32em;margin:15vh auto;padding:0 24px;color:#2b2b2b">`
    + `<p>${WORDS[code][en ? 1 : 0]}</p>${back}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Language': lang, 'Cache-Control': 'no-store' } });
}
