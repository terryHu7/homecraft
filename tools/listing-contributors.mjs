import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { httpsUrl, keyOf } from './directory.mjs';

export const LEDGER = '.github/listing-contributors.json';
export const CREDITS = 'CONTRIBUTORS.md';
const loginPattern = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export function contributorAuthor(user) {
  if (user?.type !== 'User' || !Number.isSafeInteger(user.id) || user.id <= 0 || !loginPattern.test(user.login || '')) {
    throw Error('A listing contributor must be a GitHub user with a numeric account ID.');
  }
  return { name: user.login, email: `${user.id}+${user.login}@users.noreply.github.com` };
}

export function validateContributors(records) {
  if (!Array.isArray(records)) throw Error('The listing contributor ledger must be an array.');
  const ids = new Set(), logins = new Set();
  for (const record of records) {
    contributorAuthor({ ...record, type: 'User' });
    if (Object.keys(record).some(key => !['id', 'login', 'listings'].includes(key)) || ids.has(record.id) || logins.has(record.login.toLowerCase())) {
      throw Error('The listing contributor ledger contains duplicate accounts or unsupported fields.');
    }
    ids.add(record.id); logins.add(record.login.toLowerCase());
    if (!Array.isArray(record.listings) || !record.listings.length) throw Error('Each contributor must have a reviewed listing source.');
    const urls = new Set();
    for (const listing of record.listings) {
      const url = httpsUrl(listing.url);
      if (!url || url.search || url.hash || urls.has(keyOf(listing.url)) ||
          Object.keys(listing).some(key => !['url', 'issue', 'commit'].includes(key)) ||
          (listing.issue !== undefined ? !Number.isSafeInteger(listing.issue) || listing.issue <= 0 || listing.commit !== undefined : !/^[a-f0-9]{40}$/.test(listing.commit || ''))) {
        throw Error('Each contributor listing must have a unique HTTPS URL and an issue or commit source.');
      }
      urls.add(keyOf(listing.url));
    }
  }
  return records;
}

export const serializeContributors = records => JSON.stringify(validateContributors(records), null, 2) + '\n';

export function addContributor(records, user, listing) {
  contributorAuthor(user);
  const next = structuredClone(validateContributors(records));
  let record = next.find(record => record.id === user.id);
  if (!record) next.push(record = { id: user.id, login: user.login, listings: [] });
  record.login = user.login;
  if (!record.listings.some(source => keyOf(source.url) === keyOf(listing.url))) record.listings.push(listing);
  next.sort((a, b) => a.id - b.id);
  return validateContributors(next);
}

export function renderContributors(records, repo = { owner: 'terryHu7', repo: 'homecraft' }) {
  validateContributors(records);
  if (![repo.owner, repo.repo].every(value => /^[a-z\d_.-]+$/i.test(value))) throw Error('Invalid repository name.');
  const base = `https://github.com/${repo.owner}/${repo.repo}`;
  const lines = [
    '# Community Contributors', '',
    'These contributors submitted websites accepted into the Homecraft portal directory. Listing data is a project contribution.', '',
    'This list records reviewed submissions, including websites that later become unavailable or leave the directory. GitHub calculates its native Contributors statistics separately from commit authorship.', '',
    '<!-- Generated from .github/listing-contributors.json. Do not edit this table by hand. -->', '',
    '| GitHub account | Website | Source |',
    '| --- | --- | --- |',
  ];
  for (const record of [...records].sort((a, b) => a.login.toLowerCase().localeCompare(b.login.toLowerCase(), 'en'))) {
    for (const listing of record.listings) {
      const url = new URL(listing.url).href.replace(/[|<>"\\[\]()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const source = listing.issue ? `[#${listing.issue}](${base}/issues/${listing.issue})` : `[${listing.commit.slice(0, 7)}](${base}/commit/${listing.commit})`;
      lines.push(`| [@${record.login}](https://github.com/${record.login}) | [${url.replace(/^https:\/\//, '')}](${url}) | ${source} |`);
    }
  }
  return lines.join('\n') + '\n';
}

export async function readContributors(github, repo, ref) {
  const { data } = await github.rest.repos.getContent({ ...repo, path: LEDGER, ref });
  return validateContributors(JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')));
}

export function contributorFiles(records, repo) {
  return [
    { path: LEDGER, mode: '100644', type: 'blob', content: serializeContributors(records) },
    { path: CREDITS, mode: '100644', type: 'blob', content: renderContributors(records, repo) },
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const records = JSON.parse(readFileSync(new URL(`../${LEDGER}`, import.meta.url), 'utf8'));
  const rendered = renderContributors(records);
  if (readFileSync(new URL(`../${CREDITS}`, import.meta.url), 'utf8') !== rendered) throw Error('CONTRIBUTORS.md is out of date. Regenerate it from the listing contributor ledger.');
  if (readFileSync(new URL(`../${LEDGER}`, import.meta.url), 'utf8') !== serializeContributors(records)) throw Error('The listing contributor ledger must use canonical JSON formatting.');
  console.log(`Verified ${records.length} listing contributors and their source links.`);
}
