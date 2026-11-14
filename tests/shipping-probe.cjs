/* NODE_PATH=/tmp/cmhelper-tests/node_modules node --test tests/shipping-probe.cjs */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../cardmarket-shipping-probe.js'),'utf8');
const empty='<div class="shopping-cart-content">Tu carrito está vacío</div>';
const block=(seller,id,amount=1,cost='4,20')=>`<div class="shipment-block"><div class="seller-info"><a href="/es/Pokemon/Users/${seller}">${seller}</a></div><div class="summary"><div><span>Valor del pedido</span><span>0,02 €</span></div><div><span>Gastos de envío</span><span>${cost} €</span></div><div><span>Total</span><span>99,99 €</span></div></div><table><tbody><tr data-product-id="42"><td class="amount">${amount}x</td><td class="name">A card</td><td><form data-ajax-action="ShoppingCart_RemoveArticle"><input name="idArticle" value="${id}"><input name="__cmtkn" value="not-exported"></form></td></tr></tbody></table></div>`;
function setup(){const dom=new JSDOM('',{url:'https://www.cardmarket.com/es/Pokemon/Products/Singles/30th-Celebration',runScripts:'dangerously'});dom.window.eval(source);return {dom,w:dom.window,api:dom.window.CMShippingProbe}}
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
test('shipping updates are read-only and do not require article IDs or removal controls',async()=>{
 const env=setup();try{
 let reads=0,mutations=0;
 const html='<div class="shopping-cart-content">'+block('SellerA',101).replace(/<form[\s\S]*?<\/form>/,'')+'</div>';
 const result=await env.api.readExisting({transport:{read:async options=>{reads++;assert.equal(options.shippingOnly,true);return env.api.parseCart(new env.w.DOMParser().parseFromString(html,'text/html'),options)},remove:async()=>{mutations++;throw Error('No removal allowed')}}});
 assert.equal(result.observed[0].value,4.2);assert.equal(result.observed[0].source,'cart-existing');assert.equal(reads,1);assert.equal(mutations,0);
 assert.equal(env.api.run,undefined,'automatic add/remove probe API must be removed');assert.equal(env.api.pending(),null);
 }finally{env.w.close()}
});
test('cancelled reads make no requests, and empty carts produce no observations',async()=>{
 const env=setup();try{
 const controller=new env.w.AbortController();controller.abort();
 const cancelled=await env.api.readExisting({signal:controller.signal,transport:{read:async()=>{throw Error('No request expected')}}});assert.equal(cancelled.stopped,true);
 const result=await env.api.readExisting({transport:{read:async options=>env.api.parseCart(new env.w.DOMParser().parseFromString(empty,'text/html'),options)}});
 assert.equal(result.observed.length,0);assert.equal(env.api.pending(),null);
 }finally{env.w.close()}
});
test('legacy recovery alone may post the native single-article removal form, then verifies it',async()=>{
 const env=setup();try{
 const original=env.w.setTimeout.bind(env.w);env.w.setTimeout=(fn,ms)=>original(fn,Math.min(ms,1));
 const calls=[];let cart=block('SellerA',101);
 env.w.fetch=async(url,options)=>{calls.push({url:String(url),options});if(options.method==='POST'){assert.match(String(url),/AjaxAction\/ShoppingCart_RemoveArticle$/);assert.equal(options.body.get('idArticle'),'101');assert.equal(options.body.get('__cmtkn'),'not-exported');cart='';return {ok:true,text:async()=>'<response>ok</response>'}}return {ok:true,text:async()=>cart?'<div class="shopping-cart-content">'+cart+'</div>':empty}};
 env.w.localStorage.setItem('cm_helper_shipping_probe_pending_v1',JSON.stringify({id:'101',seller:'SellerA',createdAt:Date.now()}));
 await env.api.recover(env.api.createTransport());assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(env.api.pending(),null);
 }finally{env.w.close()}
});
