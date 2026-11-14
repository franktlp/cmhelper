/* Read shipping from the existing authenticated cart. This module never adds
 * cards. Native removal is retained only for explicit recovery of a pending
 * test card created by release 1.6.0. Normal shipping updates issue GET only.
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
function parseCart(doc,{shippingOnly=false}={}){
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
    for(const row of shippingOnly?[]:block.querySelectorAll('tr[data-product-id]')){
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
    if(!shippingOnly&&!articles.size)throw Error('No puedo leer las cartas de un envío del carrito.');
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
    read:async({shippingOnly=false}={})=>parseCart(new DOMParser().parseFromString(await request(cartURL.href),'text/html'),{shippingOnly}),
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
async function readExisting({transport=createTransport(),signal,onProgress}={}){
  if(signal?.aborted)return {observed:[],failures:[],stopped:true};
  onProgress?.('Leyendo los portes de los vendedores que ya están en el carrito…');
  const cart=await transport.read({shippingOnly:true});
  if(signal?.aborted)return {observed:[],failures:[],stopped:true};
  const observed=[],failures=[];
  for(const shipment of cart.shipments.values()){
    if(shipment.shipping===null)failures.push({seller:shipment.seller,reason:'No se pudo leer un importe de envío único'});
    else observed.push({seller:shipment.seller,value:shipment.shipping,source:'cart-existing',measuredAt:Date.now()});
  }
  return {observed,failures,stopped:false};
}
window.CMShippingProbe={parseCart,formArticleId,signature,pending,createTransport,recover,readExisting,version:'0.2.0'};
})();
