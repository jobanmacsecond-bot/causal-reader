import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApiRequest,securityHeaders,secureResponse} from '../lib/http-security.mjs';
test('security policy permits only bundled resources, with no inline script execution',()=>{
  const policy=securityHeaders()['Content-Security-Policy'];
  assert.match(policy,/script-src 'self'/);assert.ok(!policy.includes('unsafe-inline'));
  assert.match(policy,/frame-ancestors 'none'/);assert.match(policy,/connect-src 'self'/);
  assert.equal(securityHeaders('http://127.0.0.1')['Strict-Transport-Security'],undefined);
});
test('secure responses retain body/status while removing server fingerprints',async()=>{
  const r=secureResponse(new Response('safe',{status:201,headers:{'X-Powered-By':'test'}}),'https://site.invalid');
  assert.equal(r.status,201);assert.equal(await r.text(),'safe');assert.equal(r.headers.get('X-Powered-By'),null);
  assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
});
test('API rejects methods, cross-site use, duplicate fields and invalid refresh before fetching',async()=>{
  for(const [request,status] of [
    [new Request('https://site.invalid/api/news',{method:'POST'}),405],
    [new Request('https://site.invalid/api/news',{headers:{Origin:'https://elsewhere.invalid'}}),403],
    [new Request('https://site.invalid/api/news',{headers:{'Sec-Fetch-Site':'cross-site'}}),403],
    [new Request('https://site.invalid/api/news?q=a&q=b'),400],
    [new Request('https://site.invalid/api/news?refresh=yes'),400],
    [new Request('https://site.invalid/api/news?url=https://127.0.0.1'),400],
    [new Request('https://site.invalid/api/constructor'),404],
    [new Request('https://site.invalid/api/__proto__'),404],
  ]){const r=await handleApiRequest(request);assert.equal(r.status,status);assert.equal(r.headers.get('Cache-Control'),'private, no-store');}
});
test('invalid inputs and unsupported identifiers return safe, useful status codes',async()=>{
  assert.equal((await handleApiRequest(new Request('https://site.invalid/api/article'))).status,400);
  assert.equal((await handleApiRequest(new Request('https://site.invalid/api/article?id=unsupported%3Amissing'))).status,404);
  assert.equal((await handleApiRequest(new Request('https://site.invalid/api/news?q='+ 'x'.repeat(121)))).status,400);
});
