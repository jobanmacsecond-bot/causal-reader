import {news,article,causes,NewsServiceError} from './news-service.mjs';

export const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
export function securityHeaders(url='https://site.invalid') {
  const headers={
    'Content-Security-Policy':contentSecurityPolicy,
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'X-Robots-Tag':'noindex, nofollow',
  };
  if(new URL(url).protocol==='https:') headers['Strict-Transport-Security']='max-age=31536000';
  return headers;
}
export function secureResponse(response,url) {
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(securityHeaders(url)))headers.set(key,value);
  headers.delete('X-Powered-By');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
export async function handleApiRequest(request) {
  const url=new URL(request.url);
  if(request.method!=='GET')return json({error:'This endpoint only supports GET.'},405,{Allow:'GET'});
  if(request.url.length>4096)return json({error:'The request is too long.'},414);
  const origin=request.headers.get('Origin');
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==url.origin))return json({error:'Use this endpoint from the news reader.'},403);
  const route=url.pathname.split('/').at(-1),routes={news:['q','refresh'],article:['id'],causes:['id']},allowed=Object.hasOwn(routes,route)?routes[route]:null;
  if(!allowed)return json({error:'Endpoint not found.'},404);
  for(const key of url.searchParams.keys())if(!allowed.includes(key)||url.searchParams.getAll(key).length!==1)return json({error:'Unsupported or repeated request parameter.'},400);
  const refresh=url.searchParams.get('refresh');
  if(refresh!==null&&!['0','1'].includes(refresh))return json({error:'Refresh must be 0 or 1.'},400);
  try {
    const result=route==='news'?await news(url.searchParams.get('q')||'',refresh==='1'):route==='article'?await article(url.searchParams.get('id')):await causes(url.searchParams.get('id'));
    return json(result);
  }catch(error){
    const known=error instanceof NewsServiceError&&[400,404,503].includes(error.status);
    return json({error:known?error.message:'The news service is temporarily unavailable. Please try again.'},known?error.status:502,error?.status===503?{'Retry-After':'30'}:{});
  }
}
