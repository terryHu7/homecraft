// Issue input is data, never shell or JavaScript. The read-only inspection job
// passes this small report to the separate job that may write a PR/comment.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { problems, reachable, logoProblem } from './directory.mjs';
import { readSiteInfo } from '../engine/door-metadata.js';
import { inspectPortal, portalMessage } from './inspect-portal.mjs';

export function requestEntry(body, date = new Date()) {
  const answers = {};
  for (const part of (body || '').split(/^### /m).slice(1)) {
    const [heading, ...rest] = part.split('\n'), value = rest.join('\n').trim();
    answers[heading.split(/（| \//)[0].trim()] = value === '_No response_' ? '' : value;
  }
  const get = (label, legacy) => (answers[label] ?? answers[legacy] ?? '').trim();
  const pair = (a, b) => a && b && a !== b ? { zh: a, en: b } : a || b;
  const languages = get('网站语言');
  const entry = {
    name: pair(get('网站名称', '名字'), get('英文名称', '英文名')),
    url: get('网址').replace(/\s+/g, ''), owner: get('作者名称', '主人'),
    lang: languages.startsWith('中文和英文') ? ['zh', 'en'] : languages.startsWith('中文') ? 'zh' : languages.startsWith('English') ? 'en' : [],
    homecraft: true, added: date.toISOString().slice(0, 10),
  };
  const intro = pair(get('简介', '一句话介绍'), get('英文简介', '英文介绍'));
  if (intro) entry.intro = intro;
  const logo = get('Logo').replace(/\s+/g, '');
  if (logo) entry.logo = logo;
  const preview = get('预览图').replace(/\s+/g, '');
  if (preview) entry.preview = preview;
  return entry;
}

export async function inspectRequest(body, options = {}) {
  const entry = requestEntry(body), issues = [], review = [];
  // Validate the URL before any request; retain all field errors in one reply.
  const urlIssues = problems(entry).filter(message => message.startsWith('url:'));
  if (urlIssues.length) return { entry, issues: problems(entry), review };
  const info = await readSiteInfo(entry.url, 15000);
  if (info) {
    if (!entry.intro && info.intro) entry.intro = info.intro;
    if (!entry.logo && info.logo && new URL(info.logo).origin === new URL(entry.url).origin) entry.logo = info.logo;
  }
  issues.push(...problems(entry));
  const validLogo = !issues.some(message => message.startsWith('logo:'));
  const [up, logo, portal] = await Promise.all([
    reachable(entry.url), validLogo ? logoProblem(entry.logo) : '', inspectPortal(entry.url, options),
  ]);
  if (logo) issues.push(logo);
  if (!up) review.push('网站暂时无法访问，请稍后复查。 / The website is temporarily unreachable; recheck later.');
  if (portal.status === 'fail') issues.push(portalMessage(portal));
  if (portal.status === 'review') review.push(portalMessage(portal));
  return { entry, issues, review, portal };
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
  // Issue checks always deliver a report, including failures, to the reply
  // job. The latter fails the workflow after updating its single comment.
  if (!event && report.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main(process.argv.slice(2));
