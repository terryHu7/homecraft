import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { problems, reachable, inspectLogo } from './directory.mjs';
import { readSiteInfo } from '../engine/door-metadata.js';
import { inspectPortal } from './inspect-portal.mjs';
import { copy, fieldMessage, portalMessage } from './listing-copy.mjs';

export const requestHash = body => createHash('sha256').update(body || '').digest('hex');
export function requestEntry(body, date = new Date()) {
  const answers = {};
  for (const part of (body || '').split(/^### /m).slice(1)) {
    const [heading, ...rest] = part.split('\n'), value = rest.join('\n').trim();
    const aliases = { Address: '网址', 'Website name': '网站名称', 'English name': '英文名称', 'Author name': '作者名称', Languages: '网站语言', Introduction: '简介', 'English introduction': '英文简介', 'Preview image': '预览图' };
    const label = heading.split(' / ')[0].replace(/\s*[（(].*$/, '').trim();
    answers[aliases[label] || label] = value === '_No response_' ? '' : value;
  }
  const get = (label, legacy) => (answers[label] ?? answers[legacy] ?? '').trim();
  const pair = (a, b) => a && b && a !== b ? { zh: a, en: b } : a || b;
  const languages = get('网站语言');
  const entry = {
    name: pair(get('网站名称', '名字'), get('英文名称', '英文名')),
    url: get('网址'), owner: get('作者名称', '主人'),
    lang: (languages.startsWith('中文和英文') || languages.startsWith('Chinese and English')) ? ['zh', 'en'] : (languages.startsWith('中文') || languages.startsWith('Chinese')) ? 'zh' : languages.startsWith('English') ? 'en' : [],
    homecraft: true, added: date.toISOString().slice(0, 10),
  };
  const intro = pair(get('简介', '一句话介绍'), get('英文简介', '英文介绍'));
  if (intro) entry.intro = intro;
  for (const [label, key] of [['Logo', 'logo'], ['预览图', 'preview']]) if (get(label)) entry[key] = get(label);
  return entry;
}

export async function inspectEntry(entry, options = {}) {
  const issues = problems(entry).map(fieldMessage), review = [], warnings = [];
  if (issues.length) return { entry, issues, review, warnings, status: 'changes' };
  const [up, logo, portal] = await Promise.all([
    (options.reachable || reachable)(entry.url), (options.inspectLogo || inspectLogo)(entry.logo),
    (options.inspectPortal || inspectPortal)(entry.url, options),
  ]);
  if (!up) review.push(copy.network(entry.url));
  else {
    if (logo.status === 'review') review.push(copy.logoNetwork(entry.logo));
    if (logo.status === 'fail') issues.push(fieldMessage('logo: invalid image'));
    if (logo.template) warnings.push(copy.templateLogo);
    if (portal.status === 'fail') issues.push(portalMessage(portal));
    if (portal.status === 'review') review.push(portalMessage(portal));
  }
  return { entry, issues, review, warnings, portal, status: issues.length ? 'changes' : review.length ? 'review' : 'pass' };
}
export async function inspectRequest(body, options = {}) {
  const entry = requestEntry(body);
  if (!problems(entry).some(message => message.startsWith('url:'))) {
    const info = await (options.readSiteInfo || readSiteInfo)(entry.url, 15000);
    if (info) {
      if (!entry.intro && info.intro) entry.intro = info.intro;
      if (!entry.logo && info.logo && new URL(info.logo).origin === new URL(entry.url).origin) entry.logo = info.logo;
    }
  }
  return { ...await inspectEntry(entry, options), hash: requestHash(body) };
}

async function main(args) {
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
  const event = option('--issue'), address = option('--url');
  const output = option('--output') || 'tools/.check/listing/report.json';
  let report;
  if (event) {
    const { issue } = JSON.parse(readFileSync(event, 'utf8'));
    report = await inspectRequest(issue.body, { out: dirname(output) });
  } else if (address) report = await inspectPortal(address, { out: dirname(output) });
  else throw Error('usage: node tools/check-listing.mjs --url <address> | --issue <event.json> [--output <report.json>]');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `report=${JSON.stringify(report)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!event && report.status !== 'pass') process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main(process.argv.slice(2));
