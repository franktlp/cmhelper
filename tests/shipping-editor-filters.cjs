/* npm install --prefix /tmp/cmhelper-tests jsdom@26 fake-indexeddb
 * NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/shipping-editor-filters.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const sellers=[
 {seller:'Zulu',country:'DE',wantsCount:2,wantsValue:1,shipping:4.2},
 {seller:'Álvaro',country:'ES',wantsCount:12,wantsValue:2,shipping:2},
 {seller:'Beta',country:'ES',wantsCount:7,wantsValue:3,shipping:0},
 {seller:'<b>Literal</b>',country:'??',wantsCount:1,wantsValue:1,shipping:7}
];
(async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com/es/Pokemon/Products/Singles/Chaos-Rising',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
 try{
 w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.structuredClone=structuredClone;w.alert=()=>{};
 w.fetch=()=>{throw Error('Filtering must not request offers')};
 await w.eval(fs.readFileSync(path.join(__dirname,'../cardmarket-helper.js'),'utf8'));
 const open=()=>{w.CMHelperEditShipping(sellers);return w.document.querySelector('#cm-shipping-editor')};
 let editor=open();
 const field=id=>editor.querySelector('#cm-ship-'+id);
 const visible=()=>[...editor.querySelectorAll('tbody tr')].filter(r=>!r.hidden).map(r=>r.querySelector('input').dataset.seller);
 const set=(id,value,event='change')=>{field(id).value=value;field(id).dispatchEvent(new w.Event(event,{bubbles:true}))};
 const input=name=>[...editor.querySelectorAll('.cm-ship-input')].find(el=>el.dataset.seller===name);
 assert.deepEqual(visible(),['Álvaro','Beta','Zulu','<b>Literal</b>']);
 assert.equal(editor.querySelectorAll('td b').length,0,'seller names must remain literal text');
 assert.equal(w.document.activeElement,field('search'));
 set('search','ALVARO','input');assert.deepEqual(visible(),['Álvaro']);
 input('Álvaro').value='3,50';input('Álvaro').dispatchEvent(new w.Event('input',{bubbles:true}));
 set('search','zzz','input');assert.equal(visible().length,0);assert.equal(field('empty').hidden,false);
 field('clear').click();assert.equal(visible().length,4);assert.equal(input('Álvaro').value,'3,50');
 set('country','ES');assert.deepEqual(visible(),['Álvaro','Beta']);
 set('sort','name');assert.deepEqual(visible(),['Álvaro','Beta']);
 set('sort','shipping-asc');assert.deepEqual(visible(),['Beta','Álvaro']);
 set('sort','shipping-desc');assert.deepEqual(visible(),['Álvaro','Beta']);
 field('edited').checked=true;field('edited').dispatchEvent(new w.Event('change'));assert.deepEqual(visible(),['Álvaro']);
 set('country','DE');assert.equal(visible().length,0);
 field('save').click();assert.equal(w.document.querySelector('#cm-shipping-editor'),null);
 const overrides=()=>JSON.parse(w.localStorage.getItem('cm_helper_shipping_overrides_v1'));
 assert.equal(overrides().alvaro.value,3.5,'hidden edits must save');
 assert.equal(Object.keys(overrides()).length,1,'untouched shipping must remain unchanged');
 editor=open();assert.equal(input('Álvaro').value,'3.50');
 input('Zulu').value='-1';set('search','alvaro','input');field('save').click();
 assert.ok(w.document.querySelector('#cm-shipping-editor'));assert.equal(input('Zulu').closest('tr').hidden,false);
 assert.equal(w.document.activeElement,input('Zulu'));assert.equal(overrides().alvaro.value,3.5);
 input('Zulu').value='0';input('Zulu').dispatchEvent(new w.Event('input'));field('save').click();assert.equal(overrides().zulu.value,0);
 editor=open();input('Zulu').value='99';field('cancel').click();assert.equal(overrides().zulu.value,0);
 console.log('PASS shipping filters: name/accent search, country, coverage/name/price order, empty state, unsaved-only, hidden edits saved, input nodes retained, invalid hidden edits revealed, zero shipping, cancel and persisted overrides.');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
