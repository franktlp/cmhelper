/* NODE_PATH=/tmp/cmhelper-tests/node_modules node tests/loader-release.cjs */
const {JSDOM}=require('jsdom'),{IDBFactory}=require('fake-indexeddb'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),script=fs.readFileSync(root+'/cardmarket-helper.user.js','utf8');
const version=script.match(/@version\s+(\S+)/)[1];
assert.match(fs.readFileSync(root+'/cardmarket-helper.js','utf8'),new RegExp('const VERSION = "'+version.replace(/\./g,'\\.')+'"'));
assert.match(fs.readFileSync(root+'/master-set-ui.js','utf8'),new RegExp("version:'"+version.replace(/\./g,'\\.')+"'"));
const dom=new JSDOM('<!doctype html><body></body>',{url:'https://www.cardmarket.com/es/Pokemon/Products/Singles/Destined-Rivals',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window;
(async()=>{try{
 const loaded=[],errors=[];w.indexedDB=new IDBFactory();w.ResizeObserver=class{observe(){}disconnect(){}};w.unsafeWindow=w;w.structuredClone=structuredClone;w.alert=e=>errors.push(e);
 w.GM_xmlhttpRequest=opts=>{const url=new URL(opts.url);assert.equal(url.hostname,'raw.githubusercontent.com');const file=url.pathname.split('/').pop();loaded.push(file);w.queueMicrotask(()=>opts.onload({status:200,responseText:fs.readFileSync(root+'/'+file,'utf8')}))};
 await w.eval(script);
 for(let i=0;i<100&&!w.document.querySelector('#cm-helper-tabs');i++)await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(errors,[]);assert.ok(w.CMShippingProbe);assert.ok(w.CMMasterUI);assert.equal(w.document.querySelectorAll('#cm-helper-tabs').length,1);
 assert.ok(loaded.includes('cardmarket-shipping-probe.js'));assert.equal(loaded.length,7);
 await w.eval(script);assert.equal(loaded.length,7);
 await new Promise(r=>setTimeout(r,50));
 console.log('PASS release '+version+': seven pinned modules, shipping probe loaded, one integrated Helper, consistent versions and duplicate initialization prevented.');
 }finally{w.close()}})().catch(e=>{console.error(e);process.exitCode=1});
