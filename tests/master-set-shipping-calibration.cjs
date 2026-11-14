/* npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
 * NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/master-set-shipping-calibration.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),listPath='/es/Pokemon/Products/Singles/30th-Celebration';
const entries=[1,2].map(n=>({set:'30th Celebration',number:String(n).padStart(3,'0')+'/128',name:'Card'+n,variant:'holo',tier:'master',language:'all'}));
const offers=entries.flatMap((e,j)=>['SellerA','SellerB'].map((seller,i)=>({...e,key:(j+1)+':holo',language:'Spanish',seller,price:.02+i*.01,price_eur:.02+i*.01,article_id:String(100+i*100+j),condition:'NM',country:'ES',url:'https://www.cardmarket.com'+listPath+'/'+e.name+'-30C00'+(j+1)})));
const block=(seller,id,cost,amount=1)=>`<div class="shipment-block"><div class="seller-info"><a href="/es/Pokemon/Users/${seller}">${seller}</a></div><div class="summary"><div><span>Gastos de envío</span><span>${cost.toFixed(2).replace('.',',')} €</span></div></div><table><tbody><tr data-product-id="42"><td class="amount">${amount}x</td><td><form data-ajax-action="ShoppingCart_RemoveArticle"><input name="idArticle" value="${id}"><input name="__cmtkn" value="fixture"></form></td></tr></tbody></table></div>`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check){for(let i=0;i<500;i++){if(await check())return;await sleep(20)}throw Error('Timed out')}
(async()=>{
 const dom=new JSDOM('<!doctype html><body><input name="__cmtkn" value="fixture"></body>',{url:'https://www.cardmarket.com'+listPath,runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.alert=()=>{};w.confirm=()=>true;
 const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>timer(fn,Math.min(ms,1),...args);
 const originalCart=block('KeepMyCards',900,2,2);let trial='',adds=[],removes=[],cartReads=0;
 w.fetch=async(input,options={})=>{
  const url=new URL(input);let text;
  if(url.pathname.endsWith('/ShoppingCart')){cartReads++;text='<div class="shopping-cart-content">'+originalCart+trial+'</div>'}
  else if(url.pathname.endsWith('/AjaxAction/ShoppingCart_Add_AddArticlesFromProductPage')){
    const id=Object.keys(JSON.parse(options.body.get('idArticle')))[0];assert.equal(JSON.parse(options.body.get('amount'))[id],'1');adds.push(id);
    trial=block(Number(id)>=200?'SellerB':'SellerA',id,Number(id)>=200?1:4.2);text='<response><resultType>c3VjY2Vzcw==</resultType><updatedRows>1</updatedRows></response>';
  }else if(url.pathname.endsWith('/AjaxAction/ShoppingCart_RemoveArticle')){const id=options.body.get('idArticle');assert.notEqual(id,'900');removes.push(id);trial='';text='<response>ok</response>'}
  else if(url.pathname.startsWith(listPath+'/')){
    const number=url.pathname.endsWith('002')?2:1;
    text=offers.filter(o=>o.key===number+':holo').map(o=>`<div class="article-row" data-article-id="${o.article_id}"><a href="/es/Users/${o.seller}">${o.seller}</a><i title="Español"></i><div class="article-condition"><span class="badge">NM</span></div><div class="price-container"><b class="fw-bold">${o.price_eur.toFixed(2).replace('.',',')} €</b></div></div>`).join('');
  }else throw Error('Unexpected request: '+url.pathname);
  assert.doesNotMatch(url.pathname,/Checkout|RemoveSeller|Empty/);return {ok:true,status:200,text:async()=>text};
 };
 for(const name of ['master-set-data-adapter.js','cardmarket-helper.js','cardmarket-shipping-probe.js'])await w.eval(fs.readFileSync(root+'/'+name,'utf8'));
 const scan={mappingVersion:4,createdAt:Date.now(),listPath,missing:entries,catalog:entries,language:'es',byNumber:[['1',[offers[0].url]],['2',[offers[2].url]]],offers,issues:[],checked:2,shipping:{sellera:.02,sellerb:2}};
 const response=await w.CMHelperSearchMasterOffers({...scan,restore:scan});assert.equal((await response.analyze()).best.chosen[0],'SellerA');
 const result=await response.calibrateShipping();
 assert.equal(result.stopped,'');assert.equal(result.pending,false);assert.equal(result.unverified.length,0);assert.equal(result.analysis.best.chosen[0],'SellerB');assert.equal(result.observed.length,2);
 assert.deepEqual(adds,['100','200']);assert.deepEqual(removes,['100','200']);assert.equal(trial,'');
 const saved=JSON.parse(w.localStorage.getItem('cm_helper_shipping_overrides_v1'));
 assert.equal(saved.sellera.value,4.2);assert.equal(saved.sellerb.value,1);assert.equal(saved.sellerb.source,'cart-probe');assert.equal(response.cartProcessedCount,0);
 const count=cartReads;const again=await response.calibrateShipping();assert.equal(again.observed.length,0);assert.equal(cartReads,count,'cached observed ports must not trigger new probes');
 // UI reuses the already calibrated plan. Clicking Add later is a separate action.
 await w.CMMasterData.storeVerifiedCatalog('30th Celebration',entries,{source:'fixture'});
 await w.CMMasterData.importCollectionFile({name:'fixture.csv',text:async()=> 'Expansion,Card number,Card variant,Card language,Quantity\nOther,1,Normal,Spanish,1'});
 const inv=await w.CMMasterData.getSnapshot(),cat=await w.CMMasterData.getCatalog('30th Celebration');
 await w.CMMasterData.saveSearch('30th Celebration','es',JSON.parse(JSON.stringify({scan:response.snapshot(),analysis:result.analysis,calibration:{...result,analysis:undefined},inventoryUpdatedAt:inv.updatedAt,catalogUpdatedAt:cat.updatedAt})));
 w.__cmMasterRegistry={sets:[{id:'30th Celebration',cardmarketSlugs:['30th-Celebration'],source:{url:'fixture'}}]};
 w.eval(fs.readFileSync(root+'/master-set-ui.js','utf8'));w.CMMasterUI.mount();
 await until(()=>w.document.querySelector('#cm-master-ui')?.textContent.includes('CSV: fixture.csv')&&w.document.querySelector('#cm-master-ui').textContent.includes('2 variantes recomendadas'));
 assert.match(w.document.querySelector('#cm-master-ui').textContent,/2 vendedores comprobados/);
 assert.equal(w.document.querySelector('#cm-master-calibrate-shipping').disabled,false);
 assert.equal(cartReads,count);assert.equal(response.cartProcessedCount,0);
 console.log('PASS full shipping calibration: native add/remove forms, exact one-card probes, previous cart preserved, 2 rounds switch the plan from A to B, observed ports cached, no duplicate protection marks and no automatic re-probe after choosing.');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
