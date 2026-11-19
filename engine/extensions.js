import * as THREE from 'three';
import { API_VERSION, validId, validateManifest, validateOptions } from './extension-contract.js';
import { lang, onLang } from './lang.js';

// Cooperative lifecycle isolation for trusted code. This is not a sandbox.
export function createExtensions({ source, player, scene }) {
  const records = [], active = [], controller = new AbortController();
  let root = null, disposed = false;
  const label = value => typeof value === 'string' ? value : value?.[lang] || value?.en || '';
  function ensureRoot() {
    if (!root) {
      root = document.createElement('div'); root.id = 'homecraft-extensions';
      Object.assign(root.style, { position: 'fixed', top: '84px', right: '16px', zIndex: '9', maxWidth: 'min(240px, calc(100vw - 32px))', display: 'grid', gap: '6px', pointerEvents: 'auto' });
      document.querySelector('#hud').append(root);
    }
    return root;
  }
  function stop(record, error) {
    if (record.stopped) return;
    record.stopped = true; record.controller.abort();
    for (const cleanup of [...record.cleanup].reverse()) { try { cleanup(); } catch (e) { console.warn(`Extension ${record.id} cleanup: ${e.message}`); } }
    record.cleanup.clear();
    record.state = error ? 'failed' : 'stopped';
    if (error) { record.error = String(error.message || error); console.warn(`Extension ${record.id}: ${record.error}`); }
    if (root && !root.childElementCount) { root.remove(); root = null; }
  }
  function apiFor(record, manifest, options, base) {
    const requireCapability = name => { if (record.stopped) throw Error('Extension is stopped'); if (!manifest.capabilities.includes(name)) throw Error(`Undeclared capability: ${name}`); };
    const own = cleanup => {
      if (typeof cleanup !== 'function') throw Error('Cleanup must be a function');
      let done = false;
      const release = () => { if (done) return; done = true; record.cleanup.delete(release); cleanup(); };
      if (record.stopped) release(); else record.cleanup.add(release);
      return release;
    };
    const guard = callback => (...args) => {
      if (record.stopped) return;
      try { const result = callback(...args); if (result?.then) result.catch(error => stop(record, error)); return result; }
      catch (error) { stop(record, error); }
    };
    function control(value, onClick) {
      requireCapability('ui');
      const element = document.createElement(onClick ? 'button' : 'output'); element.className = 'mc-button';
      element.dataset.extension = record.id;
      Object.assign(element.style, { padding: '8px 12px', fontSize: '13px', overflowWrap: 'anywhere', textAlign: 'left' });
      if (onClick) { element.type = 'button'; element.addEventListener('click', guard(onClick), { signal: record.controller.signal }); }
      else element.setAttribute('aria-live', 'polite');
      let current = value;
      const render = () => { element.textContent = label(current); };
      const off = onLang(render); render(); ensureRoot().append(element);
      own(() => { off(); element.remove(); });
      return Object.freeze({ set(value) { if (!record.stopped) { current = value; render(); } } });
    }
    let markerCount = 0;
    return Object.freeze({
      version: API_VERSION, id: record.id, options: Object.freeze(options), signal: record.controller.signal,
      asset(path) { const url = new URL(path, base); if (!url.href.startsWith(base.href)) throw Error('Asset path leaves the extension'); return url.href; },
      onDispose: own,
      onFrame(callback) {
        if (record.frame || typeof callback !== 'function') throw Error('Provide one frame callback');
        record.frame = (dt, elapsed, now) => {
          try { const result = callback(dt, elapsed, now); if (result?.then) { result.catch(() => {}); throw Error('Frame callbacks must be synchronous'); } }
          catch (error) { stop(record, error); }
        };
      },
      interval(callback, milliseconds) {
        if (!Number.isFinite(milliseconds) || milliseconds < 100) throw Error('Intervals must be at least 100 ms');
        const timer = setInterval(guard(callback), milliseconds); return own(() => clearInterval(timer));
      },
      player: Object.freeze({ read(out) { requireCapability('player.read'); out.x = player.pos.x; out.y = player.y; out.z = player.pos.z; out.heading = player.heading; return out; } }),
      ui: Object.freeze({ status: text => control(text), button: (text, callback) => control(text, callback) }),
      scene: Object.freeze({ marker(color = 0x467b8f) {
        requireCapability('scene.markers'); if (markerCount >= 4) throw Error('At most four visitor markers are supported'); markerCount++;
        const group = new THREE.Group(), material = new THREE.MeshLambertMaterial({ color });
        const body = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.15, .3), material); body.position.y = .775;
        const head = new THREE.Mesh(new THREE.BoxGeometry(.42, .42, .42), material); head.position.y = 1.56;
        group.add(body, head); group.name = `extension:${record.id}`; scene.add(group);
        let removed = false;
        const remove = own(() => { if (removed) return; removed = true; markerCount--; group.removeFromParent(); body.geometry.dispose(); head.geometry.dispose(); material.dispose(); });
        return Object.freeze({ set(pose) { if (removed) return; if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z) || !Number.isFinite(pose.heading)) throw Error('Invalid marker pose'); group.position.set(pose.x, pose.y, pose.z); group.rotation.y = pose.heading; }, remove });
      } }),
      network: Object.freeze({ async json(url, init = {}) {
        requireCapability('network');
        const target = new URL(url), allowed = Object.entries(manifest.config).filter(([, field]) => field.format === 'url').map(([key]) => options[key]).filter(Boolean);
        if (!allowed.some(value => { const base = new URL(value); return target.origin === base.origin && (target.pathname === base.pathname || target.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/')); })) throw Error('Network destination is not configured');
        const timeout = AbortSignal.timeout(5000);
        const response = await fetch(target, { ...init, credentials: 'omit', redirect: 'error', signal: AbortSignal.any([record.controller.signal, timeout]) });
        if (!response.ok) throw Error(`Service returned HTTP ${response.status}`);
        return response.json();
      } }),
    });
  }
  const ready = (async () => {
    if (!source) return;
    try {
      const url = new URL(source, document.baseURI), site = new URL('./', document.baseURI);
      if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname)) throw Error('Extension configuration must be site-local');
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw Error(`Cannot read extension configuration: HTTP ${response.status}`);
      const data = await response.json();
      if (data.format !== 1 || !Array.isArray(data.extensions)) throw Error('Invalid extension configuration');
      const ids = new Set();
      for (const item of data.extensions) {
        if (disposed) break;
        if (!validId(item.id) || ids.has(item.id) || typeof item.enabled !== 'boolean') throw Error('Invalid or duplicate extension entry');
        ids.add(item.id);
        const record = { id: item.id, version: item.version, state: item.enabled ? 'loading' : 'disabled', stopped: false, cleanup: new Set(), controller: new AbortController() };
        records.push(record);
        if (!item.enabled) continue;
        try {
          const base = new URL(`extensions/${item.id}/`, site);
          const response = await fetch(new URL('manifest.json', base), { signal: controller.signal });
          if (!response.ok) throw Error(`Manifest unavailable: HTTP ${response.status}`);
          const manifest = await response.json(), errors = validateManifest(manifest);
          if (errors.length) throw Error(errors.join('; '));
          if (manifest.id !== item.id || manifest.version !== item.version) throw Error('Installed manifest differs from configuration');
          const checked = validateOptions(manifest, item.options); if (checked.errors.length) throw Error(checked.errors.join('; '));
          const api = apiFor(record, manifest, checked.options, base);
          const module = await import(new URL(manifest.entry, base).href);
          if (disposed) { stop(record); break; }
          if (typeof module.activate !== 'function') throw Error('Entry must export activate(api)');
          // Activation is synchronous; asynchronous work belongs in managed callbacks.
          const cleanup = module.activate(api);
          if (cleanup?.then) { cleanup.catch(() => {}); throw Error('activate must be synchronous'); }
          if (typeof cleanup === 'function') api.onDispose(cleanup);
          record.state = 'active'; active.push(record);
        } catch (error) { stop(record, error); }
      }
    } catch (error) { if (!disposed) { records.push({ id: 'configuration', state: 'failed', error: error.message }); console.warn(`Extensions: ${error.message}`); } }
  })();
  return Object.freeze({ ready,
    update(dt, elapsed, now) { for (const record of active) if (!record.stopped) record.frame?.(dt, elapsed, now); },
    status() { return records.map(({ id, version, state, error }) => ({ id, version, state, ...(error ? { error } : {}) })); },
    stop(id) { for (const record of records) if (record.id === id && record.cleanup) stop(record); },
    dispose() { disposed = true; controller.abort(); for (const record of records) if (record.cleanup) stop(record); },
  });
}
