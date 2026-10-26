const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../');
class Element{
 constructor(id=''){this.id=id;this.value='';this.children=[];this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.elements={};this.listeners={};this.classList={toggle(){}};}
 replaceChildren(...items){this.children=items}append(...items){this.children.push(...items)}addEventListener(name,fn){this.listeners[name]=fn}reset(){for(const field of Object.values(this.elements))field.value=''}focus(){}
}
function setup(){
 const ids=[...fs.readFileSync(root+'index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]),els=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
 for(const key of ['word','reading','translation','lang','folder'])els.wordForm.elements[key]=new Element();els.folderForm.elements.name=new Element();
 const folders=[{id:'jp',owner_id:'owner',name:'Manga',lang:'Japanese'},{id:'es',owner_id:'owner',name:'Hiszpański',lang:'Spanish'},{id:'en',owner_id:'owner',name:'English',lang:'English'},{id:'legacy',owner_id:'owner',name:'Stary JP'},{id:'empty',owner_id:'owner',name:'Nieprzypisany',lang:null},{id:'mixed',owner_id:'owner',name:'Dawny mieszany'}];
 const words=[{id:'w1',owner_id:'owner',folder_id:'legacy',lang:'Japanese',word:'a',reading:'',translation:'A'},{id:'w2',owner_id:'owner',folder_id:'mixed',lang:'Japanese',word:'b',reading:'',translation:'B'},{id:'w3',owner_id:'owner',folder_id:'mixed',lang:'Spanish',word:'c',reading:'',translation:'C'}];
 let inserted=[],updated=[];
 const db={from(table){let filters={},nulls=[],action=null,payload;return {select(){return this},eq(key,value){filters[key]=value;return this},is(key,value){nulls.push(key);return this},order(){return this},range:async()=>({data:(table==='vocabulary_folders'?folders:words).filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v))}),insert(value){action='insert';payload=value;return this},update(value){action='update';payload=value;return this},single:async()=>{if(action==='insert'){inserted.push({table,payload});const row={id:'new'+inserted.length,...payload};(table==='vocabulary_folders'?folders:words).push(row);return {data:{id:row.id}}}if(action==='update'){updated.push({table,payload,filters});const row=folders.find(f=>Object.entries(filters).every(([k,v])=>f[k]===v)&&nulls.every(k=>f[k]==null));if(!row)return {error:{code:'PGRST116',message:'No row'}};Object.assign(row,payload);return {data:{id:row.id}}}return {data:null}}}}};
 const c={console,document:{getElementById(id){assert(els[id],id);return els[id]},createElement(){return new Element()},querySelectorAll(){return[]}},seed:{folders,words},db,location:{hash:''},addEventListener(){},setTimeout(){},confirm(){return true}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'app.js','utf8'),c);
 const run=code=>vm.runInContext(code,c);run("account={userId:'owner',client:window.db};library=window.seed;ready=true;activeLanguage='Japanese';renderLibrary();");
 return {c,els,folders,words,inserted,updated,run,ids:()=>Array.from(run('activeFolders()'),f=>f.id)};
}
(async()=>{
 let h=setup();assert.deepEqual(h.ids(),['jp','legacy']);h.run("activeLanguage='Spanish';renderLibrary()");assert.deepEqual(h.ids(),['es']);assert(!h.els.folderRows.innerHTML.includes('Manga'));h.run("activeLanguage='English';renderLibrary()");assert.deepEqual(h.ids(),['en']);
 // An empty folder keeps its explicit language, independently of word count.
 h.run("activeLanguage='Japanese';renderLibrary()");assert(h.els.folderRows.innerHTML.includes('Manga'));assert.equal(h.els.unassignedFolderRows.children.length,1);assert(h.els.unassignedFolderRows.children[0].children[1].textContent.includes('japońskiego'));
 // No language selected must not break library loading or show assignment controls.
 h.run('activeLanguage=null;renderLibrary()');assert.equal(h.els.unassignedFolders.hidden,true);assert.equal(h.els.unassignedFolderRows.children.length,0);
 // Creation records the active language and owner; switching languages cannot leak it.
 h.run("activeLanguage='Japanese';renderLibrary()");h.els.folderForm.elements.name.value='Nowa manga';await h.els.folderForm.onsubmit({preventDefault(){},target:h.els.folderForm});assert.equal(h.inserted.length,1);assert.equal(h.inserted[0].payload.lang,'Japanese');assert.equal(h.inserted[0].payload.owner_id,'owner');assert(h.ids().includes('new1'));h.run("activeLanguage='Spanish';renderLibrary()");assert(!h.ids().includes('new1'));
 // Old empty folder can be explicitly assigned once, scoped to its owner.
 h.run("activeLanguage='Japanese';renderLibrary()");const button=h.els.unassignedFolderRows.children[0].children[1];await h.els.unassignedFolderRows.listeners.click({target:{closest(){return button}}});assert.equal(h.updated.length,1);assert.equal(h.updated[0].filters.owner_id,'owner');assert.equal(h.updated[0].payload.lang,'Japanese');assert(h.ids().includes('empty'));h.run("activeLanguage='Spanish';renderLibrary()");assert(!h.ids().includes('empty'));
 // A stale/forged foreign-language folder selection is rejected before writing a word.
 h.els.wordForm.elements.word.value='hola';h.els.wordForm.elements.translation.value='cześć';h.els.wordForm.elements.folder.value='jp';await h.els.wordForm.onsubmit({preventDefault(){},target:h.els.wordForm});assert.equal(h.inserted.length,1);assert(h.els.libraryStatus.textContent.includes('aktualnego języka'));
 assert(h.run("dbError({code:'PGRST204',message:'Could not find lang column in vocabulary_folders'})").includes('folder_languages.sql'));
 console.log('PASS: folder language isolation including empty folders, legacy compatibility, creation/owner payload, assignment, missing-language setup errors and foreign-folder guard');
})().catch(error=>{console.error(error);process.exit(1)});
