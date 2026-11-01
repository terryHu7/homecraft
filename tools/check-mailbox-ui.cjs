// Isolated browser fixtures: no real challenges, tokens or mail deliveries.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
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
  async function configuredPage(options) {
    const page = await browser.newPage(options);
    await page.route('**/home.config.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/mailbox: \{[^}]*\}/,
        "mailbox: { endpoint: 'https://mailbox.example.test/send', email: 'public@example.test', turnstileSitekey: 'test-sitekey' }");
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
    console.log('PASS: Chinese/English forms and live language switch; localized challenge/errors; subject/contact required; exact subject payload; token expiry/retry; modal cleanup; 390/320px; no-JS fallback; no real email sent');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
