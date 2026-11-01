(() => {
  'use strict';

  const VERSION='0.5.0';
  const BANNER_ID='cm-id-catalog-banner';
  const STORE_KEY='cm_helper_product_id_catalog_v1';
  const EXPANSION_DB_KEY='cm_helper_expansion_db';
  const BATCH_SIZE=35;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const jitter=(base,spread=1000)=>Math.max(500,base+Math.floor(Math.random()*spread));

  if(!location.hostname.endsWith('cardmarket.com')||!/\/Pokemon\//i.test(location.pathname)) return;
  document.getElementById(BANNER_ID)?.remove();

  const norm=s=>String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const loadJSON=(k,d={})=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))||d;}catch{return d;}};
  const loadCatalog=()=>loadJSON(STORE_KEY,{});
  const saveCatalog=x=>localStorage.setItem(STORE_KEY,JSON.stringify(x||{}));
  const csvEscape=v=>{v=String(v??'');return /[;"\n\r]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;};
  const download=(filename,text)=>{const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);};

  function expansionSlugFromUrl(raw=location.href){try{const m=decodeURIComponent(new URL(raw,location.origin).pathname).match(/\/Pokemon\/Products\/Singles\/([^/?#]+)/i);return m?m[1]:'';}catch{return '';}}
  function isExpansionPage(){return /\/Pokemon\/Products\/Singles\/[^/]+\/?$/i.test(decodeURIComponent(location.pathname));}
  function canonicalProductUrl(raw){
    try{
      const u=new URL(raw,location.origin), parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
      const i=parts.findIndex((x,n)=>x.toLowerCase()==='singles'&&String(parts[n-2]||'').toLowerCase()==='products');
      if(i<0||!parts[i+1]||!parts[i+2]||parts[i+3]) return '';
      return `${u.origin}/${parts.slice(0,i+3).join('/')}`;
    }catch{return '';}
  }
  function productTail(raw){try{return decodeURIComponent(new URL(raw,location.origin).pathname).split('/').filter(Boolean).pop()||'';}catch{return '';}}
  function parseTailForCodeNumber(raw){const m=productTail(raw).match(/-([A-Za-z0-9]+?)(\d{3,4}[A-Za-z]?)$/);return m?{code:m[1].toUpperCase(),number:String(parseInt(m[2],10))}:null;}

  function inferCode(doc=document,slug=expansionSlugFromUrl()){
    const db=loadJSON(EXPANSION_DB_KEY,{}), sn=norm(slug);
    for(const [code,e] of Object.entries(db)){
      const vals=[e?.slug,e?.name,e?.label].filter(Boolean).map(norm);
      if(vals.some(v=>v===sn||v.includes(sn)||sn.includes(v))) return String(code).toUpperCase();
    }
    const counts={};
    for(const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')){
      const p=parseTailForCodeNumber(a.getAttribute('href')||a.href||'');
      if(p) counts[p.code]=(counts[p.code]||0)+1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  }

  function visiblePrintedNumber(root,code){
    const text=(root?.textContent||'').replace(/\s+/g,' '), escaped=String(code||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    for(const rx of [new RegExp(`\\(\\s*${escaped}\\s+0*(\\d{1,4}[A-Za-z]?)\\s*\\)`,'i'),new RegExp(`\\b${escaped}\\s*[-#]?\\s*0*(\\d{1,4}[A-Za-z]?)\\b`,'i'),/(?:Card\s*Number|Collector(?:'s)?\s*Number|Número\s+de\s+carta|Numero\s+de\s+carta|Kartennummer)\s*[:#]?\s*0*(\d{1,4}[A-Za-z]?)/i]){
      const m=text.match(rx); if(m) return String(parseInt(m[1],10));
    }
    return '';
  }

  function idFromMediaUrl(raw){if(!raw)return '';let s='';try{s=decodeURIComponent(String(raw));}catch{s=String(raw);}for(const rx of [/(?:product|products|product-images?|images?\/products?)[\/_-](\d{5,})/i,/\/(\d{5,})(?:\.(?:jpg|jpeg|png|webp)|\/)/i,/(?:idProduct|productId)[=/_-](\d{5,})/i]){const m=s.match(rx);if(m)return m[1];}return '';}
  function extractProductId(root){
    if(!root)return '';
    for(const el of root.querySelectorAll?.('[data-product-id],[data-id-product],input[name="idProduct"],input[name="idProducts"],[name="idProduct"]')||[]){
      for(const v of [el.value,el.getAttribute('data-product-id'),el.getAttribute('data-id-product'),el.getAttribute('value')]) if(/^\d+$/.test(String(v||'').trim())) return String(v).trim();
    }
    for(const el of root.querySelectorAll?.('img[src],img[data-src],source[srcset],a[href],form[action]')||[]){
      for(const raw of [el.getAttribute('src'),el.getAttribute('data-src'),el.getAttribute('srcset'),el.getAttribute('href'),el.getAttribute('action')].filter(Boolean)){
        try{const u=new URL(raw,location.origin),q=u.searchParams.get('idProduct')||u.searchParams.get('idProducts');if(/^\d+$/.test(String(q||'')))return String(q);}catch{}
        const id=idFromMediaUrl(raw);if(id)return id;
      }
    }
    const html=root.documentElement?.innerHTML||root.outerHTML||'';
    for(const rx of [/["']idProduct["']\s*[:=]\s*["']?(\d{4,})/i,/["']productId["']\s*[:=]\s*["']?(\d{4,})/i,/data-product-id=["'](\d{4,})["']/i,/(?:\?|&|&amp;)idProduct=(\d{4,})/i]){const m=html.match(rx);if(m)return m[1];}
    return '';
  }

  function nameFromUrl(url,code){let tail=productTail(url);tail=tail.replace(new RegExp(`-${code}\\d{3,4}[A-Za-z]?$`,'i'),'');return tail.replace(/-/g,' ').trim();}
  function productLinksFromDoc(doc,code){
    const map=new Map(),slug=expansionSlugFromUrl(location.href);
    for(const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')){
      const canonical=canonicalProductUrl(a.getAttribute('href')||a.href||'');
      if(!canonical||expansionSlugFromUrl(canonical)!==slug) continue;
      const parsed=parseTailForCodeNumber(canonical);
      if(!parsed || parsed.code!==code) continue; // CRÍTICO: solo fichas reales CODE+NÚMERO
      const row=a.closest('.row,.product-row,article,li,tr,.table-body,.card,.product')||a.parentElement;
      const name=nameFromUrl(canonical,code);
      const candidate={url:canonical,name,number:visiblePrintedNumber(row||a,code)||parsed.number,idProduct:extractProductId(row||a)};
      const old=map.get(canonical);
      map.set(canonical,old?{url:canonical,name:old.name||candidate.name,number:old.number||candidate.number,idProduct:old.idProduct||candidate.idProduct}:candidate);
    }
    return [...map.values()];
  }

  function nextPageUrl(doc){for(const sel of ['a[rel="next"]','a[aria-label="Next page"]','a[aria-label="Siguiente página"]','.pagination a[aria-label*="Next"]','.pagination a[aria-label*="Siguiente"]']){const a=doc.querySelector(sel),raw=a?.getAttribute('href');if(a?.href)return a.href;if(raw)return new URL(raw,location.origin).href;}return '';}
  async function fetchDoc(url,label){const res=await fetch(url,{credentials:'include',headers:{Accept:'text/html,application/xhtml+xml'}});if(res.status===403||res.status===429){const e=new Error(`HTTP ${res.status} en ${label}`);e.rateLimited=res.status===429;throw e;}if(!res.ok)throw new Error(`HTTP ${res.status} en ${label}`);const html=await res.text();if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))throw new Error(`ANTIBOT en ${label}`);return new DOMParser().parseFromString(html,'text/html');}

  async function collectListingPages(code,status){
    const products=new Map(),seen=new Set(); let doc=document,url=location.href,page=0;
    while(url&&!seen.has(url)&&page<50){
      seen.add(url);page++;status(`Leyendo página ${page}…`);
      for(const p of productLinksFromDoc(doc,code)){const old=products.get(p.url);products.set(p.url,old?{url:p.url,name:old.name||p.name,number:old.number||p.number,idProduct:old.idProduct||p.idProduct}:p);}
      const next=nextPageUrl(doc);if(!next||seen.has(next))break;
      await sleep(jitter(900,600));doc=await fetchDoc(next,`página ${page+1}`);url=next;
    }
    return [...products.values()];
  }

  function ensureSet(catalog,code,slug){if(!catalog[code])catalog[code]={code,slug,cards:{},byUrl:{},updated_at:null};const s=catalog[code];s.cards=s.cards||{};s.byUrl=s.byUrl||{};s.slug=slug||s.slug||'';return s;}
  function persistOne(code,slug,p){if(!p?.url||!p?.number||!p?.idProduct)return false;const catalog=loadCatalog(),set=ensureSet(catalog,code,slug),url=canonicalProductUrl(p.url)||p.url,card={number:String(p.number),name:p.name||'',idProduct:String(p.idProduct),url};set.cards[card.number]=card;set.byUrl[url]=card;set.updated_at=new Date().toISOString();saveCatalog(catalog);return true;}
  function hydrate(code,slug,products){const catalog=loadCatalog(),set=ensureSet(catalog,code,slug);for(const p of products){const saved=set.byUrl[canonicalProductUrl(p.url)||p.url]||(p.number?set.cards[p.number]:null);if(saved?.idProduct){p.number=p.number||saved.number;p.idProduct=p.idProduct||saved.idProduct;p.name=p.name||saved.name;}}return products;}

  async function enrichBatch(products,code,slug,status){
    hydrate(code,slug,products);for(const p of products)if(p.number&&p.idProduct)persistOne(code,slug,p);
    const pending=products.filter(p=>!(p.number&&p.idProduct)),batch=pending.slice(0,BATCH_SIZE);
    for(let i=0;i<batch.length;i++){
      const p=batch[i];status(`Lote ${i+1}/${batch.length} · ${p.name} · quedan ${pending.length-i}`);await sleep(jitter(1500,1000));
      const doc=await fetchDoc(p.url,`ficha ${i+1}/${batch.length}`);if(!p.idProduct)p.idProduct=extractProductId(doc);if(!p.number)p.number=visiblePrintedNumber(doc,code);if(!p.name)p.name=nameFromUrl(p.url,code);persistOne(code,slug,p);
    }
    hydrate(code,slug,products);return {products,remaining:products.filter(p=>!(p.number&&p.idProduct)).length};
  }

  function exportSet(code){const set=loadCatalog()[code];if(!set)return false;const rows=[['set','number','name','idProduct','url']];for(const c of Object.values(set.cards||{}).sort((a,b)=>parseInt(a.number,10)-parseInt(b.number,10)))rows.push([code,c.number,c.name,c.idProduct,c.url]);download(`cardmarket_ids_${code}.csv`,rows.map(r=>r.map(csvEscape).join(';')).join('\r\n'));return true;}

  if(!isExpansionPage())return;
  const slug=expansionSlugFromUrl();let code=inferCode(document,slug);
  const banner=document.createElement('div');banner.id=BANNER_ID;banner.style.cssText='position:fixed;left:18px;bottom:18px;z-index:2147483646;background:#23304a;color:white;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:12px 14px;font:13px Arial,sans-serif;max-width:430px';
  banner.innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:4px">Catálogo de IDs · ${slug.replace(/-/g,' ')}</div><div id="cm-id-catalog-status" style="opacity:.9;margin-bottom:8px">${code?`Colección: ${code}`:'Falta identificar código'}</div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="cm-id-catalog-run" style="padding:6px 9px;font-weight:700">Sacar / continuar IDs</button><button id="cm-id-catalog-export" style="padding:6px 9px">Exportar guardados</button><button id="cm-id-catalog-close" style="padding:6px 9px">×</button></div>`;document.body.appendChild(banner);
  const statusEl=banner.querySelector('#cm-id-catalog-status'),runBtn=banner.querySelector('#cm-id-catalog-run'),status=t=>statusEl.textContent=t;
  banner.querySelector('#cm-id-catalog-close').onclick=()=>banner.remove();
  banner.querySelector('#cm-id-catalog-export').onclick=()=>{if(!code)code=String(prompt('Código de la colección (ej. DRI):')||'').trim().toUpperCase();if(!code||!exportSet(code))status('No hay IDs guardados todavía.');};

  runBtn.onclick=async()=>{
    runBtn.disabled=true;
    try{
      code=code||inferCode(document,slug)||String(prompt('Código de la colección (ej. DRI):')||'').trim().toUpperCase();if(!code)throw new Error('Necesito el código.');
      let products=await collectListingPages(code,status);if(!products.length)throw new Error(`No encuentro fichas reales ${code}+número en el listado.`);
      hydrate(code,slug,products);for(const p of products)if(p.number&&p.idProduct)persistOne(code,slug,p);
      const already=products.filter(p=>p.number&&p.idProduct).length,pending=products.length-already;
      status(`${products.length} cartas reales · ${already} resueltas · ${pending} pendientes.`);
      if(!pending){exportSet(code);return;}
      const result=await enrichBatch(products,code,slug,status),now=result.products.filter(p=>p.number&&p.idProduct).length;
      status(result.remaining?`Guardados ${now}/${products.length}. Quedan ${result.remaining}. Pulsa continuar.`:`Hecho: ${now}/${products.length}. Todo completo.`);
      if(!result.remaining)exportSet(code);
    }catch(e){console.error('Cardmarket ID Catalog',e);const saved=code?Object.keys(loadCatalog()[code]?.cards||{}).length:0;status(e.rateLimited?`HTTP 429. Guardados: ${saved}. Recarga y continúa.`:`Error: ${e.message||e}. Guardados: ${saved}.`);}finally{runBtn.disabled=false;}
  };

  console.info(`Cardmarket ID Catalog v${VERSION}: ${slug}${code?` (${code})`:''}`);
})();