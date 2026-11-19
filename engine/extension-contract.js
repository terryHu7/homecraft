// Shared by the browser host and the local extension tools.
export const API_VERSION = 1;
export const CAPABILITIES = ['ui', 'player.read', 'scene.markers', 'network'];
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}\.[a-z][a-z0-9-]{0,59}$/.test(value);
export const validVersion = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) && value.split('.').every(part => Number.isSafeInteger(Number(part)));
export const safeFile = value => typeof value === 'string' && value.length < 180 && /^[A-Za-z0-9_./-]+$/.test(value) && !value.startsWith('/') && value.split('/').every(p => p && p !== '.' && p !== '..' && !p.startsWith('.'));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateManifest(m) {
  const errors = [];
  if (!object(m)) return ['Manifest must be an object'];
  if (!validId(m.id)) errors.push('id must use author.name');
  if (!validVersion(m.version)) errors.push('version must use major.minor.patch');
  if (m.apiVersion !== API_VERSION) errors.push(`Unsupported extension API: ${m.apiVersion}; expected ${API_VERSION}`);
  for (const field of ['name', 'description']) if (!object(m[field]) || !text(m[field].en) || !text(m[field].zh)) errors.push(`${field} requires en and zh text`);
  for (const field of ['author', 'license']) if (!text(m[field])) errors.push(`${field} is required`);
  if (!safeFile(m.entry) || !m.entry.endsWith('.js')) errors.push('entry must be a local .js file');
  if (!Array.isArray(m.files) || !m.files.length || m.files.length > 100 || m.files.some(f => !safeFile(f)) || new Set(m.files.map(f => String(f).toLowerCase())).size !== m.files.length) errors.push('files must contain 1–100 unique, safe relative paths');
  else {
    if (![m.entry, 'README.md', 'LICENSE'].every(f => m.files.includes(f)) || m.files.some(f => f.toLowerCase().split('/')[0] === 'manifest.json')) errors.push('files must include entry, README.md and LICENSE; manifest.json is added automatically');
    const paths = m.files.map(f => f.toLowerCase());
    if (paths.some(a => paths.some(b => b.startsWith(a + '/')))) errors.push('A file cannot also be a directory');
  }
  if (!Array.isArray(m.capabilities) || new Set(m.capabilities).size !== m.capabilities.length || m.capabilities.some(c => !CAPABILITIES.includes(c))) errors.push('Unknown or duplicate capability');
  if (!object(m.config)) errors.push('config must be an object');
  else for (const [key, field] of Object.entries(m.config)) {
    if (!/^[a-z][A-Za-z0-9]{0,39}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) errors.push(`Invalid configuration key: ${key}`);
    if (!object(field) || !['string', 'number', 'integer', 'boolean'].includes(field.type)) { errors.push(`Invalid configuration type: ${key}`); continue; }
    if (!object(field.label) || !text(field.label.en) || !text(field.label.zh)) errors.push(`${key}: label requires en and zh`);
    if (field.format !== undefined && field.format !== 'url') errors.push(`${key}: unsupported format`);
    if (field.format === 'url' && field.type !== 'string') errors.push(`${key}: URL fields must be strings`);
    if (field.required !== undefined && typeof field.required !== 'boolean') errors.push(`${key}: required must be boolean`);
    if (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 2048)) errors.push(`${key}: maxLength must be 1–2048`);
    for (const bound of ['minimum', 'maximum']) if (field[bound] !== undefined && !Number.isFinite(field[bound])) errors.push(`${key}: ${bound} must be finite`);
    if (field.minimum > field.maximum) errors.push(`${key}: minimum exceeds maximum`);
    if (field.enum !== undefined && (!Array.isArray(field.enum) || !field.enum.length)) errors.push(`${key}: enum must not be empty`);
    if (field.default !== undefined) errors.push(...validateOptions({ config: { [key]: field } }, { [key]: field.default }).errors);
  }
  return errors;
}
export function validateOptions(manifest, input = {}, { partial = false } = {}) {
  const errors = [], missing = [], options = {};
  if (!object(input)) return { errors: ['Configuration must be an object'], missing, options };
  for (const key of Object.keys(input)) if (!Object.hasOwn(manifest.config, key)) errors.push(`Unknown configuration: ${key}`);
  for (const [key, field] of Object.entries(manifest.config)) {
    const value = Object.hasOwn(input, key) ? input[key] : field.default;
    if (value === undefined || (field.required && value === '')) { if (field.required) missing.push(key); continue; }
    const valid = field.type === 'integer' ? Number.isSafeInteger(value) : typeof value === field.type;
    if (!valid || (typeof value === 'number' && !Number.isFinite(value))) { errors.push(`${key}: expected ${field.type}`); continue; }
    if (typeof value === 'string' && value.length > (field.maxLength ?? 2048)) errors.push(`${key}: value is too long`);
    if (typeof value === 'number' && ((field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum))) errors.push(`${key}: value is outside the allowed range`);
    if (field.enum && (!Array.isArray(field.enum) || !field.enum.includes(value))) errors.push(`${key}: unsupported value`);
    if (field.format === 'url') {
      try {
        const url = new URL(value);
        const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
        if (url.username || url.password || !(url.protocol === 'https:' || (local && url.protocol === 'http:'))) throw Error();
      } catch { errors.push(`${key}: use HTTPS, or HTTP on localhost; credentials are not allowed`); }
    }
    options[key] = value;
  }
  if (!partial && missing.length) errors.push(`Required configuration: ${missing.join(', ')}`);
  return { errors, missing, options };
}
