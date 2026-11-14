/* Shipping calibration through the authenticated cart. Never checks out an order.
 * Cart structure references: shipment-block/seller-info/summary and the native
 * ShoppingCart_RemoveArticle form, as used by the independent cart tools at
 * https://greasyfork.org/en/scripts/493868-cardmarket-compare-items-in-shopping-cart/code
 * No fabricated remove payloads: use the exact form delivered by Cardmarket.
 */
(()=>{'use strict';
if(window.CMShippingProbe)return;
const PENDING='cm_helper_shipping_probe_pending_v1';
const norm=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const money=text=>{
  const match=String(text).match(/(-?\d[\d.,\s\u00a0]*)\s*€/);
  if(!match)return null;
  const token=match[1].replace(/\s/g,'');
  const value=Number(token.includes(',')?token.replace(/\./g,'').replace(',','.'):token.replace(/,(?=\d{3}(?:\D|$))/g,''));
  return Number.isFinite(value)&&value>=0?value:null;
};
function pending(){
  const raw=localStorage.getItem(PENDING);if(!raw)return null;
  try{const value=JSON.parse(raw);if(!/^\d+$/.test(value.id)||!value.seller||!Number.isFinite(value.createdAt))throw Error();return value}
  catch{throw Error('El registro de una carta de prueba no se puede leer. Revisa el carrito antes de continuar.')}
}
function formArticleId(form){
  const ids=new Set();
  for(const input of form?.querySelectorAll('[name]')||[]){
    if(/^idArticles?/i.test(input.name)&&!/^idArticle(?:\[\])?$/i.test(input.name))return null;
    if(!/^idArticle(?:\[\])?$/i.test(input.name))continue;
    const value=input.value?.trim();
    if(/^\d+$/.test(value))ids.add(value);
    else try{const object=JSON.parse(value),keys=Object.keys(object);if(keys.length===1&&/^\d+$/.test(keys[0])&&String(object[keys[0]])===keys[0])ids.add(keys[0])}catch{}
  }
  return ids.size===1?[...ids][0]:null;
}
function parseCart(doc){
  if(doc.querySelector('input[type="password"]')||/just a moment|verify you are human|captcha|checking your browser/i.test(doc.title||''))throw Error('Cardmarket pide iniciar sesión o verificar el navegador.');
  const content=doc.querySelector('.shopping-cart-content');
  if(!content)throw Error('No se reconoce la página del carrito: falta el contenedor esperado.');
  const shipments=new Map();
  for(const block of content.querySelectorAll('.shipment-block')){
    const sellers=new Set([...block.querySelectorAll('.seller-info a[href*="/Users/"]')].map(a=>{
      const url=new URL(a.getAttribute('href'),location.origin);
      return url.origin===location.origin?decodeURIComponent(url.pathname.match(/\/Users\/([^/]+)/)?.[1]||''):'';
    }).filter(Boolean));
    if(sellers.size!==1)throw Error('No puedo identificar de forma única un vendedor del carrito.');
    const seller=[...sellers][0],key=norm(seller);
    if(shipments.has(key))throw Error('Hay varios envíos del mismo vendedor. Revisa los portes manualmente.');
    const costs=[];
    for(const row of block.querySelectorAll('.summary > *')){
      const label=norm(row.firstElementChild?.textContent).replace(/[:\s]+$/,'');
      if(!['gastos de envio','shipping costs','shipping cost','shipping'].includes(label))continue;
      const cost=money(row.lastElementChild?.textContent);if(cost!==null)costs.push(cost);
    }
    const uniqueCosts=new Set(costs),shipping=uniqueCosts.size===1?[...uniqueCosts][0]:null;
    const articles=new Map();
    for(const row of block.querySelectorAll('tr[data-product-id]')){
      if(row.closest('[hidden], .d-none'))continue;
      const forms=[...row.querySelectorAll('form[data-ajax-action="ShoppingCart_RemoveArticle"]')];
      const form=forms.length===1?forms[0]:null;
      const id=formArticleId(form)||row.getAttribute('data-article-id')||row.getAttribute('data-id-article');
      const quantityControl=row.querySelector('input[name^="amount"], select[name^="amount"]');
      const amount=quantityControl?Number(quantityControl.value):Number(row.querySelector('.amount')?.textContent.trim().match(/^(\d+)\s*x?$/i)?.[1]);
      if(!/^\d+$/.test(id||'')||!Number.isInteger(amount)||amount<1)throw Error('No puedo verificar el ID y la cantidad de una carta del carrito. Campos de retirada: '+[...form?.querySelectorAll('[name]')||[]].map(el=>el.name).join(', ')+'; atributos de fila: '+row.getAttributeNames().join(', '));
      if(articles.has(id))throw Error('El carrito contiene filas duplicadas que no puedo distinguir.');
      articles.set(id,{id,amount,form});
    }
    if(!articles.size)throw Error('No puedo leer las cartas de un envío del carrito.');
    shipments.set(key,{seller,shipping,articles});
  }
  if(!shipments.size&&!/carrito(?:\s+de\s+la\s+compra)?\s+(?:est[aá]\s+)?vac[ií]o|(?:shopping\s+)?cart\s+is\s+empty|no\s+(?:hay\s+)?art[ií]culos\s+en\s+(?:el|tu)\s+carrito/i.test(content.textContent))throw Error('No puedo confirmar que el carrito esté vacío.');
  return {shipments,doc};
}
const signature=cart=>JSON.stringify([...cart.shipments].flatMap(([seller,s])=>[...s.articles].map(([id,a])=>[seller,id,a.amount])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
function createTransport(){
  const prefix=location.pathname.match(/^\/(en|es)\/Pokemon\//)?.[0]||'/es/Pokemon/';
  const cartURL=new URL(prefix+'ShoppingCart',location.origin);
  let lastRequest=0;
  async function request(url,options={}){
    const wait=1200-(Date.now()-lastRequest);if(wait>0)await new Promise(r=>setTimeout(r,wait));
    lastRequest=Date.now();
    const response=await fetch(url,{credentials:'include',redirect:'error',...options});
    if(!response.ok)throw Error('Cardmarket HTTP '+response.status+' al comprobar portes.');
    const html=await response.text();
    if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))throw Error('Cardmarket ha pedido una verificación.');
    return html;
  }
  return {
    read:async()=>parseCart(new DOMParser().parseFromString(await request(cartURL.href),'text/html')),
    remove:async(article,cart)=>{
      const form=article.form;
      if(!form||formArticleId(form)!==article.id||form.dataset.ajaxAction!=='ShoppingCart_RemoveArticle')throw Error('No se reconoce el control para retirar solo la carta de prueba.');
      const url=new URL(prefix+'AjaxAction/'+form.dataset.ajaxAction,location.origin);
      const data=new FormData(form);
      if(!data.get('__cmtkn')){
        const token=cart.doc.querySelector('input[name="__cmtkn"]')?.value;
        if(!token)throw Error('No se encuentra el token para retirar la carta de prueba.');
        data.set('__cmtkn',token);
      }
      // POST exactly the single-article form. Never call RemoveSeller/EmptyCart.
      await request(url.href,{method:'POST',body:data});
    }
  };
}
async function recover(transport){
  const job=pending();if(!job)return false;
  const cart=await transport.read(),shipment=cart.shipments.get(norm(job.seller));
  const article=shipment?.articles.get(job.id);
  if(article){
  if(Date.now()-job.createdAt>30*60*1000)throw Error('La carta de prueba pendiente es antigua. Revisa y retira manualmente ese artículo del carrito.');
    if(article.amount!==1||shipment.articles.size!==1)throw Error('El envío de prueba ha cambiado. Revisa el carrito; no se retirará ninguna carta automáticamente.');
    await transport.remove(article,cart);
    const after=await transport.read();
    if(after.shipments.get(norm(job.seller))?.articles.has(job.id))throw Error('Cardmarket no confirmó la retirada de la carta de prueba.');
  }
  localStorage.removeItem(PENDING);return true;
}
async function run({candidates,add,verify,transport=createTransport(),signal,onProgress,onObserved}){
  if(pending())throw Error('Hay una carta de prueba pendiente de retirar. Resuélvela antes de comprobar otro vendedor.');
  const observed=[],failures=[];
  for(let i=0;i<candidates.length;i++){
    if(signal?.aborted)break;
    const offer=candidates[i];onProgress?.('Comprobando '+(i+1)+'/'+candidates.length+' · '+offer.seller);
    const before=await transport.read(),existing=before.shipments.get(norm(offer.seller));
    if(existing){
      if(existing.shipping===null){failures.push({seller:offer.seller,reason:'No se pudo leer el porte del envío existente'});continue}
      const observation={seller:offer.seller,value:existing.shipping,source:'cart-existing',measuredAt:Date.now()};observed.push(observation);await onObserved?.(observation);continue;
    }
    if(!offer.article_id||!await verify(offer)){failures.push({seller:offer.seller,reason:'La carta de prueba ya no coincide con la oferta'});continue}
    if(signal?.aborted)break;
    const job={id:String(offer.article_id),seller:offer.seller,createdAt:Date.now(),before:signature(before)};
    localStorage.setItem(PENDING,JSON.stringify(job));
    let value=null,error=null;
    try{
      await add(offer);
      const after=await transport.read(),shipment=after.shipments.get(norm(offer.seller));
      const article=shipment?.articles.get(job.id);
      if(!article||article.amount!==1||shipment.articles.size!==1)throw Error('No pude verificar la carta de prueba en el carrito.');
      value=shipment.shipping;
      if(value===null)throw Error('No pude leer los portes calculados por Cardmarket.');
    }catch(e){error=e}
    // Cleanup also runs after cancellation, an unknown add response, or a parse error.
    try{await recover(transport)}catch(e){throw Error(e.message+' Carta de prueba: '+offer.seller+' · artículo '+job.id+'. Revisa el carrito antes de continuar.')}
    const final=await transport.read();
    if(signature(final)!==job.before)throw Error('El contenido del carrito cambió durante la comprobación. Se ha detenido la ronda.');
    if(error){
      if(/HTTP\s*(?:403|429)|ANTIBOT|verificaci/i.test(error.message))throw error;
      failures.push({seller:offer.seller,reason:error.message});continue;
    }
    const observation={seller:offer.seller,value,source:'cart-probe',measuredAt:Date.now()};observed.push(observation);await onObserved?.(observation);
  }
  return {observed,failures,stopped:!!signal?.aborted};
}
window.CMShippingProbe={parseCart,formArticleId,signature,pending,createTransport,recover,run,version:'0.1.0'};
})();
