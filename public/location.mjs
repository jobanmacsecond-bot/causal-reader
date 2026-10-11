// Country mentions are approximate report locations, never publisher headquarters.
const aliases = {
  'United States':['United States of America','USA','U.S.A.','U.S.','US'],
  'United Kingdom':['Britain','Great Britain','UK','U.K.','England','Scotland','Wales','Northern Ireland'],
  'Türkiye':['Turkey','Turkiye'], 'Myanmar':['Burma'], 'Czechia':['Czech Republic'],
  'Democratic Republic of Congo':['Dem. Rep. Congo','Democratic Republic of the Congo','DR Congo','DRC'],
  'Republic of Congo':['Congo','Republic of the Congo','Congo-Brazzaville'],
  'South Sudan':['S. Sudan'], 'North Macedonia':['Macedonia'], 'Eswatini':['eSwatini','Swaziland'],
  'Côte d’Ivoire':["Côte d'Ivoire",'Ivory Coast'], 'Cape Verde':['Cabo Verde'],
  'Solomon Islands':['Solomon Is.'], 'Marshall Islands':['Marshall Is.'],
  'Dominican Republic':['Dominican Rep.'], 'Central African Republic':['Central African Rep.'],
  'Equatorial Guinea':['Eq. Guinea'], 'Bosnia and Herzegovina':['Bosnia and Herz.'],
  'Antigua and Barbuda':['Antigua and Barb.'], 'Cook Islands':['Cook Is.'],
  'Saint Kitts and Nevis':['St. Kitts and Nevis'], 'Saint Vincent and the Grenadines':['St. Vin. and Gren.'],
  'Western Sahara':['W. Sahara'], 'Northern Cyprus':['N. Cyprus'],
  'French Polynesia':['Fr. Polynesia'], 'Faroe Islands':['Faeroe Is.'],
  'Falkland Islands':['Falkland Is.'], 'Cayman Islands':['Cayman Is.'],
  'Turks and Caicos Islands':['Turks and Caicos Is.'], 'US Virgin Islands':['U.S. Virgin Is.'],
  'Northern Mariana Islands':['N. Mariana Is.'], 'Vatican City':['Vatican'],
  'São Tomé and Príncipe':['São Tomé and Principe'], 'Timor-Leste':['East Timor'],
  'United Arab Emirates':['UAE'], 'South Korea':['Republic of Korea'],
  'North Korea':["Democratic People's Republic of Korea"], 'Russia':['Russian Federation'],
  'Vietnam':['Viet Nam'], 'Laos':['Lao PDR'], 'Palestine':['State of Palestine']
};
const baseNames = `Zimbabwe|Zambia|Yemen|Vietnam|Venezuela|Vanuatu|Uzbekistan|Uruguay|Micronesia|Guam|American Samoa|Puerto Rico|Anguilla|Bermuda|British Virgin Islands|Montserrat|Jersey|Guernsey|Isle of Man|United Kingdom|United Arab Emirates|Ukraine|Uganda|Turkmenistan|Tunisia|Trinidad and Tobago|Tonga|Togo|Timor-Leste|Thailand|Tanzania|Tajikistan|Taiwan|Syria|Switzerland|Sweden|Suriname|Sudan|Sri Lanka|Spain|South Korea|South Africa|Somalia|Somaliland|Slovakia|Slovenia|Singapore|Sierra Leone|Seychelles|Serbia|Senegal|Saudi Arabia|San Marino|Samoa|Saint Lucia|Rwanda|Russia|Romania|Qatar|Portugal|Poland|Philippines|Peru|Paraguay|Papua New Guinea|Panama|Palau|Pakistan|Oman|Norway|North Korea|Nigeria|Niger|Nicaragua|New Zealand|Niue|Netherlands|Aruba|Curaçao|Nepal|Nauru|Namibia|Mozambique|Morocco|Montenegro|Mongolia|Moldova|Monaco|Mexico|Mauritius|Mauritania|Malta|Mali|Maldives|Malaysia|Malawi|Madagascar|Luxembourg|Lithuania|Liechtenstein|Libya|Liberia|Lesotho|Lebanon|Latvia|Kyrgyzstan|Kuwait|Kosovo|Kiribati|Kenya|Kazakhstan|Jordan|Japan|Jamaica|Italy|Israel|Palestine|Ireland|Iraq|Iran|Indonesia|India|Iceland|Hungary|Honduras|Haiti|Guyana|Guinea-Bissau|Guinea|Guatemala|Grenada|Greece|Ghana|Germany|Georgia|Gambia|Gabon|France|New Caledonia|Finland|Fiji|Ethiopia|Estonia|Eritrea|El Salvador|Egypt|Ecuador|Dominica|Djibouti|Greenland|Denmark|Czechia|Cyprus|Cuba|Croatia|Costa Rica|Comoros|Colombia|China|Macao|Hong Kong|Chile|Chad|Canada|Cameroon|Cambodia|Myanmar|Burundi|Burkina Faso|Bulgaria|Brunei|Brazil|Botswana|Bolivia|Bhutan|Benin|Belize|Belgium|Belarus|Barbados|Bangladesh|Bahrain|Bahamas|Azerbaijan|Austria|Australia|Norfolk Island|Armenia|Argentina|Angola|Andorra|Algeria|Albania|Afghanistan|Antarctica|Sint Maarten`.split('|');
const norm = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[’']/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const lookup = new Map();
for (const name of [...baseNames,...Object.keys(aliases)]) {
  lookup.set(norm(name),name);
  for (const alias of aliases[name] || []) lookup.set(norm(alias),name);
}
export function canonicalCountryName(name) {return lookup.get(norm(name)) || String(name || '').trim();}
const placeAliases = {
  'United States':['American','Washington DC','Washington, D.C.','New York','Los Angeles','San Francisco'],
  'United Kingdom':['British','London','Edinburgh','Belfast'],
  'France':['French','Paris','Marseille'], 'Germany':['German','Berlin','Frankfurt'],
  'India':['Indian','New Delhi','Delhi','Mumbai','Bengaluru','Bangalore','Kolkata'],
  'China':['Chinese','Beijing','Shanghai','Shenzhen'], 'Japan':['Japanese','Tokyo','Osaka'],
  'South Korea':['South Korean','Seoul'], 'North Korea':['North Korean','Pyongyang'],
  'Russia':['Russian','Moscow'], 'Ukraine':['Ukrainian','Kyiv','Kiev'],
  'Canada':['Canadian','Ottawa','Toronto'], 'Brazil':['Brazilian','Brasilia','São Paulo'],
  'Australia':['Australian','Canberra','Sydney','Melbourne'], 'New Zealand':['Wellington','Auckland'],
  'Palestine':['Palestinian','Gaza','West Bank','Ramallah'], 'Israel':['Israeli','Tel Aviv'],
  'Iran':['Iranian','Tehran'], 'Lebanon':['Lebanese','Beirut'], 'Syria':['Syrian','Damascus'],
  'Iraq':['Baghdad'], 'Saudi Arabia':['Saudi','Riyadh'], 'United Arab Emirates':['Dubai','Abu Dhabi'],
  'Türkiye':['Turkish','Ankara','Istanbul'], 'South Africa':['Cape Town','Johannesburg'],
  'Kenya':['Kenyan','Nairobi'], 'Nigeria':['Nigerian','Abuja','Lagos'], 'Egypt':['Egyptian','Cairo'],
  'Democratic Republic of Congo':['Kinshasa'], 'Republic of Congo':['Brazzaville'],
  'South Sudan':['Juba'], 'Sudan':['Khartoum'], 'Pakistan':['Pakistani','Islamabad'],
  'Indonesia':['Indonesian','Jakarta'], 'Thailand':['Thai','Bangkok'], 'Philippines':['Filipino','Manila'],
  'Vietnam':['Vietnamese','Hanoi'], 'Bangladesh':['Bangladeshi','Dhaka'], 'Malaysia':['Malaysian','Kuala Lumpur'],
  'Mexico':['Mexican','Mexico City'], 'Argentina':['Argentinian','Argentine','Buenos Aires'],
  'Italy':['Italian','Rome'], 'Spain':['Spanish','Madrid'], 'Portugal':['Portuguese','Lisbon'],
  'Poland':['Polish','Warsaw'], 'Belgium':['Belgian','Brussels'], 'Switzerland':['Swiss','Bern','Geneva'],
  'Netherlands':['Dutch','Amsterdam'], 'Myanmar':['Burmese','Yangon'], 'Ethiopia':['Ethiopian','Addis Ababa']
};
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const rules = [...lookup].map(([alias,country])=>({alias,country}));
for (const [country,words] of Object.entries(placeAliases)) for (const word of words) rules.push({alias:norm(word),country});
// Longest locations consume their span first: South Sudan is not also Sudan.
rules.sort((a,b)=>b.alias.length-a.alias.length);
const compiled = rules.filter(r=>r.alias.length>2 || ['us','uk'].includes(r.alias)).map(r=>({...r,rx:new RegExp(`(^|[^a-z])(${escape(r.alias)})(?=$|[^a-z])`,'g')}));
function textCountries(text) {
  const normalized=norm(text), found=new Set(), spans=[];
  for (const {country,alias,rx} of compiled) {
    if (alias==='us' && !/\bUS\b/.test(text)) continue; // “tell us” is not a location.
    rx.lastIndex=0;
    for (const match of normalized.matchAll(rx)) {
      const start=match.index+match[1].length,end=start+match[2].length;
      if(alias==='indian' && (/^\s+ocean\b/.test(normalized.slice(end)) || /(?:american|native american)\s+$/.test(normalized.slice(0,start)))) continue;
      if(alias==='georgia' && /\b(?:US|U\.S\.|United States|Atlanta)\b/.test(text) && !/\b(?:Tbilisi|Georgian government|country of Georgia)\b/i.test(text)) continue;
      if (spans.some(([a,b])=>start<b&&end>a)) continue;
      spans.push([start,end]);found.add(country);
    }
  }
  return found;
}
export function countryNamesInArticle(article={}) {
  const text=[article.title,article.summary].filter(Boolean).join(' ');
  const result=textCountries(text);
  // Parser tags are derived from the same text; recompute them to avoid its
  // shorter-word overlaps. Explicit structured locations remain usable.
  if (!article.tagBasis) for (const name of (Array.isArray(article.countries)?article.countries:[])) {
    const canonical=canonicalCountryName(name);if(canonical)result.add(canonical);
  }
  return [...result].sort((a,b)=>a.localeCompare(b));
}
export function articleMatchesCountry(article,name) {return countryNamesInArticle(article).includes(canonicalCountryName(name));}
export function countryArticleCounts(articles=[]) {
  const counts=new Map();
  for(const article of articles) for(const country of countryNamesInArticle(article)) counts.set(country,(counts.get(country)||0)+1);
  return counts;
}
