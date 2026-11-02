import { createHash } from 'node:crypto';
import { problems, keyOf, slugFor, isBlocked } from './directory.mjs';
import { requestHash } from './check-listing.mjs';
import { copy, listingTitle, statusText } from './listing-copy.mjs';

export const MARK = '<!-- homecraft-join -->';
const STATE = /<!-- homecraft-state (\{[^\n]+\}) -->/;
const SOURCE = /<!-- homecraft-request (\d+) ([a-f0-9]{64}) -->/;
export const fingerprint = entry => {
  const { added, ...data } = entry;
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, ordered(value[k])])) : value;
  return createHash('sha256').update(JSON.stringify(ordered(data))).digest('hex');
};
export function listingState(body) { try { return JSON.parse(body.match(STATE)?.[1] || 'null'); } catch { return null; } }
export function validTitle(title) {
  return typeof title === 'string' && title.length <= 120 && /^(feat|fix|perf|docs|test|refactor|build|ci|chore|revert)(\([a-z][a-z0-9-]*\))?!?: [^\s].*$/.test(title) && !/[\r\n\u0000-\u001f]/.test(title);
}
export function allowedEvent(event, name) {
  if (!event.issue || event.issue.pull_request) return false;
  if (name !== 'issue_comment') return true;
  return event.sender?.type !== 'Bot' && event.comment?.user.type !== 'Bot' && (event.comment?.user.login === event.issue.user.login ||
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(event.comment?.author_association));
}
const active = issue => issue.state === 'open' && issue.labels.some(l => (l.name || l) === 'join');
const bot = comment => comment.user?.login === 'github-actions[bot]';

export function client(github, repo) {
  const params = repo;
  return {
    async comment(number, text, state = null) {
      const comments = await github.paginate(github.rest.issues.listComments, { ...params, issue_number: number });
      const mine = comments.find(c => bot(c) && c.body?.startsWith(MARK));
      const body = [MARK, state ? `<!-- homecraft-state ${JSON.stringify(state)} -->` : '', text].filter(Boolean).join('\n');
      if (mine?.body === body) return;
      if (mine) await github.rest.issues.updateComment({ ...params, comment_id: mine.id, body });
      else await github.rest.issues.createComment({ ...params, issue_number: number, body });
    },
    async status(sha, context, state, target_url) {
      await github.rest.repos.createCommitStatus({ ...params, sha, context, state, target_url, description: statusText[context]?.[state] });
    },
    async invalidate(number) {
      const comments = await github.paginate(github.rest.issues.listComments, { ...params, issue_number: number });
      const mine = comments.find(c => bot(c) && c.body?.startsWith(MARK));
      const state = listingState(mine?.body || '');
      if (state) await github.rest.issues.updateComment({ ...params, comment_id: mine.id,
        body: mine.body.replace(STATE, `<!-- homecraft-state ${JSON.stringify({ ...state, state: 'checking' })} -->`) });
    },
    async openPR(number) {
      const { data } = await github.rest.pulls.list({ ...params, head: `${params.owner}:join/${number}`, state: 'open' });
      return data.find(pr => pr.user.login === 'github-actions[bot]' && pr.head.repo?.full_name === `${params.owner}/${params.repo}`);
    },
  };
}

export async function prepareRequest({ github, context, core }) {
  const event = context.payload;
  if (!allowedEvent(event, context.eventName)) return null;
  const { data: issue } = await github.rest.issues.get({ ...context.repo, issue_number: event.issue.number });
  const api = client(github, context.repo), pr = await api.openPR(issue.number);
  if (pr) await api.invalidate(issue.number);
  if (pr) await api.status(pr.head.sha, 'Listing request', active(issue) ? 'pending' : 'failure', issue.html_url);
  if (!active(issue)) {
    if (pr) {
      await github.rest.pulls.update({ ...context.repo, pull_number: pr.number, state: 'closed' });
      await api.comment(issue.number, copy.withdrawn);
    }
    return null;
  }
  core?.setOutput('event', JSON.stringify({ issue }));
  return { issue };
}

async function entriesAt(github, repo, ref) {
  const { data: files } = await github.rest.repos.getContent({ ...repo, path: 'directory', ref });
  const entries = [];
  for (const file of files.filter(f => /^[a-z0-9][a-z0-9-]{0,40}\.json$/.test(f.name))) {
    const { data } = await github.rest.repos.getContent({ ...repo, path: file.path, ref });
    entries.push({ path: file.path, data: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) });
  }
  return entries;
}

export async function applyRequest({ github, context, report, expected, core }) {
  const repo = context.repo, api = client(github, repo);
  const { data: issue } = await github.rest.issues.get({ ...repo, issue_number: expected.issue.number });
  if (!active(issue) || requestHash(issue.body) !== requestHash(expected.issue.body)) return { status: 'stale' };
  const oldPR = await api.openPR(issue.number);
  if (!report || report.hash !== requestHash(issue.body)) report = { status: 'review', issues: [], review: [copy.review], warnings: [] };
  if (report.status !== 'pass' || problems(report.entry).length) {
    if (oldPR) await api.status(oldPR.head.sha, 'Listing request', 'failure', issue.html_url);
    const messages = [...new Set([...(report.issues || []), ...(report.review || [])])];
    const summary = messages.length
      ? messages.map(message => `- ${message.replaceAll('\n', '\n  ')}`).join('\n') : copy.review;
    await api.comment(issue.number, `${summary}\n\n${copy.retry}`);
    return { status: report.status === 'changes' ? 'changes' : 'review' };
  }

  const base = context.payload.repository.default_branch;
  const { data: branch } = await github.rest.repos.getBranch({ ...repo, branch: base });
  const entries = await entriesAt(github, repo, branch.commit.sha);
  const same = entries.find(e => keyOf(e.data.url) === keyOf(report.entry.url));
  const entry = { ...report.entry, added: same?.data.added || report.entry.added };
  if (same && fingerprint(same.data) === fingerprint(entry)) {
    if (oldPR) await github.rest.pulls.update({ ...repo, pull_number: oldPR.number, state: 'closed' });
    await api.comment(issue.number, copy.unchanged);
    return { status: 'unchanged' };
  }
  let slug = same ? same.path.split('/').pop().slice(0, -5) : slugFor(entry.url);
  for (let n = 2; !same && entries.some(e => e.path === `directory/${slug}.json`); n++) slug = `${slugFor(entry.url).slice(0, 36)}-${n}`;
  const path = `directory/${slug}.json`, head = `join/${issue.number}`;
  const title = listingTitle(entry, !!same), content = JSON.stringify(entry, null, 2) + '\n';
  const { data: baseCommit } = await github.rest.git.getCommit({ ...repo, commit_sha: branch.commit.sha });
  const { data: tree } = await github.rest.git.createTree({ ...repo, base_tree: baseCommit.tree.sha,
    tree: [{ path, mode: '100644', type: 'blob', content }] });
  const previous = oldPR ? (await github.rest.git.getCommit({ ...repo, commit_sha: oldPR.head.sha })).data : null;
  const commit = previous?.tree.sha === tree.sha && previous.parents?.[0]?.sha === branch.commit.sha
    ? { sha: oldPR.head.sha }
    : (await github.rest.git.createCommit({ ...repo, message: title, tree: tree.sha, parents: [branch.commit.sha] })).data;

  // Recheck after remote reads so an obsolete result cannot replace a newer request.
  const { data: current } = await github.rest.issues.get({ ...repo, issue_number: issue.number });
  if (!active(current) || requestHash(current.body) !== report.hash) return { status: 'stale' };
  try { await github.rest.git.getRef({ ...repo, ref: `heads/${head}` }); }
  catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.git.createRef({ ...repo, ref: `refs/heads/${head}`, sha: commit.sha });
  }
  await github.rest.git.updateRef({ ...repo, ref: `heads/${head}`, sha: commit.sha, force: true });
  const source = `<!-- homecraft-request ${issue.number} ${report.hash} -->`;
  const body = [source, `Closes #${issue.number}`, copy.prBody, copy.approval, '```json', content.trimEnd(), '```', ...(report.warnings || [])].join('\n\n');
  const { data: pr } = oldPR
    ? await github.rest.pulls.update({ ...repo, pull_number: oldPR.number, title, body })
    : await github.rest.pulls.create({ ...repo, head, base, title, body });
  const latest = (await github.rest.issues.get({ ...repo, issue_number: issue.number })).data;
  if (!active(latest) || requestHash(latest.body) !== report.hash) {
    await api.status(commit.sha, 'Listing request', 'failure', issue.html_url);
    return { status: 'stale' };
  }
  await api.status(commit.sha, 'PR title', validTitle(title) ? 'success' : 'failure', pr.html_url);
  await api.status(commit.sha, 'Listing request', 'success', issue.html_url);
  await api.comment(issue.number, copy.ready(pr.number),
    { state: 'review', pr: pr.number, hash: fingerprint(entry), url: entry.url });
  await github.rest.actions.createWorkflowDispatch({ ...repo, workflow_id: 'checks.yml', ref: head });
  core?.setOutput('pr', pr.number);
  return { status: 'ready', pr: pr.number };
}

export async function reviewPolicy({ github, context }) {
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: context.payload.pull_request.number });
  const api = client(github, context.repo);
  await api.status(pr.head.sha, 'PR title', validTitle(pr.title) ? 'success' : 'failure', pr.html_url);
  const automated = pr.user.login === 'github-actions[bot]' && /^join\/\d+$/.test(pr.head.ref) &&
    pr.head.repo?.full_name === `${context.repo.owner}/${context.repo.repo}`;
  if (!automated) { await api.status(pr.head.sha, 'Listing request', 'success', pr.html_url); return; }
  const source = pr.body?.match(SOURCE);
  if (!source || Number(source[1]) !== Number(pr.head.ref.slice(5))) {
    await api.status(pr.head.sha, 'Listing request', 'failure', pr.html_url); return;
  }
  const { data: issue } = await github.rest.issues.get({ ...context.repo, issue_number: Number(source[1]) });
  if (!active(issue) || requestHash(issue.body) !== source[2]) {
    await api.status(pr.head.sha, 'Listing request', 'failure', issue.html_url); return;
  }
  const comments = await github.paginate(github.rest.issues.listComments, { ...context.repo, issue_number: issue.number });
  const state = listingState(comments.find(c => bot(c) && c.body?.startsWith(MARK))?.body || '');
  if (state?.state === 'checking') { await api.status(pr.head.sha, 'Listing request', 'pending', issue.html_url); return; }
  const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: pr.number });
  let matches = false;
  if (state?.state === 'review' && state.pr === pr.number && files.length === 1 && /^directory\/[a-z0-9][a-z0-9-]{0,40}\.json$/.test(files[0].filename)) {
    const { data } = await github.rest.repos.getContent({ ...context.repo, path: files[0].filename, ref: pr.head.sha });
    try {
      const entry = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
      matches = !problems(entry).length && fingerprint(entry) === state.hash;
    } catch {}
  }
  await api.status(pr.head.sha, 'Listing request', matches ? 'success' : 'failure', issue.html_url);
}

export async function notifyPublication({ github, repo, directory, successful }) {
  const api = client(github, repo);
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'all', labels: 'join', per_page: 100 });
  for (const issue of issues.filter(i => !i.pull_request)) {
    const comments = await github.paginate(github.rest.issues.listComments, { ...repo, issue_number: issue.number });
    const comment = comments.find(c => bot(c) && c.body?.startsWith(MARK));
    const state = listingState(comment?.body || '');
    if (!state || !['review', 'unpublished'].includes(state.state) || !Number.isSafeInteger(state.pr)) continue;
    const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: state.pr });
    if (!pr.merged_at) continue;
    const present = successful && directory?.worlds?.some(e => fingerprint(e) === state.hash && !isBlocked(e.url, directory.blocked));
    await api.comment(issue.number, present ? copy.published : copy.unpublished,
      { ...state, state: present ? 'published' : 'unpublished' });
  }
}
