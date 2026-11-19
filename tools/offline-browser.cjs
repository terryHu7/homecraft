// Opt-in test transport. Load with NODE_OPTIONS=--require=.../offline-browser.cjs.
// Test-specific routes take priority over this external-request fixture.
const { chromium } = require('playwright');
const local = value => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
const launch = chromium.launch.bind(chromium);
chromium.launch = async function (options = {}) {
  const browser = await launch({ ...options, args: [...(options.args || []),
    '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async function (options = {}) {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (local(route.request().url())) return route.continue();
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('worlds.json')) return route.fulfill({ json: { version: 1, worlds: [], blocked: [] }, headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    });
    return context;
  };
  return browser;
};
const fetch = globalThis.fetch;
globalThis.fetch = (url, ...args) => {
  if (!local(typeof url === 'string' || url instanceof URL ? url : url.url)) return Promise.reject(Error('External requests are disabled for this test run'));
  return fetch(url, ...args);
};
