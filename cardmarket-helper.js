
(async () => {
  const VERSION = "5.4.29 DRI Product Number Fix";
  const STORAGE_KEY = "cm_helper_v540_sellers";
  const MARKET_CACHE_KEY = "cm_helper_v44_market_cache";
  const CATALOG_CACHE_KEY = "cm_helper_v540_product_cache";
  const EXPANSION_ID_CACHE_KEY = "cm_helper_v540_expansion_ids";
  const SEED_HISTORY_KEY = "cm_helper_v540_seed_history";
  const UI_STATE_KEY = "cm_helper_v540_ui_state";
  const EXPANSION_DB_KEY = "cm_helper_expansion_db";
  const IDB_NAME = "cardmarket_helper_db";
  const IDB_VERSION = 1;
  const IDB_SELLERS_STORE = "sellers";
  const IDB_KV_STORE = "kv";

  if (!location.hostname.endsWith("cardmarket.com")) {
    alert("Abre Cardmarket en Chrome y ejecuta el script allí.");
    return;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = (base, spread=500) => Math.max(250, base + Math.floor(Math.random()*spread));

  async function fetchWithBackoff(url, options={}, label="petición", retries=3) {
    const waits = [30000, 60000, 120000];
    let lastRes = null;

    for (let attempt=0; attempt<=retries; attempt++) {
      const res = await fetch(url, options);
      lastRes = res;

      if (res.status !== 429) return res;

      if (attempt >= retries) return res;

      const wait = waits[Math.min(attempt, waits.length-1)];
      const log = document.querySelector("#cm-log");
      if (log) {
        log.textContent += `\nHTTP 429 en ${label}. Esperando ${Math.round(wait/1000)} s antes de reintentar...\n`;
        log.scrollTop = log.scrollHeight;
      }
      await sleep(wait);
    }
    return lastRes;
  }

  function loadCatalogCache() {
    try { return JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null"); }
    catch { return null; }
  }

  function saveCatalogCache(catalog) {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      ts: Date.now(),
      catalog
    }));
  }



  function normalizeExpansionDbEntry(code,entry={}) {
    const c=String(code||"").trim().toUpperCase();
    return {code:c,id:String(entry.id||"").trim(),label:String(entry.label||entry.name||"").trim(),
      slug:String(entry.slug||"").trim(),name:String(entry.name||entry.label||"").trim()};
  }
  function loadExpansionDb() {
    let db={}; try{db=JSON.parse(localStorage.getItem(EXPANSION_DB_KEY)||"{}")}catch{}
    const bootstrap={
      MEW:{id:"5402",label:"151",slug:"151",name:"151"},
      DRI:{id:"6096",label:"Destined Rivals",slug:"Destined-Rivals",name:"Destined Rivals"}
    };
    for(const [code,e] of Object.entries(bootstrap)) if(!db[code]) db[code]=normalizeExpansionDbEntry(code,e);
    localStorage.setItem(EXPANSION_DB_KEY,JSON.stringify(db)); return db;
  }
  function saveExpansionDb(db){localStorage.setItem(EXPANSION_DB_KEY,JSON.stringify(db||{}));}
  function upsertExpansionDb(code,entry={}) {
    const c=String(code||"").trim().toUpperCase(); if(!c)return;
    const db=loadExpansionDb(); db[c]=normalizeExpansionDbEntry(c,{...(db[c]||{}),...entry}); saveExpansionDb(db);
  }
  function expansionDbEntry(code){return loadExpansionDb()[String(code||"").trim().toUpperCase()]||null;}
  function expansionDbToCsv(){
    const rows=[["code","id","slug","name"]];
    for(const code of Object.keys(loadExpansionDb()).sort()){
      const e=loadExpansionDb()[code]||{}; rows.push([code,e.id||"",e.slug||"",e.name||e.label||""]);
    }
    return rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(";")).join("\r\n");
  }
  async function importExpansionDbCsv(file){
    const rows=parseCSV(await file.text()); const db=loadExpansionDb(); let count=0;
    for(const r of rows){const code=String(r.code||"").trim().toUpperCase(); if(!code)continue;
      db[code]=normalizeExpansionDbEntry(code,{id:r.id||"",slug:r.slug||"",name:r.name||r.label||""}); count++;}
    saveExpansionDb(db);
    const cache=loadExpansionIdCache();
    for(const [code,e] of Object.entries(db)) if(e?.id) cache[code]={id:String(e.id),label:e.label||e.name||code,source:"expansion-db",ts:Date.now()};
    saveExpansionIdCache(cache); return count;
  }

  function loadExpansionIdCache() {
    try { return JSON.parse(localStorage.getItem(EXPANSION_ID_CACHE_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveExpansionIdCache(obj) {
    localStorage.setItem(EXPANSION_ID_CACHE_KEY, JSON.stringify(obj));
    try{for(const [code,e] of Object.entries(obj||{})) if(e?.id) upsertExpansionDb(code,{id:String(e.id),label:e.label||code});}catch{}
  }

  const KNOWN_EXPANSION_IDS = {
  };

  function cacheExpansionId(code, id, label="", source="auto") {
    code = String(code || "").trim().toUpperCase();
    id = String(id || "").trim();
    if (!code || !id) return null;

    const cache = loadExpansionIdCache();
    cache[code] = {
      id,
      label: label || cache[code]?.label || "",
      source,
      ts: Date.now()
    };
    saveExpansionIdCache(cache);
    return cache[code];
  }

  function expansionIdFromCache(code) {
    code = String(code || "").trim().toUpperCase();
    if (!code) return null;

    const cache = loadExpansionIdCache();

    // v5.4.25: 5402 was previously (incorrectly) cached for SV2A.
    // It actually points to the western 151/MEW filter, so invalidate it.
    if (code==="SV2A" && String(cache[code]?.id||"")==="5402") {
      delete cache[code];
      saveExpansionIdCache(cache);
    }

    if (cache[code]?.id) return cache[code];

    const dbEntry=expansionDbEntry(code);
    if(dbEntry?.id) return cacheExpansionId(code,dbEntry.id,dbEntry.label||dbEntry.name||code,"expansion-db");

    const known = KNOWN_EXPANSION_IDS[code];
    if (known?.id) return cacheExpansionId(code, known.id, known.label, "bootstrap");

    return null;
  }

  function compactSetText(s) {
    return norm(String(s || "")
      .replace(/&/g, " and ")
      .replace(/[-_/]+/g, " ")
      .replace(/[()[\]{}:.,'’"]/g, " ")
      .replace(/\s+/g, " ")
    );
  }

  function productExpansionSlug(href) {
    try {
      const u = new URL(href, location.origin);
      const m = u.pathname.match(/\/Pokemon\/Products\/Singles\/([^/]+)\//i);
      return m ? decodeURIComponent(m[1]) : "";
    } catch {
      return "";
    }
  }

  function productCodeNumberFromHref(href) {
    try {
      const u=new URL(href,location.origin);
      const path=decodeURIComponent(u.pathname);
      const m=path.match(/-([A-Za-z0-9]+?)(\d{3})(?:\/)?$/);
      if(!m) return null;
      return {
        expansion:String(m[1]||"").trim().toUpperCase(),
        number:normalizeNum(m[2]),
        path,
        href:u.href
      };
    } catch {
      return null;
    }
  }

  function chooseProductLinkForExpansion(root, expansion, wantedNumber="") {
    const links=[...root.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')];
    const exp=canonicalExpansionCode(expansion);
    const num=normalizeNum(wantedNumber);

    // Exact expansion + printed number first. Cardmarket's URL suffix is not
    // guaranteed to equal the printed card number for every product.
    for(const a of links){
      const p=productCodeNumberFromHref(a.getAttribute("href")||"");
      if(!p) continue;
      if(canonicalExpansionCode(p.expansion)!==exp) continue;
      if(num){
        const rowText=(a.closest('.row, .product-row, article, li, tr, .table-body, .card')?.textContent||a.textContent||"").replace(/\s+/g," ").trim();
        const escaped=String(expansion||"").trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const visibleRe=new RegExp(`\\(\\s*${escaped}\\s+0*${String(parseInt(num,10))}\\s*\\)`,`i`);
        if(p.number!==num && !visibleRe.test(rowText)) continue;
      }
      return a;
    }

    // Exact expansion code, any number.
    for(const a of links){
      const p=productCodeNumberFromHref(a.getAttribute("href")||"");
      if(p && canonicalExpansionCode(p.expansion)===exp) return a;
    }

    return links[0] || null;
  }

  function findExpansionOption(doc, expansionCode) {
    const code = String(expansionCode || "").trim().toUpperCase();
    if (!code) return null;

    const options = [...doc.querySelectorAll('select[name="idExpansions"] option, [name="idExpansions"] option')]
      .filter(o => String(o.value || "").trim());

    for (const o of options) {
      const hay = [
        o.textContent,
        o.getAttribute("label"),
        o.getAttribute("title"),
        o.getAttribute("data-name"),
        o.getAttribute("data-expansion"),
        o.getAttribute("data-abbreviation"),
        o.getAttribute("data-code")
      ].filter(Boolean).join(" ");
      const h = compactSetText(hay);
      const c = compactSetText(code);
      if (h === c || h.split(" ").includes(c) || expansionLabelMatches(code, hay)) {
        return { id:String(o.value), label:(o.textContent || "").trim(), source:"option-code-or-name" };
      }
    }

    let slug = "";
    for (const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')) {
      const label = (a.textContent || "").trim();
      const m = label.match(/\(([^()]+?)\s+\d+\)\s*$/);
      if (!m || String(m[1]).trim().toUpperCase() !== code) continue;
      slug = productExpansionSlug(a.getAttribute("href") || "");
      if (slug) break;
    }

    if (slug) {
      const slugNorm = compactSetText(slug);
      for (const o of options) {
        const label = (o.textContent || "").trim();
        const labelNorm = compactSetText(label);
        if (labelNorm === slugNorm || labelNorm.includes(slugNorm) || slugNorm.includes(labelNorm)) {
          return { id:String(o.value), label, source:"product-slug" };
        }
      }
    }

    return null;
  }

  function extractExpansionIdFromProductDoc(doc, productUrl, code) {
    const candidates = [];

    // Hidden inputs / data attributes / links.
    for (const el of doc.querySelectorAll(
      'input[name="idExpansion"],input[name="idExpansions"],[data-expansion-id],[data-id-expansion],a[href*="idExpansions="],a[href*="idExpansion="]'
    )) {
      let id = el.value || el.getAttribute("data-expansion-id") || el.getAttribute("data-id-expansion") || "";
      if (!id && el.getAttribute("href")) {
        try {
          const u = new URL(el.getAttribute("href"), location.origin);
          id = u.searchParams.get("idExpansions") || u.searchParams.get("idExpansion") || "";
        } catch(e) {}
      }
      if (/^\d+$/.test(String(id))) candidates.push(String(id));
    }

    // Embedded JSON / JS used by Cardmarket pages.
    const html = doc.documentElement?.innerHTML || "";
    const patterns = [
      /["']idExpansion["']\s*[:=]\s*["']?(\d+)/ig,
      /["']idExpansions["']\s*[:=]\s*["']?(\d+)/ig,
      /idExpansion(?:s)?%5B%5D=(\d+)/ig,
      /idExpansion(?:s)?=(\d+)/ig
    ];
    for (const rx of patterns) {
      let m;
      while ((m = rx.exec(html))) candidates.push(m[1]);
    }

    return candidates.find(x => /^\d+$/.test(x)) || "";
  }

  async function resolveExpansionIdFromProduct(product, code) {
    const log = document.querySelector("#cm-log");
    if (!product?.url) return null;

    const res = await fetchWithBackoff(
      product.url,
      {credentials:"include", headers:{"Accept":"text/html,application/xhtml+xml"}},
      `leer idExpansion desde producto ${code}`,
      1
    );
    if (res.status === 429) throw new Error("HTTP 429 leyendo producto para idExpansion");
    if (!res.ok) throw new Error(`HTTP ${res.status} leyendo producto para idExpansion`);

    const html = await res.text();
    if (/just a moment|verify you are human|captcha|checking your browser/i.test(html))
      throw new Error("ANTIBOT_EXPANSION_PRODUCT");

    const doc = new DOMParser().parseFromString(html,"text/html");
    const id = extractExpansionIdFromProductDoc(doc, product.url, code);
    if (!id) return null;

    const label = productExpansionSlug(product.url) || code;
    const saved = cacheExpansionId(code,id,label,"product-page");
    if (log) log.textContent += `  ✓ ${code} → idExpansions=${saved.id} obtenido desde la página del producto. Guardado en caché.\n`;
    return saved;
  }

  const VERIFIED_EXPANSION_IDS = {
    CRI:{id:"6517", label:"Caos Creciente"},
    MEG:{id:"6209", label:"Megaevolución"},
    POR:{id:"6443", label:"Equilibrio Perfecto"},
    PFL:{id:"6299", label:"Fuegos Fantasmales"},
    DRI:{id:"6096", label:"Destined Rivals"},
    "30C":{id:"6601", label:"Celebración 30.º Aniversario"}
  };

  const EXPANSION_NAME_ALIASES = {
    CRI:["Chaos Rising"],
    MEG:["Megaevolución","Mega Evolution"],
    POR:["Perfect Order"],
    PFL:["Phantasmal Flames"],
    DRI:["Destined Rivals"],
    MEW:["151"],
    SV2A:["Pokemon Card 151","Pokémon Card 151"]
  };

  const EXPANSION_CODE_ALIASES = {
    SV2A:"SV2A",
    MEW:"MEW"
  };

  function canonicalExpansionCode(code) {
    const raw=String(code || "").trim().toUpperCase();
    return EXPANSION_CODE_ALIASES[raw] || raw;
  }

  function expansionCodesEquivalent(a,b) {
    return canonicalExpansionCode(a) === canonicalExpansionCode(b);
  }

  function expansionLabelMatches(code, label) {
    const ln = compactSetText(label);
    const cn = compactSetText(code);
    if (!ln) return false;
    if (ln === cn || ln.split(" ").includes(cn)) return true;
    for (const alias of (EXPANSION_NAME_ALIASES[code] || [])) {
      const an = compactSetText(alias);
      if (ln === an || ln.includes(an) || an.includes(ln)) return true;
    }
    return false;
  }

  async function resolveExpansionIdFromSearch(code, sampleWant) {
    const log = document.querySelector("#cm-log");
    const num = normalizeNum(sampleWant?.number || "");
    const padded = String(num || "").padStart(3,"0");
    const q = `${code} ${padded}`;
    const url = new URL(`${location.origin}/es/Pokemon/Products/Search`);
    url.searchParams.set("searchString", q);

    const res = await fetchWithBackoff(
      url.href,
      {credentials:"include", headers:{"Accept":"text/html,application/xhtml+xml"}},
      `resolver idExpansion ${code} desde búsqueda`,
      1
    );
    if (res.status === 429) throw new Error("HTTP 429 resolviendo idExpansion desde búsqueda");
    if (!res.ok) throw new Error(`HTTP ${res.status} resolviendo idExpansion desde búsqueda`);

    const html = await res.text();
    if (/just a moment|verify you are human|captcha|checking your browser/i.test(html))
      throw new Error("ANTIBOT_EXPANSION_SEARCH");

    const doc = new DOMParser().parseFromString(html,"text/html");
    const select = doc.querySelector('select[name="idExpansion"], select[name="idExpansions"], select[name*="idExpansion"]');
    if (!select) return null;

    const codeNorm = compactSetText(code);
    const options = [...select.querySelectorAll("option")].filter(o => /^\d+$/.test(String(o.value||"").trim()));

    // v5.4.25: exact Japanese 151 expansion label before fuzzy matching.
    if(code==="SV2A"){
      for(const o of options){
        const label=(o.textContent||"").trim();
        const ln=compactSetText(label);
        if(ln===compactSetText("Pokémon Card 151") || ln===compactSetText("Pokemon Card 151")){
          const saved=cacheExpansionId(code,String(o.value),label,"search-select-exact-pokemon-card-151");
          if(log) log.textContent += `  ✓ ${code} → idExpansions=${saved.id} (${saved.label}) desde etiqueta exacta de Cardmarket.\n`;
          return saved;
        }
      }
    }

    // First try code shown in option text/metadata.
    for (const o of options) {
      const hay = [
        o.textContent,
        o.getAttribute("label"),
        o.getAttribute("title"),
        o.getAttribute("data-name"),
        o.getAttribute("data-code"),
        o.getAttribute("data-abbreviation")
      ].filter(Boolean).join(" ");
      const hn = compactSetText(hay);
      if (hn === codeNorm || hn.split(" ").includes(codeNorm) || expansionLabelMatches(code, hay)) {
        const saved = cacheExpansionId(code,String(o.value),(o.textContent||"").trim(),"search-select-code-or-name");
        if (log) log.textContent += `  ✓ ${code} → idExpansions=${saved.id} (${saved.label||code}) desde select idExpansion de búsqueda.\n`;
        return saved;
      }
    }

    // Resolve product slug/name, then match it against option label.
    let slug = "";
    for (const a of doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')) {
      const href = a.getAttribute("href") || "";
      const row = (a.closest('.row,.product-row,article,li,tr,.table-body,.card')?.textContent || a.textContent || "").replace(/\s+/g," ");
      const visibleRe = new RegExp(`\\(\\s*${code}\\s+0*${String(parseInt(num,10))}\\s*\\)`,"i");
      const hrefRe = new RegExp(`-${code}0*${String(parseInt(num,10))}(?:[/?#-]|$)`,"i");
      if (visibleRe.test(row) || hrefRe.test(href)) {
        slug = productExpansionSlug(href);
        break;
      }
    }

    if (slug) {
      const sn = compactSetText(slug);
      for (const o of options) {
        const label = (o.textContent||"").trim();
        const ln = compactSetText(label);
        if (ln === sn || ln.includes(sn) || sn.includes(ln)) {
          const saved = cacheExpansionId(code,String(o.value),label,"search-select-slug");
          if (log) log.textContent += `  ✓ ${code} → idExpansions=${saved.id} (${saved.label||code}) desde select idExpansion de búsqueda.\n`;
          return saved;
        }
      }
    }
    return null;
  }

  async function resolveExpansionId(expansionCode, sellerForDiscovery="") {
    const verifiedCode = canonicalExpansionCode(expansionCode);
    if (VERIFIED_EXPANSION_IDS[verifiedCode]) {
      const v = VERIFIED_EXPANSION_IDS[verifiedCode];
      const saved = cacheExpansionId(verifiedCode, v.id, v.label, "verified-cardmarket-select");
      const log = document.querySelector("#cm-log");
      if (log) log.textContent += `Filtro ${verifiedCode}: idExpansions=${saved.id} verificado (${saved.label}).\n`;
      return saved;
    }

    const log = document.querySelector("#cm-log");
    const code = canonicalExpansionCode(expansionCode);
    if (!code) return null;

    const cached = expansionIdFromCache(code);
    if (cached?.id) return cached;

    const current = findExpansionOption(document, code);
    if (current?.id) {
      const saved = cacheExpansionId(code, current.id, current.label, current.source);
      if (log) log.textContent += `Filtro ${code}: idExpansions=${saved.id} aprendido desde la página actual (${saved.label || "sin etiqueta"}).\n`;
      return saved;
    }

    // v5.4.9: Cardmarket expone el filtro como select[name="idExpansion"] (singular)
    // en la página de búsqueda. Lo resolvemos una sola vez y lo cacheamos.
    try {
      const wantsForSearch = await readWants();
      const sampleForSearch = wantsForSearch.find(w => String(w.expansion||"").trim().toUpperCase() === code);
      if (sampleForSearch) {
        const fromSearch = await resolveExpansionIdFromSearch(code, sampleForSearch);
        if (fromSearch?.id) return fromSearch;
      }
    } catch(e) {
      if (String(e.message||"").includes("ANTIBOT") || String(e.message||"").includes("429")) throw e;
      if (log) log.textContent += `  Aviso resolviendo ${code} desde select idExpansion: ${e.message || e}\n`;
    }

    // Primero resolvemos una carta real de la colección. Su página/slug nos da el nombre
    // oficial de la expansión, que luego podemos cruzar con el selector del vendedor.
    let expansionSlug = "";
    let expansionLabel = "";
    try {
      const wants = await readWants();
      const sample = wants.find(w => String(w.expansion||"").trim().toUpperCase() === code);
      if (sample) {
        const product = await resolveProductForWant(sample, {silent:true});
        if (product?.url) expansionSlug = productExpansionSlug(product.url);
        if (product?.expansionLabel) expansionLabel = product.expansionLabel;

        // v5.4.25: product pages can contain multiple expansion/reprint IDs.
        // For SV2A do NOT trust a generic numeric ID scraped from the product HTML;
        // resolve it from Cardmarket's named expansion selector instead.
        if (code!=="SV2A") {
          const fromProduct = await resolveExpansionIdFromProduct(product, code);
          if (fromProduct?.id) return fromProduct;
        }
      }
    } catch(e) {
      if (String(e.message||"").includes("ANTIBOT") || String(e.message||"").includes("429")) throw e;
      if (log) log.textContent += `  Aviso leyendo idExpansion desde producto ${code}: ${e.message || e}\n`;
    }

    if (!sellerForDiscovery) return null;

    const url = `${location.origin}/es/Pokemon/Users/${encodeURIComponent(sellerForDiscovery)}/Offers/Singles`;
    if (log) {
      log.textContent += `Filtro ${code}: resolviendo idExpansions desde filtros de ${sellerForDiscovery}...\n`;
      log.scrollTop = log.scrollHeight;
    }

    const res = await fetchWithBackoff(
      url,
      {credentials:"include", headers:{"Accept":"text/html,application/xhtml+xml"}},
      `descubrir idExpansion ${code}`,
      1
    );

    if (res.status === 429) throw new Error("HTTP 429 descubriendo idExpansion");
    if (!res.ok) throw new Error(`HTTP ${res.status} descubriendo idExpansion`);

    const html = await res.text();
    if (/just a moment|verify you are human|captcha|checking your browser/i.test(html))
      throw new Error("ANTIBOT_EXPANSION_ID");

    const doc = new DOMParser().parseFromString(html, "text/html");

    // A) método existente por código/nombre.
    let found = findExpansionOption(doc, code);

    // v5.4.25: for SV2A prefer the exact Cardmarket expansion label.
    if (!found?.id && code==="SV2A") {
      const opts=[...doc.querySelectorAll(
        'select[name="idExpansion"] option, select[name="idExpansions"] option, select[name*="idExpansion"] option'
      )].filter(o=>String(o.value||"").trim());

      const wantedLabels=["pokemon card 151","pokémon card 151"];
      for(const o of opts){
        const label=(o.textContent||"").trim();
        const ln=compactSetText(label);
        if(wantedLabels.some(x=>ln===compactSetText(x))){
          found={id:String(o.value),label,source:"exact-pokemon-card-151-label"};
          break;
        }
      }

      if(!found?.id && log){
        const near=opts
          .map(o=>({id:String(o.value),label:(o.textContent||"").trim()}))
          .filter(x=>/151|pokemon card/i.test(x.label))
          .slice(0,12);
        if(near.length){
          log.textContent += `  Opciones 151 visibles en filtro de ${sellerForDiscovery}: ` +
            near.map(x=>`${x.id}=${x.label}`).join(" | ") + `\n`;
        }
      }
    }

    // B) si Cardmarket no muestra el código en el <option>, cruzamos por slug/nombre.
    if (!found?.id && expansionSlug) {
      const slugNorm = compactSetText(expansionSlug);
      const opts = [...doc.querySelectorAll('select[name="idExpansion"] option, select[name="idExpansions"] option, select[name*="idExpansion"] option')]
        .filter(o => String(o.value||"").trim());
      for (const o of opts) {
        const label = (o.textContent||"").trim();
        const ln = compactSetText(label);
        if (ln === slugNorm || ln.includes(slugNorm) || slugNorm.includes(ln)) {
          found = {id:String(o.value), label, source:"slug-label"};
          break;
        }
      }
    }

    // C) atributos/links/query params del propio formulario.
    if (!found?.id) {
      const candidates = [...doc.querySelectorAll('[data-expansion-id],[data-id-expansion],[data-expansion],a[href*="idExpansions="]')];
      for (const el of candidates) {
        const hay = [
          el.textContent,
          el.getAttribute("data-expansion"),
          el.getAttribute("data-name"),
          el.getAttribute("title"),
          el.getAttribute("aria-label")
        ].filter(Boolean).join(" ");
        const hn = compactSetText(hay);
        const cn = compactSetText(code);
        const sn = compactSetText(expansionSlug);
        if (!(hn===cn || hn.split(" ").includes(cn) || (sn && (hn.includes(sn)||sn.includes(hn))))) continue;

        let id = el.getAttribute("data-expansion-id") || el.getAttribute("data-id-expansion") || "";
        if (!id && el.getAttribute("href")) {
          try { id = new URL(el.getAttribute("href"), location.origin).searchParams.get("idExpansions") || ""; } catch(e) {}
        }
        if (id) {
          found = {id:String(id), label:(el.textContent||expansionLabel||expansionSlug||code).trim(), source:"filter-attribute"};
          break;
        }
      }
    }

    if (!found?.id) {
      if (log) log.textContent += `  ⚠ No pude resolver idExpansions para ${code}. Colección omitida; NO escaneo inventario completo.\n`;
      return null;
    }

    const saved = cacheExpansionId(code, found.id, found.label, found.source);
    if (log) log.textContent += `  ✓ ${code} → idExpansions=${saved.id}${saved.label ? ` (${saved.label})` : ""}. Guardado en caché.\n`;
    return saved;
  }
  const norm = s => String(s ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const normalizeNum = v => {
    const m = String(v ?? "").match(/\d+/);
    return m ? String(parseInt(m[0],10)) : "";
  };
  const euro = s => {
    const m = (s || "").replace(/\s/g, "").match(/(\d+(?:[.,]\d{1,2})?)€/);
    return m ? parseFloat(m[1].replace(".", "").replace(",", ".")) : null;
  };
  const fmt = n => `${Number(n || 0).toFixed(2).replace(".", ",")} €`;
  const csvDec = (n, decimals=2) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toFixed(decimals).replace(".", ",") : "";
  };
  const csvEscape = v => {
    v = String(v ?? "");
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
  };
  const download = (filename, text, type="text/csv;charset=utf-8") => {
    const blob = new Blob(["\ufeff" + text], {type});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  const parseCSV = text => {
    text = text.replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const parseLine = line => {
      const out=[]; let cur="", q=false;
      for (let i=0;i<line.length;i++) {
        const c=line[i];
        if (c === '"') {
          if (q && line[i+1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (c === sep && !q) { out.push(cur); cur=""; }
        else cur += c;
      }
      out.push(cur);
      return out.map(x=>x.trim());
    };
    const head = parseLine(lines[0]).map(x=>x.toLowerCase());
    return lines.slice(1).map(line => {
      const vals=parseLine(line), obj={};
      head.forEach((h,i)=>obj[h]=vals[i] ?? "");
      return obj;
    });
  };
  let helperDb = null;
  let sellersMemory = {};
  let indexedDbActive = false;
  let sellerWriteChain = Promise.resolve();

  function requestToPromise(req) {
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error || new Error("IndexedDB request failed"));
    });
  }

  function txDone(tx) {
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort=()=>reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openHelperDb() {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(IDB_NAME,IDB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(IDB_SELLERS_STORE)){
          db.createObjectStore(IDB_SELLERS_STORE,{keyPath:"seller"});
        }
        if(!db.objectStoreNames.contains(IDB_KV_STORE)){
          db.createObjectStore(IDB_KV_STORE,{keyPath:"key"});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error || new Error("No se pudo abrir IndexedDB"));
      req.onblocked=()=>reject(new Error("IndexedDB bloqueada por otra pestaña/versión"));
    });
  }

  async function idbGetAllSellers() {
    if(!helperDb) return [];
    const tx=helperDb.transaction(IDB_SELLERS_STORE,"readonly");
    const rows=await requestToPromise(tx.objectStore(IDB_SELLERS_STORE).getAll());
    await txDone(tx);
    return rows || [];
  }

  async function idbPutSeller(record) {
    if(!helperDb || !record?.seller) return;
    const tx=helperDb.transaction(IDB_SELLERS_STORE,"readwrite");
    tx.objectStore(IDB_SELLERS_STORE).put(record);
    await txDone(tx);
  }

  async function idbPutManySellers(obj) {
    if(!helperDb) return;
    const rows=Object.values(obj||{}).filter(r=>r?.seller);
    const tx=helperDb.transaction(IDB_SELLERS_STORE,"readwrite");
    const store=tx.objectStore(IDB_SELLERS_STORE);
    for(const row of rows) store.put(row);
    await txDone(tx);
  }

  async function idbClearSellers() {
    if(!helperDb) return;
    const tx=helperDb.transaction(IDB_SELLERS_STORE,"readwrite");
    tx.objectStore(IDB_SELLERS_STORE).clear();
    await txDone(tx);
  }

  async function idbKvGet(key) {
    if(!helperDb) return null;
    const tx=helperDb.transaction(IDB_KV_STORE,"readonly");
    const row=await requestToPromise(tx.objectStore(IDB_KV_STORE).get(key));
    await txDone(tx);
    return row ? row.value : null;
  }

  async function idbKvPut(key,value) {
    if(!helperDb) return;
    const tx=helperDb.transaction(IDB_KV_STORE,"readwrite");
    tx.objectStore(IDB_KV_STORE).put({key,value,updated_at:Date.now()});
    await txDone(tx);
  }

  async function idbKvDelete(key) {
    if(!helperDb) return;
    const tx=helperDb.transaction(IDB_KV_STORE,"readwrite");
    tx.objectStore(IDB_KV_STORE).delete(key);
    await txDone(tx);
  }

  function queueSellerPut(record) {
    if(!record?.seller) return;
    sellersMemory[record.seller]=record;

    if(!indexedDbActive){
      try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(sellersMemory)); }
      catch(e){ console.warn("No pude guardar vendedores en localStorage",e); }
      return;
    }

    const snapshot = typeof structuredClone==="function"
      ? structuredClone(record)
      : JSON.parse(JSON.stringify(record));

    sellerWriteChain=sellerWriteChain
      .then(()=>idbPutSeller(snapshot))
      .catch(e=>console.warn("No pude guardar vendedor en IndexedDB",record.seller,e));
  }

  const loadSellers = () => sellersMemory;

  const saveSellers = obj => {
    sellersMemory=obj || {};

    if(!indexedDbActive){
      try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(sellersMemory)); }
      catch(e){ console.warn("No pude guardar vendedores en localStorage",e); }
      return;
    }

    const snapshot = typeof structuredClone==="function"
      ? structuredClone(sellersMemory)
      : JSON.parse(JSON.stringify(sellersMemory));

    sellerWriteChain=sellerWriteChain
      .then(()=>idbPutManySellers(snapshot))
      .catch(e=>console.warn("No pude sincronizar vendedores en IndexedDB",e));
  };

  async function clearStoredSellers() {
    sellersMemory={};
    if(indexedDbActive){
      await idbClearSellers();
      localStorage.removeItem(STORAGE_KEY);
    }else{
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async function initIndexedStorage() {
    try{
      helperDb=await openHelperDb();

      const idbRows=await idbGetAllSellers();
      const merged={};
      for(const row of idbRows) if(row?.seller) merged[row.seller]=row;

      // One-time migration of the current v5.4 seller blob.
      const legacyRaw=localStorage.getItem(STORAGE_KEY);
      if(legacyRaw){
        try{
          const legacy=JSON.parse(legacyRaw)||{};
          for(const [seller,record] of Object.entries(legacy)){
            if(record?.seller) merged[seller]=record;
          }
          await idbPutManySellers(merged);
          localStorage.removeItem(STORAGE_KEY);
        }catch(e){
          console.warn("No pude migrar vendedores legacy a IndexedDB",e);
        }
      }

      sellersMemory=merged;

      // One-time migration of the large smart-plan blobs.
      for(const [legacyKey,dbKey] of [
        ["cm_helper_smart_plan_v5","smart_plan"],
        ["cm_helper_smart_plan_progress_v5","smart_plan_progress"]
      ]){
        const raw=localStorage.getItem(legacyKey);
        if(raw){
          try{
            await idbKvPut(dbKey,JSON.parse(raw));
            localStorage.removeItem(legacyKey);
          }catch(e){
            console.warn(`No pude migrar ${legacyKey} a IndexedDB`,e);
          }
        }
      }

      indexedDbActive=true;
      console.info(`Cardmarket Helper: IndexedDB activa · ${Object.keys(sellersMemory).length} vendedores cargados.`);
      return true;
    }catch(e){
      console.warn("IndexedDB no disponible; usando localStorage como fallback.",e);
      indexedDbActive=false;
      helperDb=null;
      try{sellersMemory=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}")||{};}
      catch{sellersMemory={};}
      return false;
    }
  }

  await initIndexedStorage();

  const loadMarketCache = () => {
    try { return JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || "{}"); }
    catch { return {}; }
  };
  const saveMarketCache = obj => localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(obj));

  const median = arr => {
    const x = arr.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if (!x.length) return null;
    const m = Math.floor(x.length/2);
    return x.length % 2 ? x[m] : (x[m-1]+x[m])/2;
  };
  const percentile = (arr, p) => {
    const x = arr.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if (!x.length) return null;
    const idx = Math.max(0, Math.min(x.length-1, Math.floor((x.length-1)*p)));
    return x[idx];
  };
  const cardKey = o => `${norm(canonicalExpansionCode(o.expansion || ""))}:${normalizeNum(o.number)}`;

  const COUNTRY_NAMES = {
    NL:["netherlands","nederland","niederlande","holanda","países bajos","paises bajos"],
    DE:["germany","deutschland","alemania"],
    FR:["france","francia","frankreich"],
    PT:["portugal"],
    CZ:["czech republic","czechia","chequia","tschechien","česko","cesko"],
    ES:["spain","españa","espana","spanien"],
    BE:["belgium","belgië","belgie","belgique","belgien","bélgica","belgica"],
    IT:["italy","italia","italien"],
    AT:["austria","österreich","osterreich"],
    PL:["poland","polska","polen","polonia"],
    DK:["denmark","danmark","dänemark","dinamarca"],
    SE:["sweden","sverige","schweden","suecia"],
    FI:["finland","suomi","finnland","finlandia"],
    IE:["ireland","irlanda"],
    GR:["greece","grecia","griechenland"],
    HU:["hungary","hungría","hungria","ungarn"],
    RO:["romania","rumanía","rumania","rumänien"],
    SK:["slovakia","slovensko","eslovaquia","slowakei"]
  };

  // Cardmarket sellerCountry ids confirmed from the live filter.
  const CARDMARKET_COUNTRY_IDS = {
    CZ:"6",
    DE:"7",
    ES:"10",
    FR:"12",
    NL:"23",
    PT:"26"
  };

  function orderedSelectedCountryCodes() {
    return ($("#cm-country-list")?.value || "NL,DE,FR,PT,CZ,ES")
      .toUpperCase()
      .split(/[\s,;]+/)
      .map(x=>x.trim())
      .filter(Boolean)
      .filter((c,i,a)=>a.indexOf(c)===i)
      .filter(c=>CARDMARKET_COUNTRY_IDS[c]);
  }

  function discoveryCountryCodes() {
    const mode = $("#cm-country-mode")?.value || "moyano";
    if (mode === "cost") return [];

    const selected = orderedSelectedCountryCodes();

    if (mode === "moyano") {
      // Strict country preference for discovery.
      const priority = ["NL","DE","ES","FR","PT","CZ"];
      const allowed = new Set(selected);
      return priority.filter(c=>allowed.has(c));
    }

    // "Solo países seleccionados": respect the order typed by the user.
    return selected;
  }

  function buildDiscoveryUrl(baseUrl, countryCode="", want=null) {
    const u = new URL(baseUrl, location.origin);

    const langId = languageIdForWant(want);
    if (langId) u.searchParams.set("language", langId);

    const cond = String(want?.condition || "NM").toUpperCase();
    if (cond === "NM") u.searchParams.set("minCondition", "2");

    if (countryCode && CARDMARKET_COUNTRY_IDS[countryCode]) {
      u.searchParams.set("sellerCountry", CARDMARKET_COUNTRY_IDS[countryCode]);
    } else {
      u.searchParams.delete("sellerCountry");
    }

    return u.href;
  }

  function loadSeedHistory() {
    try { return JSON.parse(localStorage.getItem(SEED_HISTORY_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveSeedHistory(obj) {
    localStorage.setItem(SEED_HISTORY_KEY, JSON.stringify(obj));
  }

  function markSeedUsed(seed) {
    const h = loadSeedHistory();
    const n = cardKey(seed);
    if (!n || n === ":") return;
    h[n] = (h[n] || 0) + 1;
    saveSeedHistory(h);
  }


  function countryFromText(text) {
    const t = norm(text);
    for (const [code,names] of Object.entries(COUNTRY_NAMES)) {
      if (names.some(n => t === norm(n) || t.includes(norm(n)))) return code;
    }
    return "";
  }

  function detectCountryFromElement(root) {
    if (!root) return "";
    const attrs = [...root.querySelectorAll("[aria-label],[title],[data-bs-original-title],[data-original-title]")]
      .flatMap(el => [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.getAttribute("data-bs-original-title"),
        el.getAttribute("data-original-title")
      ])
      .filter(Boolean);

    for (const value of attrs) {
      const c = countryFromText(value);
      if (c) return c;
    }
    return "";
  }

  function selectedCountrySet() {
    return new Set(
      ($("#cm-country-list")?.value || "NL,DE,FR,PT,CZ,ES")
        .toUpperCase()
        .split(/[\s,;]+/)
        .map(x=>x.trim())
        .filter(Boolean)
    );
  }

  function countryBaseRank(code) {
    // "Perfil Moyano": preferencia práctica aportada por el usuario.
    // No es una valoración objetiva de países ni vendedores individuales.
    return ({NL:0, DE:1, ES:2, FR:3, PT:4, CZ:5})[code] ?? 6;
  }

  function countryPreferenceScore(sellerRecord, selectedCardCount=0, selectedCardCost=0) {
    const mode = $("#cm-country-mode")?.value || "cost";
    if (mode !== "moyano") return 0;

    const code = sellerRecord?.country || "";
    const strength = $("#cm-country-strength")?.value || "strong";

    // Monetary "trust premium" used ONLY by the optimizer's effective cost.
    // Real totals are always reported separately.
    const baseStrong = {
      NL:0.00,
      DE:0.75,
      FR:1.75,
      PT:1.75,
      CZ:2.50,
      ES:5.00
    };

    let p = baseStrong[code] ?? 6.00;

    // Czech sellers become more attractive for larger consolidated orders.
    if (code === "CZ" && selectedCardCount >= 15) p = 1.00;

    // Spain remains viable for concentrated cheap bulk.
    const avg = selectedCardCount ? selectedCardCost / selectedCardCount : Infinity;
    if (code === "ES" && selectedCardCount >= 15 && avg <= 0.15) p = 2.50;

    if (strength === "soft") p *= 0.35;
    else if (strength === "medium") p *= 0.65;

    return p;
  }

  function countryEffectiveCost(realTotal, sellerRecords, selectedBySeller) {
    const mode = $("#cm-country-mode")?.value || "cost";
    if (mode !== "moyano") return realTotal;

    let penalty = 0;
    for (const s of sellerRecords) {
      const u = selectedBySeller[s.seller] || {count:0,cost:0};
      if (!u.count) continue;
      penalty += countryPreferenceScore(s,u.count,u.cost);
    }
    return realTotal + penalty;
  }

  function countryMargin() {
    const v = parseFloat(($("#cm-country-margin")?.value || "5").replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 5;
  }

  function countryAllowed(code) {
    const mode = $("#cm-country-mode")?.value || "cost";
    if (mode !== "selected") return true;
    return selectedCountrySet().has((code || "").toUpperCase());
  }

  function sellerDiscoverySort(a,b) {
    const mode = $("#cm-country-mode")?.value || "cost";
    if (mode !== "moyano") return 0;
    return countryBaseRank(a.country) - countryBaseRank(b.country);
  }


  document.getElementById("cm-helper-v42")?.remove();
  const box = document.createElement("div");
  box.id = "cm-helper-v42";
  box.style.cssText = `
    position:fixed;z-index:2147483647;top:18px;right:18px;
    width:min(720px,calc(100vw - 36px));height:min(820px,calc(100vh - 36px));
    min-width:420px;min-height:260px;max-width:calc(100vw - 12px);max-height:calc(100vh - 12px);
    background:#fff;color:#111;border:2px solid #23304a;border-radius:12px;
    box-shadow:0 10px 36px rgba(0,0,0,.35);font:14px Arial,sans-serif;
    resize:both;overflow:hidden;display:flex;flex-direction:column
  `;
  box.innerHTML = `
    <div style="font-size:18px;font-weight:700;margin-bottom:10px">
      Cardmarket Helper v${VERSION}
    </div>

    <div style="margin-bottom:8px;padding:8px;border:1px solid #d7dce5;border-radius:7px;background:#f8fafc">
      <b>Multi-set:</b> la expansión se lee del Wants CSV. Idioma, estado, máximo por carta y presupuesto máximo del carrito se eligen aquí.
      <input id="cm-exp" type="hidden" value="MULTI">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:7px">
        <label>Idioma:
          <select id="cm-language" style="padding:4px">
            <option value="Spanish" selected>Español</option>
            <option value="English">Inglés</option>
            <option value="French">Francés</option>
            <option value="German">Alemán</option>
            <option value="Italian">Italiano</option>
            <option value="Portuguese">Portugués</option>
            <option value="Japanese">Japonés</option>
          </select>
        </label>
        <label>Estado mínimo:
          <select id="cm-condition" style="padding:4px">
            <option value="MT">MT</option>
            <option value="NM" selected>NM</option>
            <option value="EX">EX</option>
            <option value="GD">GD</option>
            <option value="LP">LP</option>
            <option value="PL">PL</option>
            <option value="PO">PO</option>
          </select>
        </label>
        <label>Máx. por carta (€):
          <input id="cm-card-max-price" type="number" min="0" step="0.01" placeholder="Sin límite" style="width:92px;padding:4px">
        </label>
        <label>Máx. carrito (€):
          <input id="cm-cart-max-price" type="number" min="0" step="0.01" placeholder="Sin límite" style="width:92px;padding:4px">
        </label>
      </div>
    </div>

    <div style="margin-bottom:8px">
      <label>Wants CSV:
        <input type="file" id="cm-file" accept=".csv,text/csv" style="max-width:320px">
      </label>
    </div>

    <div style="margin-bottom:8px">
      <div style="font-weight:700;margin-bottom:4px">Vendedores (uno por línea, coma o espacio):</div>
      <textarea id="cm-sellers" rows="7" style="width:100%;box-sizing:border-box;padding:6px"
        placeholder="samibetis&#10;usuario2&#10;usuario3"></textarea>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      <label>Pausa entre páginas:
        <input id="cm-page-delay" value="700" style="width:75px;padding:4px"> ms
      </label>
      <label>Pausa entre vendedores:
        <input id="cm-seller-delay" value="1800" style="width:75px;padding:4px"> ms
      </label>
    </div>

    <div style="margin-bottom:8px">
      <label>Portes por defecto:
        <input id="cm-default-ship" value="2.00" style="width:70px;padding:4px"> €
      </label>
      <span style="font-size:11px;color:#666">Luego puedes corregirlos con el botón "Editar portes" sin volver a analizar.</span>
    </div>

    <div style="border:1px solid #cfcfcf;border-radius:7px;padding:8px;margin-bottom:9px">
      <div style="font-weight:700;margin-bottom:5px">País del vendedor</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label>Modo:
          <select id="cm-country-mode">
            <option value="cost">Solo coste</option>
            <option value="moyano" selected>Perfil Moyano</option>
            <option value="selected">Solo países seleccionados</option>
          </select>
        </label>
        <label>Países permitidos:
          <input id="cm-country-list" value="NL,DE,FR,PT,CZ,ES" style="width:155px;padding:4px">
        </label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <label>Margen país:
          <input id="cm-country-margin" value="5.00" style="width:60px;padding:4px"> €
        </label>
        <label>Fuerza país:
          <select id="cm-country-strength">
            <option value="soft">Suave</option>
            <option value="medium">Media</option>
            <option value="strong" selected>Fuerte</option>
          </select>
        </label>
      </div>
      <div style="font-size:11px;color:#666;margin-top:5px">
        Perfil país: prioriza NL → DE → ES → FR → PT → CZ. En modo fuerte el país entra
        en el coste efectivo del plan; una diferencia real de hasta ~5 € puede compensarse
        por mayor confianza en el país/vendedor.
      </div>
    </div>

    <div style="border:1px solid #bbb;border-radius:7px;padding:8px;margin-bottom:9px;background:#fafafa">
      <div style="font-weight:700;margin-bottom:5px">Descubrimiento automático de vendedores</div>
      <div style="margin-bottom:6px">
        <label>Semillas manuales opcionales (números, separados por coma):
          <input id="cm-seeds" placeholder="015, 064, 137" style="width:170px;padding:4px">
        </label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label>Semillas/ronda:
          <input id="cm-seeds-per-round" value="3" style="width:45px;padding:4px">
        </label>
        <label>Vendedores/semilla:
          <input id="cm-sellers-per-seed" value="15" style="width:45px;padding:4px">
        </label>
        <label>Rondas:
          <input id="cm-rounds" value="3" style="width:45px;padding:4px">
        </label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
        <label>Pausa semillas:
          <input id="cm-seed-delay" value="1200" style="width:65px;padding:4px"> ms
        </label>
        <label>Máx. vendedores nuevos/ronda:
          <input id="cm-max-new-sellers" value="30" style="width:55px;padding:4px">
        </label>
      </div>
      <div style="font-size:11px;color:#666;margin-top:5px">
        Si no indicas semillas, rota entre las menos usadas históricamente. En Perfil Moyano, cada semilla busca primero NL; solo si faltan vendedores pasa a DE → ES → FR → PT → CZ.
      </div>
    </div>

    <div style="border:1px solid #ddd;border-radius:7px;padding:8px;margin-bottom:9px">
      <div style="font-weight:700;margin-bottom:5px">Valoración inteligente</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <label>Prima máxima mercado:
          <input id="cm-premium" value="20" style="width:50px;padding:4px"> %
        </label>
        <label title="Se acepta el mayor margen entre el porcentaje y esta cantidad en euros.">Margen mínimo en euros:
          <input id="cm-abs-tol" value="0.50" style="width:60px;padding:4px"> €
        </label>
        <label>Pausa ficha mercado:
          <input id="cm-market-delay" value="4000" style="width:70px;padding:4px"> ms
        </label>
        <label title="100% = un porte de 7 € necesita aportar al menos ~7 € entre valor de cartas nuevas y ahorro de precios.">
          Porte máx. / valor aportado:
          <input id="cm-ship-value-ratio" value="100" style="width:55px;padding:4px"> %
        </label>
      </div>
      <div style="font-size:11px;color:#666;margin-top:5px">
        Techo por carta = referencia + el mayor margen entre el porcentaje y los euros. Ejemplo: 0,70 € con 20 % y 0,50 € admite hasta 1,20 €. El plan compara cartas y portes entre las ofertas admitidas.
        Con “Solo base”, prioriza un vendedor ancla con la mayor cobertura posible. Solo añade otro vendedor si su porte se justifica por el valor de las cartas nuevas y/o el ahorro que aporta.
      </div>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="cm-auto-discover" style="padding:7px 10px;font-weight:700">Auto descubrir + analizar</button>
      <button id="cm-resume-partials" style="padding:7px 10px;font-weight:700">Reanudar parciales</button>
      <button id="cm-run-batch" style="padding:7px 10px">Analizar lista manual</button>
      <button id="cm-edit-shipping" style="padding:7px 10px">Editar portes</button>
      <button id="cm-smart-plan" style="padding:7px 10px;font-weight:700">Plan inteligente</button>
      <button id="cm-compare" style="padding:7px 10px">Comparar simple</button>
      <div id="cm-cart-pack-box" style="display:none;margin-top:8px;padding:8px;border:1px solid #ccc;border-radius:8px">
        <div style="font-weight:700;margin-bottom:6px">Carrito por vendedor</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="cm-cart-seller" style="min-width:250px;padding:6px"></select>
          <label>Tanda máx.:
            <input id="cm-cart-batch" value="30" style="width:55px;padding:5px"> cartas
          </label>
          <button id="cm-add-cart-pack" disabled style="padding:7px 10px;font-weight:700">
            Añadir este vendedor
          </button>
        </div>
        <div id="cm-cart-pack-info" style="margin-top:6px;color:#555"></div>
      </div>
      <button id="cm-export" style="padding:7px 10px">Exportar resumen</button>
      <button id="cm-clear-cache" style="padding:7px 10px">Borrar caché catálogo</button>
      <button id="cm-clear-seeds" style="padding:7px 10px">Reiniciar semillas</button>
      <button id="cm-export-expdb" style="padding:7px 10px">Exportar expansiones</button>
      <label style="display:inline-flex;align-items:center;padding:7px 10px;border:1px solid #aaa;border-radius:4px;cursor:pointer">Importar expansiones<input id="cm-import-expdb" type="file" accept=".csv,text/csv" style="display:none"></label>
      <button id="cm-clear" style="padding:7px 10px">Borrar guardados</button>
      <button id="cm-close" style="padding:7px 10px">Cerrar</button>
    </div>

    <pre id="cm-log" style="white-space:pre-wrap;max-height:360px;overflow:auto;background:#f4f4f4;padding:8px;margin-top:10px;border-radius:6px"></pre>
  `;
  loadExpansionDb();
  document.body.appendChild(box);

  // v5.2.5: floating desktop-style window.
  const originalHtml = box.innerHTML;
  box.innerHTML = `
    <div id="cm-window-bar" style="
      flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:9px 11px;background:#23304a;color:#fff;cursor:move;
      user-select:none;border-radius:9px 9px 0 0;">
      <strong>Cardmarket Helper v${VERSION}</strong>
      <div style="display:flex;gap:6px">
        <button id="cm-window-fit" title="Ajustar a pantalla"
          style="padding:4px 8px;border:0;border-radius:5px;cursor:pointer">Ajustar</button>
        <button id="cm-window-min" title="Minimizar"
          style="padding:4px 8px;border:0;border-radius:5px;cursor:pointer">—</button>
      </div>
    </div>
    <div id="cm-window-body" style="
      flex:1 1 auto;min-height:0;overflow:auto;padding:15px;
      box-sizing:border-box;overscroll-behavior:contain;">${originalHtml}</div>
  `;

  function loadUiState(){
    try { return JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveUiState(){
    const r=box.getBoundingClientRect();
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      left:Math.round(r.left), top:Math.round(r.top),
      width:Math.round(r.width), height:Math.round(r.height),
      minimized:box.dataset.minimized==="1"
    }));
  }
  function clampWindow(){
    const r=box.getBoundingClientRect();
    const w=Math.min(r.width,Math.max(320,window.innerWidth-12));
    const h=Math.min(r.height,Math.max(110,window.innerHeight-12));
    const left=Math.max(6,Math.min(r.left,window.innerWidth-w-6));
    const top=Math.max(6,Math.min(r.top,window.innerHeight-h-6));
    box.style.width=`${w}px`;
    if(box.dataset.minimized!=="1") box.style.height=`${h}px`;
    box.style.left=`${left}px`;
    box.style.top=`${top}px`;
    box.style.right="auto";
  }

  const uiState=loadUiState();
  if(Number.isFinite(uiState.width)) box.style.width=`${Math.max(420,uiState.width)}px`;
  if(Number.isFinite(uiState.height)) box.style.height=`${Math.max(260,uiState.height)}px`;
  if(Number.isFinite(uiState.left)){ box.style.left=`${uiState.left}px`; box.style.right="auto"; }
  if(Number.isFinite(uiState.top)) box.style.top=`${uiState.top}px`;

  const bar=box.querySelector("#cm-window-bar");
  const body=box.querySelector("#cm-window-body");
  const minBtn=box.querySelector("#cm-window-min");
  const fitBtn=box.querySelector("#cm-window-fit");

  let drag=null;
  bar.addEventListener("pointerdown",e=>{
    if(e.target.closest("button")) return;
    const r=box.getBoundingClientRect();
    drag={dx:e.clientX-r.left,dy:e.clientY-r.top};
    bar.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  bar.addEventListener("pointermove",e=>{
    if(!drag) return;
    const r=box.getBoundingClientRect();
    const maxLeft=Math.max(6,window.innerWidth-r.width-6);
    const maxTop=Math.max(6,window.innerHeight-r.height-6);
    box.style.left=`${Math.max(6,Math.min(e.clientX-drag.dx,maxLeft))}px`;
    box.style.top=`${Math.max(6,Math.min(e.clientY-drag.dy,maxTop))}px`;
    box.style.right="auto";
  });
  const endDrag=e=>{
    if(!drag) return;
    drag=null;
    try{bar.releasePointerCapture(e.pointerId)}catch{}
    saveUiState();
  };
  bar.addEventListener("pointerup",endDrag);
  bar.addEventListener("pointercancel",endDrag);

  let restoredHeight=Number.isFinite(uiState.height)?uiState.height:700;
  function setMinimized(on){
    if(on){
      restoredHeight=box.getBoundingClientRect().height;
      body.style.display="none";
      box.style.height="auto";
      box.style.minHeight="0";
      box.style.resize="none";
      box.dataset.minimized="1";
      minBtn.textContent="□";
      minBtn.title="Restaurar";
    }else{
      body.style.display="block";
      box.style.minHeight="260px";
      box.style.resize="both";
      box.style.height=`${Math.max(260,restoredHeight)}px`;
      box.dataset.minimized="0";
      minBtn.textContent="—";
      minBtn.title="Minimizar";
      clampWindow();
    }
    saveUiState();
  }

  minBtn.onclick=()=>setMinimized(box.dataset.minimized!=="1");
  fitBtn.onclick=()=>{
    box.dataset.minimized="0";
    body.style.display="block";
    box.style.resize="both";
    box.style.minHeight="260px";
    const w=Math.min(720,window.innerWidth-24);
    const h=Math.min(820,window.innerHeight-24);
    box.style.width=`${w}px`;
    box.style.height=`${h}px`;
    box.style.left=`${Math.max(12,window.innerWidth-w-12)}px`;
    box.style.top="12px";
    box.style.right="auto";
    minBtn.textContent="—";
    saveUiState();
  };

  let resizeTimer=null;
  const ro=new ResizeObserver(()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(saveUiState,180);
  });
  ro.observe(box);

  window.addEventListener("resize",clampWindow);
  setTimeout(()=>{
    clampWindow();
    if(uiState.minimized) setMinimized(true);
  },0);

  const $ = s => box.querySelector(s);
  $("#cm-close").onclick = () => box.remove();

  const readWants = async () => {
    const file = $("#cm-file").files[0];
    if (!file) return [];

    const globalLanguage = $("#cm-language")?.value || "Spanish";
    const globalCondition = ($("#cm-condition")?.value || "NM").toUpperCase();
    const cardMaxRaw = String($("#cm-card-max-price")?.value ?? "").trim().replace(",", ".");
    const cardMax = cardMaxRaw === "" ? null : Number(cardMaxRaw);

    return parseCSV(await file.text()).map(w => ({
      number: normalizeNum(w.number),
      name: String(w.name || "").trim(),
      expansion: canonicalExpansionCode(w.expansion),
      language: globalLanguage,
      condition: globalCondition,
      max_price_eur: Number.isFinite(cardMax) ? cardMax : null
    })).filter(w => w.number && w.expansion);
  };
  function getCartMaxPrice() {
    const raw = String($("#cm-cart-max-price")?.value ?? "").trim().replace(",", ".");
    if (raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : null;
  }


  function wantedByKey(wants) {
    return Object.fromEntries(wants.map(w => [cardKey(w), w]));
  }

  function languageIdForWant(w) {
    const l = norm(w?.language || "");
    if (l.startsWith("english") || l === "en") return "1";
    if (l.startsWith("french") || l.startsWith("franc")) return "2";
    if (l.startsWith("german") || l.startsWith("alem")) return "3";
    if (l.startsWith("spanish") || l.startsWith("espan") || l === "es") return "4";
    if (l.startsWith("italian") || l.startsWith("ital")) return "5";
    if (l.startsWith("japanese") || l.startsWith("japon")) return "7";
    if (l.startsWith("portugu")) return "8";
    return "";
  }

  function detectOfferLanguage(row) {
    const attrs=[...row.querySelectorAll("[aria-label],[title],[data-bs-original-title],[data-original-title]")]
      .flatMap(el=>[
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.getAttribute("data-bs-original-title"),
        el.getAttribute("data-original-title")
      ]).filter(Boolean).join(" ");
    if (/english|inglés|ingles/i.test(attrs)) return "English";
    if (/spanish|español|espanol|castellano/i.test(attrs)) return "Spanish";
    if (/french|français|francais|francés|frances/i.test(attrs)) return "French";
    if (/german|deutsch|alemán|aleman/i.test(attrs)) return "German";
    if (/italian|italiano/i.test(attrs)) return "Italian";
    if (/japanese|日本語|japonés|japones/i.test(attrs)) return "Japanese";
    if (/portuguese|português|portugues/i.test(attrs)) return "Portuguese";
    return "Other/Unknown";
  }

  function languageMatchesWant(actual, wanted) {
    const a=norm(actual), w=norm(wanted);
    if (!w) return true;
    if (w.startsWith("spanish") || w.startsWith("espan") || w==="es") return a.startsWith("spanish");
    if (w.startsWith("english") || w==="en") return a.startsWith("english");
    if (w.startsWith("french") || w.startsWith("franc")) return a.startsWith("french");
    if (w.startsWith("german") || w.startsWith("alem")) return a.startsWith("german");
    if (w.startsWith("italian") || w.startsWith("ital")) return a.startsWith("italian");
    if (w.startsWith("japanese") || w.startsWith("japon")) return a.startsWith("japanese");
    if (w.startsWith("portugu")) return a.startsWith("portugu");
    return a===w;
  }

  const parseSellerList = raw => [...new Set(
    raw.split(/[\s,;]+/)
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => {
        try {
          if (x.includes("cardmarket.com")) {
            const u = new URL(x);
            const m = u.pathname.match(/\/Users\/([^/]+)/i);
            return m ? decodeURIComponent(m[1]) : "";
          }
        } catch {}
        return x.replace(/^@/, "");
      })
      .filter(Boolean)
  )];

  function currentCoverageSet() {
    const covered = new Set();
    for (const s of Object.values(loadSellers())) {
      for (const o of (s.offers || [])) covered.add(cardKey(o));
    }
    return covered;
  }

  async function resolveProductForWant(want) {
    const key=cardKey(want);
    const cache=loadCatalogCache() || {};
    const cached=cache[key];
    const badCachedName=/^(English|Spanish|German|French|Italian|Portuguese|Japanese|Chinese|Korean|Dutch|Polish|Czech|Hungarian|Russian)$/i.test(String(cached?.name||"").trim());
    const cachedParsed=cached?.url ? productCodeNumberFromHref(cached.url) : null;
    const cacheMatchesSet=cachedParsed &&
      expansionCodesEquivalent(cachedParsed.expansion,want.expansion) &&
      normalizeNum(cached?.number)===normalizeNum(want.number);
    if (cached?.url && cached?.ts && !badCachedName && cacheMatchesSet && (Date.now()-cached.ts)<14*24*3600*1000) return cached;
    if (badCachedName || (cached?.url && !cacheMatchesSet)) delete cache[key];

    const log=$("#cm-log");
    const exp=String(want.expansion||"").trim().toUpperCase();
    const num=normalizeNum(want.number);
    const padded=String(num).padStart(3,"0");
    const queries=[
      [want.name, exp, padded].filter(Boolean).join(" "),
      `${exp} ${padded}`,
      `${exp}${padded}`
    ];

    log.textContent += `Resolviendo producto ${exp} #${padded}${want.name?` · ${want.name}`:""}...\n`;

    for (const q of [...new Set(queries)]) {
      const url=new URL(`${location.origin}/es/Pokemon/Products/Search`);
      url.searchParams.set("searchString",q);
      const res=await fetchWithBackoff(
        url.href,
        {credentials:"include",headers:{"Accept":"text/html,application/xhtml+xml"}},
        `buscar producto ${key}`,2
      );
      if(!res.ok) throw new Error(`HTTP ${res.status} buscando ${key}`);
      const html=await res.text();
      if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))
        throw new Error("ANTIBOT_PRODUCT_SEARCH");

      const doc=new DOMParser().parseFromString(html,"text/html");
      const links=[...doc.querySelectorAll('a[href*="/Pokemon/Products/Singles/"]')];
      for(const a of links){
        const href=a.getAttribute("href")||"";
        const label=(a.textContent||"").trim();
        const rowText=(a.closest('.row, .product-row, article, li, tr, .table-body, .card')?.textContent||label).replace(/\s+/g," ").trim();

        // v5.4.24: the canonical product URL must belong to the requested set.
        // This prevents "SV2A 007" searches from resolving the western MEW007 reprint.
        const parsedHref=productCodeNumberFromHref(href);
        const escapedExpForVisible=exp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const visibleRe=new RegExp(`\\(\\s*${escapedExpForVisible}\\s+0*${String(parseInt(num,10))}\\s*\\)`,`i`);
        const visibleMatches=visibleRe.test(rowText);
        if(parsedHref){
          if(!expansionCodesEquivalent(parsedHref.expansion,exp)) continue;
          // Cardmarket has products where the internal URL suffix is off by one
          // from the printed card number (e.g. DRI 032 -> ...DRI031).
          // Trust the visible (SET NNN) label when it explicitly confirms the wanted number.
          if(parsedHref.number!==num && !visibleMatches) continue;
        } else if(!visibleMatches) continue;

        // v5.4.13: Cardmarket puede poner "English" como texto del enlace.
        // El slug canónico de la URL es la fuente principal del nombre.
        let name="";
        try {
          const pu=new URL(href,location.origin);
          const slug=decodeURIComponent(pu.pathname.split("/").filter(Boolean).pop()||"");
          const escapedExp=exp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          // Strip Cardmarket's internal URL suffix, which can differ from the printed number.
          const suffixRe=new RegExp(`-${escapedExp}\\d{3}$`,`i`);
          name=slug.replace(suffixRe,"").replace(/-/g," ").trim();
        } catch(e) {}

        const badUi=/^(English|Spanish|German|French|Italian|Portuguese|Japanese|Chinese|Korean|Dutch|Polish|Czech|Hungarian|Russian)$/i;
        if(!name || badUi.test(name)){
          name="";
          const escapedExp=exp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          const m=rowText.match(new RegExp(`(.+?)\\s*\\(\\s*${escapedExp}\\s+0*${String(parseInt(num,10))}\\s*\\)`,`i`));
          if(m?.[1]){
            const candidate=m[1].trim().split(/\s{2,}/).pop()||"";
            if(candidate && !badUi.test(candidate)) name=candidate;
          }
        }
        if(!name && label && !badUi.test(label)) name=label;
        const best={
          number:num,
          name:name || want.name || `${exp} ${padded}`,
          expansion:exp,
          language:want.language,
          condition:want.condition,
          max_price_eur:want.max_price_eur,
          url:new URL(href,location.origin).href,
          ts:Date.now()
        };
        cache[key]=best;
        saveCatalogCache(cache);
        log.textContent += `  ✓ ${exp} #${padded} → ${best.name}\n`;
        return best;
      }
    }

    throw new Error(`No encuentro producto exacto ${exp} #${padded} en resultados de Cardmarket.`);
  }

  function chooseAutoSeeds(wants, count, alreadyUsedSeeds) {
    const history=loadSeedHistory();
    const covered=currentCoverageSet();

    // v5.4.26: missing wants first. Only fall back to already-covered wants
    // when every uncovered want has already been used as a seed in this run.
    let eligible=wants.filter(w=>
      !covered.has(cardKey(w)) &&
      !alreadyUsedSeeds.has(cardKey(w))
    );

    let source="missing";
    if(!eligible.length){
      eligible=wants.filter(w=>!alreadyUsedSeeds.has(cardKey(w)));
      source="fallback";
    }
    if(!eligible.length) return [];

    eligible.sort((a,b)=>{
      const ah=history[cardKey(a)]||0, bh=history[cardKey(b)]||0;
      if(ah!==bh) return ah-bh;
      if(a.expansion!==b.expansion) return a.expansion.localeCompare(b.expansion);
      return parseInt(a.number,10)-parseInt(b.number,10);
    });

    const minUses=history[cardKey(eligible[0])]||0;
    let pool=eligible.filter(w=>(history[cardKey(w)]||0)===minUses);
    if(pool.length<count) pool=eligible.slice(0,Math.max(count*12,count));

    const picks=[];
    for(let i=0;i<count && pool.length;i++){
      const idx=count===1?0:Math.floor(i*(pool.length-1)/Math.max(1,count-1));
      const w=pool[idx];
      if(w && !picks.some(x=>cardKey(x)===cardKey(w))) picks.push(w);
    }

    picks._seedSource=source;
    return picks;
  }

  async function discoverSellersFromCard(card, sellerLimit, seedDelay) {
    const log=$("#cm-log");
    const alreadySaved = new Set(Object.keys(loadSellers()).map(x=>x.toLowerCase()));
    const discovered = [];
    const seenSeller = new Set();
    let skippedSaved = 0;
    let totalPages = 0;

    const mode = $("#cm-country-mode")?.value || "moyano";
    const countryQueue = discoveryCountryCodes();

    // Solo coste: one unfiltered-country pass.
    // Moyano/Selected: one country at a time, in priority order.
    const passes = countryQueue.length ? countryQueue : [""];

    log.textContent += `Descubriendo vendedores desde ${card.name} (${card.expansion} ${String(card.number).padStart(3,"0")})...\n`;

    if (mode === "moyano" && countryQueue.length) {
      log.textContent += `  Prioridad estricta: ${countryQueue.join(" → ")}\n`;
    } else if (countryQueue.length) {
      log.textContent += `  Orden países: ${countryQueue.join(" → ")}\n`;
    } else {
      log.textContent += `  Sin filtro/prioridad de país.\n`;
    }
    log.scrollTop=log.scrollHeight;

    for (const country of passes) {
      if (discovered.length >= sellerLimit) break;

      const neededAtStart = sellerLimit - discovered.length;
      const countryLabel = country || "todos";
      let nextUrl = buildDiscoveryUrl(card.url, country, card);
      const seenPages = new Set();
      let pageNo = 1;
      let addedThisCountry = 0;

      log.textContent += `  ${countryLabel}: buscando ${neededAtStart} vendedor(es) nuevo(s)...\n`;

      while(nextUrl && !seenPages.has(nextUrl) && discovered.length < sellerLimit && pageNo <= 25) {
        seenPages.add(nextUrl);
        totalPages++;

        await sleep(jitter(seedDelay,350));

        log.textContent += `    página ${pageNo} · total nuevos ${discovered.length}/${sellerLimit}...\n`;
        log.scrollTop=log.scrollHeight;

        const res=await fetchWithBackoff(
          nextUrl,
          {credentials:"include",headers:{"Accept":"text/html,application/xhtml+xml"}},
          `semilla ${card.expansion} ${card.number} ${countryLabel} página ${pageNo}`,
          2
        );

        if(res.status===429) throw new Error(`HTTP 429 en semilla ${card.number} (${countryLabel})`);
        if(!res.ok) throw new Error(`HTTP ${res.status} en semilla ${card.number} (${countryLabel})`);

        const html=await res.text();
        if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))
          throw new Error("ANTIBOT_DISCOVERY");

        const doc=new DOMParser().parseFromString(html,"text/html");
        const rows=[...doc.querySelectorAll(".article-row")];

        for(const row of rows){
          // Safety checks; Cardmarket should already have filtered these.
          const offerLanguage=detectOfferLanguage(row);
          if(offerLanguage!=="Other/Unknown" && !languageMatchesWant(offerLanguage,card.language)) continue;

          const cond=row.querySelector(".article-condition .badge")?.textContent.trim()||"";
          const condRank={MT:7,NM:6,EX:5,GD:4,LP:3,PL:2,PO:1};
          if(cond && condRank[cond] < (condRank[card.condition] || condRank.NM)) continue;

          const userLink=row.querySelector('a[href*="/Users/"]');
          let seller="";
          if(userLink){
            const m=(userLink.getAttribute("href")||"").match(/\/Users\/([^/?#]+)/i);
            if(m) seller=decodeURIComponent(m[1]);
            if(!seller) seller=(userLink.textContent||"").trim();
          }
          if(!seller) continue;

          const key=seller.toLowerCase();
          if(seenSeller.has(key)) continue;
          seenSeller.add(key);

          let detectedCountry=detectCountryFromElement(row) || country;

          // With a country-specific Cardmarket query, trust the query if the row
          // does not expose a readable tooltip/flag.
          if(country && detectedCountry && detectedCountry !== country) continue;

          if(alreadySaved.has(key)){
            skippedSaved++;
            continue;
          }

          discovered.push({seller,country:detectedCountry || country});
          addedThisCountry++;

          if(discovered.length >= sellerLimit) break;
        }

        if(discovered.length >= sellerLimit) break;

        const next = [...doc.querySelectorAll('a[aria-label="Siguiente página"],a[aria-label="Next page"]')]
          .map(a=>a.getAttribute("href"))
          .filter(Boolean)[0];

        if(!next) break;

        // Re-apply the same country/language/condition filter to pagination URL.
        nextUrl = buildDiscoveryUrl(new URL(next, location.origin).href, country, card);
        pageNo++;
      }

      log.textContent += `  ${countryLabel}: +${addedThisCountry} nuevo(s)`;
      if(discovered.length < sellerLimit)
        log.textContent += ` · faltan ${sellerLimit-discovered.length}`;
      log.textContent += "\n";
    }

    const byCountry={};
    discovered.forEach(s=>byCountry[s.country||"??"]=(byCountry[s.country||"??"]||0)+1);

    log.textContent += `  Resultado: ${discovered.length}/${sellerLimit} vendedores NUEVOS`;
    if(skippedSaved) log.textContent += ` · ${skippedSaved} ya guardados saltados`;
    if(discovered.length) log.textContent += ` · ${Object.entries(byCountry).map(([c,n])=>`${c}:${n}`).join(" ")}`;
    log.textContent += ` · ${totalPages} página(s) de ofertas consultada(s)\n`;

    return discovered;
  }


  function extractArticleId(row) {
    if (!row) return "";

    // Cardmarket seller inventory rows expose the article id directly as:
    //   id="stockRow2158985386"
    // and in the checkbox:
    //   name="idArticle[2158985386]"
    const rowId = row.getAttribute("id") || "";
    let m = rowId.match(/^stockRow(\d+)$/i);
    if (m) return m[1];

    const direct = row.getAttribute("data-article-id") || row.getAttribute("data-id-article") ||
                   row.dataset?.articleId || row.dataset?.idArticle;
    if (direct && /^\d+$/.test(String(direct))) return String(direct);

    const checkbox = row.querySelector('input[name^="idArticle["]');
    if (checkbox) {
      const name = checkbox.getAttribute("name") || "";
      m = name.match(/^idArticle\[(\d+)\]$/i);
      if (m) return m[1];
    }

    const el = row.querySelector('[data-article-id],[data-id-article],input[name*="Article"],input[name*="article"],button[name*="Article"],button[name*="article"]');
    if (el) {
      const vals=[
        el.getAttribute("name"),
        el.getAttribute("id"),
        el.getAttribute("data-article-id"),
        el.getAttribute("data-id-article"),
        el.getAttribute("value"),
        el.dataset?.articleId,
        el.dataset?.idArticle
      ].filter(Boolean);

      for (const v of vals) {
        const s=String(v);
        let mm=s.match(/idArticle\[(\d+)\]/i);
        if(mm) return mm[1];
        mm=s.match(/stockRow(\d+)/i);
        if(mm) return mm[1];
        mm=s.match(/\b(\d{7,})\b/);
        if(mm) return mm[1];
      }
    }

    const html=row.outerHTML||"";
    const patterns=[
      /id=["']stockRow(\d+)["']/i,
      /name=["']idArticle\[(\d+)\]["']/i,
      /data-article-id=["'](\d+)["']/i,
      /data-id-article=["'](\d+)["']/i,
      /["']idArticle["']\s*[:=]\s*["']?(\d+)/i,
      /idArticle[^0-9]{0,30}(\d{7,})/i,
      /"(\d{7,})"\s*:\s*"\1"/
    ];
    for(const p of patterns){
      const mm=html.match(p);
      if(mm) return mm[1];
    }
    return "";
  }

  function sellerNameFromRow(row) {
    const a=row?.querySelector('a[href*="/Users/"]');
    if(!a) return "";
    const m=(a.getAttribute("href")||"").match(/\/Users\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : (a.textContent||"").trim();
  }

  function tokenFromDoc(doc) {
    const inp=doc?.querySelector?.('input[name="__cmtkn"]');
    if(inp?.value) return inp.value;
    const html=doc?.documentElement?.innerHTML||"";
    for(const p of [
      /name=["']__cmtkn["'][^>]*value=["']([^"']+)["']/i,
      /value=["']([^"']+)["'][^>]*name=["']__cmtkn["']/i,
      /["']__cmtkn["']\s*[:=]\s*["']([^"']+)["']/i
    ]) { const m=html.match(p); if(m) return m[1]; }
    return "";
  }

  async function getCurrentCartToken(fallbackUrl="") {
    let token=tokenFromDoc(document);
    if(token) return token;
    const res=await fetch(fallbackUrl||location.href,{
      credentials:"include",
      headers:{"Accept":"text/html,application/xhtml+xml"}
    });
    if(!res.ok) throw new Error(`No se pudo obtener token del carrito: HTTP ${res.status}`);
    const html=await res.text();
    if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))
      throw new Error("ANTIBOT_CART_TOKEN");
    token=tokenFromDoc(new DOMParser().parseFromString(html,"text/html"));
    if(!token) throw new Error("No encuentro __cmtkn en Cardmarket.");
    return token;
  }

  function countryIdForSellerName(sellerName) {
    const s=loadSellers()[sellerName];
    return CARDMARKET_COUNTRY_IDS[s?.country||""]||"";
  }

  async function resolveArticleIdForOffer(offer) {
    if(offer?.article_id && /^\d+$/.test(String(offer.article_id))) return String(offer.article_id);
    if(!offer?.url) throw new Error("La oferta no tiene URL.");

    let url=new URL(offer.url,location.origin);
    url.search="";
    const offerLangId=languageIdForWant({language:offer.language});
    if(offerLangId) url.searchParams.set("language",offerLangId);
    url.searchParams.set("minCondition","2");
    const countryId=countryIdForSellerName(offer.seller);
    if(countryId) url.searchParams.set("sellerCountry",countryId);

    const seen=new Set();
    for(let page=1;page<=12;page++){
      if(seen.has(url.href)) break;
      seen.add(url.href);

      const res=await fetch(url.href,{credentials:"include",headers:{"Accept":"text/html,application/xhtml+xml"}});
      if(res.status===403) throw new Error("HTTP 403 localizando idArticle");
      if(res.status===429) throw new Error("HTTP 429 localizando idArticle");
      if(!res.ok) throw new Error(`HTTP ${res.status} localizando idArticle`);

      const html=await res.text();
      if(/just a moment|verify you are human|captcha|checking your browser/i.test(html))
        throw new Error("ANTIBOT_CART_RESOLVE");

      const doc=new DOMParser().parseFromString(html,"text/html");
      const rows=[...doc.querySelectorAll(".article-row")];
      const matches=rows.filter(row=>{
        const seller=sellerNameFromRow(row);
        if(!seller || seller.toLowerCase()!==String(offer.seller||"").toLowerCase()) return false;
        const cond=row.querySelector(".article-condition .badge")?.textContent.trim()||"";
        if(offer.condition && cond && cond!==offer.condition) return false;
        const rowLanguage=detectOfferLanguage(row);
        if(offer.language && !languageMatchesWant(rowLanguage,offer.language)) return false;
        return true;
      });

      matches.sort((a,b)=>{
        const pa=euro((a.querySelector(".price-container .fw-bold")||a.querySelector(".col-offer .fw-bold")||a.querySelector(".mobile-offer-container .fw-bold"))?.textContent||"");
        const pb=euro((b.querySelector(".price-container .fw-bold")||b.querySelector(".col-offer .fw-bold")||b.querySelector(".mobile-offer-container .fw-bold"))?.textContent||"");
        return Math.abs(Number(pa)-Number(offer.price_eur))-Math.abs(Number(pb)-Number(offer.price_eur));
      });

      for(const row of matches){
        const id=extractArticleId(row);
        if(id) return id;
      }

      const next=[...doc.querySelectorAll('a[aria-label="Siguiente página"],a[aria-label="Next page"]')]
        .map(a=>a.getAttribute("href")).filter(Boolean)[0];
      if(!next) break;
      url=new URL(next,location.origin);
      if(offerLangId) url.searchParams.set("language",offerLangId);
      url.searchParams.set("minCondition","2");
      if(countryId) url.searchParams.set("sellerCountry",countryId);
      await sleep(jitter(1400,500));
    }
    throw new Error(`No encuentro idArticle para ${offer.name} de ${offer.seller}.`);
  }

  function decodeBase64Utf8(s){try{const b=atob(String(s||""));return new TextDecoder("utf-8").decode(Uint8Array.from(b,c=>c.charCodeAt(0)))}catch{try{return atob(String(s||""))}catch{return String(s||"")}}}
  function stripHtmlText(html){const d=new DOMParser().parseFromString(String(html||""),"text/html");return(d.body?.textContent||"").replace(/\s+/g," ").trim();}
  function parseCartAjaxResponse(text){
    const xml=new DOMParser().parseFromString(text,"application/xml");
    if(xml.querySelector("parsererror")) return {ok:false,type:"invalid_response",message:"Respuesta XML inválida de Cardmarket."};
    const resultType=decodeBase64Utf8((xml.querySelector("resultType")?.textContent||"").trim()).trim().toLowerCase();
    const systemText=stripHtmlText(decodeBase64Utf8((xml.querySelector("systemMessage")?.textContent||"").trim()));
    const updatedRows=(xml.querySelector("updatedRows")?.textContent||"").trim();
    const unavailable=/art[ií]culo no est[aá] disponible|article is not available|not available/i.test(systemText);
    if(resultType==="error"||resultType.includes("error")||/ha ocurrido un error|error occurred/i.test(systemText))
      return {ok:false,type:unavailable?"unavailable":"cardmarket_error",message:systemText||`Cardmarket devolvió ${resultType||"error"}.`};
    if(!updatedRows&&!systemText&&!resultType) return {ok:false,type:"unknown_response",message:"Cardmarket respondió HTTP 200 pero sin confirmación reconocible."};
    return {ok:true,type:resultType||"ok",message:systemText,updatedRows};
  }
  async function addArticleToCart(articleId,token,amount=1,referrerUrl="") {
    const form=new FormData(); form.append("__cmtkn",token);
    form.append("idArticle",JSON.stringify({[articleId]:articleId}));
    form.append("amount",JSON.stringify({[articleId]:String(amount)}));
    const res=await fetch("https://www.cardmarket.com/es/Pokemon/AjaxAction/ShoppingCart_Add_AddArticlesFromProductPage",
      {method:"POST",credentials:"include",headers:{"Accept":"*/*"},body:form,referrer:referrerUrl||location.href});
    if(res.status===403) throw new Error("HTTP 403 al añadir al carrito");
    if(res.status===429) throw new Error("HTTP 429 al añadir al carrito");
    if(!res.ok) throw new Error(`HTTP ${res.status} al añadir al carrito`);
    const text=await res.text();
    if(/just a moment|verify you are human|captcha|checking your browser/i.test(text)) throw new Error("ANTIBOT_CART_ADD");
    const parsed=parseCartAjaxResponse(text);
    if(!parsed.ok){const e=new Error(parsed.message||"Cardmarket no confirmó el alta en carrito.");e.cartType=parsed.type;throw e;}
    return parsed;
  }

  function partialScanInfo(result) {
    const pending=Object.values(result.subscans || {}).filter(s=>s?.status!=="COMPLETE");
    const reasons=pending.map(s=>String(s.interruption || ""));
    return {
      onlyMissingIds:pending.length>0 && pending.every(s=>s.status==="SKIPPED" && s.interruption==="NO_EXPANSION_ID"),
      blocked:reasons.some(r=>/antibot|captcha|HTTP\s*(403|429)\b/i.test(r)),
      detail:pending.map(s=>`${s.expansion}: ${s.interruption || "escaneo pendiente"}`).join("; ") || "escaneo pendiente"
    };
  }

  async function scanSellerByName(seller, wants, pageDelay, defaultShipping, countryHint="") {
    const log=$("#cm-log");
    const condRank={MT:7,NM:6,EX:5,GD:4,LP:3,PL:2,PO:1};
    const groups={};
    for(const w of wants) (groups[w.expansion] ||= []).push(w);

    const savedAtStart=loadSellers();
    const previous=savedAtStart[seller] || {};
    const subscans={...(previous.subscans || {})};
    let detectedCountry=countryHint || previous.country || "";
    let overallStatus="COMPLETE";

    const saveAggregate=()=>{
      const merged=[];
      let raw=0;
      for(const sub of Object.values(subscans)){
        raw += Number(sub?.total_raw_offers||0);
        for(const o of (sub?.offers||[])) merged.push(o);
      }
      const record={
        seller,
        country:detectedCountry || "",
        scanned_at:new Date().toISOString(),
        expansion:"MULTI",
        scan_mode:"MULTI_SET",
        shipping:Number(previous.shipping ?? defaultShipping),
        wants_count:wants.length,
        offers:merged,
        total_raw_offers:raw,
        status:overallStatus,
        subscans
      };
      sellersMemory[seller]=record;
      queueSellerPut(record);
      return record;
    };

    for(const [expansion,expWants] of Object.entries(groups)){
      log.textContent += `\n${seller} · ${expansion} (${expWants.length} wants)\n`;

      let expansionFilter=null;
      try{
        expansionFilter=await resolveExpansionId(expansion,seller);
      }catch(e){
        if(String(e.message).includes("ANTIBOT") || String(e.message).includes("429")) throw e;
        log.textContent += `  Aviso filtro ${expansion}: ${e.message}. La colección se omitirá.\n`;
      }

      const filterId=expansionFilter?.id ? String(expansionFilter.id) : "";
      if(!filterId){
        log.textContent += `  ⚠ ${expansion} omitida: no hay idExpansions y está prohibido escanear el inventario completo.\n`;
        subscans[expansion]={
          expansion,
          scan_mode:"SKIPPED_NO_EXPANSION_ID",
          filter_expansion_id:"",
          filter_expansion_label:"",
          wants_count:expWants.length,
          offers:[],
          total_raw_offers:0,
          status:"SKIPPED",
          last_page:0,
          next_page:null,
          resume_url:"",
          interruption:"NO_EXPANSION_ID"
        };
        saveAggregate();
        continue;
      }
      const scanMode="EXPANSION_FILTER";
      const prev=subscans[expansion] || {};
      const sameFiltered=prev.scan_mode==="EXPANSION_FILTER" &&
        String(prev.filter_expansion_id||"")===filterId;
      const canResume=prev.status==="PARTIAL" && prev.resume_url && (sameFiltered || !prev.scan_mode);

      let nextUrl;
      if(canResume) nextUrl=prev.resume_url;
      else{
        const u=new URL(`${location.origin}/es/Pokemon/Users/${encodeURIComponent(seller)}/Offers/Singles`);
        if(filterId) u.searchParams.set("idExpansions",filterId);

        // v5.4.20: all wants currently share the global UI language/condition,
        // so let Cardmarket filter the seller inventory before we parse rows.
        const scanLangId=languageIdForWant(expWants[0]);
        if(scanLangId) u.searchParams.set("language",scanLangId);

        const wantedCond=String(expWants[0]?.condition||"NM").toUpperCase();
        if(wantedCond==="NM") u.searchParams.set("minCondition","2");

        u.searchParams.set("sortBy","name_asc");
        nextUrl=u.href;
      }

      let pageNo=canResume ? Number(prev.next_page || ((prev.last_page||0)+1)) : 1;
      let totalRawOffers=canResume ? Number(prev.total_raw_offers||0) : 0;
      const cheapest={};

      if(canResume){
        for(const o of (prev.offers||[])) cheapest[cardKey(o)]=o;
        log.textContent += `  ↻ Reanudando desde página ${pageNo}...\n`;
      }else if(filterId){
        log.textContent += `  🔎 Filtro Cardmarket ${expansion} · idExpansions=${filterId}${expansionFilter?.label?` · ${expansionFilter.label}`:""}\n`;
      }else{
        throw new Error(`Protección interna: ${expansion} llegó al escáner sin idExpansions`);
      }

      const wantMap=Object.fromEntries(expWants.map(w=>[cardKey(w),w]));
      const seen=new Set();
      let interrupted="";

      const writeSub=(status,lastPage,resumeUrl="",reason="")=>{
        subscans[expansion]={
          expansion,
          scan_mode:scanMode,
          filter_expansion_id:filterId,
          filter_expansion_label:expansionFilter?.label||"",
          wants_count:expWants.length,
          offers:Object.values(cheapest),
          total_raw_offers:totalRawOffers,
          status,
          last_page:lastPage,
          next_page:resumeUrl ? lastPage+1 : null,
          resume_url:resumeUrl||"",
          interruption:reason||""
        };
      };

      while(nextUrl && !seen.has(nextUrl) && pageNo<=300){
        seen.add(nextUrl);
        log.textContent += `  ${seller} · ${expansion} · página ${pageNo}...\n`;
        log.scrollTop=log.scrollHeight;

        let res;
        try{
          res=await fetchWithBackoff(nextUrl,{
            credentials:"include",headers:{"Accept":"text/html,application/xhtml+xml"}
          },`inventario ${seller} ${expansion} página ${pageNo}`,2);
        }catch(e){
          writeSub("PARTIAL",pageNo-1,nextUrl,`fetch: ${e.message}`);
          overallStatus="PARTIAL";
          saveAggregate();
          return saveAggregate();
        }

        if(res.status===429){
          writeSub("PARTIAL",pageNo-1,nextUrl,"HTTP 429");
          overallStatus="PARTIAL";
          log.textContent += `  ⏸ HTTP 429. Progreso guardado.\n`;
          return saveAggregate();
        }
        if(!res.ok){
          writeSub("PARTIAL",pageNo-1,nextUrl,`HTTP ${res.status}`);
          overallStatus="PARTIAL";
          return saveAggregate();
        }

        const html=await res.text();
        if(/just a moment|verify you are human|captcha|checking your browser/i.test(html)){
          writeSub("PARTIAL",pageNo-1,nextUrl,"antibot/captcha");
          overallStatus="PARTIAL";
          log.textContent += `  ⏸ Antibot detectado. Progreso guardado.\n`;
          return saveAggregate();
        }

        const doc=new DOMParser().parseFromString(html,"text/html");
        if(!detectedCountry) detectedCountry=detectCountryFromElement(doc);

        // v5.4.21: seller inventory pages may use stockRow<ID> instead of
        // the .article-row class used on product offer pages.
        const rows=[...new Set([
          ...doc.querySelectorAll(".article-row"),
          ...doc.querySelectorAll('[id^="stockRow"]')
        ])];
        totalRawOffers += rows.length;

        const rejectStats={
          rows:rows.length,
          noProductLink:0,
          parseFail:0,
          wrongExpansion:0,
          notWanted:0,
          condition:0,
          language:0,
          noPrice:0,
          overMax:0,
          accepted:0
        };

        for(const row of rows){
          const a=chooseProductLinkForExpansion(row, expansion);
          if(!a){ rejectStats.noProductLink++; continue; }

          // v5.4.20: Cardmarket often renders the card name inside <a>
          // but "(sv2a 063)" elsewhere in the same row. Parse the whole row first,
          // with canonical URL fallback, instead of relying on a.textContent only.
          const label=(a.textContent||"").trim();
          const rowText=(row.textContent||label).replace(/\s+/g," ").trim();

          let name="";
          let exp="";
          let number="";

          // v5.4.22: canonical product URL is the PRIMARY source.
          // Seller rows contain many other parenthesized values, so parsing the
          // whole row first can produce a perfectly valid but wrong "expansion".
          try{
            const href=new URL(a.getAttribute("href")||"",location.origin);
            const path=decodeURIComponent(href.pathname);

            // Examples:
            //   .../Ivysaur-V1-sv2a002
            //   .../Charmander-V1-sv2a004
            // Keep this deliberately anchored to the end of the product slug.
            const mm=path.match(/-([A-Za-z0-9]+?)(\d{3})(?:\/)?$/);
            if(mm){
              exp=String(mm[1]||"").trim().toUpperCase();
              number=normalizeNum(mm[2]);

              const slug=path.split("/").filter(Boolean).pop()||"";
              const suffixRx=new RegExp(`-${String(mm[1]).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}${String(mm[2])}$`,"i");
              name=slug.replace(suffixRx,"").replace(/-/g," ").trim();
            }
          }catch(e){}

          // Only if the canonical URL cannot be parsed, inspect visible text.
          if(!exp || !number){
            const escapedExpansion=String(expansion||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
            const exactRx=new RegExp(`\\(\\s*(${escapedExpansion})\\s+(\\d+)\\s*\\)`,"i");
            const exact=rowText.match(exactRx);

            if(exact){
              exp=String(exact[1]||"").trim().toUpperCase();
              number=normalizeNum(exact[2]);
            }else{
              // Last-resort generic parser.
              const m=rowText.match(/\(\s*([A-Za-z0-9]+)\s+(\d{1,3})\s*\)/);
              if(m){
                exp=String(m[1]||"").trim().toUpperCase();
                number=normalizeNum(m[2]);
              }
            }
          }

          if(!name){
            const badUi=/^(English|Spanish|German|French|Italian|Portuguese|Japanese|Chinese|Korean|Dutch|Polish|Czech|Hungarian|Russian)$/i;
            name=(label && !badUi.test(label)) ? label : `${exp} ${String(number).padStart(3,"0")}`;
          }

          if(!exp || !number){ rejectStats.parseFail++; continue; }
          if(!expansionCodesEquivalent(exp, expansion)){
            rejectStats.wrongExpansion++;
            if(!rejectStats.wrongExpansionSamples) rejectStats.wrongExpansionSamples=[];
            if(rejectStats.wrongExpansionSamples.length<3)
              rejectStats.wrongExpansionSamples.push(`${exp}#${number}`);
            continue;
          }

          const key=cardKey({expansion:exp,number});
          const want=wantMap[key];
          if(!want){ rejectStats.notWanted++; continue; }

          const cond=row.querySelector(".article-condition .badge")?.textContent.trim()||"";
          if(cond && condRank[cond] < (condRank[want.condition] || condRank.NM)){ rejectStats.condition++; continue; }

          let language=detectOfferLanguage(row);
          // The request itself is language-filtered. If the fetched HTML does not
          // expose a readable flag/tooltip, trust the Cardmarket filter.
          if(language==="Other/Unknown") language=want.language;
          if(!languageMatchesWant(language,want.language)){ rejectStats.language++; continue; }

          const priceEl=row.querySelector(".price-container .fw-bold")
                     || row.querySelector(".col-offer .fw-bold")
                     || row.querySelector(".mobile-offer-container .fw-bold");
          const price=euro(priceEl?.textContent||"");
          if(!Number.isFinite(price)){ rejectStats.noPrice++; continue; }
          if(Number.isFinite(want.max_price_eur) && price>want.max_price_eur){ rejectStats.overMax++; continue; }
          rejectStats.accepted++;

          const qty=parseInt(row.querySelector(".item-count")?.textContent.trim()||"1",10)||1;
          const offer={
            name, expansion:exp, number, condition:cond, language,
            quantity:qty, price_eur:price, article_id:extractArticleId(row),
            url:new URL(a.getAttribute("href"),location.origin).href, page:pageNo
          };

          const old=cheapest[key];
          if(!old || price<Number(old.price_eur) ||
             (Math.abs(price-Number(old.price_eur))<1e-9 && offer.article_id && !old.article_id)){
            cheapest[key]=offer;
          }
        }

        // Diagnostic summary: useful if Cardmarket changes its seller DOM again.
        log.textContent += `    filas DOM: ${rejectStats.rows} · aceptadas: ${rejectStats.accepted}`;
        const rejectedParts=[
          ["sin link",rejectStats.noProductLink],
          ["parse",rejectStats.parseFail],
          ["otra exp",rejectStats.wrongExpansion],
          ["no want",rejectStats.notWanted],
          ["estado",rejectStats.condition],
          ["idioma",rejectStats.language],
          ["sin precio",rejectStats.noPrice],
          ["sobre máx",rejectStats.overMax]
        ].filter(([,n])=>n>0);
        if(rejectedParts.length) log.textContent += ` · descartes: ${rejectedParts.map(([k,n])=>`${k}:${n}`).join(" ")}`;
        if(rejectStats.wrongExpansionSamples?.length)
          log.textContent += ` · muestra exp: ${rejectStats.wrongExpansionSamples.join(", ")}`;
        log.textContent += "\n";

        const next=[...doc.querySelectorAll('a[aria-label="Siguiente página"],a[aria-label="Next page"]')]
          .map(a=>a.getAttribute("href")).filter(Boolean)[0];
        const nextResolved=next ? new URL(next,location.origin).href : null;

        writeSub(nextResolved?"PARTIAL":"COMPLETE",pageNo,nextResolved,"");
        saveAggregate();

        if(!nextResolved) break;
        nextUrl=nextResolved;
        pageNo++;
        await sleep(jitter(pageDelay,250));
      }

      if(subscans[expansion]?.status!=="COMPLETE"){
        overallStatus="PARTIAL";
        return saveAggregate();
      }
    }

    overallStatus=Object.values(subscans).every(s=>s?.status==="COMPLETE") ? "COMPLETE" : "PARTIAL";
    return saveAggregate();
  }

  $("#cm-auto-discover").onclick = async () => {
    const btn=$("#cm-auto-discover"), log=$("#cm-log");
    btn.disabled=true; log.textContent="";
    try{
      const wants=await readWants();
      if(!wants.length) throw new Error("Selecciona un Wants CSV válido.");

      const pageDelay=Math.max(500,parseInt($("#cm-page-delay").value||"700",10));
      const sellerDelay=Math.max(1000,parseInt($("#cm-seller-delay").value||"1800",10));
      const seedDelay=Math.max(700,parseInt($("#cm-seed-delay").value||"1200",10));
      const sellersPerSeed=Math.max(1,Math.min(30,parseInt($("#cm-sellers-per-seed").value||"15",10)));
      const seedsPerRound=Math.max(1,Math.min(8,parseInt($("#cm-seeds-per-round").value||"3",10)));
      const rounds=Math.max(1,Math.min(8,parseInt($("#cm-rounds").value||"3",10)));
      const maxNewPerRound=Math.max(1,Math.min(100,parseInt($("#cm-max-new-sellers").value||"30",10)));
      const defaultShipping=parseFloat($("#cm-default-ship").value.replace(",","."))||0;

      const exps=[...new Set(wants.map(w=>w.expansion))];
      log.textContent += `Wants: ${wants.length} cartas · ${exps.length} colecciones: ${exps.join(", ")}\n\n`;

      const scanned=new Set(
        Object.values(loadSellers()).filter(s=>s?.status==="COMPLETE").map(s=>String(s.seller||"").toLowerCase())
      );
      const usedSeeds=new Set();
      let totalNewSellers=0, stoppedByAntibot=false, stoppedByScanError=false;

      for(let round=1;round<=rounds;round++){
        const coveredBefore=currentCoverageSet();
        const poolCoveredBefore=wants.filter(w=>coveredBefore.has(cardKey(w))).length;
        const missingBefore=wants.filter(w=>!coveredBefore.has(cardKey(w)));
        let seeds=chooseAutoSeeds(wants,seedsPerRound,usedSeeds);
        if(!seeds.length){ log.textContent += "\nNo quedan semillas nuevas. Fin.\n"; break; }

        log.textContent += `\n========== RONDA ${round}/${rounds} ==========\n`;
        log.textContent += `Vistas en vendedores guardados: ${poolCoveredBefore}/${wants.length}\n`;
        log.textContent += `Sin cobertura todavía: ${missingBefore.length}/${wants.length}\n`;
        log.textContent += seeds._seedSource==="missing"
          ? `Semillas elegidas entre cartas aún sin cobertura.\n`
          : `Todas las cartas sin cobertura ya fueron semilla en esta ejecución; usando fallback.\n`;

        const resolved=[];
        for(const w of seeds){
          try{
            const card=await resolveProductForWant(w);
            resolved.push(card);
            usedSeeds.add(cardKey(w));
            markSeedUsed(w);
          }catch(e){
            // Do not hammer the same failed seed again in later rounds.
            usedSeeds.add(cardKey(w));
            markSeedUsed(w);
            log.textContent += `Semilla ${w.expansion} #${w.number}: ${e.message}\n`;
            if(/ANTIBOT/.test(String(e.message))){ stoppedByAntibot=true; break; }
          }
        }
        if(stoppedByAntibot) break;
        if(!resolved.length) continue;

        log.textContent += `Semillas: ${resolved.map(c=>`${c.expansion} #${String(c.number).padStart(3,"0")} ${c.name}`).join(", ")}\n\n`;

        const discovered=[];
        for(const card of resolved){
          try{
            const found=await discoverSellersFromCard(card,sellersPerSeed,seedDelay);
            for(const item of found){
              const k=String(item.seller||"").toLowerCase();
              if(!scanned.has(k) && !discovered.some(x=>String(x.seller).toLowerCase()===k))
                discovered.push(item);
            }
          }catch(e){
            if(/ANTIBOT/.test(String(e.message))){ log.textContent += "ANTIBOT durante descubrimiento.\n"; stoppedByAntibot=true; break; }
            log.textContent += `Error semilla ${card.expansion} #${card.number}: ${e.message}\n`;
          }
        }
        if(stoppedByAntibot) break;

        discovered.sort(sellerDiscoverySort);
        const queue=discovered.slice(0,maxNewPerRound);
        log.textContent += `\nVendedores nuevos a analizar: ${queue.length}\n`;
        if(!queue.length) continue;

        for(let i=0;i<queue.length;i++){
          const candidate=queue[i];
          const seller=candidate.seller;
          log.textContent += `\n[${i+1}/${queue.length}] ${seller}${candidate.country?` [${candidate.country}]`:""}\n`;
          try{
            const result=await scanSellerByName(seller,wants,pageDelay,defaultShipping,candidate.country||"");
            totalNewSellers++;
            if(result.status==="COMPLETE"){
              scanned.add(String(seller).toLowerCase());
              log.textContent += `  ✓ COMPLETO: ${result.offers.length}/${wants.length} cartas compatibles\n`;
            }else{
              const info=partialScanInfo(result);
              log.textContent += `  ⏸ PARCIAL guardado: ${info.detail}.\n`;
              if(info.onlyMissingIds){
                scanned.add(String(seller).toLowerCase());
                log.textContent += `  Continúo con el siguiente vendedor. Tras resolver los IDs, usa "Reanudar parciales".\n`;
              }else{
                stoppedByAntibot=info.blocked;
                stoppedByScanError=!info.blocked;
                log.textContent += info.blocked
                  ? `  Revisa Cardmarket y usa "Reanudar parciales".\n`
                  : `  Revisa la incidencia y usa "Reanudar parciales".\n`;
                break;
              }
            }
          }catch(e){
            log.textContent += `  ERROR: ${e.message}\n`;
            if(/antibot/i.test(String(e.message))){ stoppedByAntibot=true; break; }
          }
          if(i<queue.length-1) await sleep(jitter(sellerDelay,500));
        }

        const coveredAfter=currentCoverageSet();
        const poolCoveredAfter=wants.filter(w=>coveredAfter.has(cardKey(w))).length;
        log.textContent += `\nRonda ${round}: ${poolCoveredAfter}/${wants.length} cartas vistas al menos una vez.\n`;
        if(stoppedByAntibot || stoppedByScanError) break;
      }

      const finalCovered=currentCoverageSet();
      const finalMissing=wants.filter(w=>!finalCovered.has(cardKey(w)));

      log.textContent += `\nAUTO DISCOVERY FINALIZADO\n`;
      log.textContent += `Vendedores nuevos analizados: ${totalNewSellers}\n`;
      log.textContent += `Semillas utilizadas: ${usedSeeds.size}\n`;
      log.textContent += `Cobertura final: ${wants.length-finalMissing.length}/${wants.length}\n`;
      log.textContent += `Sin cobertura: ${finalMissing.length}/${wants.length}\n`;

      if(finalMissing.length){
        log.textContent += `\nCARTAS AÚN SIN COBERTURA:\n`;
        finalMissing
          .slice()
          .sort((a,b)=>a.expansion.localeCompare(b.expansion) || parseInt(a.number,10)-parseInt(b.number,10))
          .forEach(w=>{
            log.textContent += `- ${w.expansion} #${String(w.number).padStart(3,"0")}${w.name?` · ${w.name}`:""}\n`;
          });
      }

      if(stoppedByAntibot) log.textContent += "Proceso detenido por antibot/limitación; el progreso queda guardado.\n";
      if(stoppedByScanError) log.textContent += "Proceso detenido por una incidencia de escaneo; el progreso queda guardado.\n";
      log.textContent += '\nAhora pulsa "Plan inteligente".';
    }catch(e){
      console.error(e); log.textContent += `\nERROR: ${e.message}`;
    }finally{ btn.disabled=false; }
  };


  $("#cm-resume-partials").onclick = async () => {
    const btn=$("#cm-resume-partials"), log=$("#cm-log");
    btn.disabled=true;
    log.textContent="";

    try {
      const wants=await readWants();
      if(!wants.length) throw new Error("Selecciona un Wants CSV válido.");

      const pageDelay=Math.max(1200,parseInt($("#cm-page-delay").value||"2800",10));
      const sellerDelay=Math.max(2000,parseInt($("#cm-seller-delay").value||"7000",10));
      const defaultShipping=parseFloat($("#cm-default-ship").value.replace(",","."))||0;

      let partials=Object.values(loadSellers())
        .filter(s=>s?.status==="PARTIAL")
        .sort((a,b)=>(a.seller||"").localeCompare(b.seller||""));

      if(!partials.length){
        log.textContent="No hay vendedores parciales pendientes.";
        return;
      }

      log.textContent += `Vendedores parciales pendientes: ${partials.length}\n\n`;

      for(let i=0;i<partials.length;i++){
        const p=partials[i];
        log.textContent += `[${i+1}/${partials.length}] ${p.seller}${p.country?` [${p.country}]`:""}...\n`;

        const result=await scanSellerByName(
          p.seller,
          wants,
          pageDelay,
          Number(p.shipping ?? defaultShipping),
          p.country || ""
        );

        const cardTotal=result.offers.reduce((s,o)=>s+(o.price_eur||0),0);

        if(result.status==="COMPLETE"){
          log.textContent += `  ✓ COMPLETO: ${result.offers.length}/${wants.length} cartas | ${fmt(cardTotal)}\n`;
        } else {
          const info=partialScanInfo(result);
          log.textContent += `  ⏸ Sigue PARCIAL: ${info.detail}. El progreso está guardado.\n`;
          if(info.onlyMissingIds){
            log.textContent += `  Faltan IDs de expansión; continúo con los demás vendedores.\n`;
          }else{
            log.textContent += info.blocked
              ? `  Revisa Cardmarket y vuelve a pulsar "Reanudar parciales".\n`
              : `  Revisa la incidencia y vuelve a pulsar "Reanudar parciales".\n`;
            break;
          }
        }

        if(i<partials.length-1) await sleep(jitter(sellerDelay,500));
      }

      const remaining=Object.values(loadSellers())
        .filter(s=>s?.status==="PARTIAL").length;

      log.textContent += `\nParciales pendientes ahora: ${remaining}\n`;
    } catch(e){
      console.error(e);
      log.textContent += `\nERROR: ${e.message}`;
    } finally {
      btn.disabled=false;
    }
  };

  $("#cm-run-batch").onclick = async () => {
    const btn=$("#cm-run-batch"), log=$("#cm-log");
    btn.disabled=true;
    log.textContent="";

    try {
      const sellers = parseSellerList($("#cm-sellers").value);
      if (!sellers.length) throw new Error("Pega al menos un vendedor.");
      const wants = await readWants();
      if (!wants.length) throw new Error("Selecciona un Wants CSV válido.");

      const pageDelay = Math.max(800, parseInt($("#cm-page-delay").value || "2800",10));
      const sellerDelay = Math.max(1500, parseInt($("#cm-seller-delay").value || "7000",10));
      const defaultShipping = parseFloat($("#cm-default-ship").value.replace(",",".")) || 0;

      log.textContent += `Vendedores: ${sellers.length}\n`;
      log.textContent += `Pausa páginas: ~${pageDelay} ms\n`;
      log.textContent += `Pausa vendedores: ~${sellerDelay} ms\n\n`;

      const saved = loadSellers();
      let ok=0, fail=0;

      for (let i=0; i<sellers.length; i++) {
        const seller=sellers[i];
        log.textContent += `\n[${i+1}/${sellers.length}] ${seller}\n`;
        log.scrollTop=log.scrollHeight;

        try {
          const result = await scanSellerByName(seller, wants, pageDelay, defaultShipping);
          saved[seller]=result;
          queueSellerPut(result);

          const cardTotal=result.offers.reduce((s,o)=>s+(o.price_eur||0),0);
          if (result.status === "COMPLETE") {
            log.textContent += `  ✓ COMPLETO: ${result.offers.length}/${wants.length} cartas | ${fmt(cardTotal)} + ${fmt(result.shipping)} envío
`;
            ok++;
          } else {
            log.textContent += `  ⏸ PARCIAL: ${result.offers.length}/${wants.length} cartas · hasta página ${result.last_page}.
`;
            log.textContent += `  Resuelve el captcha y usa "Reanudar parciales".
`;
            fail++;
            break;
          }
        } catch (e) {
          fail++;
          log.textContent += `  ERROR: ${e.message}\n`;
          if (String(e.message).toLowerCase().includes("antibot")) {
            log.textContent += `\nANTIBOT DETECTADO. Se detiene el lote para no insistir.\n`;
            break;
          }
        }

        if (i < sellers.length-1) {
          const wait = jitter(sellerDelay, 1500);
          log.textContent += `  Esperando ${(wait/1000).toFixed(1)} s...\n`;
          log.scrollTop=log.scrollHeight;
          await sleep(wait);
        }
      }

      log.textContent += `\nFinalizado. OK: ${ok} | Errores: ${fail}\nGuardados totales: ${Object.keys(loadSellers()).length}\n`;
    } catch(e) {
      console.error(e);
      log.textContent += `ERROR: ${e.message}`;
    } finally {
      btn.disabled=false;
    }
  };


  function allObservedOffers() {
    const sellers = Object.values(loadSellers());
    const out = {};
    for (const s of sellers) {
      for (const o of (s.offers || [])) {
        const k = cardKey(o);
        if (!out[k]) out[k] = [];
        out[k].push({
          seller:s.seller,
          shipping:Number(s.shipping||0),
          ...o
        });
      }
    }
    return out;
  }

  function internalReference(observations) {
    const prices = observations.map(o=>Number(o.price_eur)).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!prices.length) return null;

    // Robust reference:
    // 5+ observations: median of the cheapest 5
    // 3-4 observations: median
    // 1-2 observations: insufficient confidence (used only as fallback)
    let ref;
    let confidence;
    if (prices.length >= 5) {
      ref = median(prices.slice(0,5));
      confidence = "HIGH_INTERNAL";
    } else if (prices.length >= 3) {
      ref = median(prices);
      confidence = "MEDIUM_INTERNAL";
    } else {
      ref = median(prices);
      confidence = "LOW_INTERNAL";
    }
    return {ref, confidence, count:prices.length, min:prices[0], prices};
  }

  async function fetchMarketReference(offer, delayMs) {
    const key = cardKey(offer);
    const cache = loadMarketCache();
    const cached = cache[key];

    // Cache valid for 7 days.
    if (cached && cached.ts && (Date.now() - cached.ts) < 7*24*3600*1000) {
      return {...cached, source:"CACHE"};
    }

    await sleep(jitter(delayMs, 900));

    const url = new URL(offer.url, location.origin);
    // Strip seller-specific filters so Cardmarket can show the product market.
    url.search = "";

    const res = await fetchWithBackoff(
      url.href,
      {
        credentials:"include",
        headers:{"Accept":"text/html,application/xhtml+xml"}
      },
      `mercado ${key}`,
      2
    );
    if (!res.ok) throw new Error(`HTTP ${res.status} al valorar ${key}`);

    const html = await res.text();
    if (/just a moment|verify you are human|captcha|checking your browser/i.test(html))
      throw new Error("ANTIBOT_MARKET");

    const doc = new DOMParser().parseFromString(html,"text/html");
    const rows = [...doc.querySelectorAll(".article-row")];
    const prices = [];

    for (const row of rows) {
      const rowLanguage = detectOfferLanguage(row);
      if (!languageMatchesWant(rowLanguage, offer.language)) continue;

      const cond = row.querySelector(".article-condition .badge")?.textContent.trim() || "";
      if (offer.condition && cond && cond !== offer.condition && !(offer.condition==="NM" && cond==="MT")) continue;

      const priceEl = row.querySelector(".price-container .fw-bold")
                   || row.querySelector(".col-offer .fw-bold")
                   || row.querySelector(".mobile-offer-container .fw-bold");
      const p = euro(priceEl?.textContent || "");
      if (Number.isFinite(p)) prices.push(p);
    }

    prices.sort((a,b)=>a-b);

    // Use a robust low-market reference rather than one single cheapest outlier.
    // With >=5 offers, median of five cheapest. With 3-4, median.
    let ref = null;
    if (prices.length >= 5) ref = median(prices.slice(0,5));
    else if (prices.length >= 3) ref = median(prices);
    else if (prices.length) ref = median(prices);

    const result = {
      ref,
      count:prices.length,
      min:prices.length ? prices[0] : null,
      sample:prices.slice(0,10),
      ts:Date.now(),
      source:"MARKET"
    };

    cache[key] = result;
    saveMarketCache(cache);
    return result;
  }

  function makeCeiling(ref, premiumPct, absTol) {
    if (!Number.isFinite(ref)) return null;
    return Math.max(ref * (1 + premiumPct/100), ref + absTol);
  }

  function verdict(price, ref, ceiling) {
    if (!Number.isFinite(price)) return {status:"UNKNOWN", reason:"sin precio"};
    if (!Number.isFinite(ref) || !Number.isFinite(ceiling))
      return {status:"REVIEW", reason:"sin referencia suficiente"};

    const ratio = ref > 0 ? price/ref : 1;
    if (price <= ref) return {status:"GOOD", reason:"a mercado o por debajo"};
    if (price <= ceiling + 1e-9) return {status:"OK", reason:`prima razonable (${Math.round((ratio-1)*100)}%)`};
    if (price > ref*1.75 && price-ref >= 1) return {status:"OUTLIER", reason:`muy por encima de mercado (+${Math.round((ratio-1)*100)}%)`};
    return {status:"EXPENSIVE", reason:`por encima del techo (+${Math.round((ratio-1)*100)}%)`};
  }


  async function enrichUnknownSellerCountries() {
    const sellersObj = loadSellers();
    const unknown = Object.values(sellersObj).filter(s => !s.country);
    if (!unknown.length) return 0;

    const log = $("#cm-log");
    let updated = 0;

    log.textContent += `\nActualizando país de ${unknown.length} vendedores antiguos...\n`;

    for (let i=0; i<unknown.length; i++) {
      const s = unknown[i];
      try {
        const url = `${location.origin}/es/Pokemon/Users/${encodeURIComponent(s.seller)}/Offers/Singles`;
        const res = await fetchWithBackoff(
          url,
          {credentials:"include",headers:{"Accept":"text/html,application/xhtml+xml"}},
          `país vendedor ${s.seller}`,
          1
        );
        if (!res.ok) continue;

        const html = await res.text();
        if (/just a moment|verify you are human|captcha|checking your browser/i.test(html)) break;

        const doc = new DOMParser().parseFromString(html,"text/html");
        const country = detectCountryFromElement(doc);

        if (country) {
          sellersObj[s.seller].country = country;
          updated++;
          log.textContent += `  ${s.seller}: ${country}\n`;
        }

        await sleep(jitter(2500,900));
      } catch {}
    }

    saveSellers(sellersObj);
    if (updated) log.textContent += `País actualizado en ${updated} vendedores.\n`;
    return updated;
  }

  function shippingValueRatio() {
    const v = parseFloat(($("#cm-ship-value-ratio")?.value || "100").replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v / 100 : 1.0;
  }

  function offerReferenceValue(o) {
    const ref = Number(o?.valuation?.ref);
    if (Number.isFinite(ref) && ref >= 0) return ref;
    const price = Number(o?.price_eur);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  // Generic economic guard: a new order should not cost more in shipping
  // than the market value it contributes, scaled by the user ratio.
  function sellerMarginalOrderAcceptable(seller, addedPairs) {
    if (!addedPairs?.length) return false;
    const shipping = Number(seller?.shipping || 0);
    if (shipping <= 0) return true;

    const contributedValue = addedPairs.reduce(
      (sum, pair) => sum + offerReferenceValue(pair[1]), 0
    );

    return shipping <= contributedValue * shippingValueRatio();
  }

  function bestOfferForSeller(acceptableByKey, key, sellerName) {
    const offers = acceptableByKey[key] || [];
    return offers
      .filter(o => o.seller === sellerName)
      .sort((a,b)=>a.price_eur-b.price_eur)[0] || null;
  }

  function buildPlanFromChosen(chosenNames, sellers, acceptableByKey) {
    const chosen = new Set(chosenNames);
    const selected = {};
    let cardCost = 0;

    for (const [k, offers] of Object.entries(acceptableByKey)) {
      const avail = offers
        .filter(o => chosen.has(o.seller))
        .sort((a,b)=>a.price_eur-b.price_eur);
      if (!avail.length) continue;
      selected[k] = avail[0];
      cardCost += Number(avail[0].price_eur || 0);
    }

    const usedNames = [...new Set(Object.values(selected).map(o=>o.seller))];
    const shipCost = usedNames.reduce(
      (sum,name)=>sum+Number(sellers.find(s=>s.seller===name)?.shipping||0), 0
    );
    const total = cardCost + shipCost;

    const sellerUse = {};
    for (const o of Object.values(selected)) {
      if (!sellerUse[o.seller]) sellerUse[o.seller] = {count:0,cost:0};
      sellerUse[o.seller].count++;
      sellerUse[o.seller].cost += Number(o.price_eur || 0);
    }

    const chosenRecords=sellers.filter(s=>usedNames.includes(s.seller));
    const effectiveTotal=countryEffectiveCost(total,chosenRecords,sellerUse);

    return {
      coverage:Object.keys(selected).length,
      total,effectiveTotal,cardCost,shipCost,
      selected,chosen:usedNames,sellerUse
    };
  }



  async function buildSmartPlan(wants) {
    const log = $("#cm-log");
    await enrichUnknownSellerCountries();
    const sellers = Object.values(loadSellers());
    if (!sellers.length) throw new Error("No hay vendedores guardados.");

    const premiumInput = parseFloat($("#cm-premium").value.replace(",","."));
    const toleranceInput = parseFloat($("#cm-abs-tol").value.replace(",","."));
    const premiumPct = Number.isFinite(premiumInput) ? Math.max(0,premiumInput) : 20;
    const absTol = Number.isFinite(toleranceInput) ? Math.max(0,toleranceInput) : 0.50;
    log.textContent += `Margen de precio: ${premiumPct}% o ${fmt(absTol)}, el mayor de los dos.\n`;
    const marketDelay = Math.max(1200, parseInt($("#cm-market-delay").value || "4000",10));
    const cartMaxPrice = getCartMaxPrice();

    const observations = allObservedOffers();
    const wantsMap = wantedByKey(wants);
    const baseOnly = false;
    let targetKeys = wants.map(w=>cardKey(w)).filter(Boolean);
    if (baseOnly) targetKeys = targetKeys.filter(k => parseInt(k.split(":").pop(),10) <= 165);
    const target = new Set(targetKeys.length ? targetKeys : Object.keys(observations));

    // Value each exact expansion+number appearing in seller observations.
    const valued = {};
    const keys = Object.keys(observations).filter(k => target.has(k));
    let checkedMarket = 0;

    for (let idx=0; idx<keys.length; idx++) {
      const k = keys[idx];
      const want = wantsMap[k];
      const obs = observations[k].filter(o =>
        (!want || languageMatchesWant(o.language,want.language)) &&
        (!want || !want.condition || o.condition===want.condition || (want.condition==="NM" && o.condition==="MT")) &&
        (!want || !Number.isFinite(want.max_price_eur) || Number(o.price_eur)<=want.max_price_eur)
      );
      if (!obs.length) continue;

      const internal = internalReference(obs);
      const cheapest = obs.slice().sort((a,b)=>a.price_eur-b.price_eur)[0];

      let ref = internal?.ref ?? cheapest.price_eur;
      let refSource = internal?.confidence || "LOW_INTERNAL";
      let market = null;

      // Query Cardmarket market page when confidence is low OR prices are material/suspicious.
      const spreadRatio = internal && internal.min > 0 ? (ref / internal.min) : 1;
      const needMarket =
        (internal?.count || 0) < 3 ||
        cheapest.price_eur >= 0.50 ||
        spreadRatio >= 1.5;

      if (needMarket) {
        log.textContent += `Valorando ${cheapest.name} (${k}) [${idx+1}/${keys.length}]...\n`;
        log.scrollTop = log.scrollHeight;
        try {
          market = await fetchMarketReference(cheapest, marketDelay);
          checkedMarket++;

          if (Number.isFinite(market.ref)) {
            // Prefer market-wide evidence. If both market and internal are available,
            // use the lower robust reference to avoid accepting inflated local clusters.
            if (Number.isFinite(ref)) ref = Math.min(ref, market.ref);
            else ref = market.ref;
            refSource = market.source === "CACHE" ? "MARKET_CACHE" : "MARKET";
          }
        } catch (e) {
          if (String(e.message).includes("ANTIBOT_MARKET")) {
            log.textContent += `ANTIBOT durante valoración de mercado. Se continúa usando referencias internas/caché.\n`;
            // Do not keep hammering market pages after antibot.
            break;
          } else {
            log.textContent += `No se pudo consultar mercado para ${k}: ${e.message}\n`;
          }
        }
      }

      const ceiling = makeCeiling(ref, premiumPct, absTol);
      valued[k] = {ref, ceiling, refSource, internal, market};
    }

    // Build acceptable offers by seller and card.
    const sellerIndex = Object.fromEntries(sellers.map((s,i)=>[s.seller,i]));
    const candidates = {};
    const valuationRows = [];

    for (const [k, obsAll] of Object.entries(observations)) {
      const val = valued[k];
      if (!val) continue;

      for (const o of obsAll) {
        const want=wantsMap[k];
        if (want && !languageMatchesWant(o.language,want.language)) continue;
        if (want?.condition && o.condition!==want.condition && !(want.condition==="NM" && o.condition==="MT")) continue;
        if (want && Number.isFinite(want.max_price_eur) && Number(o.price_eur)>want.max_price_eur) continue;
        const v = verdict(o.price_eur, val.ref, val.ceiling);

        valuationRows.push({
          key:k,
          expansion:o.expansion,
          number:o.number,
          name:o.name,
          seller:o.seller,
          price_eur:o.price_eur,
          market_ref_eur:val.ref,
          ceiling_eur:val.ceiling,
          verdict:v.status,
          reason:v.reason,
          source:val.refSource,
          url:o.url
        });

        if (!["GOOD","OK"].includes(v.status)) continue;
        if (!candidates[k] || o.price_eur < candidates[k].price_eur)
          candidates[k] = {...o, valuation:val, verdict:v};
      }
    }

    // Optimization considers ALL acceptable seller offers, not only global cheapest,
    // because a slightly dearer card can save an entire extra shipping charge.
    const acceptableByKey = {};
    for (const [k, obsAll] of Object.entries(observations)) {
      const val = valued[k];
      if (!val) continue;
      if (!target.has(k)) continue;
      const want=wantsMap[k];
      acceptableByKey[k] = obsAll
        .filter(o => !want || languageMatchesWant(o.language,want.language))
        .filter(o => !want?.condition || o.condition===want.condition || (want.condition==="NM" && o.condition==="MT"))
        .filter(o => !want || !Number.isFinite(want.max_price_eur) || Number(o.price_eur)<=want.max_price_eur)
        .map(o => ({...o, v:verdict(o.price_eur,val.ref,val.ceiling), valuation:val}))
        .filter(o => ["GOOD","OK"].includes(o.v.status));
    }

    // Base-only mode: concentration first.
    // Start from a single anchor seller, then add sellers ONLY when the
    // value/savings they contribute economically justify their extra shipping.
    let best = null;

    if (sellers.length <= 18) {
      const totalMasks = 1 << sellers.length;

      for (let mask=1; mask<totalMasks; mask++) {
        const chosen = new Set();
        let shipCost = 0;
        for (let i=0;i<sellers.length;i++) {
          if (mask & (1<<i)) {
            chosen.add(sellers[i].seller);
            shipCost += Number(sellers[i].shipping || 0);
          }
        }

        const selected = {};
        let cardCost = 0;

        for (const [k, offers] of Object.entries(acceptableByKey)) {
          const avail = offers.filter(o=>chosen.has(o.seller)).sort((a,b)=>a.price_eur-b.price_eur);
          if (!avail.length) continue;
          selected[k] = avail[0];
          cardCost += avail[0].price_eur || 0;
        }

        const coverage = Object.keys(selected).length;
        const total = cardCost + shipCost;
        if (cartMaxPrice !== null && total > cartMaxPrice + 1e-9) continue;

        const sellerUse = {};
        for (const o of Object.values(selected)) {
          if (!sellerUse[o.seller]) sellerUse[o.seller] = {count:0,cost:0};
          sellerUse[o.seller].count++;
          sellerUse[o.seller].cost += o.price_eur || 0;
        }

        const chosenRecords = sellers.filter(s=>chosen.has(s.seller));
        let irrationalOrder = false;
        for (const sr of chosenRecords) {
          const ownOffers = Object.entries(selected)
            .filter(([k,o]) => o.seller === sr.seller)
            .map(([k,o]) => [k,o]);
          if (ownOffers.length && !sellerMarginalOrderAcceptable(sr, ownOffers)) {
            irrationalOrder = true;
            break;
          }
        }
        if (irrationalOrder) continue;

        const effectiveTotal = countryEffectiveCost(total, chosenRecords, sellerUse);
        const margin = countryMargin();

        if (!best ||
            coverage > best.coverage ||
            (coverage === best.coverage && effectiveTotal < best.effectiveTotal) ||
            (coverage === best.coverage &&
             Math.abs(effectiveTotal - best.effectiveTotal) <= 0.01 &&
             total < best.total) ||
            (coverage === best.coverage &&
             total <= best.total + margin &&
             effectiveTotal < best.effectiveTotal)) {
          best = {
            coverage,total,effectiveTotal,cardCost,shipCost,
            selected,chosen:[...chosen],sellerUse
          };
        }
      }
    } else {
      // Greedy fallback: iteratively choose seller with best added-card value.
      const uncovered = new Set(Object.keys(acceptableByKey));
      const chosen = [];
      const selected = {};
      let runningTotal = 0;

      while (uncovered.size) {
        let pick = null;
        for (const s of sellers) {
          if (chosen.includes(s.seller)) continue;
          let added = [];
          let cost = Number(s.shipping||0);
          for (const k of uncovered) {
            const offer = acceptableByKey[k]?.filter(o=>o.seller===s.seller).sort((a,b)=>a.price_eur-b.price_eur)[0];
            if (offer) { added.push([k,offer]); cost += offer.price_eur||0; }
          }
          if (!added.length) continue;
          if (cartMaxPrice !== null && runningTotal + cost > cartMaxPrice + 1e-9) continue;
          if (!sellerMarginalOrderAcceptable(s, added)) continue;
          const sr = sellers.find(x=>x.seller===s.seller) || s;
          const countryBias = countryPreferenceScore(sr,added.length,cost);
          const score = added.length / Math.max(cost + countryBias,0.01);
          if (!pick || score > pick.score) pick = {seller:s.seller,added,cost,score};
        }
        if (!pick) break;
        chosen.push(pick.seller);
        runningTotal += pick.cost;
        for (const [k,o] of pick.added) {
          selected[k]=o; uncovered.delete(k);
        }
      }

      // Re-optimize chosen seller copies to cheapest within chosen set.
      let cardCost=0;
      for (const k of Object.keys(selected)) {
        const avail=acceptableByKey[k].filter(o=>chosen.includes(o.seller)).sort((a,b)=>a.price_eur-b.price_eur);
        selected[k]=avail[0]; cardCost += avail[0].price_eur||0;
      }
      const shipCost=chosen.reduce((sum,name)=>sum+Number(sellers.find(s=>s.seller===name)?.shipping||0),0);
      const total=cardCost+shipCost;
      const sellerUse={};
      for(const o of Object.values(selected)){
        if(!sellerUse[o.seller]) sellerUse[o.seller]={count:0,cost:0};
        sellerUse[o.seller].count++;
        sellerUse[o.seller].cost+=o.price_eur||0;
      }
      const chosenRecords=sellers.filter(s=>chosen.includes(s.seller));
      const effectiveTotal=countryEffectiveCost(total,chosenRecords,sellerUse);
      best={coverage:Object.keys(selected).length,total,effectiveTotal,cardCost,shipCost,selected,chosen,sellerUse};
    }

    return {
      best,
      valued,
      valuationRows,
      observations,
      checkedMarket,
      targetCount:target.size,
      cardMaxPrice: wants[0]?.max_price_eur ?? null,
      cartMaxPrice
    };
  }

  function buildComparison(wants=[]) {
    const sellers=Object.values(loadSellers());
    if(!sellers.length) return null;

    let targetKeys=wants.map(w=>cardKey(w)).filter(Boolean);
    if(!targetKeys.length)
      targetKeys=[...new Set(sellers.flatMap(s=>(s.offers||[]).map(o=>cardKey(o))).filter(Boolean))];

    const targetSet=new Set(targetKeys);
    const maps=sellers.map(s=>{
      const m={};
      for(const o of (s.offers||[])){
        const k=cardKey(o);
        if(targetSet.has(k) && (!m[k] || o.price_eur<m[k].price_eur)) m[k]=o;
      }
      return m;
    });

    const summaries=sellers.map((s,i)=>{
      const keys=Object.keys(maps[i]);
      const cards=keys.reduce((sum,k)=>sum+(maps[i][k].price_eur||0),0);
      return {seller:s.seller,count:keys.length,cards,shipping:s.shipping||0,total:cards+(s.shipping||0)};
    }).sort((a,b)=>b.count-a.count || a.total-b.total);

    const union=new Set();
    maps.forEach(m=>Object.keys(m).forEach(k=>union.add(k)));

    let best=null;
    if(sellers.length<=18){
      const totalMasks=1<<sellers.length;
      for(let mask=1;mask<totalMasks;mask++){
        const chosen=[];
        for(let i=0;i<sellers.length;i++) if(mask&(1<<i)) chosen.push(i);

        const bestOffer={};
        for(const i of chosen){
          for(const [k,o] of Object.entries(maps[i])){
            if(!bestOffer[k] || o.price_eur<bestOffer[k].offer.price_eur)
              bestOffer[k]={sellerIndex:i,offer:o};
          }
        }

        const used=new Set(Object.values(bestOffer).map(x=>x.sellerIndex));
        let cardCost=0;
        for(const x of Object.values(bestOffer)) cardCost+=x.offer.price_eur||0;
        let shipCost=0; used.forEach(i=>shipCost+=sellers[i].shipping||0);
        const coverage=Object.keys(bestOffer).length;
        const total=cardCost+shipCost;
        if(!best || coverage>best.coverage || (coverage===best.coverage && total<best.total))
          best={coverage,total,cardCost,shipCost,bestOffer,used:[...used]};
      }
    }
    return {sellers,maps,summaries,union,targetKeys,best};
  }


  $("#cm-edit-shipping").onclick = () => {
    const sellersObj = loadSellers();
    const sellers = Object.values(sellersObj).sort((a,b)=>a.seller.localeCompare(b.seller));
    const log = $("#cm-log");

    if (!sellers.length) {
      log.textContent = "No hay vendedores guardados.";
      return;
    }

    const existing = document.getElementById("cm-shipping-editor");
    if (existing) existing.remove();

    const editor = document.createElement("div");
    editor.id = "cm-shipping-editor";
    editor.style.cssText = `
      position:fixed;z-index:2147483647;top:60px;left:50%;transform:translateX(-50%);
      width:min(720px,92vw);max-height:80vh;overflow:auto;background:#fff;color:#111;
      border:2px solid #333;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);
      padding:16px;font:14px Arial,sans-serif
    `;

    const rows = sellers.map(s => {
      const cardCost = s.offers.reduce((sum,o)=>sum+(o.price_eur||0),0);
      return `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd">${s.seller}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${s.country || "??"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${s.status || "COMPLETE"}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${s.offers.length}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${fmt(cardCost)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">
            <input data-seller="${s.seller.replace(/"/g,'&quot;')}" class="cm-ship-input"
              value="${Number(s.shipping||0).toFixed(2)}"
              style="width:80px;padding:4px;text-align:right"> €
          </td>
        </tr>
      `;
    }).join("");

    editor.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:10px">Editar portes guardados</div>
      <div style="font-size:12px;color:#666;margin-bottom:10px">
        Cambiar estos importes NO vuelve a analizar Cardmarket. Solo actualiza el coste de envío usado en la comparativa.
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #333">Vendedor</th>
            <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333">País</th>
            <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333">Estado</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333">Cartas</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333">Cartas €</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #333">Portes €</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button id="cm-ship-save" style="padding:8px 12px;font-weight:700">Guardar portes</button>
        <button id="cm-ship-cancel" style="padding:8px 12px">Cancelar</button>
      </div>
    `;
    document.body.appendChild(editor);

    editor.querySelector("#cm-ship-cancel").onclick = () => editor.remove();

    editor.querySelector("#cm-ship-save").onclick = () => {
      const updated = loadSellers();
      let changed = 0;

      editor.querySelectorAll(".cm-ship-input").forEach(inp => {
        const seller = inp.dataset.seller;
        let val = parseFloat(String(inp.value).replace(",", "."));
        if (!Number.isFinite(val) || val < 0) val = 0;

        if (updated[seller]) {
          if (Number(updated[seller].shipping || 0) !== val) changed++;
          updated[seller].shipping = val;
        }
      });

      saveSellers(updated);
      editor.remove();

      // v5.4.18: refresh visible cart/plan shipping data immediately.
      try { refreshCartPackUi(); } catch(e) {}

      log.textContent = `Portes actualizados. Vendedores modificados: ${changed}\n\nPulsa "Plan inteligente" para recalcular el plan con los nuevos portes.`;
    };
  };


  let lastSmartPlan = null;
  let cartPackProgress = {};
  const SMART_PLAN_STORAGE_KEY="cm_helper_smart_plan_v5";
  const SMART_PLAN_PROGRESS_KEY="cm_helper_smart_plan_progress_v5";
  function saveSmartPlanSession(){
    if(indexedDbActive){
      const planSnapshot=lastSmartPlan
        ? (typeof structuredClone==="function" ? structuredClone(lastSmartPlan) : JSON.parse(JSON.stringify(lastSmartPlan)))
        : null;
      const progressSnapshot=typeof structuredClone==="function"
        ? structuredClone(cartPackProgress||{})
        : JSON.parse(JSON.stringify(cartPackProgress||{}));

      Promise.all([
        planSnapshot ? idbKvPut("smart_plan",planSnapshot) : idbKvDelete("smart_plan"),
        idbKvPut("smart_plan_progress",progressSnapshot)
      ]).catch(e=>console.warn("No pude guardar plan inteligente en IndexedDB",e));
      return;
    }

    try{
      if(lastSmartPlan) localStorage.setItem(SMART_PLAN_STORAGE_KEY,JSON.stringify(lastSmartPlan));
      localStorage.setItem(SMART_PLAN_PROGRESS_KEY,JSON.stringify(cartPackProgress||{}));
    }catch(e){console.warn("No pude guardar plan inteligente",e);}
  }

  async function restoreSmartPlanSession(){
    if(indexedDbActive){
      try{
        lastSmartPlan=await idbKvGet("smart_plan");
        cartPackProgress=(await idbKvGet("smart_plan_progress"))||{};
        return !!lastSmartPlan?.best?.selected;
      }catch(e){
        console.warn("No pude restaurar plan inteligente desde IndexedDB",e);
        return false;
      }
    }

    try{
      const raw=localStorage.getItem(SMART_PLAN_STORAGE_KEY);
      if(raw) lastSmartPlan=JSON.parse(raw);
      const p=localStorage.getItem(SMART_PLAN_PROGRESS_KEY);
      if(p) cartPackProgress=JSON.parse(p)||{};
      return !!lastSmartPlan?.best?.selected;
    }catch(e){console.warn("No pude restaurar plan inteligente",e);return false;}
  }


  function planOffersBySeller() {
    const selected = lastSmartPlan?.best?.selected;
    if (!selected) return {};
    const grouped = {};
    for (const o of Object.values(selected)) {
      if (!grouped[o.seller]) grouped[o.seller] = [];
      grouped[o.seller].push(o);
    }
    for (const arr of Object.values(grouped)) {
      arr.sort((a,b)=>parseInt(a.number,10)-parseInt(b.number,10));
    }
    return grouped;
  }

  function refreshCartPackUi() {
    const box=$("#cm-cart-pack-box");
    const sel=$("#cm-cart-seller");
    const info=$("#cm-cart-pack-info");
    const btn=$("#cm-add-cart-pack");

    if (!lastSmartPlan?.best?.selected) {
      box.style.display="none";
      btn.disabled=true;
      return;
    }

    const grouped=planOffersBySeller();
    const sellers=Object.keys(grouped);
    if (!sellers.length) {
      box.style.display="none";
      btn.disabled=true;
      return;
    }

    const current=sel.value;
    sel.innerHTML="";

    sellers.sort((a,b)=>{
      const ca=loadSellers()[a]?.country||"";
      const cb=loadSellers()[b]?.country||"";
      const ra=countryBaseRank(ca), rb=countryBaseRank(cb);
      if (ra!==rb) return ra-rb;
      return grouped[b].length-grouped[a].length;
    });

    for (const s of sellers) {
      const offers=grouped[s];
      const country=loadSellers()[s]?.country||"??";
      const cardCost=offers.reduce((sum,o)=>sum+Number(o.price_eur||0),0);
      const shipping=Number(loadSellers()[s]?.shipping||0);
      const done=Math.min(cartPackProgress[s]||0,offers.length);

      const opt=document.createElement("option");
      opt.value=s;
      opt.textContent=`${s} [${country}] · ${offers.length} cartas · ${fmt(cardCost)} + porte ${fmt(shipping)}${done?` · ${done}/${offers.length} añadidas`:""}`;
      sel.appendChild(opt);
    }

    if (current && sellers.includes(current)) sel.value=current;
    else sel.value=sellers[0];

    box.style.display="block";
    btn.disabled=false;
    updateCartPackInfo();
  }

  function updateCartPackInfo() {
    const sel=$("#cm-cart-seller");
    const info=$("#cm-cart-pack-info");
    const grouped=planOffersBySeller();
    const s=sel.value;
    const offers=grouped[s]||[];

    if(!s || !offers.length){
      info.textContent="";
      return;
    }

    const cardCost=offers.reduce((sum,o)=>sum+Number(o.price_eur||0),0);
    const shipping=Number(loadSellers()[s]?.shipping||0);
    const done=Math.min(cartPackProgress[s]||0,offers.length);
    const remaining=offers.length-done;

    info.textContent =
      `${offers.length} cartas del plan · cartas ${fmt(cardCost)} · porte estimado ${fmt(shipping)} · ` +
      `aprox. ${fmt(cardCost+shipping)} total · pendientes en esta sesión: ${remaining}`;
  }

  $("#cm-smart-plan").onclick = async () => {
    const log=$("#cm-log"), btn=$("#cm-smart-plan");
    btn.disabled=true;
    log.textContent="";

    try {
      const wants=await readWants();
      if (!wants.length) throw new Error("Selecciona un Wants CSV válido.");

      const result=await buildSmartPlan(wants);
      const b=result.best;

      if (!b) {
        lastSmartPlan = null;
        log.textContent += "\nNo se pudo construir ningún plan aceptable.";
        return;
      }

      lastSmartPlan = {result, best:b, createdAt:Date.now()};
      cartPackProgress = {};
      saveSmartPlanSession();
      refreshCartPackUi();

      log.textContent += `\nPLAN INTELIGENTE\n`;
log.textContent += `Cobertura aceptable: ${b.coverage}/${result.targetCount}\n`;
      log.textContent += `Cartas: ${fmt(b.cardCost)}\n`;
      log.textContent += `Portes: ${fmt(b.shipCost)}\n`;
      log.textContent += `TOTAL: ${fmt(b.total)}\n`;
      log.textContent += `Vendedores (${b.chosen.length}): ${b.chosen.map(n=>`${n}${loadSellers()[n]?.country?` [${loadSellers()[n].country}]`:""}`).join(", ")}\n`;
      log.textContent += `Fichas de mercado consultadas en esta ejecución: ${result.checkedMarket}\n`;

      const rows=Object.entries(b.selected).map(([k,o])=>{
        const val=o.valuation;
        const v=verdict(o.price_eur,val.ref,val.ceiling);
        return {
          expansion:o.expansion,
          number:o.number,
          name:o.name,
          seller:o.seller,
          country:(loadSellers()[o.seller]?.country || ""),
          seller_scan_status:(loadSellers()[o.seller]?.status || "COMPLETE"),
          article_id:o.article_id || "",
          country_penalty_eur:csvDec(countryPreferenceScore(
            loadSellers()[o.seller] || {},
            b.sellerUse?.[o.seller]?.count || 0,
            b.sellerUse?.[o.seller]?.cost || 0
          )),
          price_eur:csvDec(o.price_eur),
          market_reference_eur:Number.isFinite(val.ref)?csvDec(val.ref):"",
          max_acceptable_eur:Number.isFinite(val.ceiling)?csvDec(val.ceiling):"",
          verdict:v.status,
          reference_source:val.refSource,
          language:o.language,
          condition:o.condition,
          url:o.url
        };
      }).sort((a,b)=>parseInt(a.number)-parseInt(b.number));

      const cols=["expansion","number","name","seller","country","seller_scan_status","article_id","country_penalty_eur","price_eur","market_reference_eur","max_acceptable_eur","verdict","reference_source","language","condition","url"];
      const csv=[cols.join(";"),...rows.map(r=>cols.map(c=>csvEscape(r[c]??"")).join(";"))].join("\r\n");
      download(`cardmarket_plan_inteligente_MULTI.csv`,csv);

      // Full audit: every observed offer with verdict/reason
      const aCols=["key","number","name","seller","price_eur","market_ref_eur","ceiling_eur","verdict","reason","source","url"];
      const audit=[aCols.join(";"),...result.valuationRows.map(r=>aCols.map(c=>{
        let v=r[c];
        if (typeof v==="number") v=csvDec(v);
        return csvEscape(v??"");
      }).join(";"))].join("\r\n");
      download(`cardmarket_valoracion_MULTI.csv`,audit);

      const rejected=result.valuationRows.filter(r=>["EXPENSIVE","OUTLIER"].includes(r.verdict));
      log.textContent += `Ofertas descartadas por precio: ${rejected.length}\n`;
      if (rejected.length) {
        log.textContent += `\nEjemplos descartados:\n`;
        rejected.slice(0,8).forEach(r=>{
          log.textContent += `- ${r.name} #${r.number}: ${fmt(r.price_eur)} (ref ${fmt(r.market_ref_eur)} · techo ${fmt(r.ceiling_eur)}) · ${r.verdict}\n`;
        });
      }

    } catch(e) {
      console.error(e);
      log.textContent += `\nERROR: ${e.message}`;
    } finally {
      btn.disabled=false;
    }
  };





  function syncPlanPackFromSavedSeller(seller) {
    const grouped=planOffersBySeller();
    const planOffers=grouped[seller]||[];
    const saved=loadSellers()[seller];
    if(!saved?.offers?.length) return {matched:0,withId:0,missing:planOffers.length,priceChanges:0};

    let matched=0,withId=0,priceChanges=0;

    for(const po of planOffers){
      const candidates=saved.offers.filter(x=>
        norm(x.expansion)===norm(po.expansion) &&
        normalizeNum(x.number)===normalizeNum(po.number)
      );
      if(!candidates.length) continue;

      candidates.sort((a,b)=>{
        const condA=(a.condition===po.condition?0:1);
        const condB=(b.condition===po.condition?0:1);
        if(condA!==condB) return condA-condB;

        const langA=(a.language===po.language?0:1);
        const langB=(b.language===po.language?0:1);
        if(langA!==langB) return langA-langB;

        return Math.abs(Number(a.price_eur)-Number(po.price_eur)) -
               Math.abs(Number(b.price_eur)-Number(po.price_eur));
      });

      const cur=candidates[0];
      matched++;

      if(cur.article_id){
        po.article_id=cur.article_id;
        withId++;
      }

      if(Number.isFinite(Number(cur.price_eur)) &&
         Math.abs(Number(cur.price_eur)-Number(po.price_eur))>0.0001){
        po.old_price_eur=po.price_eur;
        po.price_eur=Number(cur.price_eur);
        priceChanges++;
      }

      po.condition=cur.condition||po.condition;
      po.language=cur.language||po.language;
      po.url=cur.url||po.url;
      po.quantity=cur.quantity??po.quantity;
    }

    return {
      matched,
      withId,
      missing:Math.max(0,planOffers.length-withId),
      priceChanges
    };
  }

  async function refreshSellerForCart(seller) {
    const log=$("#cm-log");
    const grouped=planOffersBySeller();
    const pack=grouped[seller]||[];
    if(!pack.length) return {matched:0,withId:0,missing:0,priceChanges:0};

    const before=pack.filter(o=>o.article_id).length;
    if(before===pack.length){
      return {matched:pack.length,withId:pack.length,missing:0,priceChanges:0};
    }

    log.textContent += `\nPreparando carrito de ${seller}: faltan idArticle en ${pack.length-before}/${pack.length} cartas.\n`;
    log.textContent += `Reescaneando una vez las colecciones del Wants para este vendedor...\n`;
    log.scrollTop=log.scrollHeight;

    const wants=await readWants();
    if(!wants.length) throw new Error("Selecciona un Wants CSV válido.");

    // Force a fresh seller scan rather than resuming/using stale COMPLETE data.
    const saved=loadSellers();
    const old=saved[seller];
    if(old){
      old.status="STALE_FOR_CART_REFRESH";
      old.resume_url="";
      old.next_page=null;
      queueSellerPut(old);
    }

    const pageDelay=Math.max(1800,parseInt($("#cm-page-delay")?.value||"2800",10)||2800);
    const defaultShipping=Number(old?.shipping ?? parseFloat(($("#cm-shipping")?.value||"2").replace(",",".")) ?? 2);
    const countryHint=old?.country||"";

    await scanSellerByName(seller,wants,pageDelay,defaultShipping,countryHint);

    const result=syncPlanPackFromSavedSeller(seller);

    log.textContent += `Refresh ${seller}: ${result.withId}/${pack.length} cartas con idArticle`;
    if(result.priceChanges) log.textContent += ` · ${result.priceChanges} precio(s) actualizado(s)`;
    log.textContent += `.\n`;

    return result;
  }

  $("#cm-cart-seller").onchange = updateCartPackInfo;

  $("#cm-add-cart-pack").onclick = async () => {
    const btn=$("#cm-add-cart-pack");
    const log=$("#cm-log");
    const seller=$("#cm-cart-seller").value;
    const grouped=planOffersBySeller();
    const allOffers=grouped[seller]||[];

    if(!seller || !allOffers.length){
      log.textContent += "\nNo hay cartas para ese vendedor.\n";
      return;
    }

    let batch=parseInt($("#cm-cart-batch").value||"30",10);
    if(!Number.isFinite(batch) || batch<1) batch=30;
    batch=Math.min(batch,100);

    btn.disabled=true;

    try{
      // IMPORTANT: old seller scans do not contain article_id.
      // Refresh this seller once and sync the whole pack before attempting the cart.
      const refresh=await refreshSellerForCart(seller);

      const refreshedGrouped=planOffersBySeller();
      const refreshedAll=refreshedGrouped[seller]||[];
      const already=Math.min(cartPackProgress[seller]||0,refreshedAll.length);
      const offers=refreshedAll.slice(already,already+batch);

      if(!offers.length){
        log.textContent += `\n${seller}: ya se han añadido todas las cartas de este pack en esta sesión.\n`;
        return;
      }

      const staleOffers=offers.filter(o=>!o.article_id);
      const availableOffers=offers.filter(o=>!!o.article_id);

      if(staleOffers.length){
        log.textContent += `\n${staleOffers.length}/${offers.length} carta(s) de esta tanda ya no aparecen como oferta utilizable del vendedor.\n`;
        log.textContent += `Pendientes: ${staleOffers.slice(0,12).map(o=>`${o.number} ${o.name}`).join(", ")}`;
        if(staleOffers.length>12) log.textContent += `, ...`;
        log.textContent += `\nLas salto y continúo con las que siguen disponibles.\n`;
      }

      if(!availableOffers.length){
        log.textContent += `\nNo queda ninguna carta disponible en esta tanda. Regenera el plan para reasignar estas cartas a otros vendedores.\n`;
        cartPackProgress[seller]=already+offers.length;
        saveSmartPlanSession();
        refreshCartPackUi();
        return;
      }

      const country=loadSellers()[seller]?.country||"??";
      const shipping=Number(loadSellers()[seller]?.shipping||0);
      const packCardCost=refreshedAll.filter(o=>o.article_id).reduce((s,o)=>s+Number(o.price_eur||0),0);
      const batchCost=availableOffers.reduce((s,o)=>s+Number(o.price_eur||0),0);

      const msg =
        `Vendedor: ${seller} [${country}]\n` +
        `Ofertas actuales con ID: ${refresh.withId}/${refreshedAll.length}.\n` +
        `Esta tanda tenía ${offers.length} carta(s): ${availableOffers.length} disponibles y ${staleOffers.length} desaparecidas.\n` +
        `Se añadirán ${availableOffers.length} carta(s) (${fmt(batchCost)}).\n` +
        `Porte estimado del vendedor: ${fmt(shipping)}.\n` +
        (refresh.priceChanges ? `Precios actualizados tras refrescar: ${refresh.priceChanges}.\n` : "") +
        `Progreso: ${already}/${refreshedAll.length} procesadas en esta sesión.\n\n` +
        `¿Añadir las disponibles de esta tanda al carrito?`;

      // Continue using only currently available offers.
      offers.length = 0;
      offers.push(...availableOffers);

      if(!confirm(msg)) return;

      let ok=0, failed=0;
      let skippedStale=staleOffers.length;

      log.textContent += `\nAÑADIENDO PACK DE VENDEDOR\n`;
      log.textContent += `${seller} [${country}] · tanda ${offers.length} · ${fmt(batchCost)} en cartas\n\n`;

      const token=await getCurrentCartToken(offers[0]?.url||location.href);

      for(let i=0;i<offers.length;i++){
        const o=offers[i];
        log.textContent += `[${already+i+1}/${allOffers.length}] ${o.number} ${o.name} · ${fmt(o.price_eur)}... `;
        log.scrollTop=log.scrollHeight;

        try{
          const articleId=o.article_id||"";
          if(!articleId) throw new Error("idArticle ausente tras refrescar vendedor");

          await addArticleToCart(articleId,token,1,o.url);
          ok++;
          log.textContent += "OK\n";

          const saved=loadSellers();
          const rec=saved[o.seller];
          const existing=rec?.offers?.find(x=>
            norm(x.expansion)===norm(o.expansion) &&
            normalizeNum(x.number)===normalizeNum(o.number) &&
            x.language===o.language &&
            x.condition===o.condition &&
            Math.abs(Number(x.price_eur)-Number(o.price_eur))<0.001
          );
          if(existing && !existing.article_id){
            existing.article_id=articleId;
            queueSellerPut(rec);
          }

          await sleep(jitter(1400,600));
        }catch(e){
          const msg=String(e.message||e);
          if(e.cartType==="unavailable"){failed++;skippedStale++;log.textContent += `AGOTADA/DESAPARECIDA: ${msg}\n`;continue;}
          failed++;
          log.textContent += `ERROR: ${msg}\n`;
          log.textContent += `\nDetengo esta tanda en la primera incidencia real para no insistir contra Cardmarket.\n`;
          if(/403|429|ANTIBOT/i.test(msg)) log.textContent += `Revisa la web/CAPTCHA antes de seguir.\n`;
          break;
        }
      }

      // Stale offers are intentionally processed/skipped so they are not retried forever.
      // On a real cart error we stop and only advance by successfully added + stale skipped.
      cartPackProgress[seller]=already+ok+skippedStale;
      saveSmartPlanSession();
      refreshCartPackUi();

      log.textContent += `\nRESULTADO PACK ${seller}\n`;
      log.textContent += `Añadidas: ${ok}\n`;
      log.textContent += `Desaparecidas/saltadas: ${skippedStale}\n`;
      log.textContent += `Fallidas al añadir: ${failed}\n`;

      if(cartPackProgress[seller] < refreshedAll.length){
        log.textContent += `Quedan ${refreshedAll.length-cartPackProgress[seller]} posición(es) del pack por procesar.\n`;
      }else{
        log.textContent += `Pack de ${seller} procesado en esta sesión.\n`;
      }

      if(skippedStale){
        log.textContent += `${skippedStale} carta(s) siguen pendientes y conviene regenerar el Plan inteligente después para buscarlas en otros vendedores.\n`;
      }

      log.textContent += `Revisa el carrito antes de pagar.\n`;
    }catch(e){
      log.textContent += `ERROR CARRITO: ${e.message}\n`;
    }finally{
      btn.disabled=false;
    }
  };

  $("#cm-compare").onclick = async () => {
    const log=$("#cm-log");
    const wants=await readWants();
    const cmp=buildComparison(wants);
    if(!cmp){ log.textContent="No hay vendedores guardados."; return; }

    log.textContent="COMPARACIÓN\n\n";
    for(const x of cmp.summaries)
      log.textContent += `${x.seller}${(loadSellers()[x.seller]?.country)?` [${loadSellers()[x.seller].country}]`:""}: ${x.count}/${cmp.targetKeys.length} | cartas ${fmt(x.cards)} + envío ${fmt(x.shipping)} = ${fmt(x.total)}\n`;

    log.textContent += `\nCobertura conjunta: ${cmp.union.size}/${cmp.targetKeys.length}\n`;

    if(cmp.best){
      log.textContent += `\nMEJOR COMBINACIÓN PARA COBERTURA MÁXIMA\n`;
      log.textContent += `${cmp.best.coverage}/${cmp.targetKeys.length} | cartas ${fmt(cmp.best.cardCost)} + portes ${fmt(cmp.best.shipCost)} = ${fmt(cmp.best.total)}\n`;
      log.textContent += `Vendedores: ${cmp.best.used.map(i=>cmp.sellers[i].seller).join(", ")}\n`;

      const rows=Object.entries(cmp.best.bestOffer).map(([key,x])=>({
        expansion:x.offer.expansion,number:x.offer.number,name:x.offer.name,seller:cmp.sellers[x.sellerIndex].seller,
        price_eur:csvDec(x.offer.price_eur),condition:x.offer.condition,url:x.offer.url
      })).sort((a,b)=>parseInt(a.number)-parseInt(b.number));

      const cols=["expansion","number","name","seller","price_eur","condition","url"];
      const csv=[cols.join(";"),...rows.map(r=>cols.map(c=>csvEscape(r[c]??"")).join(";"))].join("\r\n");
      download(`cardmarket_plan_compra_MULTI.csv`,csv);
    } else {
      log.textContent += `\nMás de 18 vendedores guardados: se omite la optimización exacta.\n`;
    }
  };

  $("#cm-export").onclick = () => {
    const sellers=Object.values(loadSellers());
    if(!sellers.length){ $("#cm-log").textContent="No hay vendedores guardados."; return; }

    const rows=sellers.map(s=>{
      const cards=s.offers.reduce((a,o)=>a+(o.price_eur||0),0);
      return {
        seller:s.seller,
        country:s.country || "",
        status:s.status || "COMPLETE",
        scan_mode:s.scan_mode || "LEGACY_FULL_INVENTORY",
        filter_expansion_id:s.filter_expansion_id || "",
        last_page:s.last_page || "",
        next_page:s.next_page || "",
        cards_found:s.offers.length,
        cards_cost_eur:csvDec(cards),
        shipping_eur:csvDec(s.shipping||0),
        total_eur:csvDec(cards+(s.shipping||0)),
        scanned_at:s.scanned_at
      };
    }).sort((a,b)=>b.cards_found-a.cards_found);

    const cols=["seller","country","status","scan_mode","filter_expansion_id","last_page","next_page","cards_found","cards_cost_eur","shipping_eur","total_eur","scanned_at"];
    const csv=[cols.join(";"),...rows.map(r=>cols.map(c=>csvEscape(r[c]??"")).join(";"))].join("\r\n");
    download(`cardmarket_vendedores_MULTI.csv`,csv);
    $("#cm-log").textContent=`Resumen exportado: ${rows.length} vendedores.`;
  };




  $("#cm-export-expdb").onclick=()=>{download("expansiones_cardmarket.csv",expansionDbToCsv());$("#cm-log").textContent="Base de expansiones exportada.";};
  $("#cm-import-expdb").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const n=await importExpansionDbCsv(f);$("#cm-log").textContent=`Base de expansiones importada: ${n} entrada(s).`;}catch(err){$("#cm-log").textContent=`ERROR importando expansiones: ${err.message}`;}finally{e.target.value="";}};
  $("#cm-clear-seeds").onclick = () => {
    localStorage.removeItem(SEED_HISTORY_KEY);
    $("#cm-log").textContent = "Historial de semillas reiniciado. La próxima ejecución volverá a tratar todas como no usadas.";
  };

  $("#cm-clear-cache").onclick = () => {
    localStorage.removeItem(CATALOG_CACHE_KEY);
    localStorage.removeItem(EXPANSION_ID_CACHE_KEY);
    $("#cm-log").textContent = "Caché de productos y de IDs de expansión borrada. Se reconstruirá en la próxima ejecución.";
  };

  $("#cm-clear").onclick = async () => {
    if(confirm("¿Borrar todos los vendedores guardados? La caché de precios de mercado se conservará.")){
      await clearStoredSellers();
      $("#cm-log").textContent="Vendedores guardados borrados de IndexedDB.";
    }
  };
  // v5.4.14: recuperar último plan y progreso al navegar y volver a ejecutar.
  if(await restoreSmartPlanSession()){
    try{
      refreshCartPackUi();
      const restoreLog=$("#cm-log");
      if(restoreLog) restoreLog.textContent += "\n✓ Plan inteligente anterior restaurado desde IndexedDB. Puedes continuar añadiendo vendedores.\n";
    }catch(e){console.warn("No pude refrescar plan restaurado",e);}
  }

})();
