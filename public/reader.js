// Start as a classic script so opening the HTML file cannot strand a module spinner.
(() => {
 let startupFailed=false;
 const node=id=>document.getElementById(id);
 function startupIssue(fileOpened=false){
  if(startupFailed)return;startupFailed=true;
  const message=fileOpened?'Open the running news reader to load headlines.':'The news reader could not start. Reload the page to try again.';
  node('sourceStatus').textContent=fileOpened?'Open the news reader':'Reader could not start';
  node('feedCount').textContent='—';
  node('feedList').textContent=message;
  node('contextList').textContent='Earlier context appears once headlines are available.';
  node('sourceCatalog').textContent='Source availability appears in the running news reader.';
  node('newsGlobe').textContent='The globe is available in the running news reader.';
  node('locationSummary').querySelector('.location-count').textContent=message;
  node('alert').textContent=message;node('alert').classList.remove('hidden');
  for(const id of ['feedList','readerContent','contextList'])node(id).setAttribute('aria-busy','false');
  document.querySelectorAll('button, input, select').forEach(control=>control.disabled=true);
  const panel=document.createElement('div');panel.className='location-empty';
  const title=document.createElement('h2');title.textContent=fileOpened?'Open the news reader':'Could not open the reader';
  const detail=document.createElement('p');detail.textContent=fileOpened?'Live headlines load through the running website. If it is closed, double-click Start-Causal.command in the site folder first.':'Reload this page. If the problem continues, reopen the running news website.';
  const recovery=document.createElement('a');recovery.className='related-link';recovery.textContent=fileOpened?'Open news reader ↗':'Reload the reader';recovery.href=fileOpened?'http://127.0.0.1:8885/':location.href;
  panel.append(title,detail,recovery);node('readerContent').replaceChildren(panel);
 }
 if(location.protocol==='file:'){startupIssue(true);return;}
 const startupTimer=setTimeout(()=>startupIssue(),10000);
 async function startReader(){
  try{
   const [{createNewsGlobe},{canonicalCountryName,articleMatchesCountry}]=await Promise.all([import('./globe.js'),import('./location.mjs')]);
   if(startupFailed)return;
// Reader interface.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=u=>{try{if(typeof u!=='string'||u.length>4096)return '';const v=new URL(u);return ['http:','https:'].includes(v.protocol)&&!v.username&&!v.password?v.href:''}catch{return ''}};
const date=d=>{const value=new Date(/^\d{4}-\d{2}-\d{2}$/.test(d)?d+'T12:00:00':d);return d&&Number.isFinite(value.valueOf())?value.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Date unknown'};
const earlier=days=>days==null?'DATE UNCERTAIN':days===0?'SAME DAY':days<1?Math.max(1,Math.round(days*24))+' HOURS EARLIER':Math.floor(days)+' DAYS EARLIER';
const logos={bbc:'BBC',guardian:'G',aljazeera:'AJ',france24:'F24',dw:'DW',cna:'CNA',rnz:'RNZ',cbc:'CBC',africanews:'AN',federalregister:'FR',federalreserve:'FED',ecb:'ECB'};
const logo=a=>logos[a.provider]||a.source?.split(/\s+/).map(s=>s[0]).join('').slice(0,3)||'N';
let articles=[],sources=[],selected=null,topic='all',region='all',country=null,globe=null,order='headlines',query='',savedOnly=false,requestVersion=0,feedVersion=0,saved=[];
let feedLoading=true,loadedQuery=null,feedController=null,articleController=null,relatedController=null,relatedVersion=0,toastTimer;
// Browser storage is editable input: keep only small, valid, unique references.
try{
 const raw=localStorage.getItem('causal-reader-saved')||'[]';
 const parsed=raw.length<=100000?JSON.parse(raw):[];
 const seen=new Set();
 if(Array.isArray(parsed))saved=parsed.slice(0,200).filter(item=>item&&typeof item==='object'&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=2048&&!seen.has(item.id)&&seen.add(item.id)).map(item=>({id:item.id,title:typeof item.title==='string'?item.title.slice(0,500):'',url:link(item.url)}));
}catch{}
function updateSaved(){$('savedCount').textContent=saved.length;$('saved').classList.toggle('active',savedOnly);$('saved').setAttribute('aria-pressed',String(savedOnly));try{localStorage.setItem('causal-reader-saved',JSON.stringify(saved))}catch{toast('Browser storage unavailable. Saved stories stay in this session.')}}
function toast(s){clearTimeout(toastTimer);$('toast').textContent=s;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500)}
async function api(route,params={},options={}){
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,45000);
 try{
  const r=await fetch('/api/'+route+'?'+new URLSearchParams(params),{signal:controller.signal,credentials:'same-origin',headers:{Accept:'application/json'}});
  const data=await r.json();
  if(!r.ok||data.error)throw Error(String(data.error||'Request failed').slice(0,240));
  return data;
 }catch(e){if(e.name==='AbortError')throw Error('The request took too long. Please try again.');throw e}
 finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort)}
}
function loading(text){return `<div class="loading"><span class="spinner" aria-hidden="true"></span>${esc(text)}</div>`}
function matchesTopic(a){const text=`${a.title} ${a.summary} ${(a.topics||[]).join(' ')}`;return topic==='all'||({trade:/trade|tariff|duties|duty|import|export|customs|sanction/i,law:/regulat|rule|law|act\b|notice|propos|compliance/i,economy:/econom|inflation|interest|monetary|growth|employment|bank|financial/i,technology:/technology|digital|data|artificial intelligence|semiconductor|cyber|payment/i})[topic].test(text)}
function locationPool(){let list=articles.filter(a=>matchesTopic(a)&&(region==='all'||(a.regions||[a.region]).includes(region)));if(savedOnly)list=list.filter(a=>saved.some(s=>s.id===a.id));return list}
function visibleArticles(){let list=locationPool().filter(a=>!country||articleMatchesCountry(a,country));if(order==='latest')list=[...list].sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0));return list}
function locationSummary(count){const name=country|| (region==='all'?'Around the world':$('region').selectedOptions[0].textContent);$('locationSummary').innerHTML=`<span class="location-label">YOUR VIEW OF THE WORLD</span><strong>${esc(name)}</strong><span class="location-count">${feedLoading&&loadedQuery===null?'Connecting to global headlines…':`${count} ${count===1?'headline':'headlines'} in this view${query?' · '+esc(query):''}`}</span>${country||region!=='all'?'<button id="clearLocation" type="button">All locations ↗</button>':''}`;if($('clearLocation'))$('clearLocation').onclick=()=>chooseCountry(null)}
function chooseCountry(name){country=name?canonicalCountryName(name):null;region='all';$('region').value='all';globe?.selectCountry(country);filterChanged()}
function emptyReader(){selected=null;requestVersion++;articleController?.abort();$('readerContent').setAttribute('aria-busy','false');$('contextList').setAttribute('aria-busy','false');$('readerContent').innerHTML=`<div class="location-empty"><div class="welcome-mark" aria-hidden="true">∴</div><h2>${savedOnly?'No saved stories in this view':country?'No current headlines for '+esc(country):'No matching headlines'}</h2><p>${savedOnly?'Saved references appear while their stories are present in the current feed. Try another filter or return to world headlines.':'The current feeds have no stories matching these filters. Try another country, topic, or search.'}</p><button id="returnWorld" type="button">Return to world headlines</button></div>`;$('contextList').innerHTML='<div class="context-empty"><span aria-hidden="true">⌁</span><p>Select a story to explore its earlier context.</p></div>';$('returnWorld').onclick=()=>{query='';$('search').value='';topic='all';savedOnly=false;country=null;region='all';$('region').value='all';globe?.selectCountry(null);updateSaved();document.querySelectorAll('[data-topic]').forEach(b=>{b.classList.toggle('active',b.dataset.topic==='all');b.setAttribute('aria-pressed',String(b.dataset.topic==='all'))});loadFeed()}}
function renderFeed(){const list=visibleArticles();$('feedTitle').textContent=savedOnly?'Saved in this feed':country?country+' headlines':order==='latest'?'Latest stories':'Top headlines';$('feedCount').textContent=feedLoading&&loadedQuery===null?'—':list.length;locationSummary(list.length);globe?.updateArticles(locationPool(),{loading:feedLoading&&loadedQuery===null});if(feedLoading&&loadedQuery===null){$('feedList').innerHTML=loading('Fetching global headlines…');return}
 $('feedList').innerHTML=list.length?list.map(a=>`<button class="feed-card ${selected?.id===a.id?'selected':''}" data-id="${esc(a.id)}" aria-pressed="${selected?.id===a.id}"><div class="source-line"><span class="source-logo">${esc(logo(a))}</span>${esc(a.source)}</div><h3>${esc(a.title)}</h3><div class="feed-meta"><span>${date(a.published)}</span><span>·</span><span>${esc(a.documentType||'News report')}</span></div>${a.headlineRank?.coverageCount>1?`<div class="headline-signal">Related coverage · ${esc(a.headlineRank.coverageCount)} outlet groups</div>`:''}</button>`).join(''):`<div class="loading">${savedOnly?'No saved stories in this feed.':country?'No currently loaded headlines are tagged to '+esc(country)+'. Try another location or broaden your filters.':'No stories match these filters. Try another region, topic, or search.'}</div>`;
 document.querySelectorAll('.feed-card').forEach(b=>b.onclick=()=>selectArticle(b.dataset.id));
}
function renderCatalog(){$('sourceCatalog').innerHTML=sources.length?sources.map(s=>{const url=link(s.url||s.feedUrl);return `<div class="catalog-source"><strong>${esc(s.name)}</strong><span class="${s.status==='available'?'':'unavailable'}">${s.status==='available'?`${esc(s.count??0)} feed items · available`:'Feed unavailable'}</span><br>${esc(Array.isArray(s.coverage)?s.coverage.join(', '):(s.coverage||(s.sourceKind==='official'?'Official policy source':'International & regional reporting')))}${url?`<br><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Source feed ↗</a>`:''}</div>`}).join(''):'Source availability will appear after the feed loads.'}
async function loadFeed(refresh=false){
 const v=++feedVersion;
 feedController?.abort();feedController=new AbortController();feedLoading=true;
 if(query!==loadedQuery){articles=[];selected=null;loadedQuery=null;requestVersion++;articleController?.abort();$('readerContent').innerHTML=loading('Loading your headlines…');$('contextList').innerHTML='<div class="context-empty"><p>Context will appear when you select a story.</p></div>'}
 $('feedList').setAttribute('aria-busy','true');$('refresh').disabled=true;$('refresh').textContent='↻ Refreshing…';
 $('sourceStatus').textContent='Connecting to sources…';$('alert').classList.add('hidden');renderFeed();
 try{
  const data=await api('news',{q:query,...refresh?{refresh:'1'}:{}},{signal:feedController.signal});
  if(v!==feedVersion)return;
  feedLoading=false;loadedQuery=query;articles=Array.isArray(data.articles)?data.articles:[];sources=Array.isArray(data.sources)?data.sources:[];
  const ok=sources.filter(s=>s.status==='available'),bad=sources.filter(s=>s.status!=='available');
  const fetched=new Date(data.fetchedAt);const time=Number.isFinite(fetched.valueOf())?fetched.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):'just now';
  $('sourceStatus').textContent=`${ok.length}/${sources.length} feeds · updated ${time}`;
  if(bad.length){$('alert').classList.remove('hidden');$('alert').textContent='Some feeds are unavailable: '+bad.map(s=>s.name).join(', ')+'. Available sources remain readable.'}
  renderCatalog();renderFeed();const visible=visibleArticles();
  if(!visible.length){emptyReader()}
  else if(refresh&&selected&&visible.some(a=>a.id===selected.id)){selectArticle(selected.id)}
  else if(!selected||!visible.some(a=>a.id===selected.id)){selected=null;selectArticle(visible[0].id)}
 }catch(e){
  if(v!==feedVersion)return;
  feedLoading=false;$('sourceStatus').textContent=articles.length?'Connection failed · showing previous headlines':'Connection failed';
  $('alert').classList.remove('hidden');$('alert').textContent=articles.length?'Could not refresh sources. These are the previously loaded headlines. Try Refresh sources again.':'Could not connect to live sources. Try Refresh sources again.';
  if(articles.length){renderFeed()}
  else{
   $('readerContent').setAttribute('aria-busy','false');$('contextList').setAttribute('aria-busy','false');
   locationSummary(0);globe?.updateArticles([]);
   $('feedList').innerHTML='<div class="loading">Could not load live headlines.<br>Use Refresh sources to try again.</div>';
   $('readerContent').innerHTML='<div class="location-empty"><div class="welcome-mark" aria-hidden="true">∴</div><h2>A connection is needed.</h2><p>The source feeds could not be reached. Refresh sources to try again.</p></div>';
   $('contextList').innerHTML='<div class="context-empty"><p>Context will appear once headlines are available.</p></div>';
  }
 }finally{
  if(v===feedVersion){$('feedList').setAttribute('aria-busy','false');$('refresh').disabled=false;$('refresh').textContent='↻ Refresh sources'}
 }
}
function renderArticle(a){const u=link(a.url),isSaved=saved.some(x=>x.id===a.id),paragraphs=(a.text||a.summary||'The publisher supplied a headline only.').split(/\n\s*\n/).filter(Boolean),mode=a.contentMode==='source-text'?'FULL SOURCE TEXT':a.contentMode==='rss-summary'?'PUBLISHER RSS EXCERPT':'SOURCE SUMMARY';
 $('readerContent').innerHTML=`<div class="reader-head"><div class="reader-toolbar"><span>SOURCE READER · ${mode}</span><button id="bookmark" type="button" aria-pressed="${isSaved}">${isSaved?'★ Saved':'☆ Save story'}</button></div><div class="source-line"><span class="source-logo">${esc(logo(a))}</span>${esc(a.source)}</div><h2>${esc(a.title)}</h2><div class="reader-meta"><span>${date(a.published)}</span><span class="type">${esc(a.documentType||'News report')}</span>${u?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Original publication ↗</a>`:''}</div>${a.headlineRank?`<details class="headline-explainer"><summary>Why this headline ranks here</summary><ul>${(a.headlineRank.reasons||[]).map(r=>`<li>${esc(r)}</li>`).join('')}</ul><p>Headline priority is separate from evidence of a cause.</p></details>`:''}</div><div class="reader-body"><p class="article-note">${esc(a.readerNote||'Loading the source…')} ${a.readerError?esc(a.readerError):''} ${a.documentType==='Proposed Rule'?'This is a proposed rule, not an enacted law.':''}</p>${paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="attribution">Source: ${esc(a.source)}. ${esc(a.license||'')}<br>Text formatting converted for this reader. ${a.officialPdfUrl?`<a href="${esc(link(a.officialPdfUrl))}" target="_blank" rel="noopener noreferrer">Official PDF ↗</a>`:''}</div></div>`;
 $('bookmark').onclick=()=>{if(saved.some(x=>x.id===a.id))saved=saved.filter(x=>x.id!==a.id);else if(saved.length>=200){toast('You have 200 saved stories. Remove one before saving another.');return}else saved.push({id:a.id,title:a.title,url:a.url});updateSaved();filterChanged();if(selected?.id===a.id)renderArticle(a)};
}
async function selectArticle(id){const a=articles.find(x=>x.id===id);if(!a)return;selected=a;const v=++requestVersion;articleController?.abort();articleController=new AbortController();$('readerContent').setAttribute('aria-busy','true');$('contextList').setAttribute('aria-busy','true');renderFeed();renderArticle({...a,readerNote:a.contentMode==='rss-summary'?'Loading the publisher-provided excerpt…':'Fetching the original source text…'});$('contextList').innerHTML=loading('Looking for earlier context…');$('readerContent').parentElement.scrollTop=0;
 const readerJob=api('article',{id},{signal:articleController.signal}).then(full=>{if(v!==requestVersion)return;selected=full;renderArticle(full)}).catch(e=>{if(v!==requestVersion)return;renderArticle({...a,readerError:e.message,readerNote:'Only the supplied source summary is shown.'})}).finally(()=>{if(v===requestVersion)$('readerContent').setAttribute('aria-busy','false')});
 const contextJob=api('causes',{id},{signal:articleController.signal}).then(data=>{if(v===requestVersion)renderContext(data)}).catch(e=>{if(v===requestVersion)$('contextList').innerHTML=`<div class="context-empty">Could not retrieve context.<br>${esc(e.message)}</div>`}).finally(()=>{if(v===requestVersion)$('contextList').setAttribute('aria-busy','false')});await Promise.allSettled([readerJob,contextJob]);
}
function renderContext(data){const ranked=data.ranked||[];
 $('contextList').innerHTML=ranked.length?ranked.map((c,i)=>`<article class="cause-card"><div class="rank"><b>0${i+1} · ${esc(c.label)}</b><span>${earlier(c.timing?.daysBefore)}</span></div><h3>${esc(c.title)}</h3><div class="source-line"><span class="source-logo">${esc(logo(c.article||c))}</span>${esc(c.source)} · ${date(c.published)}</div><p class="reason">${esc(c.reasons?.[0]||c.assessment)}</p><details><summary>Why this appears</summary><p>${esc(c.assessment)}</p><ul>${(c.reasons||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><b>Evidence still needed</b><ul>${(c.missingEvidence||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${(c.evidence||[]).map(e=>`<p>Source passage: “${esc(e.passage)}”</p>`).join('')}<p>Ranked by relevance, not a probability of causation.</p></details><button data-related="${i}">Read this source here ↗</button></article>`).join(''):`<div class="context-empty"><span>⌁</span><p>No sufficiently relevant earlier publications were found in this source set.</p><p>That does not mean no cause exists. Try a broader search.</p></div>`;
 $('contextList').innerHTML+=`<p class="context-note">${Number.isFinite(data.candidatesReviewed)?data.candidatesReviewed:0} publications considered. Query: ${esc(data.searchQuery||'current feeds')}. ${esc(data.scope||'')} All suggested connections need case-specific evidence.</p>`;
 document.querySelectorAll('[data-related]').forEach(b=>b.onclick=()=>openRelated(ranked[Number(b.dataset.related)]));
}
async function openRelated(c){const v=++relatedVersion;relatedController?.abort();relatedController=new AbortController();if(!$('sourceDialog').open)$('sourceDialog').showModal();$('sourceDialog').scrollTop=0;$('sourceContent').setAttribute('aria-busy','true');$('sourceContent').innerHTML=loading('Loading related source…');try{const a=await api('article',{id:c.id},{signal:relatedController.signal});if(v!==relatedVersion||!$('sourceDialog').open)return;const url=link(a.url);$('sourceContent').innerHTML=`<article class="source-article"><div class="source-line">${esc(a.source)} · ${date(a.published)} · ${esc(a.contentMode==='rss-summary'?'Publisher RSS excerpt':a.documentType||'Publication')}</div><h2>${esc(a.title)}</h2><p class="article-note">${esc(a.readerNote||'Source-provided summary.')}${a.readerError?' '+esc(a.readerError):''}</p>${url?`<a class="related-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Original publication ↗</a>`:''}${(a.text||a.summary||'').split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('')}<p class="attribution">${esc(a.license||'')}</p></article>`}catch(e){if(v!==relatedVersion||!$('sourceDialog').open)return;$('sourceContent').innerHTML=`<p>Source text unavailable: ${esc(e.message)}</p>`}finally{if(v===relatedVersion)$('sourceContent').setAttribute('aria-busy','false')}}
function filterChanged(){renderFeed();if(feedLoading&&loadedQuery===null)return;const list=visibleArticles();if(!list.length){emptyReader()}else if(!list.some(a=>a.id===selected?.id))selectArticle(list[0].id)}
$('searchForm').onsubmit=e=>{e.preventDefault();query=$('search').value.trim().slice(0,120);$('search').value=query;selected=null;requestVersion++;savedOnly=false;topic='all';region='all';$('region').value='all';updateSaved();document.querySelectorAll('[data-topic]').forEach(b=>{b.classList.toggle('active',b.dataset.topic===topic);b.setAttribute('aria-pressed',String(b.dataset.topic===topic))});loadFeed()};
$('refresh').onclick=()=>loadFeed(true);
$('saved').onclick=()=>{savedOnly=!savedOnly;updateSaved();filterChanged();if(savedOnly&&saved.length)toast('Saved references show while present in the loaded feed.')};
$('region').onchange=e=>{region=e.target.value;country=null;globe?.selectCountry(null);filterChanged()};$('sort').onchange=e=>{order=e.target.value;renderFeed()};
document.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{topic=b.dataset.topic;document.querySelectorAll('[data-topic]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b))});filterChanged()});
$('about').onclick=$('sourcesBtn').onclick=$('rankingBtn').onclick=()=>{$('infoDialog').showModal();$('infoDialog').scrollTop=0};$('closeInfo').onclick=()=>$('infoDialog').close();$('closeSource').onclick=()=>$('sourceDialog').close();$('sourceDialog').addEventListener('close',()=>{relatedVersion++;relatedController?.abort();$('sourceContent').setAttribute('aria-busy','false')});try{globe=createNewsGlobe($('newsGlobe'),{onSelect:name=>chooseCountry(name)})}catch(e){$('newsGlobe').innerHTML='<p class="loading">The globe could not be loaded. Region filters remain available.</p>';console.error(e)}updateSaved();loadFeed();
// End reader interface.
   clearTimeout(startupTimer);
  }catch{clearTimeout(startupTimer);startupIssue();}
 }
 startReader();
})();
