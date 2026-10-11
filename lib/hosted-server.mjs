import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApiRequest,securityHeaders} from './http-security.mjs';

const defaultPublicDirectory=fileURLToPath(new URL('../public/',import.meta.url));
export function configuredPublicOrigin(value){
 if(typeof value!=='string'||!value.trim())throw new Error('Set PUBLIC_ORIGIN or RENDER_EXTERNAL_URL to the hosted HTTPS address.');
 let url;try{url=new URL(value.trim());}catch{throw new Error('The hosted origin must be a valid HTTPS origin.');}
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||/[?#]/.test(value)||url.hostname.includes('*')||url.hostname.endsWith('.'))throw new Error('The hosted origin must be an exact HTTPS origin without a path, credentials, query, or fragment.');
 return url.origin;
}
export function readHostedConfig(env=process.env){
 const publicOrigin=configuredPublicOrigin(env.PUBLIC_ORIGIN||env.RENDER_EXTERNAL_URL);
 const portText=env.PORT||'10000',port=Number(portText),host=env.HOST||'0.0.0.0';
 if(!/^\d+$/.test(String(portText))||!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 if(!['0.0.0.0','127.0.0.1'].includes(host))throw new Error('HOST must be 0.0.0.0 for hosted access or 127.0.0.1 for a local tunnel.');
 return {publicOrigin,port,host};
}

/** Explicit hosted entry only: origin comes from configuration, never proxy headers. */
export async function createHostedServer({publicOrigin,publicDirectory=defaultPublicDirectory,apiHandler=handleApiRequest}={}){
 const origin=configuredPublicOrigin(publicOrigin),expectedHost=new URL(origin).host.toLowerCase();
 const assets=new Map([
  ['reader.html','text/html; charset=utf-8'],['reader.js','text/javascript; charset=utf-8'],['reader.css','text/css; charset=utf-8'],
  ['globe.js','text/javascript; charset=utf-8'],['globe.css','text/css; charset=utf-8'],['location.mjs','text/javascript; charset=utf-8'],
  ['data/countries-50m.json','application/json'],['vendor/d3-array.min.js','text/javascript'],['vendor/d3-geo.min.js','text/javascript'],
  ['vendor/topojson-client.min.js','text/javascript'],['favicon.svg','image/svg+xml'],
 ]);
 for(const file of await fs.readdir(path.join(publicDirectory,'fonts')))if(/^(?:dm-sans|newsreader)-(?:400|500|600|700)\.ttf$/.test(file))assets.set('fonts/'+file,'font/ttf');
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  const send=(status,body,type='application/json',extra={})=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',...extra,...securityHeaders(origin)});res.end(req.method==='HEAD'?undefined:body);};
  try{
   const hostCount=req.rawHeaders.filter((_,index)=>index%2===0&&req.rawHeaders[index].toLowerCase()==='host').length;
   if(hostCount!==1||typeof req.headers.host!=='string'||req.headers.host.toLowerCase()!==expectedHost){send(403,JSON.stringify({error:'Use the configured website address.'}));return;}
   const target=req.url||'';
   if(target.length>4096){send(414,JSON.stringify({error:'The request is too long.'}));return;}
   if(!target.startsWith('/')||target.startsWith('//')||target.includes('\\')){send(400,JSON.stringify({error:'Use a local website path.'}));return;}
   const url=new URL(target,origin);
   if(url.origin!==origin){send(400,JSON.stringify({error:'Use a local website path.'}));return;}
   if(!['GET','HEAD'].includes(req.method)){send(405,JSON.stringify({error:'Unsupported request method.'}),'application/json',{Allow:'GET, HEAD',Connection:'close'});req.resume();return;}
   if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0){send(400,JSON.stringify({error:'Request bodies are not accepted.'}),'application/json',{Connection:'close'});req.resume();return;}
   if(url.pathname==='/healthz'){send(200,JSON.stringify({status:'ok'}));return;}
   if(url.pathname.startsWith('/api/')){
    const headers=new Headers(Object.entries(req.headers).flatMap(([key,value])=>Array.isArray(value)?value.map(v=>[key,v]):value===undefined?[]:[[key,value]]));
    const response=await apiHandler(new Request(url,{method:req.method,headers}));
    send(response.status,await response.text(),'application/json',Object.fromEntries(response.headers));return;
   }
   const file=url.pathname==='/'?'reader.html':url.pathname.slice(1);
   if(!assets.has(file)){send(404,'Not found','text/plain; charset=utf-8');return;}
   const content=await fs.readFile(path.join(publicDirectory,file));
   send(200,content,assets.get(file),{'Cache-Control':file.startsWith('fonts/')?'public, max-age=86400':'no-cache'});
  }catch{send(502,JSON.stringify({error:'The reader is temporarily unavailable. Please try again.'}));}
 });
 server.maxConnections=128;server.maxRequestsPerSocket=100;
 server.headersTimeout=10000;server.requestTimeout=20000;server.keepAliveTimeout=5000;
 server.setTimeout(40000,socket=>socket.destroy());
 return server;
}
