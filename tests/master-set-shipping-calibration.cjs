/* NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-shipping-calibration.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),listPath='/es/Pokemon/Products/Singles/30th-Celebration';
const entries=[1,2].map(n=>({set:'30th Celebration',number:String(n).padStart(3,'0')+'/128',name:'Card'+n,variant:'holo',tier:'master',language:'all'}));
const offers=entries.flatMap((e,j)=>['SellerA','SellerB','NotInCart'].map((seller,i)=>({...e,key:(j+1)+':holo',language:'Spanish',seller,price:.02+i*.01,price_eur:.02+i*.01,article_id:String(100+i*100+j),condition:'NM',country:'ES',url:'https://www.cardmarket.com'+listPath+'/'+e.name+'-30C00'+(j+1)})));
const block=(seller,cost)=>`<div class="shipment-block"><div class="seller-info"><a href="/es/Pokemon/Users/${seller}">${seller}</a></div><div class="summary"><div><span>Gastos de envío</span><span>${cost.toFixed(2).replace('.',',')} €</span></div></div><table><tbody><tr data-product-id="42"><td class="amount">2x</td><td>Existing card without a remove form</td></tr></tbody></table></div>`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<500;i++){if(await check())return;await sleep(20)}throw Error('Timed out')}
(async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com'+listPath,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.alert=()=>{};w.confirm=()=>{throw Error('Reading shipping must not ask to add test cards')};
 let cartReads=0;const originalCart='<div class="shopping-cart-content">'+block('SellerA',4.2)+block('SellerB',1)+'</div>';
 w.fetch=async(input,options={})=>{assert.notEqual(options.method,'POST','shipping updates must never mutate the cart');assert.match(String(input),/\/es\/Pokemon\/ShoppingCart$/);cartReads++;return {ok:true,status:200,text:async()=>originalCart}};
 for(const name of ['master-set-data-adapter.js','cardmarket-helper.js','cardmarket-shipping-probe.js'])await w.eval(fs.readFileSync(root+'/'+name,'utf8'));
 const scan={mappingVersion:4,createdAt:Date.now(),listPath,missing:entries,catalog:entries,language:'es',byNumber:[['1',[offers[0].url]],['2',[offers[3].url]]],offers,issues:[],checked:2,shipping:{sellera:.02,sellerb:2,notincart:3}};
 const response=await w.CMHelperSearchMasterOffers({...scan,restore:scan});assert.equal((await response.analyze()).best.chosen[0],'SellerA');
 const result=await response.calibrateShipping();
 assert.equal(result.stopped,'');assert.equal(result.mode,'cart-read-only');assert.equal(result.analysis.best.chosen[0],'SellerB');assert.equal(result.observed.length,2);assert.equal(cartReads,1);
 const saved=JSON.parse(w.localStorage.getItem('cm_helper_shipping_overrides_v1'));
 assert.equal(saved.sellera.value,4.2);assert.equal(saved.sellerb.value,1);assert.equal(saved.sellerb.source,'cart-existing');assert.equal(saved.notincart,undefined);
 assert.equal(response.shippingSellers().find(s=>s.seller==='NotInCart').shipping,3);assert.equal(response.cartProcessedCount,0);assert.equal(w.CMShippingProbe.pending(),null);
 await w.CMMasterData.storeVerifiedCatalog('30th Celebration',entries,{source:'fixture'});
 await w.CMMasterData.importCollectionFile({name:'fixture.csv',text:async()=> 'Expansion,Card number,Card variant,Card language,Quantity\nOther,1,Normal,Spanish,1'});
 const inv=await w.CMMasterData.getSnapshot(),cat=await w.CMMasterData.getCatalog('30th Celebration');
 await w.CMMasterData.saveSearch('30th Celebration','es',JSON.parse(JSON.stringify({scan:response.snapshot(),analysis:result.analysis,inventoryUpdatedAt:inv.updatedAt,catalogUpdatedAt:cat.updatedAt})));
 w.__cmMasterRegistry={sets:[{id:'30th Celebration',cardmarketSlugs:['30th-Celebration'],source:{url:'fixture'}}]};
 w.eval(fs.readFileSync(root+'/master-set-ui.js','utf8'));w.CMMasterUI.mount();
 await until(()=>w.document.querySelector('#cm-master-ui')?.textContent.includes('CSV: fixture.csv')&&w.document.querySelector('#cm-master-ui').textContent.includes('2 variantes recomendadas'));
 const button=w.document.querySelector('#cm-master-calibrate-shipping');assert.equal(button.textContent,'Actualizar portes desde el carrito');
 button.click();await until(()=>cartReads===2&&w.document.querySelector('#cm-master-ui').textContent.includes('2 vendedores con portes leídos del carrito'));
 assert.equal(w.CMShippingProbe.run,undefined);assert.equal(response.cartProcessedCount,0);
 console.log('PASS: one cart GET, no POSTs/additions/removals or stock verification, updates existing sellers only, recalculates cached plan, retains other estimates, read-only UI without mutation confirmation.');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
