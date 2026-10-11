import test from 'node:test';
import assert from 'node:assert/strict';
import {rankHeadlines} from '../lib/headline-ranking.mjs';

const NOW = '2026-10-10T18:00:00Z';
const article = (id,title,extra={}) => ({id,title,summary:'',published:'2026-10-10T15:00:00Z',url:`https://${id}.example/story`,source:id,provider:id,sourceKind:'journalism',editorialGroup:id,feedPosition:0,topics:[],region:'Global',...extra});
const rank = (articles,options={}) => rankHeadlines(articles,{now:NOW,...options});

test('exact reposts count once, including across different publishers', () => {
  const title = 'Israel and Gaza agree ceasefire deal after negotiations';
  const results = rank([article('a',title),article('b',title,{source:'Another site',editorialGroup:'another'})]);
  assert.equal(results.length,1);
  assert.equal(results[0].headlineRank.coverageCount,1);
});

test('URL tracking parameters do not create duplicate articles', () => {
  const results = rank([
    article('a','Google announces cloud engineering layoffs',{url:'https://news.example/story?utm_source=one'}),
    article('b','Google cuts its cloud engineering workforce',{url:'https://news.example/story?utm_source=two'}),
  ]);
  assert.equal(results.length,1);
});

test('distinct headlines for the same event count independent editorial groups', () => {
  const results = rank([
    article('a','Israel and Gaza agree ceasefire deal after negotiations'),
    article('b','Gaza ceasefire deal agreed by Israel after negotiations'),
    article('c','Local council opens new recreation centre'),
  ]);
  const a = results.find(r => r.id === 'a'), b = results.find(r => r.id === 'b');
  assert.equal(a.headlineRank.coverageCount,2);
  assert.equal(a.headlineRank.eventGroup,b.headlineRank.eventGroup);
  assert.ok(a.headlineRank.reasons.some(reason => reason.includes('2 editorial source groups')));
});

test('syndicated reporting families cannot inflate editorial coverage', () => {
  const results = rank([
    article('a','Israel and Gaza agree ceasefire deal after negotiations',{editorialGroup:'Reuters'}),
    article('b','Gaza ceasefire deal agreed by Israel after negotiations',{editorialGroup:'Reuters syndicated'}),
  ]);
  assert.equal(results[0].headlineRank.coverageCount,1);
  assert.equal(results[1].headlineRank.coverageCount,1);
});

test('a leading wire credit prevents double-counting when the family is unspecified', () => {
  const results = rank([
    article('a','Israel and Gaza agree ceasefire deal after negotiations',{editorialGroup:undefined,source:'Reuters'}),
    article('b','Gaza ceasefire deal agreed by Israel after negotiations',{editorialGroup:undefined,summary:'Reuters - Officials reached an agreement.'}),
  ]);
  assert.equal(results[0].headlineRank.coverageCount,1);
});

test('wireSource overrides populated editorialGroup metadata across two publishers', () => {
  const results = rank([
    article('publisher-a','Israel and Gaza agree ceasefire deal after negotiations',{editorialGroup:'publisher-a',wireSource:'Reuters'}),
    article('publisher-b','Gaza ceasefire deal agreed by Israel after negotiations',{editorialGroup:'publisher-b',wireSource:'Reuters'}),
  ]);
  assert.equal(results.length,2);
  for (const result of results) assert.equal(result.headlineRank.coverageCount,1);
});

test('leading summary wire credit overrides populated publisher group metadata', () => {
  const results = rank([
    article('publisher-a','Israel and Gaza agree ceasefire deal after negotiations',{editorialGroup:'publisher-a',summary:'Reuters - Officials reached a deal.'}),
    article('publisher-b','Gaza ceasefire deal agreed by Israel after negotiations',{editorialGroup:'publisher-b',summary:'(Reuters) Officials confirmed negotiations.'}),
  ]);
  for (const result of results) assert.equal(result.headlineRank.coverageCount,1);
});

test('source rotation treats two wire reposting publishers as the same family', () => {
  const results = rank([
    article('wire-a','Government announces new election timetable',{editorialGroup:'publisher-a',wireSource:'Reuters'}),
    article('wire-b','Ministers announce national energy budget',{editorialGroup:'publisher-b',wireSource:'Reuters'}),
    article('independent','India announces major trade agreement',{editorialGroup:'independent',feedPosition:2}),
  ]);
  assert.ok(results.slice(0,2).some(result => result.id === 'independent'));
});

test('unrelated Google stories do not become the same event', () => {
  const results = rank([
    article('layoffs','Google announces layoffs in cloud engineering teams'),
    article('launch','Google launches Gemini model for cloud developers'),
    article('court','Google faces antitrust court ruling over search monopoly'),
  ]);
  assert.equal(new Set(results.map(r => r.headlineRank.eventGroup)).size,3);
  for (const result of results) assert.equal(result.headlineRank.coverageCount,1);
});

test('a current lead ranks above stale-but-eligible coverage and old news is excluded', () => {
  const results = rank([
    article('recent','Government announces major trade agreement',{published:'2026-10-10T17:00:00Z'}),
    article('aging','Government announces budget negotiations',{published:'2026-10-05T15:00:00Z'}),
    article('old','Central bank cuts interest rates',{published:'2026-09-30T15:00:00Z'}),
  ]);
  assert.equal(results[0].id,'recent');
  assert.ok(!results.some(r => r.id === 'old'));
});

test('official documents stay behind journalism and do not count as editorial corroboration', () => {
  const results = rank([
    article('official','Central bank cuts interest rates after inflation report',{sourceKind:'official',feedPosition:0}),
    article('editorial','Central bank cuts interest rates following inflation report',{feedPosition:10}),
  ]);
  assert.equal(results[0].id,'editorial');
  assert.equal(results[0].headlineRank.coverageCount,1);
  assert.equal(results[1].id,'official');
  assert.ok(results[1].headlineRank.reasons.some(r => r.includes('research context')));
});

test('known official providers are handled even without a sourceKind', () => {
  const results = rank([
    article('fed','Federal Reserve policy announcement',{provider:'federalreserve',sourceKind:undefined}),
    article('news','Community celebrates a local festival',{feedPosition:20}),
  ]);
  assert.equal(results[0].id,'news');
  assert.equal(results[1].headlineRank.coverageCount,0);
});

test('top feed rotates sources and regions rather than letting one dominate', () => {
  const results = rank([
    article('a1','Government announces new election timetable',{editorialGroup:'a',region:'Europe',feedPosition:0}),
    article('a2','Government unveils new transport budget',{editorialGroup:'a',region:'Europe',feedPosition:1}),
    article('a3','European ministers consider new energy rules',{editorialGroup:'a',region:'Europe',feedPosition:2}),
    article('b1','India announces major trade agreement',{editorialGroup:'b',region:'Asia',feedPosition:3}),
  ],{limit:3});
  assert.ok(results.slice(0,2).some(r => r.id === 'b1'));
  assert.equal(new Set(results.map(r => r.editorialGroup)).size,2);
});

test('distinct events are shown before a second account of the same event', () => {
  const results = rank([
    article('a','Israel and Gaza agree ceasefire deal after negotiations'),
    article('b','Gaza ceasefire deal agreed by Israel after negotiations'),
    article('c','India approves a new national energy budget'),
  ]);
  assert.equal(results[1].id,'c');
});

test('search matches title and summary and does not surface unrelated news', () => {
  const results = rank([
    article('match','Google cloud teams face layoffs'),
    article('summary','Tech industry reacts',{summary:'Google is cutting jobs in cloud operations.'}),
    article('unrelated','Parliament votes on fishing licenses'),
  ],{query:'Google'});
  assert.equal(results.length,2);
  assert.equal(results[0].id,'match');
});

test('future dated stories are excluded; undated stories disclose missing freshness', () => {
  const results = rank([
    article('future','A scheduled announcement',{published:'2026-10-11T15:00:00Z'}),
    article('unknown','An undated news story',{published:null}),
    article('current','A current news story'),
  ]);
  assert.ok(!results.some(r => r.id === 'future'));
  assert.equal(results[0].id,'current');
  assert.ok(results.find(r => r.id === 'unknown').headlineRank.reasons.some(r => r.includes('missing')));
});

test('date-only now includes the whole calendar date and applies the freshness limit', () => {
  const results = rankHeadlines([article('today','Today’s headline'),article('old','Old headline',{published:'2026-09-01'})],{now:'2026-10-10'});
  assert.equal(results.length,1);
});

test('ranking preserves fields and does not mutate input', () => {
  const originals = [article('a','Google cloud teams face layoffs',{custom:{hello:'world'}})];
  const saved = JSON.stringify(originals);
  const result = rank(originals)[0];
  assert.deepEqual(result.custom,{hello:'world'});
  assert.equal(JSON.stringify(originals),saved);
  assert.equal(result.headlineRank.scoreKind,'editorial relevance');
  assert.ok(!('confidence' in result.headlineRank));
  assert.deepEqual(rank(null),[]);
  assert.deepEqual(rank(originals,{limit:0}),[]);
});
