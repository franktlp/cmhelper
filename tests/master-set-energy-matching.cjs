/* Run with: node --test tests/master-set-energy-matching.cjs */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function adapter(){
  const source=fs.readFileSync(path.join(__dirname,'../master-set-data-adapter.js'),'utf8');
  // Only replace the persistence boundary. Exercise real CSV decoding, catalog
  // validation and progress matching without requiring a browser IndexedDB.
  const boundary="const get=k=>transaction('readonly',s=>s.get(k)),put=(k,v)=>transaction('readwrite',s=>s.put(v,k));";
  assert.ok(source.includes(boundary));
  const context={window:{},console:{info(){}},records:new Map()};
  vm.runInNewContext(source.replace(boundary,'const get=async k=>records.get(k),put=async(k,v)=>records.set(k,v);'),context);
  return context.window.CMMasterData;
}
const energy=(n)=>({set:'30th Celebration',number:'MEE '+String(n).padStart(3,'0'),name:'Energy',variant:'holo',language:'all',tier:'master'});
const csvFile=rows=>({name:'collection.csv',lastModified:1,text:async()=>
  'Expansion,Card number,Card variant,Card language,Quantity\n'+rows.map(r=>r.join(',')).join('\n')});

test('30C counts the eight owned MEE holos from a separate TCGCollector expansion',async()=>{
  const api=adapter();
  const catalog=[2,4,5,7,9,10,11,12,13,14,15,16].map(energy);
  await api.storeVerifiedCatalog('30th Celebration',catalog);
  await api.importCollectionFile(csvFile([
    ...[2,4,5,7].map(n=>['Mega Evolution Energies',String(n).padStart(3,'0'),'Normal','Spanish',5]),
    ...[9,10,11,12,13,14,15,16].map(n=>['Mega Evolution Energies',String(n).padStart(3,'0'),'Normal Holo','Spanish',3])
  ]));
  const result=await api.progress('30th Celebration','es','master');
  assert.equal(result.total,12);assert.equal(result.owned,8);
  assert.deepEqual(Array.from(result.missing,x=>x.number),['MEE 002','MEE 004','MEE 005','MEE 007']);
});

test('matching preserves language, foil, expansion and main-set identity',async()=>{
  const api=adapter();
  const catalog=[...Array.from({length:7},(_,i)=>energy(i+1)),{...energy(1),number:'001/128',name:'Exeggcute'}];
  await api.storeVerifiedCatalog('30th Celebration',catalog);
  await api.importCollectionFile(csvFile([
    ['Mega Evolution Energies','001','Normal Holo','Spanish',1],
    ['Mega Evolution Energies','002','Normal Holo','English',1],
    ['Mega Evolution Energies','003','Normal','Spanish',1],
    ['Unrelated Expansion','MEE 004','Normal Holo','Spanish',1],
    ['Mega Evolution Energies','005','Normal Holo','Spanish',0],
    ['Mega Evolution Energies','MEE 006','Normal Holo','Spanish',1],
    ['30th Celebration','MEE 007','Normal Holo','Spanish',1]
  ]));
  const result=await api.progress('30th Celebration','es','master');
  assert.equal(result.owned,3);
  assert.deepEqual(Array.from(result.missing,x=>x.number),['MEE 002','MEE 003','MEE 004','MEE 005','001/128']);
  assert.equal((await api.progress('30th Celebration','en','master')).owned,1);
});

test('other expansions retain their exact normal, reverse and holo matching',async()=>{
  const api=adapter(),set='Mega Evolution';
  await api.storeVerifiedCatalog(set,['normal','reverse','holo'].map(variant=>({...energy(1),set,number:'001/132',variant})));
  await api.importCollectionFile(csvFile([
    [set,'001/132','Reverse Holo','Spanish',1],
    ['Mega Evolution Energies','001','Normal Holo','Spanish',1],
    ['30th Celebration','001/128','Normal','Spanish',1]
  ]));
  const result=await api.progress(set,'es','master');
  assert.equal(result.owned,1);assert.deepEqual(Array.from(result.missing,x=>x.variant),['normal','holo']);
});
