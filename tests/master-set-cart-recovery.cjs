/* npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
 * NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-cart-recovery.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),listPath='/es/Pokemon/Products/Singles/30th-Celebration';
const entries=[10,75].map((n,i)=>({set:'30th Celebration',number:String(n).padStart(3,'0')+'/128',name:i?'Chandelure':'Ninetales',variant:'holo',tier:'master',language:'all'}));
const urls=entries.map((e,i)=>'https://www.cardmarket.com'+listPath+'/'+e.name+'-30C'+(i?'075':'010'));
const offers=entries.flatMap((e,i)=>['ItsOscar','SellerB'].map((seller,j)=>({...e,key:(i?'75':'10')+':holo',language:'Spanish',seller,price:.02+j*.01,price_eur:.02+j*.01,article_id:String(100+i*2+j),condition:'NM',country:'ES',url:urls[i]})));
const key='cm_master_cart_attempts_v1',blocked='30th Celebration|Spanish|10:holo';
const otherLanguage='30th Celebration|English|10:holo',otherSet='Mega Evolution|Spanish|10:holo';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<250;i++){if(await check())return;await sleep(20)}throw Error('Timed out')}
(async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com'+listPath,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.alert=()=>{};w.confirm=()=>true;
 let requests=0;w.fetch=()=>{requests++;throw Error('Recovery must reuse cached offers')};
 w.eval(fs.readFileSync(root+'/master-set-data-adapter.js','utf8'));await w.eval(fs.readFileSync(root+'/cardmarket-helper.js','utf8'));
 w.localStorage.setItem(key,JSON.stringify({[blocked]:Date.now(),[otherLanguage]:Date.now(),[otherSet]:Date.now()}));
 const scan={mappingVersion:4,createdAt:Date.now(),listPath,missing:entries,catalog:entries,language:'es',byNumber:[['10',[urls[0]]],['75',[urls[1]]]],offers,issues:[],checked:2,shipping:{itsoscar:0,sellerb:0}};
 const response=await w.CMHelperSearchMasterOffers({...scan,restore:scan});
 assert.equal(response.cartProcessedCount,1);
 const before=await response.analyze();assert.equal(before.best.coverage,1);assert.equal(before.best.selected['10:holo'],undefined);
 assert.ok(before.diagnostics.flatMap(s=>s.rows).some(r=>r.status==='Añadida al carrito anteriormente'));
 assert.equal(await response.resetCartProgress(),1);assert.equal(response.cartProcessedCount,0);
 const attempts=JSON.parse(w.localStorage.getItem(key));assert.equal(attempts[blocked],undefined);assert.ok(attempts[otherLanguage]);assert.ok(attempts[otherSet]);
 const after=await response.analyze();assert.equal(after.best.coverage,2);assert.equal(after.best.selected['10:holo'].seller,'ItsOscar');assert.equal(requests,0);
 // Recovery persists across fresh response objects, and is harmless twice.
 const restored=await w.CMHelperSearchMasterOffers({...scan,restore:response.snapshot()});
 assert.equal((await restored.analyze()).best.coverage,2);assert.equal(await restored.resetCartProgress(),0);
 // Exercise the visible recovery button and its persisted plan invalidation.
 w.localStorage.setItem(key,JSON.stringify({...attempts,[blocked]:Date.now()}));
 await w.CMMasterData.storeVerifiedCatalog('30th Celebration',entries,{source:'fixture'});
 await w.CMMasterData.importCollectionFile({name:'fixture.csv',text:async()=> 'Expansion,Card number,Card variant,Card language,Quantity\nOther,1,Normal,Spanish,1'});
 const inv=await w.CMMasterData.getSnapshot(),cat=await w.CMMasterData.getCatalog('30th Celebration');
 await w.CMMasterData.saveSearch('30th Celebration','es',JSON.parse(JSON.stringify({scan,analysis:before,feedback:{seller:'OldSeller',added:6},inventoryUpdatedAt:inv.updatedAt,catalogUpdatedAt:cat.updatedAt})));
 w.__cmMasterRegistry={sets:[{id:'30th Celebration',cardmarketSlugs:['30th-Celebration'],source:{url:'fixture'}}]};
 w.localStorage.setItem('cm_master_ui_settings_v1',JSON.stringify({lang:'es',tier:'master',lastPath:listPath}));
 w.eval(fs.readFileSync(root+'/master-set-ui.js','utf8'));w.CMMasterUI.mount();
 await until(()=>w.document.querySelector('#cm-master-recover-cart'));
 const button=w.document.querySelector('#cm-master-recover-cart');assert.equal(button.hidden,false);
 w.confirm=()=>false;button.click();assert.ok(JSON.parse(w.localStorage.getItem(key))[blocked]);
 w.confirm=()=>true;button.click();
 await until(()=>w.document.querySelector('#cm-master-ui')?.textContent.includes('2 variantes recomendadas'));
 assert.equal(w.document.querySelector('#cm-master-recover-cart').hidden,true);
 assert.equal(JSON.parse(w.localStorage.getItem(key))[blocked],undefined);
 const saved=await w.CMMasterData.getSearch('30th Celebration','es');
 await until(async()=> (await w.CMMasterData.getSearch('30th Celebration','es'))?.analysis?.best?.coverage===2);
 assert.equal(saved.feedback,null);assert.equal(requests,0);
 console.log('PASS cart recovery: prior additions excluded until explicit reset, variants return with another seller, set/language isolation, persistent reset, UI confirmation, cached plan recalculation, no market/cart requests.');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
