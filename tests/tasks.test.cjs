const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../');
class Element {
 constructor(){this.children=[];this._text='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.dataset={};this.handlers={};this.attrs={};this.classes=new Set();this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
 set textContent(v){this._text=v;this.children=[]}get textContent(){return this._text}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}add(item){this.children.push(item)}
 setAttribute(k,v){this.attrs[k]=v}addEventListener(k,fn){this.handlers[k]=fn}
 click(){this.handlers.click?.()}
}
function setup(){
 const ids=[...fs.readFileSync(root+'index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
 els.taskCount.value='10';els.taskType.value='write';els.taskDirection.value='toTarget';els.gameCount.value='6';els.gameDirection.value='toPolish';els.gameReading.checked=true;
 let timers=new Map(),sequence=0,context=null;
 const words=Array.from({length:4},(_,i)=>({id:'w'+i,lang:'Japanese',folder_id:'a',word:'語'+i,reading:'ご'+i,translation:'PL '+i}));
 const c={console,Date,Math:Object.assign(Object.create(Math),{random:()=>0}),String,Number,Boolean,Object,Array,Set,document:{getElementById(id){assert(els[id],id);return els[id]},createElement(){return new Element()}},ready:true,saving:false,account:{userId:'owner',client:{from(){throw Error('Games must not write to database')}}},activeLanguage:'Japanese',languageInfo:{Japanese:{code:'ja'}},Option:function(t,v){this.textContent=t;this.value=v},activeWords:()=>words.filter(w=>w.lang===c.activeLanguage),activeFolders:()=>[{id:'a',name:'A'},{id:'b',name:'B'}],filterLearningWords:rows=>context?rows.filter(w=>context.includes(w.id)):rows,getLearningContext:()=>context,clearLearningContext:()=>{context=null},tab(id){c.tabbed=id},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'tasks.js','utf8'),c);
 return {c,els,words,set context(v){context=v},generate(kind='write'){els.taskType.value=kind;els.taskType.onchange();els.generateTasks.onclick()},check(){els.taskWorksheet.onsubmit({preventDefault(){}})}};
}
const inputs=h=>h.els.taskQuestions.children.map(card=>card.children.find(child=>String(child.id).startsWith('taskAnswer-')));
let h=setup();h.generate();assert.equal(inputs(h).length,4);h.check();assert(h.els.taskStatus.textContent.includes('Uzupełnij wszystkie'));assert.equal(h.els.taskResults.children.length,0);
inputs(h).forEach((input,i)=>{const prompt=h.els.taskQuestions.children[i].children[0].textContent;const word=h.words.find(w=>prompt.endsWith(w.translation));input.value=i%2?word.word:word.reading;});h.check();assert(h.els.taskResults.children[0].textContent.includes('4 / 4 (100%)'));assert(inputs(h).every(x=>x.disabled));h.check();assert.equal(h.els.taskResults.children.length,1);
// Invalid answer gets feedback; both translation directions work.
h.generate();inputs(h).forEach((input,i)=>{const prompt=h.els.taskQuestions.children[i].children[0].textContent;input.value=i?'bad':h.words.find(w=>prompt.endsWith(w.translation)).word});h.check();assert(h.els.taskResults.children[0].textContent.includes('1 / 4'));
h.els.taskDirection.value='toPolish';h.generate();inputs(h).forEach((input,i)=>{const word=h.words.find(w=>h.els.taskQuestions.children[i].children[0].textContent.endsWith(w.word+(w.reading?' ('+w.reading+')':'')));input.value=word.translation});h.check();assert(h.els.taskResults.children[0].textContent.includes('100%'));
// Every Japanese choice retains its stored kana reading in parentheses.
h=setup();h.generate('choice');for(const input of inputs(h))for(const option of input.children.slice(1)){const word=h.words.find(w=>w.id===option.value);assert.equal(option.textContent,word.word+' ('+word.reading+')');}
// Choice and matching are scored by word identity and have distinct alternatives.
for(const kind of ['choice','match']){h=setup();h.generate(kind);inputs(h).forEach((input,i)=>{const prompt=h.els.taskQuestions.children[i].children[0].textContent;const word=h.words.find(w=>prompt.endsWith(kind==='match'?w.word+(w.reading?' ('+w.reading+')':''):w.translation));assert.equal(input.children.length,5);assert.equal(new Set(input.children.map(x=>x.value)).size,5);input.value=word.id});h.check();assert(h.els.taskResults.children[0].textContent.includes('100%'));}
// Gaps mask actual kana; full kanji or kana both count as correct.
h=setup();h.generate('gaps');assert.equal(h.els.taskDirection.disabled,true);assert.equal(h.els.taskDirection.value,'toTarget');h.els.taskQuestions.children.forEach((card,i)=>{assert(card.children[1].textContent.includes('＿'));const word=h.words.find(w=>card.children[0].textContent.endsWith(w.translation));inputs(h)[i].value=i%2?word.reading:word.word});h.check();assert(h.els.taskResults.children[0].textContent.includes('100%'));
// Counts, category/folder isolation, shortage and owner change.
h=setup();h.context=['w0','w1'];h.generate();assert.equal(inputs(h).length,2);assert.equal(h.els.taskFolder.disabled,true);h.c.openTasksLobby();assert.equal(h.c.tabbed,'tasks');h.generate();assert.equal(inputs(h).length,4);
for(let i=4;i<30;i++)h.words.push({id:'w'+i,lang:'Japanese',folder_id:'a',word:'語'+i,reading:'ご'+i,translation:'PL '+i});for(const n of [6,10,15,20,25]){h.els.taskCount.value=String(n);h.generate();assert.equal(inputs(h).length,n)}
h.els.taskFolder.value='b';h.generate();assert.equal(inputs(h).length,0);assert(h.els.taskStatus.textContent.includes('Brak słówek'));
h.els.taskFolder.value='';h.generate();inputs(h).forEach(x=>x.value='bad');h.c.account.userId='other';h.check();assert.equal(h.els.taskResults.children.length,0);
h=setup();h.context=['w0'];h.generate('choice');assert.equal(inputs(h).length,0);assert(h.els.taskStatus.textContent.includes('co najmniej 2'));
// Japanese reading alternatives must not leak to Spanish.
h=setup();h.words.splice(0,h.words.length,{id:'s',lang:'Spanish',word:'azul',reading:'blue',translation:'niebieski'});h.c.activeLanguage='Spanish';h.generate();inputs(h)[0].value='blue';h.check();assert(h.els.taskResults.children[0].textContent.includes('0 / 1'));assert.equal(h.els.taskReadingHint.hidden,true);
console.log('PASS: four worksheet types, kanji/kana, both directions, whole-sheet validation/scoring, counts, category/folder/language/owner isolation and insufficient data; no database writes');
