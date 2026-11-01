// Run: node --experimental-vm-modules tools/check-mailbox.cjs
// No real mail: Siteverify and the email binding are replaced in an isolated VM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

async function fixture(options = {}) {
  const calls = { verify: 0, mail: [], writes: [] };
  const context = vm.createContext({
    Request, Response, URL, TextEncoder, AbortSignal, crypto: webcrypto, btoa, console,
    fetch: async (url, init) => {
      calls.verify++;
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(JSON.parse(init.body).response, 'visitor-token');
      assert.equal(JSON.parse(init.body).remoteip, '192.0.2.1');
      if (options.outage) throw new Error('Verification network fixture');
      if (options.malformed) return new Response('not JSON');
      return Response.json(options.verdict ?? { success: true, hostname: 'owner.example', action: 'mailbox' }, { status: options.status ?? 200 });
    },
  });
  const source = new vm.SourceTextModule(fs.readFileSync(new URL('../backend/mailbox/src/index.js', `file://${__filename}`), 'utf8'), { context });
  await source.link(() => new vm.SyntheticModule(['EmailMessage'], function () {
    this.setExport('EmailMessage', class { constructor(from, to, raw) { Object.assign(this, { from, to, raw }); } });
  }, { context }));
  await source.evaluate();
  const env = {
    SITE: 'https://owner.example,https://www.owner.example', FROM: 'mailbox@owner.example', TO: 'owner@example.test', NAME: 'My Home', HOME: 'https://owner.example/',
    SALT: 'test-salt', TURNSTILE_SECRET_KEY: options.noSecret ? undefined : 'test-secret',
    LIMITS: { get: async () => options.limited ? '100' : null, put: async (...args) => calls.writes.push(args) },
    MAIL: { send: async mail => { calls.mail.push(mail); if (options.mailOutage) throw new Error('Mail fixture'); } },
  };
  async function send(body, form = false, headers = {}) {
    const response = await source.namespace.default.fetch(new Request('https://mailbox.owner.example/send', {
      method: 'POST',
      headers: { Origin: 'https://owner.example', 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', ...headers },
      body: form ? new URLSearchParams(body) : JSON.stringify(body),
    }), env);
    return { response, result: form ? await response.text() : await response.json() };
  }
  return { send, calls };
}

(async () => {
  const valid = { subject: '网站移动端操作反馈', message: '很喜欢你做的作品', contact: '微信：visitor', 'cf-turnstile-response': 'visitor-token' };
  const cases = [
    ['missing subject', { ...valid, subject: undefined }, {}, 400, 'subject'],
    ['blank subject', { ...valid, subject: '   ' }, {}, 400, 'subject'],
    ['invalid subject type', { ...valid, subject: {} }, {}, 400, 'subject'],
    ['long subject', { ...valid, subject: '题'.repeat(81) }, {}, 400, 'subject'],
    ...['\r\nBcc: other@example.com', '\n', '\t', '\0', '\u007f', '\u2028', '\u2029'].map(control =>
      ['subject control characters', { ...valid, subject: `Hello${control}world` }, {}, 400, 'subject']),
    ['missing contact', { ...valid, contact: undefined }, {}, 400, 'contact'],
    ['blank contact', { ...valid, contact: ' \n ' }, {}, 400, 'contact'],
    ['invalid contact type', { ...valid, contact: {} }, {}, 400, 'contact'],
    ['blank note', { ...valid, message: ' ' }, {}, 400, 'bad'],
    ['long contact', { ...valid, contact: 'a'.repeat(121) }, {}, 400, 'bad'],
    ['null JSON', null, {}, 400, 'bad'],
    ['array JSON', [], {}, 400, 'bad'],
    ['missing token', { ...valid, 'cf-turnstile-response': undefined }, {}, 403, 'verify'],
    ['oversize token', { ...valid, 'cf-turnstile-response': 'a'.repeat(2049) }, {}, 403, 'verify'],
    ['rejected token', valid, { verdict: { success: false, 'error-codes': ['invalid-input-response'] } }, 403, 'verify'],
    ['expired/reused token', valid, { verdict: { success: false, 'error-codes': ['timeout-or-duplicate'] } }, 403, 'verify'],
    ['wrong hostname', valid, { verdict: { success: true, hostname: 'other.example', action: 'mailbox' } }, 403, 'verify'],
    ['wrong action', valid, { verdict: { success: true, hostname: 'owner.example', action: 'login' } }, 403, 'verify'],
    ['missing secret', valid, { noSecret: true }, 503, 'unavailable'],
    ['verification outage', valid, { outage: true }, 503, 'unavailable'],
    ['verification HTTP failure', valid, { status: 500 }, 503, 'unavailable'],
    ['malformed verification reply', valid, { malformed: true }, 503, 'unavailable'],
    ['existing daily limit', valid, { limited: true }, 429, 'limit'],
    ['honeypot', { ...valid, website: 'bot.example' }, {}, 200, 'sent'],
  ];
  for (const [name, body, options, status, code] of cases) {
    const { send, calls } = await fixture(options);
    const { response, result } = await send(body);
    assert.equal(response.status, status, name);
    assert.equal(result.code, code, name);
    assert.equal(calls.mail.length, 0, `${name} sent email`);
    assert.equal(calls.writes.length, 0, `${name} changed delivery quota`);
  }
  for (const hostname of ['owner.example', 'www.owner.example']) {
    const { send, calls } = await fixture({ verdict: { success: true, hostname, action: 'mailbox' } });
    assert.equal((await send(valid)).result.ok, true);
    assert.equal(calls.mail.length, 1);
    assert.equal(calls.writes.length, 2);
    assert(!calls.mail[0].raw.includes('Reply-To:'), 'WeChat was treated as an email');
    const payload = calls.mail[0].raw.split('\r\n\r\n')[1];
    assert.equal(Buffer.from(payload, 'base64').toString(), `${valid.message}\n\n${valid.contact}`);
  }
  // Decode the actual MIME header, including folded Chinese/emoji subjects.
  for (const subject of [valid.subject, '项目合作咨询 — collaboration', 'A'.repeat(80), '题'.repeat(80), '🏠'.repeat(40), '合作 & feedback?']) {
    const delivery = await fixture();
    assert.equal((await delivery.send({ ...valid, subject: `  ${subject}  ` })).response.status, 200);
    const raw = delivery.calls.mail[0].raw;
    const header = raw.match(/^Subject: (.*(?:\r\n[ \t].*)*)/m)?.[1];
    assert(header, 'Missing email subject');
    const words = [...header.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    assert(words.every(word => word[0].length <= 75), 'Oversize MIME encoded word');
    assert.equal(words.map(word => Buffer.from(word[1], 'base64').toString()).join(''), subject, 'Subject changed or was truncated');
    assert.equal(raw.match(/^Subject:/gm).length, 1);
  }
  const email = await fixture();
  await email.send({ ...valid, contact: ' visitor@example.com ' });
  assert(email.calls.mail[0].raw.includes('Reply-To: <visitor@example.com>'));
  const form = await fixture();
  assert.equal((await form.send({ subject: valid.subject, message: 'test', contact: 'test@example.com' }, true)).response.status, 403);
  assert.equal(form.calls.mail.length, 0, 'Plain form bypassed verification');
  assert.equal((await form.send({ ...valid, contact: ' ' }, true)).response.status, 400);
  assert.equal((await form.send(valid, true)).response.status, 200);
  assert.equal(form.calls.mail.length, 1);
  for (const subject of ['', 'test\r\nBcc: other@example.com', '题'.repeat(81)]) {
    const rejected = await fixture();
    for (const lang of ['zh', 'en']) {
      const { response, result } = await rejected.send({ ...valid, subject, lang }, true);
      assert.equal(response.status, 400);
      assert(result.includes(lang === 'en' ? 'single-line subject' : '单行主题'));
    }
    assert.equal(rejected.calls.mail.length, 0, 'Invalid form subject sent mail');
    assert.equal(rejected.calls.verify, 0, 'Invalid subject consumed verification');
  }
  for (const [browserLanguage, selectedLanguage, expectedLanguage, words] of [
    ['en-US,en;q=0.9', undefined, 'en', 'Please leave a way to reach you.'],
    ['zh-CN,zh;q=0.9', undefined, 'zh-CN', '请填写联系方式。'],
    ['zh-CN', 'en', 'en', 'Please leave a way to reach you.'],
    ['en-US', 'zh', 'zh-CN', '请填写联系方式。'],
  ]) {
    const localized = await fixture();
    const { response, result } = await localized.send({ subject: valid.subject, message: 'test', contact: '', ...(selectedLanguage ? { lang: selectedLanguage } : {}) }, true, { 'Accept-Language': browserLanguage });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Content-Language'), expectedLanguage);
    assert(result.includes(`<html lang="${expectedLanguage}">`));
    assert(result.includes(words));
    assert.equal(localized.calls.mail.length, 0);
  }
  const forbidden = await fixture();
  assert.equal((await forbidden.send(valid, false, { Origin: 'https://other.example' })).response.status, 403);
  assert.equal(forbidden.calls.mail.length, 0);
  assert.equal(forbidden.calls.verify, 0);
  console.log('PASS: mailbox validation and configuration cases; verification cannot be bypassed; email/WeChat contacts; localized fallback; no real email sent');
})().catch(error => { console.error(error); process.exitCode = 1; });
