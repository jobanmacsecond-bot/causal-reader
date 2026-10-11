/** Official publisher RSS discovery. Only feed-provided excerpts are reproduced. */
const defs = [
  {id:'bbc',name:'BBC News',region:'Global',coverage:['Africa','Americas','Asia','Europe','Middle East','Oceania'],feedUrl:'https://feeds.bbci.co.uk/news/world/rss.xml',url:'https://www.bbc.com/news/world',editorialGroup:'bbc',feedHosts:['feeds.bbci.co.uk'],articleHosts:['www.bbc.com','bbc.com','www.bbc.co.uk','bbc.co.uk'],termsUrl:'https://www.bbc.co.uk/usingthebbc/terms',license:'BBC News RSS headline and excerpt; credit BBC News and link to the original report.'},
  {id:'guardian',name:'The Guardian',region:'Global',coverage:['Africa','Americas','Asia','Europe','Middle East','Oceania'],feedUrl:'https://www.theguardian.com/world/rss',url:'https://www.theguardian.com/world',editorialGroup:'guardian',feedHosts:['www.theguardian.com','theguardian.com'],articleHosts:['www.theguardian.com','theguardian.com'],termsUrl:'https://www.theguardian.com/help/feeds',license:'Guardian RSS for personal, non-commercial aggregation. Copyright Guardian News & Media; full article is on the publisher site.'},
  {id:'aljazeera',name:'Al Jazeera',region:'Middle East',coverage:['Africa','Americas','Asia','Europe','Middle East'],feedUrl:'https://www.aljazeera.com/xml/rss/all.xml',url:'https://www.aljazeera.com',editorialGroup:'aljazeera',feedHosts:['www.aljazeera.com','aljazeera.com'],articleHosts:['www.aljazeera.com','aljazeera.com'],termsUrl:'https://www.aljazeera.com/terms-and-conditions',license:'Publisher RSS headline and excerpt. Copyright Al Jazeera; full report remains on the publisher site.'},
  {id:'france24',name:'France 24',region:'Global',coverage:['Africa','Americas','Asia','Europe','Middle East'],feedUrl:'https://www.france24.com/en/rss',url:'https://www.france24.com/en',editorialGroup:'france-medias-monde',feedHosts:['www.france24.com','france24.com'],articleHosts:['www.france24.com','france24.com'],termsUrl:'https://www.france24.com/en/rss',license:'France 24 publisher RSS headline and excerpt; original reporting linked and attributed.'},
  {id:'dw',name:'DW',region:'Global',coverage:['Africa','Americas','Asia','Europe','Middle East'],feedUrl:'https://rss.dw.com/rdf/rss-en-all',url:'https://www.dw.com/en',editorialGroup:'deutsche-welle',feedHosts:['rss.dw.com'],articleHosts:['www.dw.com','dw.com','amp.dw.com'],termsUrl:'https://corporate.dw.com/en/rss-feeds/a-68693346',license:'Deutsche Welle publisher RSS headline and excerpt; original reporting linked and attributed.'},
  {id:'cna',name:'CNA',region:'Asia',coverage:['Asia'],feedUrl:'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511',url:'https://www.channelnewsasia.com/asia',editorialGroup:'mediacorp',feedHosts:['www.channelnewsasia.com','channelnewsasia.com'],articleHosts:['www.channelnewsasia.com','channelnewsasia.com'],termsUrl:'https://www.channelnewsasia.com/rss',license:'CNA RSS service is free for personal, non-commercial use; publisher headline and excerpt only.'},
  {id:'rnz',name:'RNZ Pacific',region:'Oceania',coverage:['Oceania'],feedUrl:'https://www.rnz.co.nz/rss/pacific.xml',url:'https://www.rnz.co.nz/news/pacific',editorialGroup:'radio-new-zealand',feedHosts:['www.rnz.co.nz','rnz.co.nz'],articleHosts:['www.rnz.co.nz','rnz.co.nz'],termsUrl:'https://www.rnz.co.nz/about',license:'RNZ Pacific publisher RSS headline and excerpt; original reporting linked and attributed.'},
  {id:'cbc',name:'CBC News',region:'Americas',coverage:['Americas','Africa','Asia','Europe','Middle East','Oceania'],feedUrl:'https://www.cbc.ca/webfeed/rss/rss-world',url:'https://www.cbc.ca/news/world',editorialGroup:'cbc-radio-canada',feedHosts:['www.cbc.ca','cbc.ca'],articleHosts:['www.cbc.ca','cbc.ca'],termsUrl:'https://www.cbc.ca/aboutus/terms-and-conditions.html',license:'CBC News publisher RSS headline and excerpt; original reporting linked and attributed.'},
  {id:'africanews',name:'Africanews',region:'Africa',coverage:['Africa'],feedUrl:'https://www.africanews.com/feed/rss',url:'https://www.africanews.com',editorialGroup:'africanews',feedHosts:['www.africanews.com','africanews.com'],articleHosts:['www.africanews.com','africanews.com'],termsUrl:'https://www.africanews.com/feed/rss',license:'Africanews publisher RSS headline and excerpt; original reporting linked and attributed.'},
];
export const GLOBAL_SOURCES = Object.freeze(defs.map(d=>Object.freeze({...d,sourceKind:'journalism',coverage:Object.freeze(d.coverage),feedHosts:Object.freeze(d.feedHosts),articleHosts:Object.freeze(d.articleHosts)})));
export const globalSourceDefinitions = GLOBAL_SOURCES;

const NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',thinsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',hellip:'…',euro:'€',pound:'£',copy:'©'};
function decode(text='') {
  return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(all,e)=>{
    if(e[0]!=='#') return NAMED[e.toLowerCase()]??all;
    const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  });
}
function plain(text='') {
  return decode(text).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function tag(xml,name) {return (xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))||[,''])[1];}
function clipped(text,maximum=350) {
  const clean=plain(text).replace(/\s*Continue reading(?:\.\.\.)?\s*$/i,'').trim();
  if(clean.length<=maximum)return clean;
  const end=clean.lastIndexOf(' ',maximum);
  return `${clean.slice(0,end>maximum*.65?end:maximum).trim()}…`;
}
function hash(value) {let n=2166136261;for(const ch of value){n^=ch.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(36);}
function articleUrl(value,source) {
  try {
    const url=new URL(decode(value).trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!source.articleHosts.includes(url.hostname.toLowerCase()))return null;
    url.protocol='https:';url.hash='';url.pathname=url.pathname.replace(/^\/{2,}/,'/');
    for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||key==='CMP')url.searchParams.delete(key);
    return url.href.length<1800?url.href:null;
  } catch{return null;}
}

const COUNTRY_RULES=[
 ['United States','Americas',/\b(?:United States|USA|American|Washington|Florida|Gulf Coast)\b|\bU\.S\.(?=\W|$)/i],['United States','Americas',/\bUS\b/],['Canada','Americas',/\b(?:Canada|Canadian)\b/i],['Brazil','Americas',/\b(?:Brazil|Brazilian)\b/i],['Mexico','Americas',/\b(?:Mexico|Mexican)\b/i],['Argentina','Americas',/\bArgentina\b/i],['Colombia','Americas',/\bColombia\b/i],['Chile','Americas',/\bChile\b/i],['Venezuela','Americas',/\bVenezuela\b/i],['Panama','Americas',/\bPanama\b/i],['Costa Rica','Americas',/\bCosta Rica\b/i],['Guatemala','Americas',/\bGuatemala\b/i],['Honduras','Americas',/\bHonduras\b/i],['El Salvador','Americas',/\bEl Salvador\b/i],['Nicaragua','Americas',/\bNicaragua\b/i],['Belize','Americas',/\bBelize\b/i],
 ['United Kingdom','Europe',/\b(?:United Kingdom|Britain|British|UK|London)\b/i],['France','Europe',/\b(?:France|French)\b/i],['Germany','Europe',/\b(?:Germany|German)\b/i],['Ukraine','Europe',/\b(?:Ukraine|Ukrainian)\b/i],['Russia','Europe',/\b(?:Russia|Russian)\b/i],['Spain','Europe',/\bSpain\b/i],['Italy','Europe',/\bItaly\b/i],['Poland','Europe',/\b(?:Poland|Polish)\b/i],['Belgium','Europe',/\b(?:Belgium|Belgian|Brussels)\b/i],['Switzerland','Europe',/\b(?:Switzerland|Swiss)\b/i],['Netherlands','Europe',/\b(?:Netherlands|Dutch)\b/i],['Austria','Europe',/\b(?:Austria|Austrian)\b/i],['Portugal','Europe',/\b(?:Portugal|Portuguese)\b/i],['Denmark','Europe',/\b(?:Denmark|Danish)\b/i],['Sweden','Europe',/\b(?:Sweden|Swedish)\b/i],['Norway','Europe',/\b(?:Norway|Norwegian)\b/i],['Finland','Europe',/\b(?:Finland|Finnish)\b/i],['Iceland','Europe',/\b(?:Iceland|Icelandic)\b/i],['Hungary','Europe',/\b(?:Hungary|Hungarian)\b/i],['Czechia','Europe',/\b(?:Czechia|Czech)\b/i],['Greece','Europe',/\b(?:Greece|Greek)\b/i],['Romania','Europe',/\b(?:Romania|Romanian)\b/i],['Croatia','Europe',/\b(?:Croatia|Croatian)\b/i],['Serbia','Europe',/\b(?:Serbia|Serbian)\b/i],
 ['China','Asia',/\b(?:China|Chinese|Beijing)\b/i],['India','Asia',/\b(?:India|Indian)\b/i],['Japan','Asia',/\b(?:Japan|Japanese)\b/i],['South Korea','Asia',/\b(?:South Korea|Seoul)\b/i],['North Korea','Asia',/\bNorth Korea\b/i],['Taiwan','Asia',/\bTaiwan\b/i],['Indonesia','Asia',/\bIndonesia\b/i],['Singapore','Asia',/\bSingapore\b/i],['Malaysia','Asia',/\bMalaysia\b/i],['Pakistan','Asia',/\bPakistan\b/i],['Bangladesh','Asia',/\bBangladesh\b/i],['Philippines','Asia',/\bPhilippines\b/i],['Vietnam','Asia',/\bVietnam\b/i],['Thailand','Asia',/\bThailand\b/i],['Nepal','Asia',/\bNepal\b/i],['Myanmar','Asia',/\b(?:Myanmar|Burma|Burmese)\b/i],['Afghanistan','Asia',/\b(?:Afghanistan|Afghan)\b/i],['Sri Lanka','Asia',/\b(?:Sri Lanka|Sri Lankan)\b/i],
 ['Iran','Middle East',/\b(?:Iran|Iranian)\b/i],['Iraq','Middle East',/\bIraq\b/i],['Israel','Middle East',/\b(?:Israel|Israeli)\b/i],['Palestine','Middle East',/\b(?:Palestine|Palestinian|Gaza|West Bank)\b/i],['Lebanon','Middle East',/\b(?:Lebanon|Lebanese)\b/i],['Syria','Middle East',/\bSyria\b/i],['Yemen','Middle East',/\bYemen\b/i],['Saudi Arabia','Middle East',/\bSaudi\b/i],['United Arab Emirates','Middle East',/\b(?:United Arab Emirates|UAE)\b/i],['Türkiye','Middle East',/\b(?:Türkiye|Turkey|Turkish)\b/i],
 ['South Africa','Africa',/\bSouth Africa\b/i],['Nigeria','Africa',/\b(?:Nigeria|Nigerian)\b/i],['Kenya','Africa',/\b(?:Kenya|Kenyan)\b/i],['Sudan','Africa',/\bSudan\b/i],['Ethiopia','Africa',/\bEthiopia\b/i],['Egypt','Africa',/\bEgypt\b/i],['Morocco','Africa',/\bMorocco\b/i],['Tunisia','Africa',/\bTunisia\b/i],['Democratic Republic of Congo','Africa',/\b(?:Congo|DRC)\b/i],['Uganda','Africa',/\bUganda\b/i],['Ghana','Africa',/\bGhana\b/i],['Rwanda','Africa',/\bRwanda\b/i],['Senegal','Africa',/\bSenegal\b/i],['Benin','Africa',/\bBenin\b/i],['Guinea-Bissau','Africa',/\bGuinea[ -]Bissau\b/i],['Madagascar','Africa',/\b(?:Madagascar|Malagasy)\b/i],['Libya','Africa',/\b(?:Libya|Libyan)\b/i],['Mali','Africa',/\b(?:Mali|Malian)\b/i],
 ['Australia','Oceania',/\b(?:Australia|Australian)\b/i],['New Zealand','Oceania',/\bNew Zealand\b/i],['Fiji','Oceania',/\bFiji\b/i],['Samoa','Oceania',/\bSamoa\b/i],['Vanuatu','Oceania',/\bVanuatu\b/i],['Tonga','Oceania',/\bTonga\b/i],['Papua New Guinea','Oceania',/\bPapua New Guinea\b/i],['Solomon Islands','Oceania',/\bSolomon Islands\b/i],
];
const REGION_RULES=[['Africa',/\b(?:Africa|African|Sahel)\b/i],['Americas',/\b(?:Americas|Latin America|Central America|Caribbean)\b/i],['Asia',/\b(?:Asia|Asian)\b/i],['Europe',/\b(?:Europe|European|EU)\b/i],['Middle East',/\bMiddle East\b/i],['Oceania',/\b(?:Pacific|Oceania)\b/i]];
const TOPIC_RULES=[['Trade',/\b(?:trade|tariff|import|export|sanction|customs|duties|supply chain)\b/i],['Regulation',/\b(?:law|regulation|rule|bill|court|legal|legislation|ban|compliance)\b/i],['Business',/\b(?:business|company|companies|bank|investment|merger|acquisition|market|factory|industry|manufacturing)\b/i],['Economy',/\b(?:economy|economic|inflation|growth|interest rate|tax|employment|jobs|layoffs|unemployment)\b/i],['Technology',/\b(?:technology|AI|artificial intelligence|semiconductor|digital|cyber|software|data centre|data center)\b/i],['Energy',/\b(?:energy|oil|gas|fuel|electricity|coal|renewable|nuclear)\b/i],['Climate',/\b(?:climate|emission|carbon|environment|flood|drought)\b/i],['Politics',/\b(?:election|president|minister|government|parliament|diplomacy|treaty)\b/i],['Conflict',/\b(?:war|attack|military|ceasefire|missile|peace|conflict)\b/i],['Health',/\b(?:health|disease|vaccine|hospital|pandemic)\b/i]];
function tagsOf(text,categories,source) {
  const countries=COUNTRY_RULES.filter(([, ,rx])=>rx.test(text));
  const regions=[...new Set([...countries.map(([,region])=>region),...REGION_RULES.filter(([,rx])=>rx.test(text)).map(([name])=>name)])];
  const topics=[...new Set([...TOPIC_RULES.filter(([,rx])=>rx.test(text)).map(([name])=>name),...categories.map(plain).filter(v=>v&&v.length<45)])].slice(0,12);
  return {countries:[...new Set(countries.map(([country])=>country))],regions:regions.length?regions:[source.region],region:regions[0]||source.region,topics,tagBasis:'Text mentions and publisher categories; approximate, not verified event locations.'};
}

/** Parses RSS/RDF/Atom without evaluating markup or resolving external entities. */
export function parsePublisherFeed(xml,source,{asOfDate=new Date().toISOString().slice(0,10),query=''}={}) {
  source=GLOBAL_SOURCES.find(s=>s.id===source?.id);
  if(!source)throw new Error('Unsupported publisher.');
  if(typeof xml!=='string'||new TextEncoder().encode(xml).byteLength>2000000)throw new Error('RSS feed exceeds the 2 MB limit.');
  const entries=[...String(xml).matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0,250);
  if(!entries.length)throw new Error('Publisher returned no RSS or Atom items.');
  const words=String(query||'').toLowerCase().match(/[a-z0-9]+/g)?.filter(w=>w.length>2&&!['the','and','news','from','with','for'].includes(w))||[];
  const output=[],seen=new Set();
  entries.forEach(([,item],feedPosition)=>{
    const atomLink=item.match(/<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1]
      ||item.match(/<link\b(?![^>]*\brel=)[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1];
    const url=articleUrl(tag(item,'link')||atomLink||tag(item,'guid'),source);
    const title=clipped(tag(item,'title'),260);
    if(!url||!title||seen.has(url))return;
    const date=decode(tag(item,'pubDate')||tag(item,'dc:date')||tag(item,'published')||tag(item,'updated')).trim();
    const timestamp=date?Date.parse(date):NaN;
    const published=Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
    if(published&&published.slice(0,10)>asOfDate)return;
    const summary=clipped(tag(item,'description')||tag(item,'summary'),350);
    const categories=[...item.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map(m=>m[1]);
    const tags=tagsOf(`${title} ${summary}`,categories,source);
    if(words.length&&!words.some(w=>`${title} ${summary} ${tags.topics.join(' ')} ${tags.countries.join(' ')} ${tags.regions.join(' ')}`.toLowerCase().includes(w)))return;
    seen.add(url);
    const author=clipped(tag(item,'dc:creator')||tag(item,'author'),100)||null;
    const wireSource=author?.match(/\b(?:Reuters|Associated Press|AFP|AP)\b/i)?.[0]||null;
    output.push({id:`${source.id}:${hash(url)}`,title,summary,text:summary,published,url,source:source.name,provider:source.id,sourceKind:'journalism',contentMode:'rss-summary',license:source.license,attributionUrl:source.termsUrl,sourceUrl:source.url,feedUrl:source.feedUrl,editorialGroup:source.editorialGroup,feedPosition,documentType:'News report',readerNote:`${source.name} RSS excerpt. Full article on the publisher site.`,author,wireSource,...tags});
  });
  return output;
}

function allowedFeed(value,source) {
  let url;try{url=new URL(value);}catch{throw new Error('Publisher feed redirected outside its allowed host.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!source.feedHosts.includes(url.hostname.toLowerCase()))throw new Error('Publisher feed redirected outside its allowed host.');
  return url;
}
const FEED_ERRORS=new Set(['Publisher feed redirected outside its allowed host.','Publisher redirect has no destination.','RSS feed exceeds the 2 MB limit.','Publisher redirected too many times.','Publisher feed timed out.','Publisher returned no RSS or Atom items.']);
function feedErrorMessage(error){return FEED_ERRORS.has(error?.message)||/^Publisher returned HTTP \d{3}\.$/.test(error?.message||'')?error.message:'Publisher feed could not be loaded. Please try again.';}
async function cancelResponse(response){try {await response.body?.cancel();} catch {}}
async function fetchFeed(source,fetchImpl) {
  let url=allowedFeed(source.feedUrl,source);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {
    for(let redirect=0;redirect<4;redirect++) {
      const response=await fetchImpl(url.href,{redirect:'manual',signal:controller.signal,headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml'}});
      if(response.status>=300&&response.status<400){const next=response.headers.get('location');await cancelResponse(response);if(!next)throw new Error('Publisher redirect has no destination.');url=allowedFeed(new URL(next,url).href,source);continue;}
      if(!response.ok){await cancelResponse(response);throw new Error(`Publisher returned HTTP ${response.status}.`);}
      if(Number(response.headers.get('content-length')||0)>2000000){await cancelResponse(response);throw new Error('RSS feed exceeds the 2 MB limit.');}
      if(!response.body?.getReader){const text=await response.text();if(new TextEncoder().encode(text).byteLength>2000000)throw new Error('RSS feed exceeds the 2 MB limit.');return text;}
      const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw new Error('RSS feed exceeds the 2 MB limit.');}text+=decoder.decode(value,{stream:true});}
      return text+decoder.decode();
    }
    throw new Error('Publisher redirected too many times.');
  }catch(error){if(error.name==='AbortError')throw new Error('Publisher feed timed out.');throw new Error(feedErrorMessage(error));}finally{clearTimeout(timer);}
}

/** Round-robin preserves outlet diversity instead of letting one prolific feed win. */
export async function loadGlobalNews({query='',limit=160,asOfDate=new Date().toISOString().slice(0,10),fetchImpl=fetch}={}) {
  if(typeof query!=='string'||query.length>120||/[\u0000-\u001f\u007f]/.test(query))throw new Error('Use a search query of at most 120 characters.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate))throw new Error('Use YYYY-MM-DD for the publication cutoff.');
  const results=await Promise.allSettled(GLOBAL_SOURCES.map(async source=>parsePublisherFeed(await fetchFeed(source,fetchImpl),source,{query,asOfDate}).slice(0,20)));
  const sources=[],groups=[];
  results.forEach((result,index)=>{
    const source=GLOBAL_SOURCES[index];
    const fields={id:source.id,provider:source.id,name:source.name,sourceKind:'journalism',region:source.region,coverage:source.coverage,editorialGroup:source.editorialGroup,url:source.feedUrl,feedUrl:source.feedUrl,attributionUrl:source.termsUrl};
    if(result.status==='fulfilled'){sources.push({...fields,status:'available',count:result.value.length});groups.push(result.value);}
    else{sources.push({...fields,status:'unavailable',count:0,message:feedErrorMessage(result.reason)});groups.push([]);}
  });
  const articles=[],seen=new Set(),cap=Math.max(1,Math.min(180,Number(limit)||160));
  for(let position=0;position<20&&articles.length<cap;position++)for(const group of groups){const article=group[position];if(article&&!seen.has(article.url)){seen.add(article.url);articles.push(article);if(articles.length===cap)break;}}
  return {articles,sources,query,asOfDate,fetchedAt:new Date().toISOString(),readerScope:'Publisher RSS headlines and excerpts; full commercial articles are not scraped.'};
}
