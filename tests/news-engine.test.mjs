import test from 'node:test';
import assert from 'node:assert/strict';
import {rankPotentialCauses} from '../lib/news-engine.mjs';

const target = {
  id:'target', title:'Google announces layoffs in its cloud engineering teams',
  summary:'Google plans to eliminate engineering roles as its cloud business changes.',
  text:'Google has announced layoffs. The plan affects cloud engineering teams.',
  published:'2026-06-10', url:'https://example.com/google-layoffs', source:'Example News',
  topics:['Google','Cloud computing'],
};
const story = (id, title, overrides = {}) => ({
  id,title,published:'2026-06-01',url:`https://news.example/${id}`,source:'Source A',summary:title,topics:[],...overrides,
});

test('earlier strategic change is a hypothesis, never proof or probability', () => {
  const results = rankPotentialCauses(target, [story('strategy','Google shifts cloud investment toward AI automation')]);
  assert.equal(results.length,1);
  assert.equal(results[0].label,'Possible contributor');
  assert.equal(results[0].assessment,'hypothesis');
  assert.equal(results[0].scoreKind,'relevance');
  assert.deepEqual(results[0].evidence,[]);
  assert.ok(results[0].missingEvidence.some(s => s.includes('No explicit causal link')));
});

test('future stories, the target itself, and unrelated policy are excluded', () => {
  const results = rankPotentialCauses(target, [
    target,
    story('future','Google shifts cloud investment toward AI',{published:'2026-06-11'}),
    story('unrelated','Canada adopts new rules for fishing licenses'),
  ]);
  assert.deepEqual(results,[]);
});

test('canonical URLs and syndicated headlines are deduplicated', () => {
  const a = story('a','Google shifts cloud investment toward AI automation');
  const b = story('b',a.title,{url:'https://another.example/repost'});
  const c = story('c','Google funding priorities change for cloud computing',{url:`${a.url}?utm_source=feed`});
  assert.equal(rankPotentialCauses(target,[a,b,c]).length,1);
});

test('deduplication retains the article with causal attribution rather than first occurrence', () => {
  const headline = 'Google shifts cloud investment toward AI automation';
  const short = story('short',headline);
  const detailed = story('detailed',headline,{text:'Google said cloud engineering layoffs were due to AI investment changes.'});
  const results = rankPotentialCauses(target,[short,detailed]);
  assert.equal(results.length,1);
  assert.equal(results[0].id,'detailed');
  assert.equal(results[0].label,'Attributed explanation');
});

test('same-event coverage gets a repeat-coverage penalty', () => {
  const [lead] = rankPotentialCauses(target,[story('repeat','Google announces layoffs in its cloud engineering teams today')],{minScore:0});
  assert.ok(lead);
  assert.equal(lead.label,'Related context');
  assert.ok(lead.signals.includes('Possible repeat coverage'));
  assert.ok(lead.reasons.some(s => s.includes('score is reduced')));
});

test('direct attribution requires a sentence linking the actor and target event', () => {
  const lead = story('explicit','Google shifts cloud investment to AI', {
    text:'Google said its cloud engineering layoffs were due to a shift in investment toward AI.',
  });
  const [result] = rankPotentialCauses(target,[lead]);
  assert.equal(result.label,'Attributed explanation');
  assert.equal(result.evidence[0].kind,'reported_attribution');
  assert.match(result.evidence[0].passage,/Google said/);
  assert.match(result.evidence[0].note,/not independently/);
});

test('a causal sentence about another event is not attribution for target layoffs', () => {
  const [result] = rankPotentialCauses(target,[story('unlinked','Google shifts cloud investment to AI',{
    text:'Google cloud investment grew because of demand for AI services. Another company announced layoffs.',
  })]);
  assert.equal(result.label,'Possible contributor');
  assert.equal(result.evidence.length,0);
});

test('separate mentions cannot manufacture a causal link', () => {
  const [result] = rankPotentialCauses(target,[story('split','Google shifts cloud investment toward AI',{
    text:'Google plans to invest in cloud services. Layoffs were due to changes at a different company.',
  })]);
  assert.equal(result.evidence.length,0);
});

test('an explicit denial is preserved as contrary reporting, not supportive evidence', () => {
  const [result] = rankPotentialCauses(target,[story('denial','Google explains cloud investment decisions',{
    text:'Google said its cloud engineering layoffs were not due to AI investment.',
  })]);
  assert.equal(result.label,'Contradicting report');
  assert.equal(result.evidence[0].kind,'reported_contradiction');
  assert.match(result.evidence[0].note,/does not establish independence/);
});

test('missing dates remain unknown and trigger an evidence gap', () => {
  const [result] = rankPotentialCauses(target,[story('undated','Google shifts cloud investment toward AI',{published:null})]);
  assert.equal(result.timing.daysBefore,null);
  assert.ok(result.missingEvidence.some(s => s.includes('date is missing')));
});

test('event dates can identify an earlier decision reported after the target', () => {
  const selected = {...target,eventDate:'2026-06-08'};
  const [result] = rankPotentialCauses(selected,[story('late-report','Google shifts cloud investment toward AI',{
    published:'2026-06-15',eventDate:'2026-06-02',
  })]);
  assert.equal(result.timing.basis,'event dates');
  assert.equal(result.timing.daysBefore,6);
});

test('cross-company trade lead can match an affected sector without an identical actor', () => {
  const selected = {id:'steel-target',title:'Tata Steel cuts jobs as export orders fall',summary:'Steel production and exports declined.',published:'2026-06-10',topics:['Steel','Trade']};
  const [result] = rankPotentialCauses(selected,[story('tariffs','US imposes tariffs on Indian steel imports',{topics:['Steel','Trade']})]);
  assert.equal(result.label,'Possible contributor');
  assert.ok(result.mechanisms.includes('Trade policy'));
  assert.equal(result.evidence.length,0);
});

test('matching country alone does not make an unrelated law a potential cause', () => {
  const selected = {title:'Indian software companies announce layoffs',summary:'Indian firms reduce engineering roles.',published:'2026-06-10'};
  const results = rankPotentialCauses(selected,[story('broad','Indian parliament passes law on fishing permits')]);
  if (results.length) assert.equal(results[0].label,'Related context');
});

test('Iran, Kenyan demonym, and Oceania country-only overlap cannot create contributor hypotheses',()=>{
  for(const country of ['Iran','Kenyan','New Zealand','Oceania']) {
    const selected={title:`${country} inflation rises amid higher household costs`,published:'2026-06-10'};
    const results=rankPotentialCauses(selected,[story(`country-${country}`,`${country} minister announces new trade talks`)],{minScore:0});
    for(const result of results)assert.equal(result.label,'Related context',`${country} alone is broad context`);
  }
});

test('geographic metadata prevents unknown country names from becoming specific actor scope',()=>{
  const selected={title:'Mauritius inflation rises amid higher household costs',countries:['Mauritius'],regions:['Africa'],published:'2026-06-10'};
  const candidate=story('mauritius','Mauritius minister announces new trade talks',{countries:['Mauritius'],regions:['Africa']});
  for(const result of rankPotentialCauses(selected,[candidate],{minScore:0}))assert.equal(result.label,'Related context');
});

test('shared Gulf geography and generic verbs do not connect hurricane landfall to unrelated laws or shows',()=>{
  const selected={title:'Hurricane Isaias makes landfall in Florida',summary:'US weather authorities are warning of life-threatening storm surges on the Gulf Coast due to the Category 2 hurricane. Extreme winds and possible tornadoes are also on the radar.',published:'2026-10-10',countries:['United States']};
  const candidates=[
    story('gulf-lease','Oil and Gas Lease Sale in the Gulf of Mexico',{summary:'A new policy makes changes to lease funding in the Gulf region.'}),
    story('raisins','Raisins Produced From Grapes in California: Marketing Order',{summary:'This rule makes changes due to revised marketing policy.'}),
    story('show','US singer Ella Langley cancels show due to touring costs',{summary:'The singer makes a decision due to rising costs.'}),
  ];
  for(const result of rankPotentialCauses(selected,candidates,{minScore:0}))assert.equal(result.label,'Related context');
});

test('even a shared hurricane name does not make an unrelated investment policy explain hurricane onset',()=>{
  const selected={title:'Hurricane Isaias makes landfall in Florida',published:'2026-10-10'};
  const [result]=rankPotentialCauses(selected,[story('recovery','Isaias recovery funding changes after Florida budget shifts')],{minScore:0});
  assert.ok(result);assert.equal(result.label,'Related context');
});

test('violence, weeks, and politics do not connect unrelated French protests to South African security',()=>{
  const selected={title:'Heightened security at anti-immigrant hotspots in South Africa',summary:'This follows two-days of violent anti-foreigner riots in the cities of Durban and Johannesburg, that come weeks before local government elections.',countries:['South Africa'],regions:['Africa'],topics:['Politics'],published:'2026-10-10'};
  const candidate=story('french-protests','French students vow to keep up protests as UN voices concern over violence',{summary:'Violent protests over a new policy have lasted weeks.',countries:['France'],regions:['Europe'],topics:['Politics']});
  for(const result of rankPotentialCauses(selected,[candidate],{minScore:0}))assert.equal(result.label,'Related context');
  const noMetadataTarget={...selected,countries:undefined,regions:undefined};
  const noMetadataCandidate={...candidate,countries:undefined,regions:undefined};
  for(const result of rankPotentialCauses(noMetadataTarget,[noMetadataCandidate],{minScore:0}))assert.equal(result.label,'Related context');
});

const steelNotice = {
  id:'steel-target',
  title:'Hot-Rolled Steel Flat Products From the Republic of Korea: Preliminary Results of Antidumping Duty Administrative Review; 2023-2024',
  summary:'The Department of Commerce preliminarily determines that certain producers of hot-rolled steel flat products from the Republic of Korea received dumping margins during the period of review.',
  text:'The United States Department of Commerce issues final results for administrative review of certain merchandise. '.repeat(1000),
  published:'2026-10-10',source:'Federal Register',
};

test('Korean steel matches rank above unrelated regulatory notices despite boilerplate', () => {
  const results = rankPotentialCauses(steelNotice,[
    story('dram','Dynamic Random Access Memory (DRAM) Semiconductors From the Republic of Korea: Initiation of Countervailing Duty Investigation',{
      summary:'The Department of Commerce has received a request to investigate certain producers during the period of review.',
    }),
    story('bags','Paper Bags From Cambodia: Final Results of Antidumping Duty Administrative Review',{
      summary:'The United States Department of Commerce determines that certain companies produced subject merchandise during the period.',
    }),
    story('tires','Passenger Vehicle and Light Truck Tires From Thailand: Preliminary Results of Antidumping Duty Administrative Review',{
      summary:'The Department of Commerce reviews producers and the applicable period and rates for certain products.',
    }),
    story('steel','Hot-Rolled Steel Flat Products From Korea: Amended Antidumping Duty Order',{
      summary:'The United States sets revised import duties for Korean hot-rolled steel.',
    }),
  ],{minScore:0});
  assert.equal(results[0].id,'steel');
  assert.equal(results[0].label,'Possible contributor');
  for (const result of results.filter(r => r.id !== 'steel')) {
    assert.notEqual(result.label,'Possible contributor');
    assert.ok(result.score < results[0].score);
  }
  assert.ok(!results[0].matchingTerms.some(t => ['certain','administrative','review','result','product','department','commerce'].includes(t)));
});

test('body boilerplate cannot add scope or make unrelated notices relevant', () => {
  const candidate = story('regulation','Cambodian Paper Bags: Import Duties',{
    summary:'Commerce announces a duty review for paper bags.',
    text:steelNotice.text + ' Hot-rolled steel Korea final preliminary certain results.',
  });
  assert.deepEqual(rankPotentialCauses(steelNotice,[candidate]),[]);
});

test('agency and country overlap alone cannot be a possible contributor', () => {
  const selected = {title:'United States Department of Commerce Announces New Rule',summary:'A federal notice announces a new law.',published:'2026-10-10'};
  const results = rankPotentialCauses(selected,[story('agency','United States Department of Commerce Announces Administrative Review',{
    summary:'An official policy notice was published.',
  })],{minScore:0});
  for (const result of results) assert.equal(result.label,'Related context');
});

test('a causal phrase about an unrelated Korean product cannot attribute a steel cause', () => {
  const [result] = rankPotentialCauses(steelNotice,[story('dram-causal','Korean DRAM Products: Revised Import Duties',{
    summary:'Korean memory chips receive new duties.',
    text:'Korea product prices changed because of the preliminary results for 2023-2024.',
  })],{minScore:0});
  assert.equal(result.evidence.length,0);
  assert.equal(result.label,'Related context');
  assert.ok(!result.matchingTerms.includes('2023-2024'));
});

test('exact commodity and country outrank Korean steel nails and German forged steel', () => {
  const results = rankPotentialCauses(steelNotice,[
    story('nails','Certain Steel Nails From the Republic of Korea: Preliminary Results of Antidumping Duty Administrative Review; 2024-2025'),
    story('forged','Forged Steel Fittings From Germany: Final Results of Antidumping Duty Administrative Review'),
    story('exact','Hot-Rolled Steel Flat Products From the Republic of Korea: Final Results of Antidumping Duty Administrative Review; 2022-2023'),
    story('framework','Hot-Rolled Steel Flat Products From the Republic of Korea: Antidumping Duty Order'),
  ]);
  const exact = results.find(r => r.id === 'exact');
  assert.ok(exact);
  assert.equal(exact.label,'Related context');
  assert.ok(exact.signals.includes('Exact commodity and country match'));
  for (const id of ['nails','forged']) {
    const result = results.find(r => r.id === id);
    if (result) {
      assert.equal(result.label,'Related context');
      assert.ok(exact.score > result.score);
    }
  }
  assert.equal(results.find(r => r.id === 'framework').label,'Possible contributor');
});

test('Federal Reserve publisher overlap does not connect surveys to stablecoin regulation', () => {
  const selected = {title:'Federal Reserve releases Survey of Consumer Finances',summary:'The Federal Reserve Board reports household wealth and income from its survey.',published:'2026-10-10'};
  const results = rankPotentialCauses(selected,[story('stablecoins','Federal Reserve Board announces stablecoin regulation',{
    summary:'The Federal Reserve outlines new financial rules for digital currency.',
  })],{minScore:0});
  for (const result of results) assert.equal(result.label,'Related context');
});

test('POR, dates, exporter and determination boilerplate are not scope', () => {
  const results = rankPotentialCauses(steelNotice,[story('only-boilerplate','Final Results for January to December POR: Exporter Determination',{
    summary:'The Department of Commerce determines the exporter result for the review period and trade notice.',
  })]);
  assert.deepEqual(results,[]);
});

test('results are deterministic, limited, and do not mutate the inputs', () => {
  const articles = [story('a','Google shifts cloud investment toward AI'),story('b','Google changes budgets for cloud automation')];
  const before = JSON.stringify([target,articles]);
  assert.deepEqual(rankPotentialCauses(target,articles),rankPotentialCauses(target,articles));
  assert.equal(rankPotentialCauses(target,articles,{limit:1}).length,1);
  assert.equal(JSON.stringify([target,articles]),before);
  assert.deepEqual(rankPotentialCauses(target,null),[]);
});

test('a single ambiguous security term does not connect policing with financial securities',()=>{
 const selected={title:'Heightened security at anti-immigrant hotspots in South Africa',summary:'Police increase security before local elections.',countries:['South Africa'],published:'2026-10-10'};
 const candidates=[story('securities','Credit terms in euro-denominated securities financing',{summary:'The survey covers securities financing conditions.'}),story('filing','Mandatory electronic filing',{summary:'This notice updates filing rules for security information.'})];
 assert.deepEqual(rankPotentialCauses(selected,candidates),[]);
});
