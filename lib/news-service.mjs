import {loadNews,readArticle} from './news-sources.mjs';
import {loadGlobalNews,GLOBAL_SOURCES} from './global-sources.mjs';
import {rankHeadlines} from './headline-ranking.mjs';
import {rankPotentialCauses} from './news-engine.mjs';

const CACHE_MS=300000, REFRESH_COOLDOWN_MS=30000;
export class NewsServiceError extends Error {
 constructor(message,status){super(message);this.name='NewsServiceError';this.status=status;}
}
function validateQuery(value){
 if(typeof value!=='string'||value.length>120||/[\u0000-\u001f\u007f]/.test(value))throw new NewsServiceError('Search must contain at most 120 characters without control characters.',400);
 return value.trim();
}
function validateId(value){
 if(typeof value!=='string'||!value||value.length>2048||/[\u0000-\u0020\u007f]/.test(value))throw new NewsServiceError('Choose a valid story identifier.',400);
 return value;
}
const publisherIds=new Set(GLOBAL_SOURCES.map(source=>source.id));
function registryProvider(id){
 const [provider,suffix]=[id.slice(0,id.indexOf(':')),id.slice(id.indexOf(':')+1)];
 if(publisherIds.has(provider)&&/^[a-z0-9]{1,7}$/.test(suffix))return provider;
 if(provider==='fr'&&/^(?:C\d-)?\d{4}-\d{3,7}$/.test(suffix))return 'federalregister';
 const paths={federalreserve:{hosts:['www.federalreserve.gov','federalreserve.gov'],prefix:'/newsevents/pressreleases/'},ecb:{hosts:['www.ecb.europa.eu','ecb.europa.eu'],prefix:'/press/pr/'}};
 if(!Object.hasOwn(paths,provider))return null;
 try{const url=new URL(suffix),rule=paths[provider];return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&rule.hosts.includes(url.hostname)&&url.pathname.startsWith(rule.prefix)?provider:null;}catch{return null;}
}
function cap(map,max){while(map.size>max)map.delete(map.keys().next().value);}
function matches(a,query){const tokens=query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(t=>t.length>2&&!/^(the|and|for|from|with|news)$/.test(t));const text=`${a.title} ${a.summary} ${(a.topics||[]).join(' ')}`.toLowerCase();return !tokens.length||tokens.some(t=>text.includes(t));}
const regionKey=value=>String(value||'global').toLowerCase().replace(/\s+/g,'-');

/** A bounded per-worker cache; injected loaders let concurrency protection be tested offline. */
export function createNewsService({loadNewsImpl=loadNews,loadGlobalNewsImpl=loadGlobalNews,readArticleImpl=readArticle,now=Date.now}={}) {
 const registry=new Map(),cache=new Map(),reads=new Map(),pendingNews=new Map(),pendingReads=new Map(),pendingCauses=new Map(),causeCache=new Map(),misses=new Map();
 let globalCache,globalPending,hydrationPending;
 const iso=()=>new Date(now()).toISOString(),asOf=()=>iso().slice(0,10);
 function fresh(entry,refresh=false){return entry&&now()-entry.time<(refresh?REFRESH_COOLDOWN_MS:CACHE_MS);}
 function register(articles){
  for(const a of articles){const old=registry.get(a.id);if(old&&(old.title!==a.title||old.summary!==a.summary||old.published!==a.published)){reads.delete(a.id);causeCache.clear();}const cached=reads.get(a.id);if(cached)reads.set(a.id,{...cached,data:{...cached.data,...a,text:cached.data.text,contentMode:cached.data.contentMode,readerNote:cached.data.readerNote,readAt:cached.data.readAt}});registry.set(a.id,a);misses.delete(a.id);}
  cap(registry,1500);
 }
 async function worldwide(refresh){
  if(fresh(globalCache,refresh))return globalCache.data;
  if(globalPending)return globalPending;
  globalPending=Promise.resolve().then(()=>loadGlobalNewsImpl({limit:160,asOfDate:asOf()})).then(data=>{globalCache={time:now(),data};return data;}).finally(()=>{globalPending=undefined;});
  return globalPending;
 }
 async function news(query='',refresh=false){
  query=validateQuery(query);refresh=refresh===true;
  const found=cache.get(query);if(fresh(found,refresh))return found.data;
  if(pendingNews.has(query))return pendingNews.get(query);
  if(pendingNews.size>=6)throw new NewsServiceError('News is busy. Please try again in a moment.',503);
  const job=Promise.resolve().then(async()=>{
   const [global,official]=await Promise.all([worldwide(refresh),loadNewsImpl({query,limit:54,asOfDate:asOf(),refresh})]);
   const articles=[...global.articles.filter(a=>matches(a,query)).map(a=>({...a,region:regionKey(a.region),regions:(a.regions||[a.region]).map(regionKey)})),...official.articles.map(a=>({...a,sourceKind:'official',editorialGroup:a.provider,region:a.provider==='ecb'?'europe':'americas',regions:[a.provider==='ecb'?'europe':'americas'],feedPosition:99}))];
   register(articles); // Historical official records stay available for context research.
   const data={articles:rankHeadlines(articles,{now:new Date(now()),query,limit:180}),sources:[...global.sources,...official.sources.map(s=>({...s,sourceKind:'official'}))],query,asOfDate:asOf(),fetchedAt:iso(),coverage:'Global English-language reporting plus official US and European policy sources.',rankingMethod:'Publisher feed placement, freshness, related coverage across outlet groups, and source diversity. This is headline importance, not causal confidence.'};
   register(data.articles);
   cache.set(query,{time:now(),data});cap(cache,30);return data;
  }).finally(()=>pendingNews.delete(query));pendingNews.set(query,job);return job;
 }
 async function hydrateRegistry(){
  if(hydrationPending)return hydrationPending;
  hydrationPending=Promise.resolve().then(()=>news()).then(data=>{register(data.articles);return data;}).catch(error=>{if(error instanceof NewsServiceError)throw error;throw new NewsServiceError('Sources are temporarily unavailable. Please try again later.',503);}).finally(()=>{hydrationPending=undefined;});
  return hydrationPending;
 }
 async function article(id){
  id=validateId(id);
  const cached=reads.get(id);if(fresh(cached))return cached.data;if(cached)reads.delete(id);
  const miss=misses.get(id);if(!registry.has(id)&&miss&&now()-miss.time<30000)throw new NewsServiceError(miss.message,miss.status);
  if(!registry.has(id)&&!registryProvider(id))throw new NewsServiceError('This story is no longer loaded. Refresh the source feed and select it again.',404);
  if(pendingReads.has(id))return pendingReads.get(id);
  if(pendingReads.size>=8)throw new NewsServiceError('The reader is busy. Please try again in a moment.',503);
  const job=Promise.resolve().then(async()=>{
   let a=registry.get(id);
   if(!a){
    const data=await hydrateRegistry();a=registry.get(id);
    if(!a){const failed=data.sources.some(source=>source.provider===registryProvider(id)&&source.status==='unavailable');const status=failed?503:404,message=failed?'This publisher is temporarily unavailable. Please try again later.':'This story is no longer in the source feeds. Refresh the headlines and select it again.';misses.set(id,{time:now(),status,message});cap(misses,100);throw new NewsServiceError(message,status);}
   }
   let full;
   if(a.contentMode==='rss-summary')full={...a,text:a.summary||'This publisher supplied a headline only.',readerNote:a.readerNote||'Publisher-provided RSS excerpt. The full article is available at the original publication link.',readAt:iso()};
   else try{full=await readArticleImpl(a);}catch{full={...a,readerError:'Source text is temporarily unavailable.',readerNote:'The full source text could not be loaded. The source-provided summary remains available.',readAt:iso()};}
   // Registry holds summaries, not full documents, so eviction actually releases large texts.
   if(registry.get(id)===a){reads.set(id,{time:now(),data:full});cap(reads,40);}
   return full;
  }).finally(()=>pendingReads.delete(id));pendingReads.set(id,job);return job;
 }
 async function causes(id){
  id=validateId(id);const cached=causeCache.get(id);if(fresh(cached))return cached.data;
  if(pendingCauses.has(id))return pendingCauses.get(id);
  if(pendingCauses.size>=6)throw new NewsServiceError('Context research is busy. Please try again in a moment.',503);
  const job=Promise.resolve().then(async()=>{
   const target=await article(id),text=`${target.title} ${target.summary}`;
   let query=/tariff|import|export|duties|trade/i.test(text)?'tariff trade':/interest rate|monetary|inflation/i.test(text)?'interest rate':/artificial intelligence|semiconductor|technology|digital/i.test(text)?'technology':/bank|financial|capital/i.test(text)?'bank':target.title.replace(/[^a-zA-Z ]/g,' ').split(/\s+/).filter(x=>x.length>5&&!/notice|proposed|amended|certain|review|period|federal|public|agency|information/i.test(x)).slice(0,3).join(' ');
   const subject=target.title.split(/\bFrom\b|:|;/)[0].replace(/^Certain\s+|^Notice of\s+/gi,'').trim();
   if(target.provider==='federalregister'&&/steel|pipe|tires|fertilizers|paper|chromium|paprika|shipments|semiconductor/i.test(subject))query='"'+subject.slice(0,80)+'"';
   query=query.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120);
   const related=query?await news(query):{articles:[],sources:[]};
   const candidates=new Map([...registry.values(),...related.articles].map(a=>[a.id,a]));
   for(const [readId,entry] of reads)if(fresh(entry)&&candidates.has(readId))candidates.set(readId,{...candidates.get(readId),text:entry.data.text});
   const all=[...candidates.values()];
   const data={targetId:id,ranked:rankPotentialCauses(target,all,{limit:6,minScore:18,maxAgeDays:730}),searchQuery:query,candidatesReviewed:all.length,method:'Subject, entity, chronology, and mechanism ranking; relevance is not causal confidence.',scope:'Current publisher feeds and searchable official policy records. This prototype does not search a complete historical news archive.',sources:related.sources};
   causeCache.set(id,{time:now(),data});cap(causeCache,50);return data;
  }).finally(()=>pendingCauses.delete(id));pendingCauses.set(id,job);return job;
 }
 return {news,article,causes};
}
const service=createNewsService();
export const news=service.news,article=service.article,causes=service.causes;
