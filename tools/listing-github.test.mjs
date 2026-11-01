import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRequest, applyRequest, reviewPolicy, notifyPublication, fingerprint, allowedEvent, validTitle, listingState, MARK } from './listing-github.mjs';
import { requestHash } from './check-listing.mjs';
import { classify, resolveCheckBase } from './pr-check.mjs';
import { sameDirectory, verifyPublication } from './verify-publication.mjs';

const entry = {name:'Example',url:'https://example.com/',owner:'Alex',lang:'en',intro:'Hello',logo:'https://example.com/logo.png',homecraft:true,added:'2026-11-01'};
function fixture({ hasPR = true, listed = false } = {}) {
  const calls = [], comments = [];
  const issue = {number:4,body:'original form',state:'open',labels:[{name:'join'}],user:{login:'alex'},html_url:'https://github.com/o/r/issues/4'};
  let pr = hasPR ? {number:5,user:{login:'github-actions[bot]'},head:{sha:'old-head',ref:'join/4',repo:{full_name:'o/r'}},base:{sha:'base'},html_url:'https://github.com/o/r/pull/5',body:`<!-- homecraft-request 4 ${requestHash(issue.body)} -->`} : null;
  const response = data => Promise.resolve({data});
  const github = {paginate:async (method, args) => (await method(args)).data,rest:{
    actions:{createWorkflowDispatch:async args=>calls.push(['dispatch',args])},
    issues:{get:async()=>({data:structuredClone(issue)}),listForRepo:()=>response([issue]),listComments:()=>response(comments),
      createComment:async args=>{calls.push(['comment',args.body]);comments.push({id:1,user:{login:'github-actions[bot]'},body:args.body});},
      updateComment:async args=>{calls.push(['comment',args.body]);comments.find(c=>c.id===args.comment_id).body=args.body;}},
    pulls:{list:()=>response(pr?[pr]:[]),get:()=>response(pr),listFiles:()=>response([{filename:'directory/example-com.json'}]),
      update:async args=>{calls.push(['updatePR',args]);Object.assign(pr,args);return {data:pr};},
      create:async args=>{calls.push(['createPR',args]);pr={number:5,html_url:'https://github.com/o/r/pull/5',...args};return {data:pr};}},
    repos:{getBranch:()=>response({commit:{sha:'base'}}),
      getContent:args=>response(args.path==='directory'?listed?[{name:'example-com.json',path:'directory/example-com.json'}]:[]:{content:Buffer.from(JSON.stringify(entry)).toString('base64')}),
      createCommitStatus:async args=>calls.push(['status',args])},
    git:{getCommit:()=>response({tree:{sha:'base-tree'}}),createTree:async args=>{calls.push(['tree',args]);return {data:{sha:'tree'}};},
      createCommit:async args=>{calls.push(['commit',args]);return {data:{sha:'new-head'}};},
      getRef:()=>response({}),createRef:async args=>calls.push(['createRef',args]),updateRef:async args=>calls.push(['updateRef',args])},
  }};
  const context={repo:{owner:'o',repo:'r'},eventName:'issues',payload:{issue, sender:{type:'User'},repository:{default_branch:'main'},pull_request:{number:5}}};
  const expected={issue:structuredClone(issue)};
  const report={entry,hash:requestHash(issue.body),status:'pass',issues:[],review:[],warnings:[]};
  return {github,context,issue,expected,report,calls,comments,getPR:()=>pr};
}

test('an edit blocks the old PR before inspecting the site', async()=>{
  const f=fixture();await prepareRequest(f);
  assert(f.calls.some(([type,s])=>type==='status'&&s.context==='Listing request'&&s.state==='pending'&&s.sha==='old-head'));
});
test('invalid edits cannot leave the previously successful PR mergeable', async()=>{
  const f=fixture();f.report.status='changes';f.report.issues=['invalid URL'];await applyRequest(f);
  assert(f.calls.some(([type,s])=>type==='status'&&s.state==='failure'));
  assert(!f.calls.some(([type])=>type==='updateRef'));
  assert(!f.calls.some(([type])=>type==='dispatch'));
});
test('inspection failures produce review feedback and block an existing PR', async()=>{
  const f=fixture();f.report=null;assert.equal((await applyRequest(f)).status,'review');
  assert(f.calls.some(([type,s])=>type==='status'&&s.state==='failure'));
});
test('a late result cannot overwrite a subsequently edited issue', async()=>{
  const f=fixture();f.issue.body='a new request';assert.equal((await applyRequest(f)).status,'stale');assert.equal(f.calls.length,0);
});
test('closing or removing the label closes the bot PR', async()=>{
  for(const kind of ['close','unlabel']){const f=fixture();if(kind==='close')f.issue.state='closed';else f.issue.labels=[];
    await prepareRequest(f);assert(f.calls.some(([t,p])=>t==='updatePR'&&p.state==='closed'));}
});
test('third-party and bot replies cannot trigger a recheck',()=>{
  const f=fixture();const event={...f.context.payload,comment:{user:{login:'other',type:'User'},author_association:'NONE'}};
  assert(!allowedEvent(event,'issue_comment'));event.comment.user.login='alex';assert(allowedEvent(event,'issue_comment'));
  event.sender.type='Bot';assert(!allowedEvent(event,'issue_comment'));
});
test('one accepted request creates one data file and a standardized PR',async()=>{
  const f=fixture({hasPR:false});assert.equal((await applyRequest(f)).status,'ready');
  const tree=f.calls.find(([t])=>t==='tree')[1];assert.equal(tree.tree.length,1);assert.equal(tree.tree[0].path,'directory/example-com.json');
  assert.equal(JSON.parse(tree.tree[0].content).url,entry.url);
  const pr=f.calls.find(([t])=>t==='createPR')[1];assert.equal(pr.title,'chore(directory): add Example');assert(pr.body.includes('Closes #4'));
  assert(f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.sha==='new-head'&&s.state==='success'));
  assert.deepEqual(f.calls.find(([t])=>t==='dispatch')[1],{owner:'o',repo:'r',workflow_id:'checks.yml',ref:'join/4'});
  assert.equal(f.calls.at(-1)[0],'dispatch');
});
test('rechecking updates the same PR and the same comment',async()=>{
  const f=fixture();await applyRequest(f);await applyRequest(f);
  assert.equal(f.calls.filter(([t])=>t==='createPR').length,0);assert.equal(f.comments.length,1);
  assert.equal(listingState(f.comments[0].body).pr,5);
  assert.equal(f.calls.filter(([t])=>t==='dispatch').length,2);
});
test('unchanged requests do not generate empty PRs',async()=>{
  const f=fixture({hasPR:false,listed:true});assert.equal((await applyRequest(f)).status,'unchanged');
  assert(!f.calls.some(([t])=>t==='createPR'||t==='commit'));
  assert(!f.calls.some(([t])=>t==='dispatch'));
});
test('dispatched checks resolve the PR base only for the exact bot commit',async()=>{
  const f=fixture();Object.assign(f.context,{eventName:'workflow_dispatch',ref:'refs/heads/join/4',sha:'old-head'});
  assert.equal(await resolveCheckBase(f),'base');
  f.context.sha='outdated-head';await assert.rejects(resolveCheckBase(f),/No open listing PR/);
  f.context.sha='old-head';f.getPR().head.repo.full_name='fork/r';await assert.rejects(resolveCheckBase(f),/No open listing PR/);
  f.getPR().head.repo.full_name='o/r';f.getPR().user.login='other';await assert.rejects(resolveCheckBase(f),/No open listing PR/);
  f.context.ref='refs/heads/main';assert.equal(await resolveCheckBase(f),'');
  f.context.eventName='pull_request';f.context.payload.pull_request.base={sha:'event-base'};assert.equal(await resolveCheckBase(f),'event-base');
});
test('PR body edits cannot turn pending inspection into success',async()=>{
  const f=fixture();await reviewPolicy(f);
  assert(!f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.state==='success'));
  f.issue.body='changed';await reviewPolicy(f);
  assert(f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.state==='failure'));
});
test('updating a branch preserves verified data but not a pending recheck',async()=>{
  const f=fixture();
  f.comments.push({id:1,user:{login:'github-actions[bot]'},body:`${MARK}\n<!-- homecraft-state ${JSON.stringify({state:'review',pr:5,hash:fingerprint(entry)})} -->`});
  f.getPR().head.sha='updated-head';await reviewPolicy(f);
  assert(f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.state==='success'&&s.sha==='updated-head'));
  await prepareRequest(f);f.calls.length=0;await reviewPolicy(f);
  assert(f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.state==='pending'));
  assert(!f.calls.some(([t,s])=>t==='status'&&s.context==='Listing request'&&s.state==='success'));
});
test('title and change scope checks cover normal and adversarial input',()=>{
  assert(validTitle('chore(directory): add 西西和北'));assert(validTitle('fix(input): handle movement keys'));
  assert(!validTitle('Add a site'));assert(!validTitle('fix: one\nsecond line'));
  assert.throws(()=>classify(['directory/a.json','engine/input.js']));
  assert.throws(()=>classify(['directory/a.json','directory/b.json']));
  assert.equal(classify(['directory/a.json']).listing,'directory/a.json');assert.equal(classify(['docs/worlds.md']).browser,false);
});
test('publication reports success only when reviewed data is in the verified directory',async()=>{
  const f=fixture();f.getPR().merged_at='2026-11-01';
  f.comments.push({id:1,user:{login:'github-actions[bot]'},body:`${MARK}\n<!-- homecraft-state ${JSON.stringify({state:'review',pr:5,hash:fingerprint(entry),url:entry.url})} -->`});
  await notifyPublication({...f,repo:f.context.repo,directory:{worlds:[entry]},successful:false});assert.equal(listingState(f.comments[0].body).state,'unpublished');
  await notifyPublication({...f,repo:f.context.repo,directory:{worlds:[{...entry,intro:'not the reviewed details'}]},successful:true});assert.equal(listingState(f.comments[0].body).state,'unpublished');
  await notifyPublication({...f,repo:f.context.repo,directory:{worlds:[entry]},successful:true});assert.equal(listingState(f.comments[0].body).state,'published');
  const count=f.calls.length;await notifyPublication({...f,repo:f.context.repo,directory:{worlds:[entry]},successful:true});assert.equal(f.calls.length,count);
});
test('stale CDN data cannot produce a successful publication notification',async()=>{
  const expected={version:1,updated:'2026-11-01',join:null,all:null,blocked:[],worlds:[entry]};
  assert(sameDirectory(expected,structuredClone(expected)));assert(!sameDirectory(expected,{...expected,updated:'2026-10-31'}));
  let attempts=0;assert(await verifyPublication(expected,'https://example.com/worlds.json',{pause:0,attempts:2,fetcher:async()=>({ok:true,json:async()=>++attempts===1?{...expected,worlds:[]}:expected})}));
});
