(() => {
  'use strict';

  const VERSION = '0.1.0';
  const BANNER_ID = 'cm-id-catalog-banner';
  const STORE_KEY = 'cm_helper_product_id_catalog_v1';
  const EXPANSION_DB_KEY = 'cm_helper_expansion_db';

  if (!location.hostname.endsWith('cardmarket.com')) return;
  if (!/\/Pokemon\//i.test(location.pathname)) return;
  document.getElementById(BANNER_ID)?.remove();

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = (base, spread=350) => Math.max(300, base + Math.floor(Math.random() * spread));
  const norm = s => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const csvEscape = v => {
    v = String(v ?? '');
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const download = (filename, text) => {
    const blob = new Blob(['\ufeff' + text], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  function expansionSlugFromUrl(url=location.href) {
    try {
      const u = new URL(url, location.origin);
      const m = decodeURIComponent(u.pathname).match(/\/Pokemon\/Products\/Singles\/([^/?#]+)/i);
      return m ? m[1] : '';
    } catch { return ''; }
  }

  function isExpansionListingPage() {
    const path = decodeURIComponent(location.pathname).replace(/\/+$/, '');
    const m = path.match(/\/Pokemon\/Products\/Singles\/([^/]+)$/i);
    return !!m;
  }

  function loadExpansionDb() {
    try { return JSON.parse(localStorage.getItem(EXPANSION_DB_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function loadCatalog() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch { return {}; }
  }

  function saveCatalog(obj) {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj || {}));
  }

  function codeFromExpansionDb(slug) {
    const sn = norm(slug);
    for (const [code, e] of Object.entries(loadExpansionDb())) {
      const vals = [e?.slug, e?.name, e?.label].filter(Boolean).map(norm);
      if (vals.some(v => v === sn || v.includes(sn) || sn.includes(v))) return String(code).toUpperCase();
    }
    return '';
  }

  function codeFromProductHref(href) {
    try {
      const path = decodeURIComponent(new URL(href, location.origin).pathname);
      const tail = path.split('/').filter(Boolean).pop() || '';
      const m = tail.match(/-([A-Za-z0-9]+?)(\d{3,4}[A-Za-z]?)$/);
      return m ? String(m[1]).toUpperCase() : '';
    } catch { return ''; }
  }

  function inferCode(doc=document, slug=expansionSlugFromUrl()) {
    const fromDb = codeFromExpansionDb(slug);
    if (fromDb) return fromDb;
    const counts = {};
    for (const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')) {
      const code = codeFromProductHref(a.getAttribute('href') || '');
      if (code) counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  }

  function visiblePrintedNumber(root, code) {
    const text = (root?.textContent || '').replace(/\s+/g, ' ');
    if (!text) return '';
    const escaped = String(code || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = code ? [
      new RegExp(`\\(\\s*${escaped}\\s+0*(\\d{1,4}[A-Za-z]?)\\s*\\)`, 'i'),
      new RegExp(`\\b${escaped}\\s*[-#]?\\s*0*(\\d{1,4}[A-Za-z]?)\\b`, 'i')
    ] : [];
    patterns.push(/(?:Card\s*Number|Collector(?:'s)?\s*Number|Número\s+de\s+carta|Numero\s+de\s+carta|Kartennummer)\s*[:#]?\s*0*(\d{1,4}[A-Za-z]?)/i);
    for (const rx of patterns) {
      const m = text.match(rx);
      if (m) return m[1].toUpperCase();
    }
    return '';
  }

  function extractProductId(root) {
    if (!root) return '';
    const directSelectors = [
      '[data-product-id]', '[data-id-product]',
      'input[name="idProduct"]', 'input[name="idProducts"]',
      'button[name="idProduct"]', '[name="idProduct"]'
    ];
    for (const sel of directSelectors) {
      for (const el of root.querySelectorAll?.(sel) || []) {
        const vals = [
          el.value,
          el.getAttribute('data-product-id'),
          el.getAttribute('data-id-product'),
          el.getAttribute('value')
        ];
        for (const v of vals) if (/^\d+$/.test(String(v || '').trim())) return String(v).trim();
      }
    }

    for (const a of root.querySelectorAll?.('a[href*="idProduct"],form[action*="idProduct"]') || []) {
      const raw = a.getAttribute('href') || a.getAttribute('action') || '';
      try {
        const u = new URL(raw, location.origin);
        const id = u.searchParams.get('idProduct') || u.searchParams.get('idProducts');
        if (/^\d+$/.test(String(id || ''))) return String(id);
      } catch {}
    }

    const html = root.documentElement?.innerHTML || root.outerHTML || '';
    const patterns = [
      /["']idProduct["']\s*[:=]\s*["']?(\d{4,})/i,
      /["']productId["']\s*[:=]\s*["']?(\d{4,})/i,
      /data-product-id=["'](\d{4,})["']/i,
      /data-id-product=["'](\d{4,})["']/i,
      /(?:\?|&|&amp;)idProduct=(\d{4,})/i
    ];
    for (const rx of patterns) {
      const m = html.match(rx);
      if (m) return m[1];
    }
    return '';
  }

  function extractName(anchor) {
    const row = anchor.closest('.row,.product-row,article,li,tr,.table-body,.card,.product') || anchor.parentElement;
    const candidates = [
      anchor.getAttribute('title'),
      anchor.querySelector('h2,h3,h4,.product-name,.name')?.textContent,
      anchor.textContent,
      row?.querySelector('h2,h3,h4,.product-name,.name')?.textContent
    ].filter(Boolean).map(x=>String(x).replace(/\s+/g,' ').trim());
    return candidates.find(Boolean) || '';
  }

  function productLinksFromDoc(doc, code) {
    const out = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')) {
      const href = a.href || new URL(a.getAttribute('href') || '', location.origin).href;
      if (!href || href === location.href || seen.has(href)) continue;
      if (expansionSlugFromUrl(href) !== expansionSlugFromUrl(location.href)) continue;
      const inferred = codeFromProductHref(href);
      if (code && inferred && inferred !== code) continue;
      seen.add(href);
      const row = a.closest('.row,.product-row,article,li,tr,.table-body,.card,.product') || a.parentElement;
      out.push({
        url: href,
        anchor: a,
        row,
        name: extractName(a),
        number: visiblePrintedNumber(row || a, code),
        idProduct: extractProductId(row || a)
      });
    }
    return out;
  }

  function nextPageUrl(doc) {
    const selectors = [
      'a[rel="next"]',
      'a[aria-label="Next page"]', 'a[aria-label="Siguiente página"]',
      '.pagination a[aria-label*="Next"]', '.pagination a[aria-label*="Siguiente"]'
    ];
    for (const sel of selectors) {
      const a = doc.querySelector(sel);
      if (a?.href) return a.href;
      const raw = a?.getAttribute('href');
      if (raw) return new URL(raw, location.origin).href;
    }
    return '';
  }

  async function fetchDoc(url, label) {
    const res = await fetch(url, {credentials:'include', headers:{'Accept':'text/html,application/xhtml+xml'}});
    if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status} en ${label}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${label}`);
    const html = await res.text();
    if (/just a moment|verify you are human|captcha|checking your browser/i.test(html)) throw new Error(`ANTIBOT en ${label}`);
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function collectListingPages(code, status) {
    const products = new Map();
    let doc = document;
    let url = location.href;
    const seenPages = new Set();
    let page = 0;

    while (url && !seenPages.has(url) && page < 50) {
      seenPages.add(url);
      page++;
      status(`Leyendo página ${page} de la colección…`);
      for (const p of productLinksFromDoc(doc, code)) {
        const old = products.get(p.url);
        products.set(p.url, old ? {
          ...old,
          name: old.name || p.name,
          number: old.number || p.number,
          idProduct: old.idProduct || p.idProduct
        } : p);
      }
      const next = nextPageUrl(doc);
      if (!next || seenPages.has(next)) break;
      await sleep(jitter(700));
      doc = await fetchDoc(next, `página ${page+1} de la colección`);
      url = next;
    }
    return [...products.values()];
  }

  async function enrichProducts(products, code, status) {
    let done = 0;
    for (const p of products) {
      done++;
      if (p.idProduct && p.number) {
        status(`${done}/${products.length} · ${code} ${p.number} ✓`);
        continue;
      }
      status(`${done}/${products.length} · abriendo ${p.name || 'carta'}…`);
      await sleep(jitter(650));
      const doc = await fetchDoc(p.url, `ficha ${done}/${products.length}`);
      if (!p.idProduct) p.idProduct = extractProductId(doc);
      if (!p.number) p.number = visiblePrintedNumber(doc, code);
      if (!p.name) p.name = (doc.querySelector('h1')?.textContent || '').replace(/\s+/g,' ').trim();
    }
    return products;
  }

  function persist(code, slug, products) {
    const catalog = loadCatalog();
    if (!catalog[code]) catalog[code] = {code, slug, cards:{}, updated_at:null};
    const target = catalog[code];
    target.slug = slug;
    target.updated_at = new Date().toISOString();
    for (const p of products) {
      if (!p.number || !p.idProduct) continue;
      target.cards[p.number] = {
        number:p.number,
        name:p.name || '',
        idProduct:String(p.idProduct),
        url:p.url
      };
    }
    saveCatalog(catalog);
    return target;
  }

  function exportSet(code) {
    const set = loadCatalog()[code];
    if (!set) return false;
    const rows = [['set','number','name','idProduct','url']];
    for (const card of Object.values(set.cards || {}).sort((a,b)=>{
      const na=parseInt(a.number,10), nb=parseInt(b.number,10);
      return (Number.isFinite(na)?na:99999)-(Number.isFinite(nb)?nb:99999) || String(a.number).localeCompare(String(b.number));
    })) rows.push([code, card.number, card.name, card.idProduct, card.url]);
    const csv = rows.map(r=>r.map(csvEscape).join(';')).join('\r\n');
    download(`cardmarket_ids_${code}.csv`, csv);
    return true;
  }

  if (!isExpansionListingPage()) return;

  const slug = expansionSlugFromUrl();
  let code = inferCode(document, slug);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.cssText = `position:fixed;left:18px;bottom:18px;z-index:2147483646;background:#23304a;color:white;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:12px 14px;font:13px Arial,sans-serif;max-width:360px`;
  banner.innerHTML = `
    <div style="font-weight:700;font-size:14px;margin-bottom:4px">Catálogo de IDs · ${slug.replace(/-/g,' ')}</div>
    <div id="cm-id-catalog-status" style="opacity:.9;margin-bottom:8px">${code ? `Colección detectada: ${code}` : 'Colección detectada; falta identificar el código.'}</div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button id="cm-id-catalog-run" style="padding:6px 9px;font-weight:700;cursor:pointer">Sacar IDs de esta colección</button>
      <button id="cm-id-catalog-export" style="padding:6px 9px;cursor:pointer">Exportar guardados</button>
      <button id="cm-id-catalog-close" style="padding:6px 9px;cursor:pointer">×</button>
    </div>`;
  document.body.appendChild(banner);

  const statusEl = banner.querySelector('#cm-id-catalog-status');
  const runBtn = banner.querySelector('#cm-id-catalog-run');
  const exportBtn = banner.querySelector('#cm-id-catalog-export');
  const status = text => { statusEl.textContent = text; };

  exportBtn.onclick = () => {
    if (!code) code = inferCode(document, slug) || String(prompt('Código de la colección (ej. DRI):') || '').trim().toUpperCase();
    if (!code || !exportSet(code)) status('Todavía no hay IDs guardados para esta colección.');
  };
  banner.querySelector('#cm-id-catalog-close').onclick = () => banner.remove();

  runBtn.onclick = async () => {
    runBtn.disabled = true;
    try {
      code = code || inferCode(document, slug) || String(prompt('Código de la colección (ej. DRI):') || '').trim().toUpperCase();
      if (!code) throw new Error('Necesito el código de la colección.');
      status(`Preparando ${code}…`);
      let products = await collectListingPages(code, status);
      if (!products.length) throw new Error('No he encontrado enlaces de cartas en esta página.');
      const direct = products.filter(p=>p.idProduct && p.number).length;
      status(`${products.length} productos encontrados; ${direct} ya traen nº + ID en el listado.`);
      products = await enrichProducts(products, code, status);
      const complete = products.filter(p=>p.number && p.idProduct);
      const unresolved = products.filter(p=>!p.number || !p.idProduct);
      const saved = persist(code, slug, complete);
      status(`Hecho: ${Object.keys(saved.cards||{}).length} IDs guardados para ${code}. ${unresolved.length ? `${unresolved.length} sin resolver.` : 'Todo resuelto.'}`);
      exportSet(code);
      if (unresolved.length) console.warn('Cardmarket ID Catalog: productos sin resolver', unresolved);
    } catch (e) {
      console.error('Cardmarket ID Catalog', e);
      status(`Error: ${e.message || e}`);
    } finally {
      runBtn.disabled = false;
    }
  };

  console.info(`Cardmarket ID Catalog v${VERSION}: listo para ${slug}${code ? ` (${code})` : ''}`);
})();