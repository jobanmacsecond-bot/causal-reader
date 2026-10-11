/** Free, attributed primary-source feeds. Browser/Worker/Node 18 compatible. */
const SOURCE_DEFS = {
  federalregister: {
    name: 'Federal Register',
    feed: 'https://www.federalregister.gov/api/v1/documents.json',
    attribution: 'https://www.federalregister.gov/reader-aids/developer-resources/rest-api',
    license: 'Federal Register material may be republished; official logos and seals excluded. Informational HTML edition; consult the linked official PDF for legal use.',
    hosts: ['www.federalregister.gov', 'federalregister.gov'],
  },
  federalreserve: {
    name: 'Federal Reserve Board',
    feed: 'https://www.federalreserve.gov/feeds/press_all.xml',
    attribution: 'https://www.federalreserve.gov/disclaimer.htm',
    license: 'Board information is public domain unless otherwise indicated. Source: Federal Reserve Board. Third-party materials and official insignia excluded.',
    hosts: ['www.federalreserve.gov', 'federalreserve.gov'],
  },
  ecb: {
    name: 'European Central Bank',
    feed: 'https://www.ecb.europa.eu/rss/press.html',
    attribution: 'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html',
    license: 'Reproduced accurately from the European Central Bank with source attribution. Formatting converted to plain text. Author-named research papers excluded.',
    hosts: ['www.ecb.europa.eu', 'ecb.europa.eu'],
  },
};

const STOP = new Set('the a an and or of to in on for from with by at is are was were as this that it its new announces announcement press release statement board commission department final proposed notice review results federal reserve european central bank'.split(' '));
const THEMES = [
  ['Trade', /tariff|trade|import|export|antidumping|countervailing|customs|sanction|duties|duty|supply chain/i],
  ['Regulation', /regulat|rule|law|act\b|compliance|supervis|consumer|enforcement|proposal/i],
  ['Economy', /inflation|interest rate|monetary|economic|growth|employment|labor|labour|tax|fiscal/i],
  ['Technology', /semiconductor|digital|technology|artificial intelligence|cyber|data|stablecoin|payment/i],
  ['Energy', /energy|oil|gas|diesel|fuel|electric|climate|carbon/i],
  ['Business', /company|companies|bank|business|acquisition|merger|industry|manufactur|investment/i],
];

function decode(value = '') {
  const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',thinsp:' ',ensp:' ',emsp:' ',shy:'',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',euro:'€',pound:'£',copy:'©',times:'×',minus:'−',le:'≤',ge:'≥'};
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    }
    return named[entity.toLowerCase()] ?? all;
  });
}

/** Never inserts remote markup into the page; the reader receives only text. */
export function htmlToText(html = '') {
  return decode(String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<\/(?:p|div|section|article|main|h[1-6]|li|tr|blockquote)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[\t \u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function safeUrl(value, provider) {
  let url;try {url=new URL(value);} catch {throw new Error('This reader only fetches the supported official sources.');}
  const def = Object.hasOwn(SOURCE_DEFS,provider)?SOURCE_DEFS[provider]:null;
  if (!def || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !def.hosts.includes(url.hostname.toLowerCase())) {
    throw new Error('This reader only fetches the supported official sources.');
  }
  // ECB's own feed sometimes emits //press/...; normalize within this host.
  url.pathname = url.pathname.replace(/^\/{2,}/, '/');
  return url;
}

const SOURCE_ERRORS=new Set(['This reader only fetches the supported official sources.','Source redirected without a destination.','Source document exceeds the reader size limit.','Source redirected too many times.']);
function sourceErrorMessage(error){const message=error?.message;return SOURCE_ERRORS.has(message)||/^Source returned HTTP \d{3}\.$/.test(message||'')?message:'Source request failed. Please try again.';}
async function cancelResponse(response){try {await response.body?.cancel();} catch {}}
async function boundedFetch(url, provider, accept = 'application/json, text/html, application/xml, text/xml',fetchImpl=fetch) {
  let current = safeUrl(url, provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetchImpl(current.href, { signal: controller.signal, redirect: 'manual', headers: {Accept: accept} });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await cancelResponse(response);
        if (!location) throw new Error('Source redirected without a destination.');
        current = safeUrl(new URL(location, current).href, provider);
        continue;
      }
      if (!response.ok) {await cancelResponse(response);throw new Error(`Source returned HTTP ${response.status}.`);}
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 3000000) {await cancelResponse(response);throw new Error('Source document exceeds the reader size limit.');}
      // Streams are bounded even when the server omits Content-Length.
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let content = '', bytes = 0;
        while (true) {
          const {done,value} = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 3000000) { await reader.cancel(); throw new Error('Source document exceeds the reader size limit.'); }
          content += decoder.decode(value, {stream:true});
        }
        return content + decoder.decode();
      }
      const content = await response.text();
      if (new TextEncoder().encode(content).byteLength > 3000000) throw new Error('Source document exceeds the reader size limit.');
      return content;
    }
    throw new Error('Source redirected too many times.');
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Source request timed out. Please try again.');
    throw new Error(sourceErrorMessage(error));
  } finally { clearTimeout(timeout); }
}

function tag(xml, name) {
  return decode((xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')) || [,''])[1]).trim();
}
function topics(text) { return THEMES.filter(([,rx]) => rx.test(text)).map(([name])=>name); }
function tokens(query) { return String(query||'').toLowerCase().match(/[a-z0-9]+/g)?.filter(t=>t.length>2&&!STOP.has(t))||[]; }
function matches(article, query) {
  const words = tokens(query);
  if (!words.length) return true;
  const text = `${article.title} ${article.summary} ${article.topics.join(' ')}`.toLowerCase();
  return words.some(w=>text.includes(w));
}

function normalized(provider, fields) {
  const def = SOURCE_DEFS[provider];
  const summary = htmlToText(fields.summary || '').slice(0,2000);
  return {
    id: fields.id,
    title: htmlToText(fields.title).slice(0,500),
    summary,
    text: summary,
    published: fields.published || null,
    url: fields.url,
    source: def.name,
    provider,
    topics: topics(`${fields.title} ${summary}`),
    contentMode: summary ? 'summary' : 'headline',
    license: def.license,
    attributionUrl: def.attribution,
    documentType: fields.documentType || 'Press release',
    ...fields.extra,
  };
}

async function federalRegister(query, asOfDate,fetchImpl) {
  const url = new URL(SOURCE_DEFS.federalregister.feed);
  url.searchParams.set('per_page', '50');
  url.searchParams.set('order', 'newest');
  url.searchParams.set('conditions[publication_date][lte]', asOfDate);
  if (String(query||'').trim()) url.searchParams.set('conditions[term]', String(query).slice(0,180));
  const payload = JSON.parse(await boundedFetch(url.href,'federalregister',undefined,fetchImpl));
  if (!Array.isArray(payload.results)) throw new Error('Source returned an unexpected document list.');
  return payload.results.filter(doc=>!doc.publication_date||doc.publication_date<=asOfDate).slice(0,30).flatMap(doc => {
    let url;try {url=safeUrl(doc.html_url,'federalregister').href;} catch {return [];}
    if(typeof doc.document_number!=='string'||doc.document_number.length>40||!/^[A-Za-z0-9-]+$/.test(doc.document_number))return [];
    let officialPdfUrl=null;try {const pdf=new URL(doc.pdf_url);if(pdf.protocol==='https:'&&!pdf.username&&!pdf.password&&!pdf.port&&['www.govinfo.gov','govinfo.gov','www.federalregister.gov','federalregister.gov'].includes(pdf.hostname))officialPdfUrl=pdf.href;}catch{}
    return [normalized('federalregister', {
    id: `fr:${doc.document_number}`,
    title: doc.title,
    summary: doc.abstract || doc.excerpts || '',
    published: doc.publication_date,
    url,
    documentType: doc.type,
    extra: {documentNumber:doc.document_number, agencies:(Array.isArray(doc.agencies)?doc.agencies:[]).slice(0,20).map(a=>htmlToText(a.name).slice(0,200)), officialPdfUrl},
  })];});
}

async function rss(provider, fetchImpl) {
  const xml = await boundedFetch(SOURCE_DEFS[provider].feed, provider,undefined,fetchImpl);
  const entries = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,80);
  if (!entries.length) throw new Error('Source returned no RSS items.');
  return entries.filter(([,item])=>provider!=='ecb'||/\/press\/pr\//.test(tag(item,'link'))).slice(0,12).map(([,item]) => {
    let url = tag(item,'link');
    // A feed may contain http URLs, but transport and reader always use HTTPS.
    if (url.startsWith('http://')) url = `https://${url.slice(7)}`;
    url = safeUrl(url,provider).href;
    const date = tag(item,'pubDate') || tag(item,'dc:date');
    const parsed = date ? new Date(date) : null;
    return normalized(provider, {
      id:`${provider}:${url}`,
      title:tag(item,'title'), summary:tag(item,'description'), url,
      published:parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    });
  });
}

const sourceCache=new Map(),sourcePending=new Map();let cacheFetchImpl;
async function cachedSource(key,loader,refresh){
 const cached=sourceCache.get(key);
 if(cached&&Date.now()-cached.time<(cached.error||refresh?30000:300000)){if(cached.error)throw cached.error;return cached.articles;}
 if(sourcePending.has(key))return sourcePending.get(key);
 if(sourcePending.size>=12)throw new Error('Source request capacity reached. Please try again.');
 const job=Promise.resolve().then(loader).then(articles=>{sourceCache.set(key,{time:Date.now(),articles});return articles;},error=>{sourceCache.set(key,{time:Date.now(),error});throw error;}).finally(()=>{sourcePending.delete(key);while(sourceCache.size>40)sourceCache.delete(sourceCache.keys().next().value);});
 sourcePending.set(key,job);return job;
}

/** Returns live articles plus per-source availability; never fabricates a fallback. */
export async function loadNews({query='',limit=54,asOfDate=new Date().toISOString().slice(0,10),refresh=false,fetchImpl=fetch}={}) {
  if(typeof query!=='string'||query.length>120||/[\u0000-\u001f\u007f]/.test(query))throw new Error('Use a search query of at most 120 characters.');
  query=query.trim();
  if(cacheFetchImpl!==fetchImpl){sourceCache.clear();sourcePending.clear();cacheFetchImpl=fetchImpl;}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Use YYYY-MM-DD for the publication cutoff.');
  const jobs = [ ['federalregister',()=>cachedSource(`fr:${asOfDate}:${query}`,()=>federalRegister(query,asOfDate,fetchImpl),refresh)], ['federalreserve',()=>cachedSource('federalreserve',()=>rss('federalreserve',fetchImpl),refresh).then(rows=>rows.filter(a=>matches(a,query)))], ['ecb',()=>cachedSource('ecb',()=>rss('ecb',fetchImpl),refresh).then(rows=>rows.filter(a=>matches(a,query)))] ];
  const results = await Promise.allSettled(jobs.map(([,run])=>run()));
  const articles = [], sources = [];
  results.forEach((result,index)=> {
    const provider = jobs[index][0], def = SOURCE_DEFS[provider];
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
      sources.push({provider,name:def.name,status:'available',count:result.value.length,url:def.feed,attributionUrl:def.attribution});
    } else {
      sources.push({provider,name:def.name,status:'unavailable',count:0,url:def.feed,attributionUrl:def.attribution,message:sourceErrorMessage(result.reason)});
    }
  });
  const unique = [...new Map(articles.map(a=>[a.url,a])).values()];
  unique.sort((a,b)=>(Date.parse(b.published)||0)-(Date.parse(a.published)||0));
  return {articles:unique.slice(0,Math.max(1,Math.min(100,Number(limit)||54))), sources, query, asOfDate, fetchedAt:new Date().toISOString()};
}

/** Extract a matching element, respecting nesting of the same tag. */
function element(html, pattern, includeMarkup=false) {
  const match = pattern.exec(html);
  if (!match) return '';
  const name = match[1], begin = match.index + match[0].length;
  const tags = new RegExp(`<\\/?${name}\\b[^>]*>`, 'gi');
  tags.lastIndex = begin;
  let depth = 1, token;
  while ((token=tags.exec(html))) {
    if (token[0].startsWith('</')) depth--;
    else if (!token[0].endsWith('/>')) depth++;
    if (depth===0) return includeMarkup ? html.slice(match.index,tags.lastIndex) : html.slice(begin,token.index);
  }
  return '';
}

function federalBody(html) {
  // This UI-only explainer is injected by FederalRegister.gov's HTML rendition.
  // Keep the actual agency/docket content beside it, and every source paragraph.
  const headings = element(html, /<(div)\b[^>]*\bclass=["'][^"']*\bdocument-headings\b[^"']*["'][^>]*>/i, true);
  if (!headings) return html;
  const seal = element(headings, /<(div)\b[^>]*\bclass=["'][^"']*\bfr-seal-block\b[^"']*["'][^>]*>/i, true);
  return seal ? html.replace(headings,headings.replace(seal,'')) : html;
}

function bodyOf(html,provider) {
  const candidates = provider==='federalreserve'
    ? [/<(div)\b[^>]*\bid=["']article["'][^>]*>/i,/<(article)\b[^>]*>/i,/<(main)\b[^>]*>/i]
    : [/<(article)\b[^>]*>/i,/<(div)\b[^>]*\bclass=["'][^"']*\bsection-content\b[^"']*["'][^>]*>/i,/<(main)\b[^>]*>/i];
  for (const pattern of candidates) {
    const extracted = element(html,pattern);
    const text = htmlToText(extracted);
    if (text.length>180) return text;
  }
  throw new Error('The source page could not be isolated reliably. Source text was not guessed.');
}

export async function readArticle(article) {
  if (!article || !Object.hasOwn(SOURCE_DEFS,article.provider)) throw new Error('Choose an article from a supported official feed.');
  safeUrl(article.url,article.provider);
  let text;
  if (article.provider === 'federalregister') {
    const number = article.documentNumber || String(article.id||'').replace(/^fr:/,'');
    if (!/^(?:C\d-)?\d{4}-\d{3,7}$/.test(number)) throw new Error('Invalid Federal Register document identifier.');
    const detail = JSON.parse(await boundedFetch(`https://www.federalregister.gov/api/v1/documents/${number}.json`,'federalregister'));
    if (!detail.body_html_url) throw new Error('The source did not provide a readable HTML body.');
    text = htmlToText(federalBody(await boundedFetch(detail.body_html_url,'federalregister','text/html')));
  } else {
    const url = safeUrl(article.url,article.provider);
    if (article.provider === 'federalreserve' && !/^\/newsevents\/pressreleases\//.test(url.pathname)) throw new Error('The reader supports Federal Reserve press releases only.');
    if (article.provider === 'ecb' && !/^\/press\/pr\//.test(url.pathname)) throw new Error('The reader supports ECB press releases only.');
    text = bodyOf(await boundedFetch(url.href,article.provider,'text/html'),article.provider);
  }
  if(text.length>300000)throw new Error('Source text exceeds the reader size limit. Open the original source.');
  if (text.length<80) throw new Error('The source returned too little article text.');
  return {...article,text,contentMode:'source-text',readAt:new Date().toISOString(),readerNote:'Official source text, converted to plain text. Read the original source for its original formatting.'};
}

export const sourceAttributions = Object.entries(SOURCE_DEFS).map(([provider,def])=>({provider,name:def.name,url:def.attribution,license:def.license}));
