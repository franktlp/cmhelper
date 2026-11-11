/* Browser integration regression test.
 * npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
 * NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-market-resolution.cjs
 */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const repo=path.join(__dirname,'..'),list='/es/Pokemon/Products/Singles/30th-Celebration';
const energy=list.replace('30th-Celebration','Mega-Evolution-Energies');
const prints='BS 58|BS 4|GH 18|GC 69|NG 25|NDE 106|AQ 149|RS 5|TRR 19|UF 108|DS 11|GE 106|LA 43|PL 47|TM 94|TM 99|TM 100|NVI 101|DRX 85|PLB 97|PRC 106|BKP 41|SUM 89|CIN 57|TEU 33|SSH 138|VIV 50|FST 114|BRS 123|PAL 203'.split('|');
const paths=prints.map((print,i)=>list+'/'+(i===1?'Charizard':'Card')+'-30C'+print.replace(' ','-'));
// Cardmarket's verified Charizard URL is /Charizard-30CBS-4, NOT /Charizard-30CBS004.
assert.equal(paths[1],list+'/Charizard-30CBS-4');
const entries=prints.map((_,i)=>({set:'30th Celebration',number:'CC '+String(i+1).padStart(3,'0')+'/030',name:'Classic '+(i+1),variant:'holo',language:'all',tier:'master'}));
entries.push({...entries[0],number:'MEE 002',name:'Basic Fire Energy'},{...entries[0],number:'001/128',name:'Exeggcute'});
const link=(url,label)=>`<a href="${url}">${label}</a>`;
const row=(id,title,price='0,20')=>`<div class="article-row" data-article-id="${id}"><a href="/es/Users/SellerA">SellerA</a><i title="Español"></i><div class="article-condition"><span class="badge">NM</span></div><div class="article-attributes"><i title="${title}"></i></div><div class="price-container"><b class="fw-bold">${price} €</b></div></div>`;
(async()=>{
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com'+list,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.alert=()=>{};
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,10),...args);
 const requested=[];
 w.fetch=async(input,opts={})=>{
  assert.notEqual(opts.method,'POST');const url=new URL(input);requested.push(url.pathname);
  let html;
  if(url.pathname===list)html=prints.map((p,i)=>link(paths[i],'Classic (30C '+p+')')).join('')+link(list+'/Exeggcute-30C001','Exeggcute (30C 001)')+link(list+'/Wrong-30CBS-999','Wrong (30C BS 58)');
  else if(url.pathname===energy)html=link(energy+'/Basic-Fire-Energy-V1-MEE002','Fire (MEE 002)')+link(energy+'/Basic-Fire-Energy-V2-MEE002','Fire (MEE 002)')+link(energy+'/Wrong-MEE004','Wrong (MEE 002)');
  else if(paths.includes(url.pathname))html=row(String(1000+paths.indexOf(url.pathname)),'');
  else if(url.pathname===list+'/Exeggcute-30C001')html=row('2000','');
  else if(url.pathname===energy+'/Basic-Fire-Energy-V1-MEE002')html=row('3000','','0,02');
  else if(url.pathname===energy+'/Basic-Fire-Energy-V2-MEE002')html=row('3001','Holo','0,50')+row('3002','Reverse Holo','0,01');
  else throw Error('Unexpected product: '+url.pathname);
  return {ok:true,status:200,text:async()=>html};
 };
 w.eval(fs.readFileSync(repo+'/master-set-data-adapter.js','utf8'));await w.eval(fs.readFileSync(repo+'/cardmarket-helper.js','utf8'));
 const result=await w.CMHelperSearchMasterOffers({missing:entries,catalog:entries,language:'es',listPath:list});
 assert.equal(result.stopped,'');assert.equal(result.checked,32);assert.equal(result.covered,32);assert.equal(result.issues.length,0);
 const offers=result.results.flatMap(s=>s.items),fire=offers.find(o=>o.key==='MEE:2:holo');
 assert.equal(fire.article_id,'3001');assert.match(fire.url,/V2-MEE002/);assert.equal(fire.price_eur,.5);
 assert.equal(offers.find(o=>o.key==='CC:2:holo').article_id,'1001');assert.equal(offers.find(o=>o.key==='1:holo').article_id,'2000');
 const before=requested.length;assert.equal(await fire.verify(fire),true);assert.deepEqual(requested.slice(before),[energy+'/Basic-Fire-Energy-V2-MEE002']);
 const saved=result.snapshot(),network=requested.length;
 const restored=await w.CMHelperSearchMasterOffers({missing:entries,catalog:entries,language:'es',listPath:list,restore:saved});
 assert.equal(requested.length,network);assert.equal(restored.covered,32);
 assert.equal(await restored.results.flatMap(s=>s.items).find(o=>o.key==='MEE:2:holo').verify(fire),true);
 console.log('PASS: all 30 hyphenated Classic links, main/Classic separation, multiple MEE products, wrong suffix rejected, normal/reverse energy excluded, exact-product revalidation and cache restore.');
}finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
