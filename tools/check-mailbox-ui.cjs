// Isolated browser fixtures: no real challenges, tokens or mail deliveries.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const base = process.argv[2] || 'http://127.0.0.1:4192';
const endpoint = 'https://mailbox.example.test/send';
const script = `
  const state = window.__mailboxTest = { widgets: new Map(), created: 0, removed: 0, resets: 0,
    pass() { [...this.widgets.values()].at(-1).options.callback('test-token'); },
    expire() { [...this.widgets.values()].at(-1).options['expired-callback'](); }
  };
  window.turnstile = {
    render(container, options) {
      const id = String(++state.created);
      container.textContent = options.language === 'en' ? 'Verification (test)' : '真人验证（测试）';
      container.style.minHeight = options.size === 'compact' ? '140px' : '65px';
      state.widgets.set(id, { container, options }); return id;
    },
    remove(id) { state.widgets.delete(id); state.removed++; },
    reset() { state.resets++; }
  };`;

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const handoff = 'location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(`${data.message}\\n\\n${data.contact}`)}`;';
  const isolated = 'window.__mailboxMailtos.push({ url: `mailto:${EMAIL}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(`${data.message}\\n\\n${data.contact}`)}`, isolated: true });';
  async function mailtoNavigations(page) {
    const attempts = await page.evaluate(() => window.__mailboxMailtos);
    assert(Array.isArray(attempts), 'Mailto isolation was not installed');
    return attempts;
  }
  function assertMailto(attempt, subject, body) {
    assert.equal(attempt.isolated, true, 'Mailto handoff was not isolated');
    const parsed = new URL(attempt.url);
    assert.equal(parsed.pathname, 'public@example.test');
    assert.equal(parsed.searchParams.get('subject'), subject);
    assert.equal(parsed.searchParams.get('body'), body);
  }
  async function configuredPage({ legacy = false, emailOnly = false, ...options } = {}) {
    const page = await browser.newPage(options);
    await page.addInitScript(() => { window.__mailboxMailtos = []; });
    // Chrome does not reliably expose external protocol handoffs through the
    // Navigation API. Replace only the final assignment in the served module;
    // form handling, validation, subject generation and URL encoding stay real.
    await page.route('**/engine/ui/mailbox.js', async route => {
      const response = await route.fetch();
      const source = await response.text();
      assert(source.includes(handoff), 'Mailbox handoff changed; update the isolated test seam');
      await route.fulfill({ response, body: source.replace(handoff, isolated) });
    });
    if (legacy) {
      const html = execFileSync('git', ['show', '8a8e101:index.html'], { encoding: 'utf8' });
      await page.route(url => url.origin === new URL(base).origin && url.pathname === '/', route =>
        route.fulfill({ contentType: 'text/html', body: html }));
    }
    await page.route('**/home.config.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/mailbox: \{[^}]*\}/,
        `mailbox: { endpoint: '${emailOnly ? '' : endpoint}', email: 'public@example.test', turnstileSitekey: 'test-sitekey' }`);
      await route.fulfill({ response, body });
    });
    return page;
  }
  try {
    const page = await configuredPage({ viewport: { width: 1280, height: 850 } });
    const errors = [], requests = []; let scripts = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => {
      scripts++;
      return route.fulfill({ contentType: 'application/javascript', body: script });
    });
    await page.route(endpoint, route => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: requests.length === 1 ? 403 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(requests.length === 1 ? { ok: false, code: 'verify' } : { ok: true, code: 'sent' }) });
    });
    await page.goto(`${base}/?lang=zh`);
    await page.waitForFunction(() => window.__home);
    assert.equal(scripts, 0, 'World startup loaded the verification script');
    await page.evaluate(() => window.__home.go('mailbox'));
    await page.waitForFunction(() => window.__mailboxTest?.widgets.size === 1);
    const form = page.locator('#panel form.mailbox');
    const subject = form.locator('[name="subject"]');
    const note = form.locator('textarea'), contact = form.locator('[name="contact"]'), send = form.locator('button[type="submit"]');
    assert(await subject.evaluate(el => el.required));
    assert.equal(await subject.getAttribute('maxlength'), '80');
    await note.fill('很喜欢这个网站');
    await contact.fill('visitor@example.com');
    await send.click();
    assert.equal(requests.length, 0, 'Empty subject reached API');
    assert.deepEqual(await mailtoNavigations(page), []);
    await subject.fill('   ');
    await send.click();
    assert.match(await form.locator('.mailbox-status').innerText(), /单行主题/);
    await page.locator('#panel').getByRole('button', { name: 'English', exact: true }).click();
    assert.equal(await subject.getAttribute('placeholder'), 'Subject');
    assert.equal(await subject.getAttribute('aria-label'), 'Subject (required)');
    assert.match(await form.locator('.mailbox-status').innerText(), /single-line subject/);
    await page.locator('#panel').getByRole('button', { name: '中文', exact: true }).click();
    assert.equal(await subject.getAttribute('placeholder'), '主题');
    await subject.fill(' 网站移动端操作反馈 ');
    await contact.fill('');
    assert(await contact.evaluate(el => el.required));
    await note.fill('很喜欢这个网站');
    await send.click();
    assert.equal(requests.length, 0, 'Empty contact reached API');
    assert.deepEqual(await mailtoNavigations(page), []);
    await contact.fill('   ');
    await send.click();
    assert.match(await form.locator('.mailbox-status').innerText(), /填写联系方式/);
    await page.locator('#panel').getByRole('button', { name: 'English', exact: true }).click();
    assert.equal(await contact.getAttribute('placeholder'), 'Email or other contact (required)');
    assert.equal(await note.inputValue(), '很喜欢这个网站', 'Language switch erased note');
    assert.equal(await subject.inputValue(), ' 网站移动端操作反馈 ', 'Language switch erased subject');
    assert.match(await form.locator('.mailbox-status').innerText(), /Please leave a way/);
    await page.waitForFunction(() => [...window.__mailboxTest.widgets.values()][0]?.options.language === 'en');
    await page.locator('#panel').getByRole('button', { name: '中文', exact: true }).click();
    assert.match(await form.locator('.mailbox-status').innerText(), /填写联系方式/);
    await page.waitForFunction(() => [...window.__mailboxTest.widgets.values()][0]?.options.language === 'zh-cn');
    await contact.fill(' 微信：visitor ');
    await send.click();
    assert.equal(requests.length, 0, 'Missing verification reached API');
    assert.deepEqual(await mailtoNavigations(page), []);
    await page.evaluate(() => window.__mailboxTest.pass());
    await send.click();
    await page.waitForFunction(() => window.__mailboxTest.resets === 1);
    assert.equal(requests[0]['cf-turnstile-response'], 'test-token');
    assert.equal(requests[0].contact, '微信：visitor');
    assert.equal(requests[0].subject, '网站移动端操作反馈');
    assert.equal(await subject.inputValue(), ' 网站移动端操作反馈 ', 'Rejected token erased subject');
    assert.equal(requests[0].lang, 'zh');
    assert.equal(await note.inputValue(), '很喜欢这个网站', 'Rejected token erased note');
    await send.click();
    assert.equal(requests.length, 1, 'Consumed token was reused');
    await page.evaluate(() => { window.__mailboxTest.pass(); window.__mailboxTest.expire(); });
    await send.click();
    assert.equal(requests.length, 1, 'Expired token reached API');
    await page.evaluate(() => window.__mailboxTest.pass());
    await send.click();
    await page.waitForFunction(() => document.querySelector('#panel .mailbox').classList.contains('is-sent'));
    assert.equal(requests.length, 2);
    assert.deepEqual(await mailtoNavigations(page), []);
    await page.locator('#panel .close').click();
    await page.waitForFunction(() => window.__mailboxTest.widgets.size === 0);
    await page.evaluate(() => window.__home.go('mailbox'));
    await page.waitForFunction(() => window.__mailboxTest.widgets.size === 1);
    assert.equal(scripts, 1, 'Reopening downloaded another script');
    await page.evaluate(() => window.__home.go('about'));
    assert.equal(await page.evaluate(() => window.__mailboxTest.widgets.size), 0, 'Switching page leaked widget');
    assert.deepEqual(errors, []);
    await page.close();

    for (const [width, language] of [[390, 'zh'], [390, 'en'], [320, 'zh'], [320, 'en']]) {
      const mobile = await configuredPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      let deliveries = 0;
      await mobile.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({ contentType: 'application/javascript', body: script }));
      await mobile.route(endpoint, route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
        assert.equal(route.request().postDataJSON().subject, 'Mobile feedback');
        deliveries++;
        return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"code":"sent"}' });
      });
      await mobile.goto(`${base}/?plain&lang=${language}#mailbox`);
      await mobile.waitForFunction(() => window.__mailboxTest?.widgets.size === 1);
      const plainForm = mobile.locator('#pages form.mailbox');
      assert.equal(await plainForm.locator('[name="contact"]').getAttribute('placeholder'), language === 'en' ? 'Email or other contact (required)' : '联系方式（必填，邮箱或微信等）');
      assert.equal(await mobile.evaluate(() => [...window.__mailboxTest.widgets.values()][0].options.language), language === 'en' ? 'en' : 'zh-cn');
      const bounds = await plainForm.locator('.mailbox-verification').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width, `Verification overflow at ${width}px`);
      if (width === 320) assert.equal(await mobile.evaluate(() => [...window.__mailboxTest.widgets.values()][0].options.size), 'compact');
      const subject = plainForm.locator('[name="subject"]');
      assert.equal(await subject.getAttribute('placeholder'), language === 'en' ? 'Subject' : '主题');
      const subjectBounds = await subject.boundingBox();
      assert(subjectBounds.x >= 0 && subjectBounds.x + subjectBounds.width <= width, `Subject overflow at ${width}px`);
      await subject.fill('Mobile feedback');
      await plainForm.locator('textarea').fill('Love the site');
      await plainForm.locator('[name="contact"]').fill('visitor@example.com');
      await mobile.evaluate(() => window.__mailboxTest.pass());
      await plainForm.locator('button[type="submit"]').click();
      await mobile.waitForFunction(() => document.querySelector('#pages .mailbox').classList.contains('is-sent'));
      assert.equal(await plainForm.locator('.mailbox-status').innerText(), language === 'en' ? 'Sent' : '已发送');
      assert.equal(deliveries, 1, 'Text-page form did not use verified submission');
      await mobile.close();
    }
    const failed = await configuredPage();
    await failed.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.abort());
    await failed.goto(`${base}/?plain&lang=zh#mailbox`);
    await failed.locator('.mailbox-status').getByRole('link', { name: 'public@example.test' }).waitFor();
    assert.match(await failed.locator('.mailbox-status').innerText(), /验证暂不可用/);
    await failed.getByRole('button', { name: 'English', exact: true }).click();
    assert.match(await failed.locator('.mailbox-status').innerText(), /Verification is unavailable/);
    assert(await failed.locator('.mailbox-status').getByRole('link', { name: 'public@example.test' }).isVisible());
    await failed.close();
    const noJS = await browser.newPage({ javaScriptEnabled: false, locale: 'en-US' });
    await noJS.goto(`${base}/examples/terry-home/?plain#mailbox`);
    const fallback = noJS.locator('#pages form.mailbox');
    assert.equal(await fallback.getAttribute('action'), 'mailto:you@example.com');
    assert(await fallback.isVisible());
    assert(await fallback.locator('[name="contact"]').evaluate(el => el.required));
    await noJS.close();
    const empty = await browser.newPage();
    await empty.goto(`${base}/?plain&lang=en#mailbox`);
    assert(await empty.locator('form.mailbox button[type="submit"]').isDisabled());
    assert.equal(await empty.locator('.mailbox-status').innerText(), '');
    assert.equal(await empty.locator('.mailbox-verification').isVisible(), false);
    await empty.close();
    // Actual initial HTML + current engine: older forks do not have a subject
    // field, for either the mail-app fallback or verified Worker submission.
    for (const plain of [false, true]) for (const emailOnly of [false, true]) {
      const legacy = await configuredPage({ legacy: true, emailOnly, viewport: { width: plain ? 390 : 1280, height: 844 }, isMobile: plain, hasTouch: plain });
      const errors = [], deliveries = [];
      legacy.on('pageerror', error => errors.push(error.message));
      await legacy.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({ contentType: 'application/javascript', body: script }));
      await legacy.route(endpoint, route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' } });
        deliveries.push(route.request().postDataJSON());
        return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"code":"sent"}' });
      });
      await legacy.goto(`${base}/?${plain ? 'plain&' : ''}lang=en${plain ? '#mailbox' : ''}`);
      if (!plain) {
        await legacy.waitForFunction(() => window.__home);
        await legacy.evaluate(() => window.__home.go('mailbox'));
      }
      const form = legacy.locator(`${plain ? '#pages' : '#panel'} form.mailbox`);
      await form.waitFor({ state: 'visible' });
      assert.equal(await form.locator('[name="subject"]').count(), 0);
      const message = 'Legacy note 🚀\nSecond line';
      const expectedSubject = [...message.replace(/\n/g, ' ')].slice(0, 24).join('');
      await form.locator('[name="contact"]').fill('visitor@example.com');
      await form.locator('textarea').fill('   ');
      await form.locator('button[type="submit"]').click();
      assert.match(await form.locator('.mailbox-status').innerText(), /Please write a note/);
      assert.equal(deliveries.length, 0);
      assert.deepEqual(await mailtoNavigations(legacy), []);
      await form.locator('textarea').fill(message);
      if (!emailOnly) {
        await legacy.waitForFunction(() => window.__mailboxTest?.widgets.size === 1);
        await legacy.evaluate(() => window.__mailboxTest.pass());
      }
      await form.locator('button[type="submit"]').click();
      if (emailOnly) {
        await form.locator('.mailbox-status').getByText('Opened your mail app', { exact: true }).waitFor();
        assert.equal(deliveries.length, 0);
        const navigations = await mailtoNavigations(legacy);
        assert.equal(navigations.length, 1);
        assertMailto(navigations[0], expectedSubject, `${message}\n\nvisitor@example.com`);
      } else {
        await legacy.waitForFunction(() => document.querySelector(`${document.body.classList.contains('plain') ? '#pages' : '#panel'} form.mailbox`)?.classList.contains('is-sent'));
        assert.equal(deliveries.length, 1);
        assert.equal(deliveries[0].subject, expectedSubject);
        assert.deepEqual(await mailtoNavigations(legacy), []);
      }
      assert.deepEqual(errors, []);
      await legacy.close();
    }

    // Current HTML keeps its explicit subject in the mail-app fallback.
    for (const plain of [false, true]) {
      const page = await configuredPage({ emailOnly: true, viewport: { width: plain ? 390 : 1280, height: 844 }, isMobile: plain, hasTouch: plain });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/?${plain ? 'plain&' : ''}lang=en${plain ? '#mailbox' : ''}`);
      if (!plain) {
        await page.waitForFunction(() => window.__home);
        await page.evaluate(() => window.__home.go('mailbox'));
      }
      const form = page.locator(`${plain ? '#pages' : '#panel'} form.mailbox`);
      const message = 'Current note 🚀\nSecond line';
      await form.locator('[name="subject"]').fill('   ');
      await form.locator('textarea').fill(message);
      await form.locator('[name="contact"]').fill('visitor@example.com');
      await form.locator('button[type="submit"]').click();
      assert.match(await form.locator('.mailbox-status').innerText(), /single-line subject/);
      assert.deepEqual(await mailtoNavigations(page), []);
      await form.locator('[name="subject"]').fill('Current feedback');
      await form.locator('button[type="submit"]').click();
      await form.locator('.mailbox-status').getByText('Opened your mail app', { exact: true }).waitFor();
      const navigations = await mailtoNavigations(page);
      assert.equal(navigations.length, 1);
      assertMailto(navigations[0], 'Current feedback', `${message}\n\nvisitor@example.com`);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: bilingual mailbox; required subject/contact; token retry/cleanup; 390/320px; no-JS; initial fork and current HTML with new engine (modal/plain, mail app/Worker); no real email sent');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
