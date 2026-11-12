/* npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
 * NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-budget-performance.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),listPath='/es/Pokemon/Products/Singles/30th-Celebration';
const entries=Array.from({length:40},(_,i)=>({set:'30th Celebration',number:String(i+1).padStart(3,'0')+'/128',name:'Card'+(i+1),variant:'holo',tier:'master',language:'all'}));
const sellers=Array.from({length:200},(_,i)=>'Seller'+String(i).padStart(3,'0'));
const offers=sellers.flatMap((seller,i)=>entries.map((e,j)=>({...e,key:(j+1)+':holo',language:'Spanish',seller,price:.02,price_eur:.02,article_id:String(1000+i*40+j),condition:'NM',country:'ES',url:'https://www.cardmarket.com'+listPath+'/'+e.name+'-30C'+String(j+1).padStart(3,'0')})));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<500;i++){if(await check())return;await sleep(20)}throw Error('Timed out')}
(async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com'+listPath,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.alert=()=>{};
 w.fetch=()=>{throw Error('Changing the budget must reuse offers')};
 w.eval(fs.readFileSync(root+'/master-set-data-adapter.js','utf8'));await w.eval(fs.readFileSync(root+'/cardmarket-helper.js','utf8'));
 w.localStorage.setItem('cm_master_cart_attempts_v1',JSON.stringify(Object.fromEntries(Array.from({length:1000},(_,i)=>['Other|Spanish|'+i+':holo',Date.now()]))));
 const proto=Object.getPrototypeOf(w.localStorage),getItem=proto.getItem;
 let reads=0;proto.getItem=function(key){if(key==='cm_master_cart_attempts_v1')reads++;return getItem.call(this,key)};
 const scan={mappingVersion:4,createdAt:Date.now(),listPath,missing:entries,catalog:entries,language:'es',byNumber:entries.map((e,i)=>[String(i+1),[offers[i].url]]),offers,issues:[],checked:40,shipping:Object.fromEntries(sellers.map(s=>[s.toLowerCase(),.02]))};
 const response=await w.CMHelperSearchMasterOffers({...scan,restore:scan});reads=0;
 let heartbeat=false;w.setTimeout(()=>{heartbeat=true},0);
 const started=w.performance.now(),analysis=await response.analyze(),elapsed=w.performance.now()-started;
 assert.equal(analysis.best.coverage,40);assert.ok(Math.abs(analysis.best.total-.82)<1e-8);assert.ok(heartbeat,'analysis must yield so input events can run');assert.ok(reads<=3,'attempts must be read once per stage, not for every offer');
 await w.CMMasterData.storeVerifiedCatalog('30th Celebration',entries,{source:'fixture'});
 await w.CMMasterData.importCollectionFile({name:'fixture.csv',text:async()=> 'Expansion,Card number,Card variant,Card language,Quantity\nOther,1,Normal,Spanish,1'});
 const inv=await w.CMMasterData.getSnapshot(),cat=await w.CMMasterData.getCatalog('30th Celebration');
 await w.CMMasterData.saveSearch('30th Celebration','es',JSON.parse(JSON.stringify({scan:response.snapshot(),analysis,inventoryUpdatedAt:inv.updatedAt,catalogUpdatedAt:cat.updatedAt})));
 w.__cmMasterRegistry={sets:[{id:'30th Celebration',cardmarketSlugs:['30th-Celebration'],source:{url:'fixture'}}]};
 let runs=0;const search=w.CMHelperSearchMasterOffers;
 w.CMHelperSearchMasterOffers=async args=>{const result=await search(args),analyze=result.analyze;result.analyze=async()=>{runs++;return analyze()};return result};
 w.eval(fs.readFileSync(root+'/master-set-ui.js','utf8'));w.CMMasterUI.mount();
 await until(()=>w.document.querySelector('#cm-master-ui')?.textContent.includes('40 variantes recomendadas'));
 assert.equal(w.document.querySelectorAll('#cm-master-ui a').length,0,'closed seller lists must not create 8,000 offer rows');
 const detail=[...w.document.querySelectorAll('#cm-master-ui details')].find(d=>d.querySelector('summary').textContent.startsWith('Seller000'));
 detail.open=true;await until(()=>detail.querySelectorAll('a').length===40);assert.match(detail.textContent,/Incluida en el plan|Asignada a otro vendedor/);
 detail.open=false;await until(()=>detail.querySelectorAll('a').length===0);
 const input=w.document.querySelector('#cm-cart-max-price'),apply=w.document.querySelector('#cm-apply-budget');
 for(const value of ['0','0.1','0.10']){input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}))}
 assert.equal(runs,0,'typing must never trigger analysis');assert.match(w.document.querySelector('#cm-budget-status').textContent,/pendiente/);
 apply.click();apply.click();
 await until(()=>!apply.disabled&&w.document.querySelector('#cm-master-ui').textContent.includes('4 variantes recomendadas'));
 assert.equal(runs,1,'double click must not run concurrent plans');
 input.value='';input.dispatchEvent(new w.Event('input',{bubbles:true}));apply.click();
 await until(()=>!apply.disabled&&w.document.querySelector('#cm-master-ui').textContent.includes('40 variantes recomendadas'));
 assert.equal(runs,2);
 console.log('PASS 8,000 offers / 1,000 cart marks: analysis '+Math.round(elapsed)+' ms, bounded storage reads, event-loop yield, lazy seller rows, budget typing without analysis, single Apply, tighter budget and no-limit recalculation.');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
