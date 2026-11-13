import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectRequest, inspectEntry } from './check-listing.mjs';
import { problems, validateSettings, inspectLogo } from './directory.mjs';
const entry={name:'Example',url:'https://example.com/',owner:'Alex',lang:'en',intro:'Hello',logo:'https://example.com/logo.png',homecraft:true};
const good={reachable:async()=>true,inspectLogo:async()=>({status:'pass'}),inspectPortal:async()=>({status:'pass',views:[]})};

test('field validation stops network access for unsafe request URLs',async()=>{
  for(const url of ['http://example.com/','https://name:password@example.com/','https://127.0.0.1/','https://10.0.0.1/','https://example.com/?key=secret']){
    const report=await inspectRequest(`### 网址 / Address\n\n${url}`,{readSiteInfo:()=>{throw Error('unexpected network request')}});
    assert.equal(report.status,'changes');
  }
});
test('an ordinary website can provide details without homecraft.json',async()=>{
  const report=await inspectRequest('### 网址 / Address\n\nhttps://example.com/\n\n### 网站名称 / Website name\n\nExample\n\n### 作者名称 / Author name\n\nAlex\n\n### 网站语言 / Languages\n\nEnglish / 英文\n\n### 简介 / Introduction\n\nHello\n\n### Logo\n\nhttps://example.com/logo.png',{...good,readSiteInfo:async()=>null});
  assert.equal(report.status,'pass');
});
test('template logo is a warning while connectivity remains required',async()=>{
  const report=await inspectEntry(entry,{...good,inspectLogo:async()=>({status:'pass',template:true})});assert.equal(report.status,'pass');assert.equal(report.warnings.length,1);
  const broken=await inspectEntry(entry,{...good,inspectPortal:async()=>({status:'fail',views:[{code:'private_directory'}]})});assert.equal(broken.status,'changes');assert(broken.issues[0].includes('portal.directory'));
});
test('temporary network failures require review without a configuration accusation',async()=>{
  const down={reachable:async()=>false,inspectLogo:async()=>({status:'review'}),inspectPortal:async()=>({status:'review',views:[{code:'page'}]})};
  const report=await inspectEntry(entry,{...good,...down});
  assert.equal(report.status,'review');assert.equal(report.issues.length,0);assert.equal(report.review.length,1);
});
test('settings and preview URLs cannot bypass the directory schema',()=>{
  assert(validateSettings({blocked:'https://example.com/'}).length);assert(validateSettings({join:'javascript:alert(1)'}).length);
  assert(validateSettings({unexpected:true}).length);assert.deepEqual(validateSettings({blocked:[],pinned:['terry']}),[]);
  assert(problems({...entry,preview:'https://other.example/picture.png'}).length);
});
test('logo checks accept the shipped image and bound streamed responses',async()=>{
  const original=globalThis.fetch;
  try {
    const templateLogo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABPklEQVR4nO3bPUpDQRTF8X8OF8QuGwg2LkBtRXADWYqlC7B2OdmAENKqC7ARN2AnVlrPFTIME32JZ37dfW/uYVLcvA94MAyDs1k+sFicfPGPvb29Fr9ZmBPmhLmoLVjen3HIVrfPW88Lc8KcMBetDZvVR1FfLo8Pqj8T5oQ5YS5aG3pnbur+TJgT5oS56L3u5vM388+ifryab12ftfbX9lMjzAlzwlzUFuSZZF3WG4629l+s38u6HOmq2n9M3k/Ov6vkC3PCnDAXvQE/ZjJ5eHop6uvz073KF+aEOWEuWhtaZ651Jn87PxPmhDlhLlobemdu6vxMmBPmhLnYdWDvvflf5wtzwpwwF7sO3Pd7/0yYE+aEuZj6ut6bN94JdhLmhLnY9xmtGc8CnYQ5YW6WD4xvhswIc5p6A8MwDEzoG4wsW1tHx5PjAAAAAElFTkSuQmCC', 'base64');
    globalThis.fetch=async()=>new Response(templateLogo,{headers:{'content-type':'image/png'}});
    assert.deepEqual(await inspectLogo(entry.logo),{status:'pass',template:true});
    globalThis.fetch=async()=>new Response(new Uint8Array(102401),{headers:{'content-type':'image/png'}});
    assert.equal((await inspectLogo(entry.logo)).status,'fail');
    globalThis.fetch=async()=>new Response('',{status:503});assert.equal((await inspectLogo(entry.logo)).status,'review');
  } finally {globalThis.fetch=original;}
});

test('English-first forms preserve existing Chinese-first request parsing',async()=>{
  const oldBody='### 网址 / Address\n\nhttps://example.com/\n\n### 网站名称 / Website name\n\nExample\n\n### 作者名称 / Author name\n\nAlex\n\n### 网站语言 / Languages\n\n中文和英文 / Chinese and English\n\n### 简介 / Introduction\n\nHello\n\n### Logo\n\nhttps://example.com/logo.png';
  const newBody=oldBody.replace('网址 / Address','Address / 网址').replace('网站名称 / Website name','Website name / 网站名称').replace('作者名称 / Author name','Author name / 作者名称').replace('网站语言 / Languages','Languages / 网站语言').replace('中文和英文 / Chinese and English','Chinese and English / 中文和英文').replace('简介 / Introduction','Introduction / 简介');
  const opts={...good,readSiteInfo:async()=>null};
  assert.deepEqual((await inspectRequest(newBody,opts)).entry,(await inspectRequest(oldBody,opts)).entry);
});
