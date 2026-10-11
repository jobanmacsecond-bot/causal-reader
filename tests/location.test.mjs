import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCountryName,countryNamesInArticle,articleMatchesCountry,countryArticleCounts} from '../public/location.mjs';
test('canonical labels align dataset and report aliases',()=>{
  assert.equal(canonicalCountryName('United States of America'),'United States');
  assert.equal(canonicalCountryName('Turkey'),'Türkiye');
  assert.equal(canonicalCountryName('Dem. Rep. Congo'),'Democratic Republic of Congo');
  assert.equal(canonicalCountryName('Congo'),'Republic of Congo');
  assert.equal(canonicalCountryName('Solomon Is.'),'Solomon Islands');
});
test('cities and reports about several countries appear in each country',()=>{
  assert.deepEqual(countryNamesInArticle({title:'Delhi and London sign a new trade pact'}),['India','United Kingdom']);
  assert.ok(articleMatchesCountry({title:'US and China hold talks'},'United States of America'));
  assert.ok(articleMatchesCountry({title:'France and Germany agree a deal'},'Germany'));
});
test('publisher origin and lowercase pronoun do not define a location',()=>{
  assert.deepEqual(countryNamesInArticle({source:'France 24',title:'Tell us about the new technology'}),[]);
  assert.deepEqual(countryNamesInArticle({source:'BBC',region:'United Kingdom',title:'New global technology'}),[]);
});
test('compound countries avoid shorter-country false matches',()=>{
  assert.deepEqual(countryNamesInArticle({title:'Papua New Guinea and South Sudan sign a treaty',countries:['Guinea','Sudan'],tagBasis:'Text mentions'}),['Papua New Guinea','South Sudan']);
  assert.deepEqual(countryNamesInArticle({title:'Republic of Congo elects a president',countries:['Democratic Republic of Congo'],tagBasis:'Text mentions'}),['Republic of Congo']);
  assert.deepEqual(countryNamesInArticle({title:'North Korea and South Korea meet'}),['North Korea','South Korea']);
});
test('counts are per story, with explicit structured locations and zero missing countries',()=>{
  const stories=[{title:'Delhi and India respond'},{title:'Trade pact',countries:['India','USA']},{title:'UK and India talks'}];
  const counts=countryArticleCounts(stories);
  assert.equal(counts.get('India'),3);assert.equal(counts.get('United States'),1);
  assert.equal(counts.get('United Kingdom'),1);assert.equal(counts.get('Mongolia')||0,0);
});
test('Indian Ocean and the US state of Georgia do not add false countries',()=>{
  assert.deepEqual(countryNamesInArticle({title:'Indian Ocean trade route disrupted'}),[]);
  assert.deepEqual(countryNamesInArticle({title:'US Georgia senate race tightening'}),['United States']);
  assert.deepEqual(countryNamesInArticle({title:'US and Georgia leaders meet in Tbilisi'}),['Georgia','United States']);
});
