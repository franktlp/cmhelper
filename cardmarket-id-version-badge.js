(() => {
  'use strict';
  const VERSION='0.5.1';
  const banner=document.getElementById('cm-id-catalog-banner');
  if(!banner) return;
  const title=banner.firstElementChild;
  if(!title) return;
  const text=String(title.textContent||'').trim();
  const cleaned=text.replace(/^Catálogo de IDs(?:\s+v[\d.]+)?\s*·\s*/i,'');
  title.textContent=`Catálogo de IDs v${VERSION} · ${cleaned}`;
  banner.dataset.catalogVersion=VERSION;
  console.info(`Cardmarket ID Catalog visible version v${VERSION}`);
})();