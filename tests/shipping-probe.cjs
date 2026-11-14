/* NODE_PATH=/tmp/cmhelper-tests/node_modules node --test tests/shipping-probe.cjs */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../cardmarket-shipping-probe.js'),'utf8');
const empty='<div class="shopping-cart-content">Tu carrito está vacío</div>';
const block=(seller,id,amount=1,cost='4,20')=>`<div class="shipment-block"><div class="seller-info"><a href="/es/Pokemon/Users/${seller}">${seller}</a></div><div class="summary"><div><span>Valor del pedido</span><span>0,02 €</span></div><div><span>Gastos de envío</span><span>${cost} €</span></div><div><span>Total</span><span>99,99 €</span></div></div><table><tbody><tr data-product-id="42"><td class="amount">${amount}x</td><td class="name">A card</td><td><form data-ajax-action="ShoppingCart_RemoveArticle"><input name="idArticle" value="${id}"><input name="__cmtkn" value="not-exported"></form></td></tr></tbody></table></div>`;
function setup(){const dom=new JSDOM('',{url:'https://www.cardmarket.com/es/Pokemon/Products/Singles/30th-Celebration',runScripts:'dangerously'});dom.window.eval(source);return {dom,w:dom.window,api:dom.window.CMShippingProbe}}
function fake(env,{existing=false,failRemove=false,unknownAdd=false,abort,shippingMissing=false}={}){
 let cart=existing?block('Other',90,2):'',adds=0,removes=0;
 const parse=()=>env.api.parseCart(new env.w.DOMParser().parseFromString(cart?'<div class="shopping-cart-content">'+cart+'</div>':empty,'text/html'));
 const transport={read:async()=>parse(),remove:async(article)=>{removes++;if(!failRemove)cart=cart.replace(block('SellerA',101,1,shippingMissing?'?':'4,20'),'')}};
 return {transport,verify:async()=>true,add:async()=>{adds++;cart+=block('SellerA',101,1,shippingMissing?'?':'4,20');abort?.abort();if(unknownAdd)throw Error('Unknown add response')},stats:()=>({cart,adds,removes}),fix:()=>{failRemove=false}};
}
const offer={seller:'SellerA',article_id:'101',price_eur:.02};
test('reads only the shipping row, preserves EUR zero, rejects unknown carts and ambiguous amounts',()=>{
 const env=setup();try{
 const parse=html=>env.api.parseCart(new env.w.DOMParser().parseFromString(html,'text/html'));
 const cart=parse('<div class="shopping-cart-content">'+block('SellerA',101)+'</div>');
 assert.equal(cart.shipments.get('sellera').shipping,4.2);
 assert.equal(parse('<div class="shopping-cart-content">'+block('SellerA',101,1,'0,00')+'</div>').shipments.get('sellera').shipping,0);
 assert.throws(()=>parse('<form><input type="password"></form>'));
 assert.throws(()=>parse('<div class="shopping-cart-content"></div>'));
 assert.throws(()=>parse('<div class="shopping-cart-content">'+block('A',101).replace('1x','?')+'</div>'));
 assert.equal(parse('<div class="shopping-cart-content">'+block('A',101).replace('Gastos de envío','Total incorrecto')+'</div>').shipments.get('a').shipping,null);
 }finally{env.w.close()}
});
test('adds one test card, observes shipping, removes only that card and preserves the previous cart',async()=>{
 const env=setup();try{const io=fake(env,{existing:true});env.w.localStorage.setItem('cm_master_cart_attempts_v1','{"keep":1}');
 const result=await env.api.run({candidates:[offer],...io});
 assert.equal(result.observed[0].value,4.2);assert.equal(io.stats().adds,1);assert.equal(io.stats().removes,1);assert.equal(io.stats().cart,block('Other',90,2));
 assert.equal(env.api.pending(),null);assert.equal(env.w.localStorage.getItem('cm_master_cart_attempts_v1'),'{"keep":1}');
 }finally{env.w.close()}
});
test('existing seller cart is read without adding or removing anything',async()=>{
 const env=setup();try{let mutations=0;const cart=env.api.parseCart(new env.w.DOMParser().parseFromString('<div class="shopping-cart-content">'+block('SellerA',50,3)+'</div>','text/html'));
 const result=await env.api.run({candidates:[offer],transport:{read:async()=>cart,remove:async()=>mutations++},verify:async()=>{throw Error('Must not verify an extra card')},add:async()=>mutations++});
 assert.equal(result.observed[0].source,'cart-existing');assert.equal(mutations,0);
 }finally{env.w.close()}
});
test('unknown add responses and unreadable prices still clean up, and never produce an observation',async()=>{
 for(const options of [{unknownAdd:true},{shippingMissing:true}]){const env=setup();try{const io=fake(env,options);const result=await env.api.run({candidates:[offer],...io});
 assert.equal(result.observed.length,0);assert.equal(result.failures.length,1);assert.equal(io.stats().removes,1);assert.equal(env.api.pending(),null);
 }finally{env.w.close()}}
});
test('cancel waits for cleanup; a failed cleanup persists and blocks the next probe until recovered',async()=>{
 const env=setup();try{const controller=new env.w.AbortController(),io=fake(env,{abort:controller});
 const result=await env.api.run({candidates:[offer,{...offer,seller:'Second'}],signal:controller.signal,...io});
 assert.equal(result.stopped,true);assert.equal(io.stats().adds,1);assert.equal(io.stats().removes,1);
 const failing=fake(env,{failRemove:true});await assert.rejects(env.api.run({candidates:[offer],...failing}),/no confirmó/);
 assert.ok(env.api.pending());await assert.rejects(env.api.run({candidates:[offer],...failing}),/pendiente/);assert.equal(failing.stats().adds,1);
 failing.fix();assert.equal(await env.api.recover(failing.transport),true);assert.equal(env.api.pending(),null);
 }finally{env.w.close()}
});
test('actual transport posts the exact native single-article form and verifies removal by reading the cart again',async()=>{
 const env=setup();try{
 const original=env.w.setTimeout.bind(env.w);env.w.setTimeout=(fn,ms)=>original(fn,Math.min(ms,1));
 const calls=[];let cart=block('SellerA',101);
 env.w.fetch=async(url,options)=>{calls.push({url:String(url),options});if(options.method==='POST'){assert.match(String(url),/AjaxAction\/ShoppingCart_RemoveArticle$/);assert.equal(options.body.get('idArticle'),'101');assert.equal(options.body.get('__cmtkn'),'not-exported');cart='';return {ok:true,text:async()=>'<response>ok</response>'}}return {ok:true,text:async()=>cart?'<div class="shopping-cart-content">'+cart+'</div>':empty}};
 env.w.localStorage.setItem('cm_helper_shipping_probe_pending_v1',JSON.stringify({id:'101',seller:'SellerA',createdAt:Date.now()}));
 await env.api.recover(env.api.createTransport());assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(env.api.pending(),null);
 }finally{env.w.close()}
});
