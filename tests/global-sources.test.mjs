import test from 'node:test';
import assert from 'node:assert/strict';
import {GLOBAL_SOURCES, parsePublisherFeed, loadGlobalNews} from '../lib/global-sources.mjs';

const bbc=GLOBAL_SOURCES.find(s=>s.id==='bbc');
const date='Sat, 10 Oct 2026 12:00:00 GMT';
function item(source,index=1,description='Publisher-provided excerpt') {
  return `<item><title>Trade report ${index}</title><link>${source.url}/fixture-${index}</link><description><![CDATA[${description}]]></description><pubDate>${date}</pubDate></item>`;
}

test('RSS excerpts preserve attribution, dates, regional mentions, and stable IDs',()=>{
  const xml=`<rss><channel>${item(bbc,1,'Japan and India negotiate a new trade agreement.')}<item><title>Future report</title><link>https://www.bbc.com/news/future</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const [article]=parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10'});
  assert.equal(parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10'}).length,1);
  assert.match(article.id,/^bbc:/);
  assert.equal(article.id,parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10'})[0].id);
  assert.equal(article.published,'2026-10-10T12:00:00.000Z');
  assert.equal(article.sourceKind,'journalism');assert.equal(article.contentMode,'rss-summary');
  assert.equal(article.documentType,'News report');assert.equal(article.editorialGroup,'bbc');
  assert.equal(article.region,'Asia');assert.deepEqual(article.countries,['India','Japan']);
  assert.ok(article.topics.includes('Trade'));assert.ok(article.readerNote.includes('BBC News'));
});

test('RSS markup, malicious URLs, duplicate tracking URLs, and full-content fields are not exposed',()=>{
  const xml=`<rss>${item(bbc,1,'&lt;script&gt;steal()&lt;/script&gt;<img src="https://evil.example/image">A &amp; B are reported.')}<item><title>Duplicate</title><link>${bbc.url}/fixture-1?utm_source=x</link><description>Same article</description></item><item><title>Dangerous link</title><link>javascript:alert(1)</link></item><item><title>Wrong publisher</title><link>https://evil.example/article</link></item><item><title>Full article omitted</title><link>https://www.bbc.com/news/body</link><content:encoded>FULL ARTICLE MUST NOT BE USED</content:encoded></item></rss>`;
  const articles=parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10'});
  assert.equal(articles.length,2);assert.equal(articles[0].summary,'A & B are reported.');
  assert.equal(articles[1].summary,'');assert.ok(!JSON.stringify(articles).includes('FULL ARTICLE'));
  assert.ok(!JSON.stringify(articles).includes('steal()'));assert.ok(!JSON.stringify(articles).includes('evil.example'));
});

test('Atom alternate links and missing dates are supported without fabricated dates',()=>{
  const xml='<feed><entry><title>Canada revises law</title><link rel="self" href="https://feeds.bbci.co.uk/news/world/rss.xml"/><link rel="alternate" href="https://www.bbc.com/news/atom"/><summary>Law update</summary></entry></feed>';
  const [article]=parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10',query:'Canada'});
  assert.equal(article.url,'https://www.bbc.com/news/atom');assert.equal(article.published,null);
  assert.equal(article.region,'Americas');assert.ok(article.topics.includes('Regulation'));
  assert.equal(parsePublisherFeed(xml,bbc,{asOfDate:'2026-10-10',query:'semiconductor'}).length,0);
});

test('location mentions override outlet coverage and US capital shorthand does not match pronoun us',()=>{
  const africa=GLOBAL_SOURCES.find(s=>s.id==='africanews');
  const [brussels]=parsePublisherFeed(`<rss>${item(africa,1,'Police clash with protesters in Brussels as thousands march against spending cuts.')}</rss>`,africa,{asOfDate:'2026-10-10'});
  assert.equal(brussels.region,'Europe');assert.deepEqual(brussels.countries,['Belgium']);
  const [us]=parsePublisherFeed(`<rss>${item(bbc,1,'US weather authorities warn of storm surge in Florida and the Gulf Coast.')}</rss>`,bbc,{asOfDate:'2026-10-10'});
  assert.equal(us.region,'Americas');assert.deepEqual(us.countries,['United States']);
  const [pronoun]=parsePublisherFeed(`<rss>${item(bbc,1,'Tell us about the latest story.')}</rss>`,bbc,{asOfDate:'2026-10-10'});
  assert.ok(!pronoun.countries.includes('United States'));
  for(const [text,region,country] of [['Panama responds to Central America trade proposal','Americas','Panama'],['Myanmar reports changes in Burma','Asia','Myanmar'],['Sri Lanka releases economic data','Asia','Sri Lanka'],['Guinea-Bissau election update','Africa','Guinea-Bissau'],['Mali reports a new law','Africa','Mali']]){
    const [article]=parsePublisherFeed(`<rss>${item(bbc,1,text)}</rss>`,bbc,{asOfDate:'2026-10-10'});
    assert.equal(article.region,region);assert.ok(article.countries.includes(country));
  }
});

test('load keeps outlet diversity and reports each feed failure without invented fallback stories',async()=>{
  const result=await loadGlobalNews({asOfDate:'2026-10-10',limit:12,fetchImpl:async url=>{
    const source=GLOBAL_SOURCES.find(s=>s.feedUrl===url);
    if(source.id==='dw')return new Response('Unavailable',{status:503});
    return new Response(`<rss>${[1,2,3].map(n=>item(source,n)).join('')}</rss>`);
  }});
  assert.equal(result.articles.length,12);assert.equal(result.sources.length,9);
  assert.equal(new Set(result.articles.slice(0,8).map(a=>a.provider)).size,8);
  assert.equal(result.sources.find(s=>s.id==='dw').status,'unavailable');
  assert.equal(result.articles.some(a=>a.provider==='dw'),false);
});

test('feed redirects cannot reach internal or arbitrary hosts and oversize bodies are rejected',async()=>{
  const requested=[];
  const result=await loadGlobalNews({asOfDate:'2026-10-10',fetchImpl:async url=>{
    requested.push(url);
    if(url===bbc.feedUrl)return new Response('',{status:302,headers:{location:'http://127.0.0.1/admin'}});
    return new Response('large',{headers:{'content-length':'2000001'}});
  }});
  assert.equal(requested.length,9);assert.equal(result.articles.length,0);
  assert.equal(result.sources.every(s=>s.status==='unavailable'),true);
  assert.match(result.sources[0].message,/allowed host/);
  assert.ok(!requested.some(u=>u.includes('127.0.0.1')));
});


test('caller cannot replace a supported publisher allowlist with an arbitrary host',()=>{
 const forged={...bbc,articleHosts:['evil.example'],name:'Forged publisher'};
 const xml='<rss><item><title>Malicious story</title><link>https://evil.example/story</link></item></rss>';
 assert.equal(parsePublisherFeed(xml,forged,{asOfDate:'2026-10-10'}).length,0);
});

test('streamed feeds are byte-bounded without Content-Length and fetch error details stay private',async()=>{
 let cancelled=0;
 const result=await loadGlobalNews({asOfDate:'2026-10-10',fetchImpl:async url=>{
  if(url!==bbc.feedUrl)throw new Error('secret API_TOKEN=123 /private/internal-path');
  let count=0;const body=new ReadableStream({pull(controller){if(count++<4)controller.enqueue(new Uint8Array(700000));else controller.close();},cancel(){cancelled++;}});
  return new Response(body);
 }});
 assert.equal(result.articles.length,0);assert.match(result.sources[0].message,/2 MB/);assert.equal(cancelled,1);
 assert.ok(!JSON.stringify(result.sources).includes('API_TOKEN'));assert.ok(!JSON.stringify(result.sources).includes('/private'));
});
