/* PokéCottage source adapter — experimental, not loaded by production Helper.
 * Runs on PokéCottage pages. Does not bypass access controls.
 * Reads only visible, structured checklist rows. Never assumes a set is complete.
 */
(()=>{'use strict';
const VERSION='0.1.0';
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const canonical=s=>norm(s).toLowerCase();
const finish=s=>{const v=canonical(s);if(/reverse/.test(v))return 'reverse';if(/cosmos/.test(v))return 'cosmos holo';if(/holo/.test(v))return 'holo';if(/non.?holo|normal|regular/.test(v))return 'normal';return v};
function findTables(doc){return [...doc.querySelectorAll('table')].filter(t=>{const headers=[...t.querySelectorAll('thead th')].map(x=>canonical(x.textContent));return headers.some(x=>/number|card #|card no|#/i.test(x))&&headers.some(x=>/name|card/i.test(x))&&headers.some(x=>/finish|variant|holo|foil/i.test(x))})}
function parseTable(table,set){const headers=[...table.querySelectorAll('thead th')].map(x=>canonical(x.textContent));const col=rx=>headers.findIndex(x=>rx.test(x));const number=col(/number|card #|card no|#/),name=col(/name|card/),variant=col(/finish|variant|holo|foil/),rarity=col(/rarity/);if([number,name,variant].some(i=>i<0))return [];return [...table.querySelectorAll('tbody tr')].map(tr=>{const cells=[...tr.querySelectorAll('td')].map(x=>norm(x.textContent));const raw=cells[number]||'',num=(raw.match(/\b\d{1,4}(?:\/\d{1,4})?\b/)||[])[0]||'';return {set,number:num,name:cells[name]||'',variant:finish(cells[variant]),rarity:rarity>=0?cells[rarity]:'',tier:'master',language:'all',source:'pokecottage',detail:''}}).filter(x=>x.number&&x.name&&x.variant)}
function inspect(doc=document,set='Mega Evolution'){const tables=findTables(doc),entries=tables.flatMap(t=>parseTable(t,set));const unique=new Map(entries.map(e=>[[e.number,e.variant,e.detail].join('|'),e]));return {version:VERSION,url:doc.URL||location.href,tables:tables.length,entries:[...unique.values()],status:tables.length&&unique.size?'partial-unverified':'no-structured-checklist',note:'Grand Master classification and source completeness must be verified before saving as authoritative.'}}
window.CMPokeCottageSource={inspect,version:VERSION};console.info('PokéCottage checklist inspector available. Run CMPokeCottageSource.inspect()');
})();