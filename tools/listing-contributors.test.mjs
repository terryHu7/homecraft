import test from 'node:test';
import assert from 'node:assert/strict';
import { addContributor, contributorAuthor, renderContributors, serializeContributors, validateContributors } from './listing-contributors.mjs';

const alex = { id: 123, login: 'Alex', type: 'User' };
const listing = { url: 'https://example.com/', issue: 4 };

test('credit uses the authenticated GitHub account rather than a form display name or private email', () => {
  assert.deepEqual(contributorAuthor(alex), { name: 'Alex', email: '123+Alex@users.noreply.github.com' });
  for (const user of [{ ...alex, type: 'Bot' }, { ...alex, id: 0 }, { ...alex, login: 'name\ntrailer' }, { ...alex, login: 'alex[bot]' }]) {
    assert.throws(() => contributorAuthor(user));
  }
});

test('rechecks and later updates retain the first accepted source without duplicating credits', () => {
  const first = addContributor([], alex, listing);
  const before = serializeContributors(first);
  const second = addContributor(first, alex, { url: 'https://example.com', issue: 9 });
  assert.equal(serializeContributors(second), before);
  assert.equal(serializeContributors(first), before);
  const renamed = addContributor(second, { ...alex, login: 'Alex-renamed' }, listing);
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].login, 'Alex-renamed');
  assert.equal(renamed[0].listings[0].issue, 4);
});

test('multiple sites and contributors keep independent sources in stable account ID order', () => {
  let records = addContributor([], alex, listing);
  records = addContributor(records, alex, { url: 'https://example.com/blog/', issue: 6 });
  records = addContributor(records, { ...alex, id: 42, login: 'Zoe' }, { url: 'https://zoe.example/', issue: 8 });
  assert.deepEqual(records.map(record => record.id), [42, 123]);
  assert.equal(records[1].listings.length, 2);
  const markdown = renderContributors(records);
  assert(markdown.indexOf('[@Alex]') < markdown.indexOf('[@Zoe]'));
  assert(markdown.includes('https://github.com/terryHu7/homecraft/issues/6'));
  assert(markdown.includes('https://example.com/blog/'));
});

test('credits retain commit evidence for the initial directory and escape table delimiters', () => {
  const records = addContributor([], alex, { url: 'https://example.com/a|b](c)', commit: 'a'.repeat(40) });
  const markdown = renderContributors(records);
  assert(markdown.includes('a%7Cb'));
  assert(markdown.includes('%5D%28c%29'));
  assert(markdown.includes('/commit/' + 'a'.repeat(40)));
  assert.equal(markdown.split('\n').find(line => line.includes('[@Alex]')).split('|').length, 5);
});

test('malformed sources, duplicate accounts and conflicting account names cannot generate public credits', () => {
  const records = addContributor([], alex, listing);
  for (const changed of [
    [...records, ...records],
    [...records, { ...records[0], id: 456 }],
    [{ ...records[0], listings: [] }],
    [{ ...records[0], listings: [{ ...listing, issue: -1 }] }],
    [{ ...records[0], listings: [{ ...listing, commit: 'a'.repeat(40) }] }],
    [{ ...records[0], listings: [{ url: 'https://example.com/', commit: 'invalid' }] }],
    [{ ...records[0], listings: [{ ...listing, url: 'javascript:alert(1)' }] }],
    [{ ...records[0], listings: [listing, listing] }],
    [{ ...records[0], email: 'unnecessary@example.com' }],
  ]) assert.throws(() => validateContributors(changed));
});
