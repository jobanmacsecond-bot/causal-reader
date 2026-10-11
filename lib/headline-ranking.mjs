/**
 * Headline selection is separate from causal research. These heuristics use
 * current feed placement and approximate same-event coverage, not confidence,
 * truth, or a claim that the stories independently verify one another.
 */

const HOUR = 3600000;
const MAX_AGE = 7 * 24 * HOUR;
const STOP = new Set(`a an and are as at be been being but by could did do does for from had has have he her him his how i if in into is it its just latest live more most new news of on only or our report reports said says she so some than that the their them then there these they this those to today update updates us was we were what when where which who why will with would your announces announced announcement amid after before during following over under about`.split(/\s+/));
const OFFICIAL = new Set(['official','official_document','official-document','primary','primary_source','primary-source','government','agency','document','press_release','press-release']);
const OFFICIAL_PROVIDERS = new Set(['federalregister','federalreserve','ecb']);
const EVENT_TYPES = [
  ['layoff', /\b(?:layoff|redundan\w*|job cuts?)\b/],
  ['trade', /\b(?:tariff|trade deal|trade agreement|export ban|sanction)\b/],
  ['conflict', /\b(?:ceasefire|war|invasion|airstrike|missile|attack|peace deal)\b/],
  ['disaster', /\b(?:earthquake|hurricane|typhoon|flood|wildfire|tsunami)\b/],
  ['election', /\b(?:election|vote|ballot|referendum)\b/],
  ['rates', /\b(?:interest rate|rate cut|rate hike|monetary)\b/],
  ['merger', /\b(?:merger|acquisition|takeover|acquire)\b/],
  ['launch', /\b(?:launch|unveil|release|introduce)\b/],
  ['legal', /\b(?:lawsuit|ruling|court|law|legislation|regulation)\b/],
];

function plain(value) {
  return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/&(?:amp|nbsp);/g,' ').replace(/\s+/g,' ').trim();
}

function normalize(value) {
  return plain(value).toLowerCase()
    .replace(/\b(?:u\.?s\.?a?\.?|united states)\b/g,'usa')
    .replace(/\b(?:u\.?k\.?|united kingdom|britain)\b/g,'uk')
    .replace(/\b(?:european union|e\.?u\.?)\b/g,'eu')
    .replace(/\b(?:alphabet)\b/g,'google')
    .replace(/\b(?:job cuts?|lay[- ]?offs?|laying off|redundancies)\b/g,'layoff')
    .replace(/\b(?:truce|cease[- ]fire)\b/g,'ceasefire')
    .replace(/\b(?:import duties|tariffs?)\b/g,'tariff')
    .replace(/\b(?:artificial intelligence)\b/g,'ai')
    .replace(/(\d),(?=\d{3}\b)/g,'$1')
    .replace(/(\d+)k\b/g,(_,n) => String(Number(n)*1000))
    .replace(/[’']/g,'')
    .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}

function stem(word) {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0,-3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0,-1);
  if (word.length > 6 && word.endsWith('ing')) return word.slice(0,-3);
  if (word.length > 5 && word.endsWith('ed')) return word.slice(0,-2);
  return word;
}

function terms(value) {
  return new Set(normalize(value).split(' ').filter(t => t && !STOP.has(t) && (t.length > 2 || ['ai','eu','uk'].includes(t))).map(stem));
}

function common(a,b) { return [...a].filter(term => b.has(term)); }
function sourceName(article) { return plain(typeof article.source === 'object' ? article.source?.name : article.source) || plain(article.provider) || 'Unknown source'; }

function official(article) {
  return OFFICIAL.has(String(article.sourceKind ?? '').toLowerCase()) || OFFICIAL_PROVIDERS.has(String(article.provider ?? '').toLowerCase());
}

function canonicalURL(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./,'')}${url.pathname.replace(/\/$/,'')}`;
  } catch { return ''; }
}

function wireFamily(value) {
  const text = plain(value).toLowerCase();
  if (/\breuters\b/.test(text)) return 'reuters';
  if (/associated press|^ap$/.test(text)) return 'associated-press';
  if (/agence france|\bafp\b/.test(text)) return 'afp';
  if (/\bbloomberg\b/.test(text)) return 'bloomberg';
  if (/\bkyodo\b/.test(text)) return 'kyodo';
  if (/\bxinhua\b/.test(text)) return 'xinhua';
  if (/deutsche presse|^dpa$/.test(text)) return 'dpa';
  if (/^ansa$/.test(text)) return 'ansa';
  return null;
}

function sourceFamily(article) {
  // dc:creator may be a person, so only recognized wire provenance from that
  // field overrides publisher metadata. Explicit original publishers also win.
  const provenance = [article.wireSource,article.syndicatedFrom,article.originalSource];
  const knownWire = provenance.map(wireFamily).find(Boolean);
  if (knownWire) return knownWire;
  const credit = plain(article.summary).match(/^(?:by |source:\s*|\()?\s*(Reuters|Associated Press|Agence France[- ]Presse|Bloomberg|Kyodo|Xinhua|AFP|DPA|ANSA|AP)(?:\)|\s*[-—:]|\s+\|)/i);
  const creditedWire = credit ? wireFamily(credit[1]) : null;
  if (creditedWire) return creditedWire;
  const explicit = article.syndicatedFrom ?? article.originalSource ?? article.editorialGroup;
  let value = plain(explicit || sourceName(article)).toLowerCase();
  const publisherWire = wireFamily(value);
  if (publisherWire) return publisherWire;
  if (/\bbbc\b/.test(value)) return 'bbc';
  return value.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || canonicalURL(article.url).split('/')[0] || 'unknown';
}

function eventTypes(title) { const text = normalize(title); return EVENT_TYPES.filter(([,pattern]) => pattern.test(text)).map(([type]) => type); }

/** Shared company or country names alone must never manufacture coverage. */
function sameEvent(a,b) {
  const left = normalize(a.title), right = normalize(b.title);
  if (left === right) return true;
  const at = terms(left), bt = terms(right), overlap = common(at,bt);
  if (overlap.length < 3) return false;
  const union = new Set([...at,...bt]).size;
  if (overlap.length / union < 0.48 || overlap.length / Math.min(at.size,bt.size) < 0.7) return false;
  const an = new Set(left.match(/\b\d+\b/g) ?? []), bn = new Set(right.match(/\b\d+\b/g) ?? []);
  if (an.size && bn.size && !common(an,bn).length) return false;
  const ae = eventTypes(left), be = eventTypes(right);
  if (ae.length && be.length && !ae.some(type => be.includes(type))) return false;
  const opposites = [['rise','fall'],['win','lose'],['approve','reject'],['increase','decrease']];
  if (opposites.some(([x,y]) => (at.has(x)&&bt.has(y)) || (at.has(y)&&bt.has(x)))) return false;
  return true;
}

function nowValue(value) {
  const parsed = typeof value === 'number' ? value : Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T23:59:59.999Z` : String(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function regionOf(article) {
  const raw = Array.isArray(article.regions) ? article.regions : [article.region ?? article.regions];
  return [...new Set(raw.map(plain).filter(Boolean).map(r => r.toLowerCase()))].filter(r => !['global','world','worldwide','international'].includes(r));
}

function hash(value) {
  let result = 2166136261;
  for (let i=0;i<value.length;i++) { result ^= value.charCodeAt(i); result = Math.imul(result,16777619); }
  return `event-${(result>>>0).toString(16)}`;
}

/**
 * rankHeadlines(articles, {now,query,limit}) -> original shape + headlineRank.
 * A seven-day freshness cap applies to main headlines, including search.
 * Official documents remain research context behind current journalism.
 */
export function rankHeadlines(articles = [], {now = Date.now(),query = '',limit = 54} = {}) {
  if (!Array.isArray(articles)) return [];
  const max = Math.max(0,Math.min(200,Number(limit) || 0));
  if (!max) return [];
  const current = nowValue(now), queryTerms = terms(query);
  const candidates = [];
  for (const article of articles) {
    if (!article || typeof article !== 'object' || !plain(article.title)) continue;
    const rawDate = article.published ?? article.publishedAt ?? article.date;
    const time = rawDate ? Date.parse(String(rawDate)) : NaN;
    const age = Number.isFinite(time) ? current - time : null;
    if (age !== null && (age > MAX_AGE || age < -15*60000)) continue;
    const titleTerms = terms(article.title), allTerms = terms(`${article.title} ${article.summary ?? ''} ${(article.topics ?? []).toString()}`);
    const titleMatches = common(queryTerms,titleTerms).length, allMatches = common(queryTerms,allTerms).length;
    if (queryTerms.size && !allMatches) continue;
    const isOfficial = official(article), family = sourceFamily(article);
    const reasons = [];
    let score = isOfficial ? 0 : 50;
    if (age === null) {
      score -= 45;
      reasons.push('Publication time is missing; freshness cannot be confirmed.');
    } else {
      const hours = Math.max(0,age/HOUR);
      score += hours <= 6 ? 30 : hours <= 24 ? 25 : hours <= 48 ? 18 : hours <= 72 ? 12 : 4;
      reasons.push(hours <= 24 ? 'Published within the last 24 hours.' : hours <= 72 ? 'Published within the last three days.' : 'Published within the last seven days.');
    }
    const feedPosition = article.feedPosition === null || article.feedPosition === undefined ? NaN : Number(article.feedPosition);
    if (!isOfficial && Number.isFinite(feedPosition) && feedPosition >= 0) {
      score += 20 / (1 + feedPosition/4);
      if (feedPosition <= 2) reasons.push(`Near the lead of ${sourceName(article)}’s feed.`);
    }
    const content = normalize(`${article.title} ${article.summary ?? ''}`);
    const geopolitical = /\b(?:war|ceasefire|invasion|election|referendum|earthquake|hurricane|typhoon|tsunami|nuclear|peace deal|sanction|tariff|trade deal)\b/.test(content);
    const economic = /\b(?:interest rate|inflation|recession|central bank|oil price|energy crisis|financial crisis|layoff|budget|economic growth|trade agreement)\b/.test(content);
    if (geopolitical || economic) {
      score += geopolitical && economic ? 22 : 16;
      reasons.push('Concerns a geopolitical, public-policy, or economic development.');
    }
    if (queryTerms.size) {
      score += 30*(titleMatches/queryTerms.size) + 12*(allMatches/queryTerms.size);
      reasons.push('Matches your search in the headline or source summary.');
    }
    if (isOfficial) reasons.push('Official primary document; retained as research context below journalism.');
    candidates.push({article,time,age,family,isOfficial,score,reasons,regions:regionOf(article)});
  }

  // Exact reposts count once, even when multiple sites republish a wire story.
  const unique = [];
  const urls = new Set(), headlines = new Set();
  candidates.sort((a,b) => Number(a.isOfficial)-Number(b.isOfficial) || b.score-a.score || (b.time||0)-(a.time||0) || normalize(a.article.title).localeCompare(normalize(b.article.title)));
  for (const candidate of candidates) {
    const url = canonicalURL(candidate.article.url), title = normalize(candidate.article.title);
    if ((url && urls.has(url)) || headlines.has(title)) continue;
    if (url) urls.add(url);
    headlines.add(title);
    unique.push(candidate);
  }

  // Complete-link clusters avoid chaining distinct stories through a broad
  // headline that happens to mention two otherwise unrelated developments.
  const clusters = [];
  for (const candidate of [...unique].sort((a,b) => normalize(a.article.title).localeCompare(normalize(b.article.title)))) {
    const cluster = clusters.find(group => group.every(member => sameEvent(candidate.article,member.article)));
    if (cluster) cluster.push(candidate);
    else clusters.push([candidate]);
  }
  for (const cluster of clusters) {
    const coverageCount = new Set(cluster.filter(item => !item.isOfficial && item.family !== 'unknown').map(item => item.family)).size;
    const eventGroup = hash(normalize(cluster[0].article.title));
    for (const candidate of cluster) {
      if (!candidate.isOfficial && coverageCount > 1) {
        candidate.score += Math.min(36,18*Math.log2(coverageCount));
        candidate.reasons.unshift(`Similar-event headlines appear in ${coverageCount} editorial source groups in the loaded feeds.`);
      } else if (!candidate.isOfficial) {
        candidate.reasons.push('One editorial source group in the loaded matching coverage.');
      }
      candidate.coverageCount = coverageCount;
      candidate.eventGroup = eventGroup;
    }
  }

  // A soft source/region rotation follows a strict journalism-first policy.
  // Distinct events are shown before repeated coverage of the same event.
  const output = [], sourceCounts = new Map(), regionCounts = new Map(), eventCounts = new Map();
  const remaining = [...unique];
  while (remaining.length && output.length < max) {
    const editorialAvailable = remaining.some(item => !item.isOfficial);
    let bestIndex = -1, bestScore = -Infinity;
    for (let index=0;index<remaining.length;index++) {
      const candidate = remaining[index];
      if (editorialAvailable && candidate.isOfficial) continue;
      const sourcePenalty = 14*(sourceCounts.get(candidate.family) ?? 0);
      const regionPenalty = candidate.regions.length ? 8*Math.min(...candidate.regions.map(r => regionCounts.get(r) ?? 0)) : 0;
      const duplicatePenalty = 140*(eventCounts.get(candidate.eventGroup) ?? 0);
      const diversityScore = candidate.score-sourcePenalty-regionPenalty-duplicatePenalty;
      if (diversityScore > bestScore) { bestScore=diversityScore;bestIndex=index; }
    }
    const [candidate] = remaining.splice(bestIndex,1);
    sourceCounts.set(candidate.family,(sourceCounts.get(candidate.family) ?? 0)+1);
    for (const region of candidate.regions) regionCounts.set(region,(regionCounts.get(region) ?? 0)+1);
    eventCounts.set(candidate.eventGroup,(eventCounts.get(candidate.eventGroup) ?? 0)+1);
    output.push({...candidate.article,headlineRank:{
      reasons:candidate.reasons,
      coverageCount:candidate.coverageCount,
      score:Math.round(candidate.score),
      scoreKind:'editorial relevance',
      eventGroup:candidate.eventGroup,
    }});
  }
  return output;
}

export const HEADLINE_RANKING_DESCRIPTION = 'Current headlines ranked by editorial feed placement, approximate same-event coverage, recency, and public consequence, with source and region variety. Relevance is not trust or causal confidence; syndicated copies count once.';
export default rankHeadlines;
