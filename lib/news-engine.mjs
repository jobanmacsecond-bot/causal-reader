/**
 * Small, deterministic news lead finder. No model, network call, or API key.
 * A score measures retrieval relevance, never the probability of causation.
 * Article shape: {id,title,text,summary,published,url,source,topics}.
 * Optional eventDate is preferred to publication time when it is known.
 */

const STOP = new Set(`a about above after again against all also amid an and another any are around as at back be because been before being between both but by can could day days did do does down during each even first for from further get gets getting had has have he her here hers him his how however i if in into is it its itself just last later latest like many may me might million more most much must new news next no nor not now of off on once one only or other our out over own people per report reports said says say several she should since so some still such than that the their theirs them themselves then there these they this those through time to today together too two under until up us use used very via was we were what when where whether which while who why will with within without would year years you your`.split(/\s+/));
const GENERIC = new Set(`article business company companies corporate corporation economy economic employee employees job jobs layoff layoffs cut cuts cutting workforce work workers worker announcement announced announces decision decisions effect effects cause causes causal consequence consequences reason reasons plan plans planned planning month months source sources story stories country countries government governments sector sectors market markets global world international following follow follows expected expects`.split(/\s+/));
for (const word of `make makes made making due become becomes became becoming bring brings brought take takes taken taking go goes went going come comes came coming set sets setting seek seeks sought call calls called move moves moved moving start starts started begin begins began get gets got find finds found see sees seen show shows shown help helps helped want wants wanted announce announces announced week weeks weekday weekdays region regions regional area areas state states city cities north northern south southern east eastern west western central coast coastal gulf mainland island islands capital local domestic national`.split(/\s+/)) { STOP.add(word); GENERIC.add(word); }

// Official notices share substantial legal boilerplate. It is not product scope.
const REGULATORY_BOILERPLATE = `certain administrative administration review reviews reviewed result results preliminary final determination determinations determine determines determined department departments commerce company companies received receiving period periods por republic produced producers producer production product products pursuant notice notices notification notifications hereby antidumping countervailing dumping duty duties order orders investigation investigations investigating initiation initiating initiates initiate amended amendment amendments rescission rescinding rescinds continuation continuance extension extensions applicable application applications interested party parties memorandum memoranda authority authorities agency agencies act section sections federal register publication published publishing effective date dates respondent respondents exporter exporters scope margin margins rate rates methodology method methods accordance information requested request requests calculate calculated calculation calculations provide provided providing subject merchandise entry entries treatment terms imports exports united states america board public trade financial finance january february march april may june july august september october november december`.split(/\s+/);
for (const word of REGULATORY_BOILERPLATE) {
  STOP.add(word);
  GENERIC.add(word);
}

const BROAD_SCOPE = new Set(`usa uk eu india indian china chinese canada canadian germany german mexico mexican japan japanese france french brazil australia australian ukraine russia russian korea southkorea korean indonesia vietnam taiwan thailand thai cambodia cambodian singapore malaysia philippines pakistan bangladesh italy italian spain spanish turkey turkish indonesia indonesian africa europe asia england scotland ireland zealand kingdom commission congress parliament court supreme house white federal reserve bank wto opec treasury cabinet minister ministry`.split(/\s+/));
for (const word of ['politics','politic','political','general','society','social','worldwide']) BROAD_SCOPE.add(word);
for (const phrase of ['federal reserve','european central bank','bank of england','european commission','white house','supreme court','department of commerce','federal reserve board','united states department of commerce']) BROAD_SCOPE.add(phrase);
const COUNTRIES = new Set(`usa uk eu india china canada germany mexico japan france brazil australia ukraine russia korea indonesia vietnam taiwan thailand cambodia singapore malaysia philippines pakistan bangladesh italy spain turkey`.split(/\s+/));
// Fallback for articles without the reader's geographic metadata. Locations and
// demonyms can retrieve context; they cannot supply a specific causal scope.
const GEOGRAPHIC = `iran iranian iraq iraqi israel israeli palestine palestinian gaza lebanon lebanese syria syrian yemen yemeni saudi arabia arabian emirates uae türkiye kenya kenyan nigeria nigerian sudan sudanese ethiopia ethiopian egypt egyptian morocco moroccan tunisia tunisian congo congolese drc uganda ugandan ghana ghanaian rwanda rwandan senegal senegalese benin beninese guinea bissau guinea-bissau madagascar malagasy libya libyan mali malian zimbabwe zimbabwean zambia zambian namibia namibian somalia somali tanzania tanzanian algeria algerian botswana botswanan mozambique mozambican cameroon cameroonian angola angolan burma burmese myanmar afghanistan afghan sri lanka lankan nepal nepalese nepali philippine filipino malaysian singaporean pakistani bangladeshi vietnamese taiwanese indonesian canadian brazilian ukrainian argentine argentinian argentina colombia colombian chile chilean venezuela venezuelan panama panamanian costa rica rican guatemala guatemalan honduras honduran salvador salvadoran nicaragua nicaraguan belize belizean peru peruvian ecuador ecuadorian bolivia bolivian uruguay uruguayan paraguay paraguayan cuba cuban haiti haitian jamaica jamaican belgium belgian brussels switzerland swiss netherlands dutch austria austrian portugal portuguese denmark danish sweden swedish norway norwegian finland finnish iceland icelandic poland polish hungary hungarian czechia czech greece greek romania romanian slovakia slovak slovenia slovenian croatia croatian serbia serbian estonia estonian latvia latvian lithuania lithuanian oceania oceanian oceanic pacific fiji fijian samoa samoan vanuatu tonga tongan papua guinean solomon zealand florida washington caribbean latin america american europe european africa african asia asian`;
for (const word of GEOGRAPHIC.split(/\s+/)) { BROAD_SCOPE.add(word); BROAD_SCOPE.add(stem(word)); }
for (const phrase of ['south africa','new zealand','sri lanka','north korea','solomon islands','papua new guinea','guinea-bissau','costa rica','el salvador','middle east','central america','latin america','united arab emirates','democratic republic of congo']) BROAD_SCOPE.add(phrase);
for (const word of `iran iraq israel palestine lebanon syria yemen saudi uae kenya nigeria sudan ethiopia egypt morocco tunisia congo drc uganda ghana rwanda senegal benin guinea guinea-bissau madagascar libya mali myanmar burma afghanistan nepal lanka argentina colombia chile venezuela panama guatemala honduras nicaragua belize belgium switzerland netherlands austria portugal denmark sweden norway finland iceland poland fiji samoa vanuatu tonga zealand`.split(/\s+/)) COUNTRIES.add(word);

const PRODUCT_SECTORS = [
  ['Steel', /\b(?:steel|iron|ferrous)\b/i],
  ['Semiconductors', /\b(?:dram|chip|memory|integrated circuit)\b/i],
  ['Paper and packaging', /\b(?:paper|paperbags?|cardboard|cartons?|pulp)\b/i],
  ['Automotive', /\b(?:tires?|tyres?|rubber|automotive|electricvehicle)\b/i],
  ['Aluminium', /\b(?:aluminium|aluminum|alumina)\b/i],
  ['Textiles', /\b(?:textiles?|fabric|cotton|apparel|garments?|clothing|polyester)\b/i],
  ['Wood and furniture', /\b(?:wood|lumber|timber|furniture|plywood)\b/i],
  ['Agriculture and food', /\b(?:agricultur\w*|wheat|rice|corn|soybeans?|sugar|food|shrimp|fish|fishing|poultry|livestock)\b/i],
  ['Energy', /\b(?:solar|petroleum|oil|gas|energy|electricity|coal|wind power)\b/i],
  ['Software and cloud', /\b(?:software|cloud|ai|automation|computing)\b/i],
];

const ALIASES = [
  [/\bhot[- ]rolled\b/gi, 'hotrolled'],
  [/\bcold[- ]rolled\b/gi, 'coldrolled'],
  [/\b(?:south korea|republic of korea|korean|korea)\b/gi, 'korea'],
  [/\b(?:peoples republic of china|people's republic of china|chinese)\b/gi, 'china'],
  [/\b(?:cambodian)\b/gi, 'cambodia'],
  [/\b(?:thai)\b/gi, 'thailand'],
  [/\b(?:united states(?: of america)?|u\.?s\.?a?\.?|american)\b/gi, 'usa'],
  [/\b(?:united kingdom|u\.?k\.?|britain|british)\b/gi, 'uk'],
  [/\b(?:european union|e\.?u\.?)\b/gi, 'eu'],
  [/\b(?:artificial intelligence|a\.?i\.?)\b/gi, 'ai'],
  [/\b(?:semiconductors?|microchips?|chips?)\b/gi, 'chip'],
  [/\b(?:automobiles?|automotive|automakers?|vehicles?|cars?)\b/gi, 'automotive'],
  [/\b(?:steelmaking|steelmakers?)\b/gi, 'steel'],
  [/\b(?:electric vehicles?|evs?)\b/gi, 'electricvehicle'],
  [/\b(?:job losses|job cuts|lay[- ]?offs?|redundancies|workforce reductions?)\b/gi, 'layoff'],
  [/\b(?:export controls?|export restrictions?)\b/gi, 'exportcontrol'],
  [/\b(?:trade agreements?|trade deals?)\b/gi, 'tradedeal'],
];

const KNOWN_ENTITIES = [
  'google','alphabet','microsoft','amazon','apple','meta','facebook','nvidia','tesla',
  'openai','samsung','intel','tiktok','bytedance','boeing','airbus','toyota','ford',
  'tata','walmart','us steel','united states','united kingdom','european union',
  'india','indian','china','chinese','germany','german','canada','canadian',
  'mexico','mexican','japan','japanese','france','french','brazil','australia',
  'ukraine','russia','russian','south korea','indonesia','vietnam','taiwan',
  'white house','congress','parliament','federal reserve','bank of england',
  'european commission','supreme court','wto','opec','gemini','youtube',
];

const MECHANISMS = [
  ['Weather and environmental conditions', /\b(?:ocean heat|sea[- ]surface temperature|warm(?:er|ing)? waters?|ocean temperatures?|atmospheric pressure|weather patterns?|wind shear|tectonic|seismic|fault line|volcanic activity)\b/i],
  ['Trade policy', /\b(?:tariffs?|tradedeal|trade|import(?:s|ing)?|export(?:s|ing)?|exportcontrol|sanctions?|quotas?|dut(?:y|ies)|embargo(?:es)?|trade barriers?)\b/i],
  ['Law or regulation', /\b(?:laws?|legislation|bills?|regulat(?:ion|ions|ory|ors)|polic(?:y|ies)|antitrust|court ruling|bans?|mandates?|legal|compliance)\b/i],
  ['Business strategy', /\b(?:strateg(?:y|ic)|pivots?|shifts?|investment|invest(?:s|ing|ed)?|restructur(?:e|es|ing)|reorganiz(?:e|ation|ing)|consolidat(?:e|ion|ing)|acquisition|merger|automation|automated|budget|funding|allocation|expansion|priorit(?:y|ies|ize))\b/i],
  ['Economic conditions', /\b(?:interest rates?|inflation|recession|costs?|cost cutting|demand|losses|earnings|revenues?|profits?|slowdown|supply|shortage|currency|price(?:s)?|sales)\b/i],
];

const EVENT_GROUPS = [
  ['Weather or natural hazard', /\b(?:hurricanes?|typhoons?|cyclones?|tornadoes?|earthquakes?|tsunamis?|volcanic eruption|landfall|storm surges?)\b/i],
  ['Staffing change', /\b(?:layoffs?|redundan(?:t|cy|cies)|workforce|headcount|job cuts?|jobs?|dismiss(?:ed|al)|staff(?:ing)?|employees?)\b/i],
  ['Closure or production change', /\b(?:clos(?:e|es|ing|ure)|shutdown|shut down|plant|factory|production|manufactur(?:e|ing)|halt(?:s|ed)?|suspend(?:s|ed)?)\b/i],
  ['Price or financial change', /\b(?:prices?|shares?|stocks?|profits?|sales|costs?|earnings|revenues?|inflation|funding|bankrupt(?:cy)?|loss(?:es)?)\b/i],
  ['Trade change', /\b(?:tariffs?|import(?:s)?|export(?:s)?|trade|exportcontrol|tradedeal)\b/i],
  ['Product change', /\b(?:product|launch(?:es|ed)?|service|discontinu(?:e|ed|ation)|release(?:s|d)?|shutdown|rollout)\b/i],
  ['Investment or strategy change', /\b(?:invest(?:s|ed|ment)?|strateg(?:y|ic)|shift(?:s|ed)?|merger|acquisition|pivots?|expansion)\b/i],
];

function clean(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp);/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  let text = clean(value).toLowerCase();
  for (const [re, to] of ALIASES) text = text.replace(re, to);
  return text.replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function broadScopeFor(...articles) {
  const broad = new Set(BROAD_SCOPE);
  for (const article of articles) {
    const geography = [...(Array.isArray(article?.countries)?article.countries:[]),...(Array.isArray(article?.regions)?article.regions:[]),article?.region].filter(Boolean);
    for (const label of geography) {
      const canonical=normalize(label);
      broad.add(canonical);
      for (const word of canonical.split(/\s+/)) broad.add(stem(word));
    }
  }
  return broad;
}

function stem(word) {
  if (word.length > 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function tokens(value, {specific = false} = {}) {
  return new Set(normalize(value).split(/\s+/).filter(w =>
    w && (w.length >= 3 || ['ai','eu','uk'].includes(w)) &&
    !/^\d[\d.,-]*(?:k|m|bn)?$/.test(w) && !STOP.has(w) && (!specific || !GENERIC.has(w))
  ).map(stem));
}

function intersect(a, b) { return [...a].filter(value => b.has(value)); }
function similarity(a, b) {
  const common = intersect(a, b).length;
  return common / Math.max(1, new Set([...a, ...b]).size);
}

function sourceName(article) {
  return clean(typeof article.source === 'object' ? article.source?.name : article.source) || 'Source not specified';
}

function getText(article) {
  return clean([article.title, article.summary, article.text ?? article.body ?? ''].filter(Boolean).join('. '));
}

function scopeText(article) {
  return clean(`${article.title ?? ''} ${article.summary ?? article.abstract ?? ''}`);
}

function productSectors(article) {
  const text = normalize(scopeText(article));
  return PRODUCT_SECTORS.filter(([,pattern]) => pattern.test(text)).map(([name]) => name);
}

function isRegulatoryNotice(article) {
  return /\b(?:administrative review|preliminary results|final results|antidumping|countervailing|duty order|determination|federal register)\b/i.test(clean(article.title));
}

function productSignature(article) {
  if (!isRegulatoryNotice(article)) return new Set();
  const phrase = clean(article.title).split(/\s+From\s+|[:;]/i)[0];
  const broad=broadScopeFor(article);
  return new Set([...tokens(phrase,{specific:true})].filter(term => !broad.has(term)));
}

function subjectCountries(article) {
  if (Array.isArray(article.countries)&&article.countries.length) return new Set(article.countries.map(normalize).filter(Boolean));
  const title = normalize(article.title);
  const from = title.match(/\bfrom\s+(.+?)(?:\s+(?:preliminary|final|initiation|amended|administrative)|$)/);
  const text = from ? from[1] : title;
  return new Set([...tokens(text)].filter(term => COUNTRIES.has(term)));
}

function topicTokens(article) {
  const raw = Array.isArray(article.topics) ? article.topics.join(' ') : article.topics ?? '';
  return tokens(raw, {specific:true});
}

function entityTokens(article) {
  const text = scopeText(article);
  const norm = normalize(text);
  const entities = new Set();
  for (const entity of KNOWN_ENTITIES) {
    const canonical = normalize(entity);
    if (` ${norm} `.includes(` ${canonical} `)) entities.add(canonical);
  }
  // A title-case name appearing beyond the start of a sentence is a scope hint,
  // not a claim that a full named-entity recognizer has identified the actor.
  for (const match of text.matchAll(/\b[A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+){0,2}\b/gu)) {
    const words = normalize(match[0]).split(' ');
    if (words.every(w => w.length > 2 && !STOP.has(w) && !GENERIC.has(w))) {
      for (const word of words) entities.add(stem(word));
    }
  }
  return entities;
}

function dateOf(article) {
  const raw = article.eventDate ?? article.published ?? article.publishedAt ?? article.date;
  if (!raw) return null;
  const time = Date.parse(String(raw));
  return Number.isFinite(time) ? time : null;
}

function urlKey(value) {
  try {
    const u = new URL(value);
    return `${u.hostname.replace(/^www\./,'')}${u.pathname.replace(/\/$/,'')}`;
  } catch { return ''; }
}

function eventGroups(text) {
  return EVENT_GROUPS.filter(([,pattern]) => pattern.test(text)).map(([name]) => name);
}

function sentences(article) {
  const body = clean(article.text ?? article.body ?? article.summary ?? '');
  // Sentence segmentation need not infer quote boundaries to retain provenance.
  return body.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter(Boolean);
}

function explicitEvidence(target, candidate, commonEntities, titleScope, broadScope=broadScopeFor(target,candidate)) {
  const groups = eventGroups(scopeText(target));
  if (!groups.length || !commonEntities.length) return [];
  const targetSpecific = new Set([...tokens(target.title, {specific:true})].filter(term => !broadScope.has(term)));
  const source = sourceName(candidate);
  const evidence = [];
  for (const sentence of sentences(candidate)) {
    const norm = normalize(sentence);
    const sentenceTokens = tokens(sentence, {specific:true});
    const namesPresent = commonEntities.some(name => ` ${norm} `.includes(` ${name} `));
    const eventPresent = EVENT_GROUPS.some(([name, pattern]) => groups.includes(name) && pattern.test(sentence));
    const causalPhrase = /\b(?:because of|due to|result(?:s|ed|ing)? (?:in|from)|caus(?:e|es|ed)|driven by|prompt(?:s|ed)|led to|in response to|as a consequence of|attribut(?:e|es|ed) .{0,60} to|reason for)\b/i.test(sentence);
    const denial = /\b(?:unrelated to|not (?:linked|related|connected) to|no (?:causal )?link|not because of|not due to|did not cause|was not caused|were not caused|weren't caused|den(?:y|ies|ied) .{0,60}(?:caus|link|because))\b/i.test(sentence);
    // Shared actor + target event + explicit causal phrase is required. Mere
    // mentions elsewhere in the article cannot manufacture a sourced edge.
    const sentenceRelevantTerms = intersect(targetSpecific,sentenceTokens);
    const meaningfulSharedScope = titleScope.filter(term => !broadScope.has(term));
    const titleRelevant = targetSpecific.size > 0 && sentenceRelevantTerms.length >= Math.min(2,targetSpecific.size) &&
      (meaningfulSharedScope.length > 0 || sentenceRelevantTerms.length >= 2);
    if (!namesPresent || !eventPresent || !titleRelevant || (!causalPhrase && !denial)) continue;
    evidence.push({
      kind: denial ? 'reported_contradiction' : 'reported_attribution',
      passage: sentence.length > 360 ? `${sentence.slice(0,357)}…` : sentence,
      url: candidate.url ?? '',
      source,
      note: denial ? 'The article reports a denial or contrary explanation; it does not establish independence.' : 'The article states a causal explanation. This is an attributed claim, not independently established causation.',
    });
    if (evidence.length === 2) break;
  }
  return evidence;
}

/**
 * Return relevance-ranked research leads, with evidence gaps visible.
 * options: {limit:6, minScore:18, maxAgeDays:730}.
 * Candidates dated after the target cannot be recommended as prior causes.
 * If only publication dates exist, that restriction is explicitly disclosed.
 */
export function rankPotentialCauses(target = {}, candidates = [], options = {}) {
  if (!target || typeof target !== 'object' || !Array.isArray(candidates)) return [];
  const limit = Math.max(0, Math.min(30, Number(options.limit ?? 6) || 0));
  const minScore = Number.isFinite(Number(options.minScore)) ? Number(options.minScore) : 18;
  const maxAgeDays = Number(options.maxAgeDays ?? 730);
  const targetTitle = tokens(target.title);
  const targetScope = tokens(scopeText(target), {specific:true});
  const targetSectors = productSectors(target);
  const targetProduct = productSignature(target);
  const targetCountries = subjectCountries(target);
  const targetIsNotice = isRegulatoryNotice(target);
  const targetTopics = topicTokens(target);
  const targetEntities = entityTokens(target);
  const targetTime = dateOf(target);
  const targetKey = urlKey(target.url);
  const targetGroups = eventGroups(scopeText(target));
  const hazardTitle=clean(target.title);
  const targetHazardOnset=/\b(?:earthquake|tsunami|volcanic eruption)\b/i.test(hazardTitle) ||
    (/\b(?:hurricane|typhoon|cyclone|tornado)\b/i.test(hazardTitle)&&/\b(?:landfall|forms?|formed|formation|intensif\w*|strengthen\w*|strik\w*|hits?|approach\w*)\b/i.test(hazardTitle));
  const output = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || !clean(candidate.title)) continue;
    if (candidate.id && target.id && candidate.id === target.id) continue;
    const key = urlKey(candidate.url);
    if (key && key === targetKey) continue;
    const candidateTitle = tokens(candidate.title);
    const candidateTitleNorm = normalize(candidate.title);
    if (candidateTitleNorm === normalize(target.title)) continue;
    const candidateTime = dateOf(candidate);
    const daysBefore = targetTime !== null && candidateTime !== null ? (targetTime - candidateTime) / 86400000 : null;
    if (daysBefore !== null && daysBefore < 0) continue;

    const candidateScope = tokens(scopeText(candidate), {specific:true});
    const commonTitleTerms = intersect(targetScope, candidateScope);
    const commonEntities = intersect(targetEntities, entityTokens(candidate));
    const commonTopics = intersect(targetTopics, topicTokens(candidate));
    const broadScope=broadScopeFor(target,candidate);
    const specificTitleTerms = commonTitleTerms.filter(term => !broadScope.has(term));
    const specificEntities = commonEntities.filter(term => !broadScope.has(term));
    const specificTopics = commonTopics.filter(term => !broadScope.has(term));
    const commonCountries = commonTitleTerms.filter(term => broadScope.has(term));
    const candidateSectors = productSectors(candidate);
    const sharedSectors = intersect(new Set(targetSectors),new Set(candidateSectors));
    const sectorMismatch = targetSectors.length > 0 && candidateSectors.length > 0 && sharedSectors.length === 0;
    const candidateProduct = productSignature(candidate);
    const candidateCountries = subjectCountries(candidate);
    const sharedSubjectCountries = intersect(targetCountries,candidateCountries);
    const countryMismatch = targetCountries.size > 0 && candidateCountries.size > 0 && !sharedSubjectCountries.length;
    const exactProduct = targetProduct.size >= 2 && candidateProduct.size >= 2 && similarity(targetProduct,candidateProduct) >= 0.85;
    const sameCommodityAndCountry = exactProduct && sharedSubjectCountries.length > 0;
    // Chronology or a causal-sounding headline alone is insufficient relevance.
    if (!commonTitleTerms.length && !commonEntities.length && !commonTopics.length) continue;

    const fullText = getText(candidate);
    const mechanismText = normalize(scopeText(candidate));
    const mechanisms = MECHANISMS.filter(([,pattern]) => pattern.test(mechanismText)).map(([name]) => name);
    const evidence = explicitEvidence(target, candidate, commonEntities, commonTitleTerms,broadScope);
    const hasAttribution = evidence.some(e => e.kind === 'reported_attribution');
    const hasContradiction = evidence.some(e => e.kind === 'reported_contradiction');
    const sameEvent = similarity(targetTitle, candidateTitle) >= 0.58 &&
      eventGroups(fullText).some(group => targetGroups.includes(group));
    const scopeStrength = specificTitleTerms.length >= 2 || specificEntities.length > 0 || specificTopics.length >= 2 || (specificTopics.length && specificTitleTerms.length) || sharedSectors.length > 0;
    // A single ambiguous word (for example security/securities) plus timing
    // cannot make a useful research lead, even under the related-context label.
    if (minScore > 0 && !scopeStrength && !hasAttribution && !hasContradiction) continue;
    const candidateIsNotice = isRegulatoryNotice(candidate);
    // A parallel review or survey is context. A prior originating legal order
    // can be a lead only for the same commodity and exporting country.
    const originatingFramework = /\b(?:duty order|imposition|impos(?:e|es|ed)|new tariff|initiation of .{0,35}investigation)\b/i.test(candidate.title) &&
      !/\b(?:preliminary|final) results|administrative review/i.test(candidate.title);
    const noticeCanContribute = !targetIsNotice && !candidateIsNotice || (sameCommodityAndCountry && originatingFramework && daysBefore !== null && daysBefore > 0);
    const plausibleMechanism = mechanisms.length > 0 && scopeStrength && !sectorMismatch && !countryMismatch &&
      (!sameEvent || originatingFramework) && noticeCanContribute &&
      (!targetHazardOnset || mechanisms.includes('Weather and environmental conditions'));
    const timingKnown = daysBefore !== null;

    let score = Math.min(32, specificTitleTerms.length * 8) + Math.min(18, specificEntities.length * 9) +
      Math.min(12, specificTopics.length * 6) + Math.min(4,commonCountries.length * 2);
    if (sharedSectors.length) score += 18 + (commonCountries.length ? 6 : 0);
    if (exactProduct) score += 28;
    if (sameCommodityAndCountry) score += 12;
    if (mechanisms.length && scopeStrength) score += 12;
    if (timingKnown) score += daysBefore <= 90 ? 12 : daysBefore <= 365 ? 8 : 3;
    if (hasAttribution) score += 24;
    if (hasContradiction) score += 8;
    if (sameEvent) score -= 25;
    if (sectorMismatch && !hasAttribution && !hasContradiction) score -= 35;
    if (countryMismatch && !hasAttribution && !hasContradiction) score -= 14;
    if (timingKnown && Number.isFinite(maxAgeDays) && daysBefore > maxAgeDays) score -= 14;
    score = Math.max(0, Math.round(score));
    if (score < minScore) continue;

    const reasons = [];
    const signals = [];
    const missingEvidence = [];
    const matchingTerms = [...new Set([...specificEntities, ...specificTitleTerms, ...specificTopics, ...commonCountries])];
    if (matchingTerms.length) {
      reasons.push(`Shared scope: ${matchingTerms.slice(0,5).join(', ')}.`);
      signals.push(`Scope overlap: ${matchingTerms.slice(0,4).join(', ')}`);
    }
    if (mechanisms.length) {
      reasons.push(`The article discusses ${mechanisms.map(s => s.toLowerCase()).join(' and ')}, which may provide a mechanism to investigate.`);
      signals.push(`Mechanism vocabulary: ${mechanisms.join(', ')}`);
    }
    if (sharedSectors.length) {
      reasons.push(`The product or industry scope matches: ${sharedSectors.join(', ')}${commonCountries.length ? '; geography also overlaps' : ''}.`);
      signals.push(`Matching industry: ${sharedSectors.join(', ')}`);
    }
    if (sameCommodityAndCountry) {
      reasons.push('The specific commodity and exporting country match the selected notice.');
      signals.push('Exact commodity and country match');
    }
    if ((targetIsNotice || candidateIsNotice) && !originatingFramework && !hasAttribution) {
      reasons.push('A parallel administrative notice is related context; shared review procedures do not establish that one notice caused another.');
    }
    if (countryMismatch) {
      reasons.push('The named subject countries differ; this is context unless a cross-country link is documented.');
      signals.push('Different subject country');
    }
    if (sectorMismatch) {
      reasons.push('The product sectors differ; shared official terminology or geography does not connect these developments.');
      signals.push('Different product sector');
      missingEvidence.push('Establish an actual cross-sector relationship before treating this development as a possible contributor.');
    }
    if (timingKnown) {
      const label = daysBefore < 1 ? 'on the same date as' : `${Math.floor(daysBefore)} day${Math.floor(daysBefore) === 1 ? '' : 's'} before`;
      reasons.push(`Dated ${label} the selected story; temporal order alone does not establish a cause.`);
      signals.push(daysBefore < 1 ? 'Same-day report; decision order unknown' : `Earlier report: ${Math.floor(daysBefore)} days`);
      if (!candidate.eventDate || !target.eventDate) missingEvidence.push('Publication order is available; confirm when the underlying decisions or events occurred.');
    } else {
      missingEvidence.push('A usable date is missing; confirm that the proposed cause preceded the effect.');
      signals.push('Timing unknown');
    }
    if (sameEvent) {
      reasons.push('The headline closely resembles coverage of the selected event; its score is reduced to avoid mistaking repeat coverage for a separate cause.');
      signals.push('Possible repeat coverage');
    }
    if (hasAttribution) {
      reasons.push('A passage in this article explicitly links the shared actor and event to a causal explanation. Treat that explanation as attributed reporting.');
      missingEvidence.push('Seek an original statement and independent case-specific evidence for the reported causal explanation.');
    } else {
      missingEvidence.push('No explicit causal link to the selected event was found in the supplied article text.');
      missingEvidence.push('Find case-specific evidence connecting this development to the affected people, products, budgets, or locations.');
    }
    if (hasContradiction) {
      reasons.push('The article includes a denial or contrary explanation; inspect that passage before treating this lead as support.');
      signals.push('Contrary statement reported');
    }
    if (timingKnown && daysBefore > maxAgeDays) missingEvidence.push('This report is old relative to the selected story; verify that its policy or decision was still relevant.');
    missingEvidence.push('Check alternative explanations and whether other outlets rely on the same original source.');

    let label = 'Related context';
    let assessment = 'context';
    if (plausibleMechanism) { label = 'Possible contributor'; assessment = 'hypothesis'; }
    if (hasAttribution) { label = 'Attributed explanation'; assessment = 'reported_attribution'; }
    if (hasContradiction) { label = 'Contradicting report'; assessment = 'reported_contradiction'; }

    output.push({
      id: candidate.id ?? key ?? candidateTitleNorm,
      title: clean(candidate.title),
      url: candidate.url ?? '',
      source: sourceName(candidate),
      published: candidate.published ?? candidate.publishedAt ?? candidate.date ?? null,
      summary: clean(candidate.summary),
      score,
      scoreKind: 'relevance',
      label,
      assessment,
      reasons,
      signals,
      missingEvidence,
      matchingTerms,
      mechanisms,
      evidence,
      timing: {
        candidate: candidateTime !== null ? new Date(candidateTime).toISOString() : null,
        target: targetTime !== null ? new Date(targetTime).toISOString() : null,
        daysBefore: daysBefore !== null ? Math.round(daysBefore * 10) / 10 : null,
        basis: candidate.eventDate && target.eventDate ? 'event dates' : 'publication dates unless event dates supplied',
      },
      article: candidate,
    });
  }

  // Deduplicate after scoring so a longer original article or an actual
  // attribution wins over a short syndicated summary of the same story.
  const parent = output.map((_,index) => index);
  const root = index => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const signatures = output.map(result => ({url:urlKey(result.url),title:normalize(result.title),tokens:tokens(result.title),notice:isRegulatoryNotice(result.article)}));
  for (let i=0; i<output.length; i++) {
    for (let j=i+1; j<output.length; j++) {
      const a = signatures[i], b = signatures[j];
      // Legal stages and review periods are distinct events even when they
      // concern an identical commodity; do not deduplicate them fuzzily.
      if ((a.url && a.url === b.url) || a.title === b.title || (!a.notice && !b.notice && similarity(a.tokens,b.tokens) >= 0.85)) parent[root(j)] = root(i);
    }
  }
  const indexed = output.map((result,index) => ({result,index}));
  const seenGroups = new Set();
  return indexed.sort((a,b) => b.result.score - a.result.score || (a.result.timing.daysBefore ?? Infinity) - (b.result.timing.daysBefore ?? Infinity) || a.result.title.localeCompare(b.result.title)).filter(({index}) => {
    const group = root(index);
    if (seenGroups.has(group)) return false;
    seenGroups.add(group);
    return true;
  }).slice(0,limit).map(({result}) => result);
}

export const ENGINE_DESCRIPTION = 'Deterministic research-lead ranking using shared scope, earlier reports, and mechanism vocabulary. Scores measure relevance, not causal probability. Source text is required for attributed explanations.';

export default rankPotentialCauses;
