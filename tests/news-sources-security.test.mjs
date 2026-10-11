import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNews,readArticle} from '../lib/news-sources.mjs';

const date=new Date().toUTCString();
const fedArticle={id:'federalreserve:fixture',provider:'federalreserve',url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261009a.htm'};
const rss=()=>new Response(`<rss><item><title>Interest rate trade statement</title><link>${fedArticle.url}</link><description>Tariff and trade update</description><pubDate>${date}</pubDate></item></rss>`);

test('official queries share feed work while malformed queries fail before fetching',async()=>{
 const requested=[];
 const fetchImpl=async url=>{requested.push(url);if(url.includes('documents.json'))return Response.json({results:[]});if(url.includes('federalreserve.gov'))return rss();return new Response('<rss/>');};
 await Promise.all([loadNews({query:'trade',fetchImpl}),loadNews({query:'tariff',fetchImpl})]);
 assert.equal(requested.filter(u=>u.includes('federalreserve.gov')).length,1);
 assert.equal(requested.filter(u=>u.includes('ecb.europa.eu')).length,1);
 assert.equal(requested.filter(u=>u.includes('documents.json')).length,2);
 await assert.rejects(()=>loadNews({query:'x'.repeat(121),fetchImpl}));assert.equal(requested.length,4);
});

test('official record links are host checked before being returned to the reader',async()=>{
 const result=await loadNews({fetchImpl:async url=>url.includes('documents.json')?Response.json({results:[
  {document_number:'2026-00001',title:'Trusted',html_url:'https://www.federalregister.gov/documents/2026-00001',pdf_url:'https://www.govinfo.gov/content/pkg/FR-2026-10-10/pdf/2026-00001.pdf'},
  {document_number:'2026-00002',title:'Malicious',html_url:'javascript:alert(1)'},
  {document_number:'2026-00003',title:'Untrusted',html_url:'https://attacker.example/story'},
 ]}):new Response('<rss/>')});
 assert.equal(result.articles.length,1);assert.equal(result.articles[0].title,'Trusted');assert.match(result.articles[0].officialPdfUrl,/www.govinfo.gov/);
});

test('official redirects cannot reach local services and redirect bodies are cancelled',async()=>{
 const originalFetch=globalThis.fetch,requested=[];let cancelled=0;
 globalThis.fetch=async url=>{requested.push(url);return new Response(new ReadableStream({cancel(){cancelled++;}}),{status:302,headers:{location:'https://127.0.0.1/admin'}});};
 try{await assert.rejects(()=>readArticle(fedArticle),/supported official/);assert.equal(requested.length,1);assert.equal(cancelled,1);}
 finally{globalThis.fetch=originalFetch;}
});

test('official streamed responses are bounded without Content-Length',async()=>{
 const originalFetch=globalThis.fetch;let cancelled=0;
 globalThis.fetch=async()=>{let count=0;return new Response(new ReadableStream({pull(controller){if(count++<5)controller.enqueue(new Uint8Array(800000));else controller.close();},cancel(){cancelled++;}}));};
 try{await assert.rejects(()=>readArticle(fedArticle),/size limit/);assert.equal(cancelled,1);}
 finally{globalThis.fetch=originalFetch;}
});

test('official source errors do not reveal raw network diagnostics',async()=>{
 const result=await loadNews({fetchImpl:async()=>{throw new Error('secret-token /private/credentials');}});
 assert.equal(result.sources.every(s=>s.status==='unavailable'),true);assert.ok(!JSON.stringify(result).includes('secret-token'));assert.ok(!JSON.stringify(result).includes('/private'));
});

test('inherited object property names are not official providers',async()=>{
 await assert.rejects(()=>readArticle({provider:'__proto__',url:'https://127.0.0.1/admin'}),/supported official feed/);
});
