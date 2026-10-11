import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredPublicOrigin,readHostedConfig,createHostedServer} from '../lib/hosted-server.mjs';

async function requestTo(server,{target='/',method='GET',host='news.example',headers={},rawHeaders}={}){
 const req={url:target,method,headers:{host,...headers},rawHeaders:rawHeaders||['Host',host],resume(){}};
 const output={};
 const res={destroyed:false,writeHead(status,responseHeaders){output.status=status;output.headers=responseHeaders;},end(body){output.body=body===undefined?'':String(body);}};
 await server.listeners('request')[0](req,res);
 return output;
}

test('hosted startup requires an exact configured HTTPS origin and a deliberate bind address',()=>{
 assert.equal(configuredPublicOrigin('https://news.example/'),'https://news.example');
 for(const value of [undefined,'','http://news.example','https://*.example','https://news.example/article','https://user:pass@news.example','https://news.example/?q=x','https://news.example/#x','https://news.example.'])assert.throws(()=>configuredPublicOrigin(value));
 assert.deepEqual(readHostedConfig({RENDER_EXTERNAL_URL:'https://causal.onrender.com'}),{publicOrigin:'https://causal.onrender.com',port:10000,host:'0.0.0.0'});
 assert.deepEqual(readHostedConfig({PUBLIC_ORIGIN:'https://news.example',RENDER_EXTERNAL_URL:'https://causal.onrender.com',HOST:'127.0.0.1',PORT:'8891'}),{publicOrigin:'https://news.example',port:8891,host:'127.0.0.1'});
 for(const env of [{HOST:'192.168.1.10'},{PORT:'0'},{PORT:'65536'},{PORT:'10000.5'},{PORT:'not-a-port'}])assert.throws(()=>readHostedConfig({PUBLIC_ORIGIN:'https://news.example',...env}));
});

test('hosted requests use the configured host and ignore forged forwarding headers',async()=>{
 const server=await createHostedServer({publicOrigin:'https://news.example'});
 const good=await requestTo(server,{target:'/healthz',headers:{'x-forwarded-host':'attacker.example','x-forwarded-proto':'http',forwarded:'host=attacker.example;proto=http'}});
 assert.equal(good.status,200);assert.equal(JSON.parse(good.body).status,'ok');assert.match(good.headers['Strict-Transport-Security'],/max-age/);
 assert.equal((await requestTo(server,{host:'attacker.example',headers:{'x-forwarded-host':'news.example'}})).status,403);
 assert.equal((await requestTo(server,{rawHeaders:['Host','news.example','Host','attacker.example']})).status,403);
 assert.equal((await requestTo(server,{host:'news.example.evil.example'})).status,403);
});

test('hosted API preserves same-origin restrictions despite proxy header forgery',async()=>{
 const server=await createHostedServer({publicOrigin:'https://news.example'});
 const target='/api/news?q='+'x'.repeat(121);
 const same=await requestTo(server,{target,headers:{origin:'https://news.example','x-forwarded-host':'evil.example','x-forwarded-proto':'http'}});
 assert.equal(same.status,400,'same-origin request must reach bounded query validation');
 assert.equal((await requestTo(server,{target,headers:{origin:'https://evil.example'}})).status,403);
 assert.equal((await requestTo(server,{target,headers:{origin:'https://news.example','sec-fetch-site':'cross-site'}})).status,403);
 assert.equal((await requestTo(server,{target:'/api/news',method:'POST'})).status,405);
 assert.equal((await requestTo(server,{target:'/api/article',method:'HEAD'})).status,405);
});

test('hosted asset routing cannot escape the allowlist or accept absolute request URLs',async()=>{
 const server=await createHostedServer({publicOrigin:'https://news.example'});
 const home=await requestTo(server);assert.equal(home.status,200);assert.match(home.body,/Causal/);
 assert.equal(home.headers['X-Frame-Options'],'DENY');assert.match(home.headers['Content-Security-Policy'],/frame-ancestors 'none'/);
 for(const target of ['/.env','/package.json','/../package.json','/public/reader.html','/fonts/dmsans-OFL.txt','/vendor/unknown.js'])assert.equal((await requestTo(server,{target})).status,404);
 for(const target of ['https://evil.example/api/news','//evil.example/api/news','/\\evil.example/api/news'])assert.equal((await requestTo(server,{target})).status,400);
 assert.equal((await requestTo(server,{target:'/'+ 'x'.repeat(4096)})).status,414);
 assert.equal((await requestTo(server,{target:'/healthz',headers:{'content-length':'1'}})).status,400);
 assert.equal((await requestTo(server,{target:'/healthz',headers:{'transfer-encoding':'chunked'}})).status,400);
 assert.equal((await requestTo(server,{target:'/',method:'HEAD'})).body,'');
});

test('hosted runtime bounds incoming connections and hides internal failures',async()=>{
 const server=await createHostedServer({publicOrigin:'https://news.example',apiHandler:async()=>{throw new Error('secret private diagnostic');}});
 assert.equal(server.maxConnections,128);assert.equal(server.maxRequestsPerSocket,100);assert.equal(server.headersTimeout,10000);assert.equal(server.requestTimeout,20000);assert.equal(server.keepAliveTimeout,5000);
 const response=await requestTo(server,{target:'/api/news'});assert.equal(response.status,502);assert.ok(!response.body.includes('secret'));assert.equal(response.headers['X-Content-Type-Options'],'nosniff');
});
