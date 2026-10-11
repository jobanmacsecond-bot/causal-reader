import test from 'node:test';
import assert from 'node:assert/strict';
import {GLOBAL_SOURCES} from '../lib/global-sources.mjs';
import {createNewsService} from '../lib/news-service.mjs';

test('global region filters, corrected reader content, and historical research work together',async()=>{
 const originalFetch=globalThis.fetch;
 let clock=Date.now();const {news,article,causes}=createNewsService({now:()=>clock});
 let corrected=false;
 const current=new Date(Date.now()-3600000).toUTCString();
 const old=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 globalThis.fetch=async value=>{
  const url=String(value),source=GLOBAL_SOURCES.find(s=>s.feedUrl===url);
  if(source){
   const title=source.id==='bbc'?'India raises steel prices after tariff change':`${source.name} reports a different local story`;
   const summary=source.id==='bbc'?(corrected?'Corrected publisher excerpt on steel prices in India.':'Original publisher excerpt on steel prices in India.'):'News from the publisher feed.';
   return new Response(`<rss><channel><item><title>${title}</title><link>https://${source.articleHosts[0]}/article-1</link><description>${summary}</description><pubDate>${current}</pubDate></item></channel></rss>`);
  }
  if(url.includes('federalregister.gov/api/v1/documents.json'))return Response.json({results:[{document_number:'test-old-policy',title:'India steel tariff increase',abstract:'India introduced tariffs on steel imports under the new trade policy.',publication_date:old,html_url:'https://www.federalregister.gov/documents/test-old-policy',type:'Rule'}]});
  return new Response('<rss><channel></channel></rss>');
 };
 try{
  const first=await news('',true),bbc=first.articles.find(a=>a.provider==='bbc');
  assert.ok(bbc);assert.ok(bbc.regions.includes('asia'));
  assert.equal(first.articles.some(a=>a.documentNumber==='test-old-policy'),false,'old policies should not be top headlines');
  const initialArticle=await article(bbc.id);assert.match(initialArticle.text,/Original publisher excerpt/);
  assert.deepEqual(initialArticle.headlineRank,bbc.headlineRank,'the reader must retain the headline ranking explanation');
  const context=await causes(bbc.id);
  assert.ok(context.ranked.some(a=>a.id==='fr:test-old-policy'),'older official policy should remain retrievable as research context');
  corrected=true;clock+=30001;const refreshed=await news('',true);
  const refreshedArticle=await article(bbc.id);assert.match(refreshedArticle.text,/Corrected publisher excerpt/,'refresh must replace a corrected RSS excerpt');
  assert.deepEqual(refreshedArticle.headlineRank,refreshed.articles.find(a=>a.id===bbc.id).headlineRank);
 }finally{globalThis.fetch=originalFetch}
});


const empty=()=>({articles:[],sources:[]});
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const fixtureStory=(id='story')=>({id,title:'India steel tariff prices change',summary:'Steel prices in India rose after tariffs on trade.',provider:'federalregister',published:new Date().toISOString(),url:'https://www.federalregister.gov/documents/2026-00001',contentMode:'summary',topics:['Trade']});

test('invalid queries and identifiers fail before any source is contacted',async()=>{
 let calls=0;const service=createNewsService({loadNewsImpl:async()=>{calls++;return empty();},loadGlobalNewsImpl:async()=>{calls++;return empty();}});
 for(const query of ['x'.repeat(121),'hidden\u0000value',{},42])await assert.rejects(()=>service.news(query),e=>e.status===400);
 for(const id of ['',null,'invalid id','x'.repeat(2049)])await assert.rejects(()=>service.article(id),e=>e.status===400);
 await assert.rejects(()=>service.article('missing'),e=>e.status===404);
 assert.equal(calls,0);
});

test('duplicate searches coalesce and repeated refreshes respect the minimum cooldown',async()=>{
 let clock=Date.now(),official=0,global=0;
 const gate=defer();
 const service=createNewsService({now:()=>clock,loadGlobalNewsImpl:async()=>{global++;await gate.promise;return empty();},loadNewsImpl:async()=>{official++;await gate.promise;return empty();}});
 const requests=Array.from({length:20},()=>service.news('trade',true));
 await Promise.resolve();await Promise.resolve();
 assert.equal(global,1);assert.equal(official,1);gate.resolve();await Promise.all(requests);
 await service.news('trade',true);assert.equal(global,1);assert.equal(official,1);
 clock+=30001;await service.news('trade',true);assert.equal(global,2);assert.equal(official,2);
});

test('distinct concurrent searches are bounded and recover when the current work completes',async()=>{
 const gate=defer();let official=0,global=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;await gate.promise;return empty();},loadNewsImpl:async()=>{official++;await gate.promise;return empty();}});
 const jobs=Array.from({length:6},(_,i)=>service.news('query-'+i));
 await assert.rejects(()=>service.news('overflow'),e=>e.status===503);
 await Promise.resolve();await Promise.resolve();assert.equal(official,6);assert.equal(global,1);
 gate.resolve();await Promise.all(jobs);await service.news('overflow');assert.equal(official,7);
});

test('article reads and context research coalesce; raw upstream errors stay private',async()=>{
 const gate=defer();let reads=0,searches=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>empty(),loadNewsImpl:async()=>{searches++;return {articles:[fixtureStory()],sources:[]};},readArticleImpl:async()=>{reads++;await gate.promise;throw new Error('credential /private/path upstream internal detail');}});
 await service.news();
 const articles=Array.from({length:10},()=>service.article('story'));
 await Promise.resolve();assert.equal(reads,1);gate.resolve();const values=await Promise.all(articles);
 assert.equal(values[0].readerError,'Source text is temporarily unavailable.');assert.ok(!JSON.stringify(values).includes('/private/path'));
 const contexts=await Promise.all(Array.from({length:10},()=>service.causes('story')));
 assert.equal(reads,1);assert.equal(searches,2);assert.deepEqual(contexts[0],contexts[9]);
});

test('read cache eviction releases full documents while source summaries remain usable',async()=>{
 let reads=0;const articles=Array.from({length:42},(_,i)=>fixtureStory('story-'+i));
 const service=createNewsService({loadGlobalNewsImpl:async()=>empty(),loadNewsImpl:async()=>({articles,sources:[]}),readArticleImpl:async a=>{reads++;return {...a,text:'Full source document',contentMode:'source-text'};}});
 await service.news();for(const a of articles)await service.article(a.id);
 assert.equal(reads,42);await service.article(articles[0].id);assert.equal(reads,43,'an evicted document must be fetched again rather than retained by the registry');
});


test('reading a cached article after a ranking refresh keeps the current ranking metadata',async()=>{
 let clock=Date.now();const story={...fixtureStory('ranked'),provider:'bbc',sourceKind:'journalism',contentMode:'rss-summary',region:'Asia',regions:['Asia'],editorialGroup:'bbc',feedPosition:0};
 const service=createNewsService({now:()=>clock,loadGlobalNewsImpl:async()=>({articles:[story],sources:[]}),loadNewsImpl:async()=>empty()});
 const initial=await service.news();const firstRead=await service.article(story.id);
 assert.ok(firstRead.headlineRank);assert.deepEqual(firstRead.headlineRank,initial.articles[0].headlineRank);
 clock+=30001;story.feedPosition=15;const refreshed=await service.news('',true);const cachedRead=await service.article(story.id);
 assert.notDeepEqual(refreshed.articles[0].headlineRank,firstRead.headlineRank);
 assert.deepEqual(cachedRead.headlineRank,refreshed.articles[0].headlineRank,'ranking must update even when the headline and text are unchanged');
 assert.equal(cachedRead.text,story.summary);
});

const publisherStory=(id='bbc:abc123',overrides={})=>({...fixtureStory(id),provider:'bbc',source:'BBC News',url:'https://www.bbc.com/news/'+id.slice(4),sourceKind:'journalism',contentMode:'rss-summary',region:'Asia',regions:['Asia'],editorialGroup:'bbc',feedPosition:0,...overrides});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('a cold worker can read a current headline without receiving a news request first',async()=>{
 let global=0,official=0,reads=0;const story=publisherStory();
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;return {articles:[story],sources:[{provider:'bbc',status:'available'}]};},loadNewsImpl:async()=>{official++;return empty();},readArticleImpl:async()=>{reads++;throw new Error('RSS articles must not be fetched');}});
 const article=await service.article(story.id);
 assert.equal(article.id,story.id);assert.equal(article.text,story.summary);assert.ok(article.headlineRank);
 assert.equal(global,1);assert.equal(official,1);assert.equal(reads,0);
});

test('cold context requests hydrate the target and still search historical official context',async()=>{
 const story=publisherStory('bbc:abc123',{title:'India raises steel prices after tariff change',summary:'Original publisher excerpt on steel prices in India.',countries:['India']}),policy={...fixtureStory('fr:2026-00001'),title:'India steel tariff increase',summary:'India introduced tariffs on steel imports under a new trade policy.',published:new Date(Date.now()-30*86400000).toISOString(),documentNumber:'2026-00001'};
 const queries=[];let global=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;return {articles:[story],sources:[]};},loadNewsImpl:async({query})=>{queries.push(query);return {articles:query==='tariff trade'?[policy]:[],sources:[]};}});
 const result=await service.causes(story.id);
 assert.equal(result.targetId,story.id);assert.ok(result.ranked.some(a=>a.id===policy.id));
 assert.equal(global,1);assert.deepEqual(queries,['','tariff trade']);
});

test('concurrent cold registry misses share hydration and respect the reader capacity limit',async()=>{
 const gate=defer(),stories=Array.from({length:8},(_,i)=>publisherStory('bbc:cold'+i));let global=0,official=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;await gate.promise;return {articles:stories,sources:[]};},loadNewsImpl:async()=>{official++;await gate.promise;return empty();}});
 const duplicate=Array.from({length:20},()=>service.article(stories[0].id));
 const other=stories.slice(1).map(story=>service.article(story.id));
 await assert.rejects(()=>service.article('bbc:extra'),e=>e.status===503);
 await flush();assert.equal(global,1);assert.equal(official,1);
 gate.resolve();const results=await Promise.all([...duplicate,...other]);
 assert.equal(results.length,27);assert.equal(results[0].id,stories[0].id);assert.equal(results.at(-1).id,stories.at(-1).id);
});

test('forged and unsupported identifiers cannot trigger hydration or URL-based reads',async()=>{
 let loads=0,reads=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>{loads++;return empty();},loadNewsImpl:async()=>{loads++;return empty();},readArticleImpl:async()=>{reads++;return {};}});
 for(const id of ['unknown:abc','bbc:https://attacker.example/article','fr:not-a-document','ecb:https://127.0.0.1/press/pr/article','ecb:https://www.ecb.europa.eu/admin','federalreserve:https://user:password@www.federalreserve.gov/newsevents/pressreleases/article'])await assert.rejects(()=>service.article(id),e=>e.status===404);
 assert.equal(loads,0);assert.equal(reads,0);
});

test('random valid-looking misses reuse the feed snapshot rather than fetching repeatedly',async()=>{
 let global=0,official=0,reads=0;const queryArgs=[];
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;return {articles:[],sources:[{provider:'bbc',status:'available'}]};},loadNewsImpl:async args=>{official++;queryArgs.push(args);return empty();},readArticleImpl:async()=>{reads++;return {};}});
 for(let n=0;n<25;n++)await assert.rejects(()=>service.article('bbc:m'+n.toString(36)),e=>e.status===404);
 await assert.rejects(()=>service.article('bbc:m0'),e=>e.status===404);
 assert.equal(global,1);assert.equal(official,1);assert.equal(reads,0);
 assert.equal(queryArgs[0].query,'');assert.ok(!('id' in queryArgs[0])&&!('url' in queryArgs[0]));
});

test('a publisher outage on a cold lookup returns a safe retryable error',async()=>{
 const service=createNewsService({loadGlobalNewsImpl:async()=>({articles:[],sources:[{provider:'bbc',status:'unavailable',message:'secret network diagnostic'}]}),loadNewsImpl:async()=>empty()});
 await assert.rejects(()=>service.article('bbc:abc123'),e=>e.status===503&&!e.message.includes('secret'));
});

test('cached headlines can restore an evicted registry entry without another upstream request',async()=>{
 const story=publisherStory();let global=0,official=0;
 const service=createNewsService({loadGlobalNewsImpl:async()=>{global++;return {articles:[story],sources:[]};},loadNewsImpl:async({query})=>{official++;return {articles:query==='fill'?Array.from({length:1501},(_,n)=>fixtureStory('fill-'+n)):[],sources:[]};}});
 await service.news();await service.news('fill');const article=await service.article(story.id);
 assert.equal(article.id,story.id);assert.ok(article.headlineRank);assert.equal(global,1);assert.equal(official,2);
});

test('expired historical official IDs return a safe 404 and never become fetch URLs',async()=>{
 let reads=0;const queries=[];
 const service=createNewsService({loadGlobalNewsImpl:async()=>empty(),loadNewsImpl:async({query})=>{queries.push(query);return empty();},readArticleImpl:async()=>{reads++;return {};}});
 for(const id of ['fr:2020-12345','federalreserve:https://www.federalreserve.gov/newsevents/pressreleases/monetary20200101a.htm','ecb:https://www.ecb.europa.eu/press/pr/date/2020/html/ecb.old.en.html'])await assert.rejects(()=>service.article(id),e=>e.status===404&&e.message.includes('no longer in the source feeds'));
 assert.deepEqual(queries,['']);assert.equal(reads,0);
});
