// A configured Worker verifies Turnstile before delivering a note. Without a
// Worker, hand the note to the visitor's mail app. Mount only the visible form.
import { t, onLang } from '../lang.js';
import { config } from '../config.js';

const { endpoint: ENDPOINT, email: EMAIL, turnstileSitekey: SITEKEY } = config.mailbox;
const WORDS = {
  opened: ['已打开邮件 App', 'Opened your mail app'],
  loading: ['正在加载验证…', 'Loading verification…'],
  sending: ['发送中…', 'Sending…'],
  sent: ['已发送', 'Sent'],
  subject: ['请填写单行主题，最多 80 字。', 'Please enter a single-line subject (up to 80 characters).'],
  contact: ['请填写联系方式。', 'Please leave a way to reach you.'],
  bad: ['请填写留言，留言最多 1000 字，联系方式最多 120 字。', 'Please write a note (up to 1,000 characters) and contact details (up to 120).'],
  verify: ['请完成真人验证后再发送。', 'Please complete the verification before sending.'],
  expired: ['验证已过期，请重新验证。', 'Verification expired. Please verify again.'],
  unavailable: ['验证暂不可用，请重试。', 'Verification is unavailable. Please retry.'],
  limit: ['今天发送次数太多，明天再试。', 'Too many notes today. Try again tomorrow.'],
  failed: ['发送失败。', 'Couldn’t send it.'],
};

let turnstileReady;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileReady) {
    turnstileReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('Verification unavailable')); };
      const timer = setTimeout(fail, 15000);
      script.onerror = fail;
      script.onload = () => {
        if (!window.turnstile) return fail();
        clearTimeout(timer);
        resolve(window.turnstile);
      };
      document.head.append(script);
    }).catch(error => { turnstileReady = null; throw error; });
  }
  return turnstileReady;
}

export function createMailboxForm({ onSent } = {}) {
  let dispose, refreshLanguage;
  onLang(() => refreshLanguage?.());
  function unmount() { dispose?.(); dispose = null; }

  function mount(body) {
    unmount();
    const form = body.querySelector('form.mailbox');
    if (!form) return;
    const status = form.querySelector('.mailbox-status');
    const send = form.querySelector('button[type="submit"]');
    let container = form.querySelector('.mailbox-verification');
    if (!container) {
      container = Object.assign(document.createElement('div'), { className: 'mailbox-verification' });
      form.querySelector('.mailbox-foot').before(container);
    }
    container.hidden = !ENDPOINT;
    send.disabled = !ENDPOINT && !EMAIL;
    let active = true, pending = false, starting = false, widgetId = null, token = '', statusCode = '', widgetLanguage = '';

    function show(code) {
      if (!active) return;
      statusCode = code;
      status.textContent = code ? t(...WORDS[code]) : '';
      if ((code === 'failed' || code === 'unavailable') && EMAIL) {
        status.append(t('也可以直接发邮件到 ', ' You can also email '));
        const link = document.createElement('a');
        link.href = `mailto:${EMAIL}`;
        link.textContent = EMAIL;
        status.append(link);
      }
    }
    async function startVerification({ preserveStatus = false } = {}) {
      if (starting || widgetId !== null) return;
      if (!SITEKEY) { show('unavailable'); return; }
      starting = true;
      if (!preserveStatus) show('loading');
      try {
        const turnstile = await loadTurnstile();
        if (!active) return;
        if (!preserveStatus || !statusCode) show('verify');
        widgetLanguage = t('zh-cn', 'en');
        widgetId = turnstile.render(container, {
          sitekey: SITEKEY,
          action: 'mailbox',
          theme: 'light',
          size: container.clientWidth < 300 ? 'compact' : 'flexible',
          language: widgetLanguage,
          callback(value) { token = value; if (!pending) show(''); },
          'expired-callback'() { token = ''; if (!pending) show('expired'); },
          'timeout-callback'() { token = ''; if (!pending) show('verify'); },
          'error-callback'() { token = ''; if (!pending) show('unavailable'); },
        });
      } catch {
        show('unavailable');
      } finally {
        starting = false;
      }
    }
    async function submit(e) {
      e.preventDefault();
      if (pending) return;
      if (!ENDPOINT && !EMAIL) return;
      const data = Object.fromEntries(new FormData(form));
      data.subject = (data.subject || '').trim();
      data.message = data.message.trim();
      data.contact = data.contact.trim();
      data.lang = t('zh', 'en');
      if (!data.subject || data.subject.length > 80 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(data.subject)) {
        show('subject'); form.elements.subject?.focus(); return;
      }
      if (!data.contact) { show('contact'); form.elements.contact.focus(); return; }
      if (!data.message || !form.reportValidity()) { show('bad'); return; }
      if (!ENDPOINT) {
        location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(`${data.message}\n\n${data.contact}`)}`;
        show('opened');
        return;
      }
      if (!token) {
        if (widgetId === null) void startVerification();
        else show('verify');
        return;
      }
      data['cf-turnstile-response'] = token;
      pending = true;
      send.disabled = true;
      show('sending');
      let code = 'failed';
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(15000),
        });
        const reply = await res.json().catch(() => ({}));
        code = reply.ok ? 'sent' : ['limit', 'bad', 'subject', 'contact', 'verify', 'unavailable'].includes(reply.code) ? reply.code : 'failed';
      } catch {
        code = 'failed';
      }
      pending = false;
      if (code === 'sent') {
        if (active) { show(code); form.classList.add('is-sent'); }
        onSent?.();
        return;
      }
      // Siteverify consumes tokens even when delivery subsequently fails.
      token = '';
      if (active) {
        show(code);
        if (widgetId !== null) {
          if (widgetLanguage === t('zh-cn', 'en')) window.turnstile.reset(widgetId);
          else {
            window.turnstile.remove(widgetId);
            widgetId = null;
            void startVerification({ preserveStatus: true });
          }
        }
        send.disabled = false;
      }
    }
    refreshLanguage = () => {
      show(statusCode);
      if (widgetId !== null && !pending && !form.classList.contains('is-sent')) {
        token = '';
        window.turnstile.remove(widgetId);
        widgetId = null;
        void startVerification({ preserveStatus: true });
      }
    };
    form.addEventListener('submit', submit);
    dispose = () => {
      active = false;
      refreshLanguage = null;
      form.removeEventListener('submit', submit);
      if (widgetId !== null) window.turnstile.remove(widgetId);
    };
    // A desktop already has its keyboard out; on a phone, wait for a tap.
    if (matchMedia('(pointer: fine)').matches) requestAnimationFrame(() => {
      if (active) (form.elements.subject || form.querySelector('textarea')).focus({ preventScroll: true });
    });
    if (ENDPOINT) void startVerification();
  }
  return { mount, unmount };
}
