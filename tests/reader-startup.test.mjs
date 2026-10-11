import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/reader.js',import.meta.url),'utf8');
// Stub module transport; the startup and reader code still execute unchanged.
const isolated=source.replace("import('./globe.js')","__import('globe')").replace("import('./location.mjs')","__import('location')");
function harness(protocol,loadModules=()=>Promise.reject(Error('Module unavailable'))){
 const elements=new Map(),controls=[{}, {}, {}],timers=new Map();let nextTimer=0,fetches=0;
 function element(){return {textContent:'Loading real publications…',innerHTML:'',attributes:{},children:[],className:'',value:'',parentElement:{scrollTop:0},selectedOptions:[{textContent:'Around the world'}],classList:{add(){},remove(){},toggle(){}},setAttribute(name,value){this.attributes[name]=value},addEventListener(){},querySelector(){return get('locationCount')},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},showModal(){},close(){}}}
 function get(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)}
 const context=vm.createContext({location:{protocol,href:protocol==='file:'?'file:///reader.html':'https://news.example/reader.html'},document:{getElementById:get,createElement:element,querySelectorAll:selector=>selector==='button, input, select'?controls:[]},__import:loadModules,localStorage:{getItem:()=>'[]',setItem(){}},AbortController,URL,URLSearchParams,console,fetch(){fetches++;return new Promise(()=>{})},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(isolated,context);
 return {get,controls,timers,fetches:()=>fetches};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('opening the HTML file ends loading and offers the running website without API requests',()=>{
 const h=harness('file:');
 assert.match(h.get('feedList').textContent,/Open the running news reader/);
 assert.equal(h.get('feedList').attributes['aria-busy'],'false');
 assert.ok(h.controls.every(control=>control.disabled));
 const panel=h.get('readerContent').children[0],recovery=panel.children.at(-1);
 assert.equal(recovery.href,'http://127.0.0.1:8885/');
 assert.equal(h.fetches(),0);assert.equal(h.timers.size,0);
});
test('a failed module load displays recovery and clears the startup deadline',async()=>{
 const h=harness('https:');await tick();
 assert.match(h.get('feedList').textContent,/could not start/);
 assert.equal(h.get('contextList').attributes['aria-busy'],'false');
 assert.equal(h.get('readerContent').children[0].children.at(-1).href,'https://news.example/reader.html');
 assert.equal(h.timers.size,0);assert.equal(h.fetches(),0);
});
test('the startup deadline stops loading and prevents a late import from starting the reader',async()=>{
 let resolve;const waiting=new Promise(done=>resolve=done);
 const h=harness('https:',()=>waiting);
 [...h.timers.values()].find(timer=>timer.ms===10000).fn();
 assert.match(h.get('feedList').textContent,/could not start/);
 resolve({createNewsGlobe(){throw Error('Reader must not initialize after timeout')}});await tick();
 assert.equal(h.fetches(),0);assert.ok(h.controls.every(control=>control.disabled));
});
test('successful startup clears its deadline while slow news keeps its own request timeout',async()=>{
 const h=harness('https:',()=>Promise.resolve({createNewsGlobe:()=>({updateArticles(){},selectCountry(){}}),canonicalCountryName:name=>name,articleMatchesCountry:()=>true}));
 await tick();
 assert.equal(h.fetches(),1);
 assert.ok(![...h.timers.values()].some(timer=>timer.ms===10000));
 assert.ok([...h.timers.values()].some(timer=>timer.ms===45000));
 assert.match(h.get('feedList').innerHTML,/Fetching global headlines/);
 assert.ok(h.controls.every(control=>!control.disabled));
});
