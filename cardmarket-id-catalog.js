(() => {
  'use strict';

  const VERSION = '0.2.0';
  const BANNER_ID = 'cm-id-catalog-banner';
  const STORE_KEY = 'cm_helper_product_id_catalog_v1';
  const EXPANSION_DB_KEY = 'cm_helper_expansion_db';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = (base, spread=1200) => Math.max(500, base + Math.floor(Math.random()*spread));

  if (!location.hostname.endsWith('cardmarket.com') || !/\/Pokemon\//i.test(location.pathname)) return;
  document.getElementById(BANNER_ID)?.remove();

  const norm = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const csvEscape = v => { v=String(v??''); return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v; };
  const download = (filename,text) => {
    const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}), a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  };

  function expansionSlugFromUrl(url=location.href){
    try{ const m=decodeURIComponent(new URL(url,location.origin).pathname).match(/\/Pokemon\/Products\/Singles\/([^/?#]+)/i); return m?m[1]:''; }catch{return '';}
  }
  function isExpansionListingPage(){ return /\/Pokemon\/Products\/Singles\/[^/]+\/?$/i.test(decodeURIComponent(location.pathname)); }
  function loadExpansionDb(){ try{return JSON.parse(localStorage.getItem(EXPANSION_DB_KEY)||'{}')||{};}catch{return {};} }
  function loadCatalog(){ try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch{return {};} }
  function saveCatalog(x){ localStorage.setItem(STORE_KEY,JSON.stringify(x||{})); }

  function codeFromExpansionDb(slug){
    const sn=norm(slug);
    for(const [code,e] of Object.entries(loadExpansionDb())){
      const vals=[e?.slug,e?.name,e?.label].filter(Boolean).map(norm);
      if(vals.some(v=>v===sn||v.includes(sn)||sn.includes(v))) return String(code).toUpperCase();
    }
    return '';
  }
  function codeFromProductHref(href){
    try{ const tail=decodeURIComponent(new URL(href,location.origin).pathname).split('/').filter(Boolean).pop()||''; const m=tail.match(/-([A-Za-z0-9]+?)(\d{3,4}[A-Za-z]?)$/); return m?m[1].toUpperCase():''; }catch{return '';}
  }
  function inferCode(doc=document,slug=expansionSlugFromUrl()){
    const db=codeFromExpansionDb(slug); if(db) return db;
    const counts={};
    for(const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')){ const c=codeFromProductHref(a.getAttribute('href')||''); if(c) counts[c]=(counts[c]||0)+1; }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  }

  function visiblePrintedNumber(root,code){
    const text=(root?.textContent||'').replace(/\s+/g,' '); if(!text) return '';
    const escaped=String(code||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const rx=[
      ...(code?[new RegExp(`\\(\\s*${escaped}\\s+0*(\\d{1,4}[A-Za-z]?)\\s*\\)`,'i'),new RegExp(`\\b${escaped}\\s*[-#]?\\s*0*(\\d{1,4}[A-Za-z]?)\\b`,'i')]:[]),
      /(?:Card\s*Number|Collector(?:'s)?\s*Number|Número\s+de\s+carta|Numero\s+de\s+carta|Kartennummer)\s*[:#]?\s*0*(\d{1,4}[A-Za-z]?)/i
    ];
    for(const r of rx){ const m=text.match(r); if(m) return m[1].toUpperCase(); }
    return '';
  }

  function idFromMediaUrl(raw){
    if(!raw) return '';
    let s=''; try{s=decodeURIComponent(String(raw));}catch{s=String(raw);}
    const patterns=[
      /(?:product|products|product-images?|images?\/products?)[\/_-](\d{5,})/i,
      /\/(\d{5,})(?:\.(?:jpg|jpeg|png|webp)|\/)/i,
      /(?:idProduct|productId)[=/_-](\d{5,})/i
    ];
    for(const r of patterns){const m=s.match(r); if(m) return m[1];}
    return '';
  }

  function extractProductId(root){
    if(!root) return '';
    for(const sel of ['[data-product-id]','[data-id-product]','input[name="idProduct"]','input[name="idProducts"]','button[name="idProduct"]','[name="idProduct"]']){
      for(const el of root.querySelectorAll?.(sel)||[]){
        for(const v of [el.value,el.getAttribute('data-product-id'),el.getAttribute('data-id-product'),el.getAttribute('value')]) if(/^\d+$/.test(String(v||'').trim())) return String(v).trim();
      }
    }
    for(const el of root.querySelectorAll?.('img[src],img[data-src],source[srcset],a[href],form[action]')||[]){
      const vals=[el.getAttribute('src'),el.getAttribute('data-src'),el.getAttribute('srcset'),el.getAttribute('href'),el.getAttribute('action')].filter(Boolean);
      for(const raw of vals){
        try{ const u=new URL(raw,location.origin); const q=u.searchParams.get('idProduct')||u.searchParams.get('idProducts'); if(/^\d+$/.test(String(q||''))) return String(q); }catch{}
        const media=idFromMediaUrl(raw); if(media) return media;
      }
    }
    const html=root.documentElement?.innerHTML||root.outerHTML||'';
    for(const r of [/["']idProduct["']\s*[:=]\s*["']?(\d{4,})/i,/["']productId["']\s*[:=]\s*["']?(\d{4,})/i,/data-product-id=["'](\d{4,})["']/i,/data-id-product=["'](\d{4,})["']/i,/(?:\?|&|&amp;)idProduct=(\d{4,})/i]){const m=html.match(r);if(m)return m[1];}
    return '';
  }

  function extractName(a){
    const row=a.closest('.row,.product-row,article,li,tr,.table-body,.card,.product')||a.parentElement;
    return [a.getAttribute('title'),a.querySelector('h2,h3,h4,.product-name,.name')?.textContent,a.textContent,row?.querySelector('h2,h3,h4,.product-name,.name')?.textContent]
      .filter(Boolean).map(x=>String(x).replace(/\s+/g,' ').trim()).find(Boolean)||'';
  }

  function productLinksFromDoc(doc,code){
    const out=[],seen=new Set(),currentSlug=expansionSlugFromUrl(location.href);
    for(const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')){
      const href=a.href||new URL(a.getAttribute('href')||'',location.origin).href;
      if(!href||seen.has(href)||expansionSlugFromUrl(href)!==currentSlug) continue;
      const inferred=codeFromProductHref(href); if(code&&inferred&&inferred!==code) continue;
      seen.add(href);
      const row=a.closest('.row,.product-row,article,li,tr,.table-body,.card,.product')||a.parentElement;
      out.push({url:href,name:extractName(a),number:visiblePrintedNumber(row||a,code),idProduct:extractProductId(row||a)});
    }
    return out;
  }

  function nextPageUrl(doc){
    for(const sel of ['a[rel="next"]','a[aria-label="Next page"]','a[aria-label="Siguiente página"]','.pagination a[aria-label*="Next"]','.pagination a[aria-label*="Siguiente"]']){
      const a=doc.querySelector(sel), raw=a?.getAttribute('href'); if(a?.href)return a.href; if(raw)return new URL(raw,location.origin).href;
    }
    return '';
  }

  async function fetchDoc(url,label,retries=2){
    const waits=[12000,30000];
    for(let attempt=0;attempt<=retries;attempt++){
      const res=await fetch(url,{credentials:'include',headers:{'Accept':'text/html,application/xhtml+xml'}});
      if(res.status===429&&attempt<retries){ await sleep(waits[Math.min(attempt,waits.length-1)]); continue; }
      if(res.status===403||res.status===429){ const e=new Error(`HTTP ${res.status} en ${label}`); e.rateLimited=res.status===429; throw e; }
      if(!res.ok) throw new Error(`HTTP ${res.status} en ${label}`);
      const html=await res.text(); if(/just a moment|verify you are human|captcha|checking your browser/i.test(html)) throw new Error(`ANTIBOT en ${label}`);
      return new DOMParser().parseFromString(html,'text/html');
    }
  }

  async function collectListingPages(code,status){
    const products=new Map(); let doc=document,url=location.href,page=0; const seen=new Set();
    while(url&&!seen.has(url)&&page<50){
      seen.add(url); page++; status(`Leyendo página ${page} de la colección…`);
      for(const p of productLinksFromDoc(doc,code)){ const old=products.get(p.url); products.set(p.url,old?{...old,name:old.name||p.name,number:old.number||p.number,idProduct:old.idProduct||p.idProduct}:p); }
      const next=nextPageUrl(doc); if(!next||seen.has(next))break;
      await sleep(jitter(1200,800)); doc=await fetchDoc(next,`página ${page+1} de la colección`,1); url=next;
    }
    return [...products.values()];
  }

  function persist(code,slug,products){
    const catalog=loadCatalog(); if(!catalog[code]) catalog[code]={code,slug,cards:{},updated_at:null};
    const target=catalog[code]; target.slug=slug; target.updated_at=new Date().toISOString();
    for(const p of products){ if(!p.number||!p.idProduct)continue; target.cards[p.number]={number:p.number,name:p.name||'',idProduct:String(p.idProduct),url:p.url}; }
    saveCatalog(catalog); return target;
  }

  async function enrichProducts(products,code,slug,status){
    const existing=loadCatalog()[code]?.cards||{};
    let fetched=0;
    for(let i=0;i<products.length;i++){
      const p=products[i];
      if(p.number&&existing[p.number]?.idProduct&&!p.idProduct) p.idProduct=existing[p.number].idProduct;
      if(p.idProduct&&p.number){ status(`${i+1}/${products.length} · ${code} ${p.number} ✓`); persist(code,slug,[p]); continue; }
      status(`${i+1}/${products.length} · abriendo ${p.name||'carta'}… (${fetched} fichas)`);
      await sleep(jitter(3200,1800));
      try{
        const doc=await fetchDoc(p.url,`ficha ${i+1}/${products.length}`,1); fetched++;
        if(!p.idProduct)p.idProduct=extractProductId(doc);
        if(!p.number)p.number=visiblePrintedNumber(doc,code);
        if(!p.name)p.name=(doc.querySelector('h1')?.textContent||'').replace(/\s+/g,' ').trim();
        persist(code,slug,[p]);
      }catch(e){
        if(e.rateLimited){
          persist(code,slug,products.slice(0,i));
          e.message += `. Progreso guardado: vuelve a pulsar para continuar.`;
        }
        throw e;
      }
    }
    return products;
  }

  function exportSet(code){
    const set=loadCatalog()[code]; if(!set)return false;
    const rows=[['set','number','name','idProduct','url']];
    for(const card of Object.values(set.cards||{}).sort((a,b)=>{const na=parseInt(a.number,10),nb=parseInt(b.number,10);return (Number.isFinite(na)?na:99999)-(Number.isFinite(nb)?nb:99999)||String(a.number).localeCompare(String(b.number));})) rows.push([code,card.number,card.name,card.idProduct,card.url]);
    download(`cardmarket_ids_${code}.csv`,rows.map(r=>r.map(csvEscape).join(';')).join('\r\n')); return true;
  }

  if(!isExpansionListingPage())return;
  const slug=expansionSlugFromUrl(); let code=inferCode(document,slug);
  const banner=document.createElement('div'); banner.id=BANNER_ID;
  banner.style.cssText='position:fixed;left:18px;bottom:18px;z-index:2147483646;background:#23304a;color:white;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:12px 14px;font:13px Arial,sans-serif;max-width:390px';
  banner.innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:4px">Catálogo de IDs · ${slug.replace(/-/g,' ')}</div><div id="cm-id-catalog-status" style="opacity:.9;margin-bottom:8px">${code?`Colección detectada: ${code}`:'Colección detectada; falta identificar el código.'}</div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="cm-id-catalog-run" style="padding:6px 9px;font-weight:700;cursor:pointer">Sacar / continuar IDs</button><button id="cm-id-catalog-export" style="padding:6px 9px;cursor:pointer">Exportar guardados</button><button id="cm-id-catalog-close" style="padding:6px 9px;cursor:pointer">×</button></div>`;
  document.body.appendChild(banner);
  const statusEl=banner.querySelector('#cm-id-catalog-status'),runBtn=banner.querySelector('#cm-id-catalog-run'),exportBtn=banner.querySelector('#cm-id-catalog-export');
  const status=t=>{statusEl.textContent=t;};
  exportBtn.onclick=()=>{ if(!code)code=inferCode(document,slug)||String(prompt('Código de la colección (ej. DRI):')||'').trim().toUpperCase(); if(!code||!exportSet(code))status('Todavía no hay IDs guardados para esta colección.'); };
  banner.querySelector('#cm-id-catalog-close').onclick=()=>banner.remove();
  runBtn.onclick=async()=>{
    runBtn.disabled=true;
    try{
      code=code||inferCode(document,slug)||String(prompt('Código de la colección (ej. DRI):')||'').trim().toUpperCase(); if(!code)throw new Error('Necesito el código de la colección.');
      status(`Preparando ${code}…`); let products=await collectListingPages(code,status); if(!products.length)throw new Error('No he encontrado enlaces de cartas en esta página.');
      const direct=products.filter(p=>p.idProduct&&p.number).length, savedBefore=Object.keys(loadCatalog()[code]?.cards||{}).length;
      status(`${products.length} productos · ${direct} directos · ${savedBefore} ya guardados.`);
      products=await enrichProducts(products,code,slug,status);
      const complete=products.filter(p=>p.number&&p.idProduct), unresolved=products.filter(p=>!p.number||!p.idProduct), saved=persist(code,slug,complete);
      status(`Hecho: ${Object.keys(saved.cards||{}).length} IDs guardados para ${code}. ${unresolved.length?`${unresolved.length} sin resolver.`:'Todo resuelto.'}`); exportSet(code);
      if(unresolved.length)console.warn('Cardmarket ID Catalog: productos sin resolver',unresolved);
    }catch(e){ console.error('Cardmarket ID Catalog',e); status(`Error: ${e.message||e}`); }
    finally{runBtn.disabled=false;}
  };
  console.info(`Cardmarket ID Catalog v${VERSION}: listo para ${slug}${code?` (${code})`:''}`);
})();