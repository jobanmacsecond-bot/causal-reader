// Loopback-only local runtime; hosted access is protected by Sites authentication.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApiRequest,securityHeaders} from './lib/http-security.mjs';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const port=Number(process.env.PORT||8885);
const assets=new Map([
 ['reader.html','text/html; charset=utf-8'],['reader.js','text/javascript; charset=utf-8'],['reader.css','text/css; charset=utf-8'],
 ['globe.js','text/javascript; charset=utf-8'],['globe.css','text/css; charset=utf-8'],['location.mjs','text/javascript; charset=utf-8'],
 ['data/countries-50m.json','application/json'],['vendor/d3-array.min.js','text/javascript'],['vendor/d3-geo.min.js','text/javascript'],
 ['vendor/topojson-client.min.js','text/javascript'],['favicon.svg','image/svg+xml'],
]);
for(const file of await fs.readdir(path.join(root,'fonts')))if(/^(?:dm-sans|newsreader)-(?:400|500|600|700)\.ttf$/.test(file))assets.set('fonts/'+file,'font/ttf');
const localHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
 const origin=`http://127.0.0.1:${port}`,headers=securityHeaders(origin);
 const send=(status,body,type='application/json',extra={})=>{res.writeHead(status,{...headers,'Content-Type':type,'Cache-Control':'no-store',...extra});res.end(req.method==='HEAD'?undefined:body)};
 try{
  if(!localHosts.has(req.headers.host)){send(403,JSON.stringify({error:'Use the local news reader address.'}));return}
  if((req.url||'').length>4096){send(414,JSON.stringify({error:'The request is too long.'}));return}
  const url=new URL(req.url,origin);
  if(!['GET','HEAD'].includes(req.method)){send(405,JSON.stringify({error:'Unsupported request method.'}),'application/json',{Allow:'GET, HEAD'});req.resume();return}
  if(url.pathname.startsWith('/api/')){
   const request=new Request(url,{method:req.method,headers:new Headers(Object.entries(req.headers).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>[key,v]):value===undefined?[]:[[key,value]]))});
   const response=await handleApiRequest(request);
   send(response.status,await response.text(),'application/json',Object.fromEntries(response.headers));return
  }
  const file=url.pathname==='/'?'reader.html':url.pathname.slice(1);
  if(!assets.has(file)){send(404,'Not found','text/plain');return}
  const content=await fs.readFile(path.join(root,file));
  send(200,content,assets.get(file),{'Cache-Control':file.startsWith('fonts/')?'public, max-age=86400':'no-cache'});
 }catch{send(502,JSON.stringify({error:'The reader is temporarily unavailable. Please try again.'}))}
});
server.headersTimeout=10000;server.requestTimeout=20000;
server.listen(port,'127.0.0.1',()=>console.log(`Causal live reader: http://127.0.0.1:${port}`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
