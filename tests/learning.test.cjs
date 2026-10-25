const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').join(__dirname,'../');
class Element {
 constructor(id=''){this.id=id;this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.children=[];this.textContent='';this.options=[];this.dataset={};this.listeners={};this.style={};this.classList={toggle(){},add(){},remove(){}};}
 replaceChildren(...items){this.children=items;if(this.id==='studyFolder'||this.id==='gameFolder')this.options=items;}
 append(...items){this.children.push(...items);}
 add(item){this.options.push(item);}
 setAttribute(){} addEventListener(name,fn){this.listeners[name]=fn;}
 querySelectorAll(){return this.children.filter(x=>x.type==='button');}
}
function harness(){
 const ids=[...fs.readFileSync(root+'index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);const els=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
 for(const [id,v] of Object.entries({studyScope:'all',studyMode:'learn',studyCount:'10',studyMinutes:'0',studyCustomMinutes:'5',studyLanguage:'Japanese',studyDirection:'toTarget'}))els[id].value=v;
 els.studyDirection.options=[{},{}];
 let time=Date.parse('2026-10-25T12:00:00Z'),records=[],fail=false,readFail=false,writes=[],challenges=[],ticker;
 class Clock extends Date {constructor(...a){super(...(a.length?a:[time]));}static now(){return time;}}
 const client={from(table){return {select(){return this},eq(){return this},order(){return this},range:async()=>readFail?{error:{message:'offline'}}:{data:records.map(p=>({...p}))},upsert(payload){writes.push(payload);return {select:async()=>{if(fail)return {error:{message:'offline'}};for(const p of payload){const i=records.findIndex(r=>r.word_id===p.word_id);if(i>=0)records[i]=p;else records.push(p);}return {data:payload};}}}}}};
 const c={console,Date:Clock,Map,Set,Math,Boolean,Number,String,Object,Array,Promise,document:{hidden:false,getElementById(id){assert(els[id],'Unknown DOM '+id);return els[id]},createElement(){return new Element()},addEventListener(){}},ready:true,saving:false,account:{userId:'owner',client},activeLanguage:'Japanese',library:{words:[],folders:[]},quiz:[],languageInfo:{Japanese:{name:'Japoński',target:'japoński',code:'ja'}},Option:function(t,v){this.textContent=t;this.value=v},renderWords(){},setInterval(fn){ticker=fn;return 1},clearInterval(){ticker=null},confirm(){return true}};
 c.window=c;c.activeWords=()=>c.library.words.filter(w=>w.lang===c.activeLanguage);c.activeFolders=()=>c.library.folders;c.recordStudyChallenge=d=>challenges.push(d);c.loadProgressDashboard=()=>{};vm.createContext(c);
 for(const f of ['srs.js','learning.js','study-scope.js','study.js','games.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),c,{filename:f});
 const word=(id,folder='a',lang='Japanese')=>({id,word:id,translation:'PL '+id,lang,folder_id:folder,created_at:new Clock().toISOString()});
 return {c,els,word,get records(){return records},set records(v){records=v},writes,challenges,set fail(v){fail=v},set readFail(v){readFail=v},advance(ms){time+=ms;ticker?.()},async start(mode){els.studyMode.value=mode;await els.startStudy.onclick()},async rate(ok){els.revealStudy.onclick();await (ok?els.knowStudyCard:els.retryStudyCard).onclick()}};
}
(async()=>{
 let h=harness(),S=h.c.TooweeSRS,now=new h.c.Date(),p=S.next(null,true,now);assert.equal(p.stage,1);assert.equal(new Date(p.due_at)-now,86400000);
 let early=S.next(p,true,new h.c.Date(now.getTime()+1000));assert.equal(early.stage,1);assert.equal(early.due_at,p.due_at);
 for(const [stage,days] of [[2,3],[3,7],[4,14],[5,30],[6,60],[6,60]]){now=new h.c.Date(p.due_at);p=S.next(p,true,now);assert.equal(p.stage,stage);assert.equal(new Date(p.due_at)-now,days*86400000);}
 assert.equal(S.category(p,new h.c.Date(p.due_at)),'review');assert.equal(S.category(p,now),'learned');const lost=S.next(p,false,now);assert.equal(lost.stage,0);assert.equal(S.category(lost),'learn');assert.equal(S.next(lost,true,now).stage,1);
 h=harness();h.c.library.folders=[{id:'a',name:'Mixed <script>'},{id:'b',name:'Other'}];h.c.library.words=['new','due','waiting','learned','failed'].map(id=>h.word(id));h.c.library.words.push(h.word('spanish','b','Spanish'),h.word('loose',null));
 h.records=[{word_id:'due',stage:4,due_at:'2026-10-24T12:00:00Z'},{word_id:'waiting',stage:2,due_at:'2026-10-28T12:00:00Z'},{word_id:'learned',stage:4,due_at:'2026-11-01T12:00:00Z'},{word_id:'failed',stage:0,due_at:'2026-10-24T12:00:00Z'}];
 await h.c.refreshLearningSets();assert.equal(h.els['learningView-learn'].textContent,'Do nauki (3)');assert.equal(h.els['learningView-review'].textContent,'Do powtórki (1)');assert.equal(h.els['learningView-learned'].textContent,'Nauczone (1)');
 h.els['learningView-review'].onclick();const card=h.els.learningSetCards.children[0];assert.equal(card.children[0].textContent,'Mixed <script>');card.children.at(-1).onclick();assert.deepEqual(Array.from(h.c.filterLearningWords(h.c.activeWords()),w=>w.id),['due']);assert.equal(h.els.studyMode.value,'review');assert.equal(h.els.studyMode.disabled,true);
 await h.start('review');assert.equal(h.els.studyPhaseLabel.textContent,'Powtórka');await h.rate(false);assert.equal(h.writes.length,1);assert.equal(h.writes[0][0].stage,0);assert.equal(h.challenges.length,1);assert.equal(h.els.unknownPileWords.children.length,1);assert(h.els.studySummaryText.textContent.includes('Powtórka:'));
 h.els['learningView-learn'].onclick();h.els.learningSetCards.children[0].children.at(-1).onclick();assert.deepEqual(Array.from(h.c.filterLearningWords(h.c.activeWords()),w=>w.id).sort(),['due','failed','new']);
 h.c.resetLearningSets();assert.equal(h.c.getLearningContext(),null);h.c.activeLanguage='Spanish';await h.c.refreshLearningSets();assert.equal(h.els['learningView-learn'].textContent,'Do nauki (1)');
 // Learning retains second verification, unknown recycling, atomic save and retry.
 h=harness();h.c.library.words=[h.word('one')];await h.start('learn');await h.rate(false);assert.equal(h.writes.length,0);await h.rate(true);assert.equal(h.els.studyPhaseLabel.textContent,'Końcowa weryfikacja');assert.equal(h.writes.length,0);h.fail=true;await h.rate(true);assert.equal(h.els.retryStudySave.hidden,false);h.fail=false;await h.els.retryStudySave.onclick();await new Promise(r=>setImmediate(r));assert.equal(h.records[0].stage,1);assert.equal(h.els.knownPileWords.children.length,1);
 // A due review advances once with one answer; a future word is excluded.
 h=harness();h.c.library.words=[h.word('due'),h.word('future'),h.word('new')];h.records=[{word_id:'due',stage:3,due_at:'2026-10-24T12:00:00Z'},{word_id:'future',stage:2,due_at:'2026-11-01T12:00:00Z'}];await h.start('review');await h.rate(true);assert.equal(h.writes[0].length,1);assert.equal(h.writes[0][0].stage,4);assert.equal(h.writes[0][0].word_id,'due');
 // Additional early practice cannot raise the stage or push the due date.
 h=harness();h.c.library.words=[h.word('future')];h.records=[{word_id:'future',stage:2,reviews:2,due_at:'2026-11-01T12:00:00Z'}];await h.start('practice');await h.rate(true);await h.rate(true);assert.equal(h.records[0].stage,2);assert.equal(h.records[0].due_at,'2026-11-01T12:00:00Z');
 // Timer auto adds portions; timeout saves only answered review words.
 h=harness();h.els.studyMinutes.value='5';h.c.library.words=Array.from({length:12},(_,i)=>h.word('w'+i));h.records=h.c.library.words.map(w=>({word_id:w.id,stage:1,due_at:'2026-10-24T12:00:00Z'}));await h.start('review');for(let i=0;i<10;i++)await h.rate(true);assert.equal(h.writes.length,0);assert(h.els.studyProgress.textContent.includes('z 12'));h.advance(300000);await new Promise(r=>setImmediate(r));assert.equal(h.writes[0].length,10);assert.equal(h.records.find(p=>p.word_id==='w10').stage,1);assert.equal(h.challenges.length,1);
 // Timed learning also adds another portion, then verifies all marked known.
 h=harness();h.els.studyMinutes.value='5';h.c.library.words=Array.from({length:12},(_,i)=>h.word('w'+i));await h.start('learn');for(let i=0;i<10;i++)await h.rate(true);assert(h.els.studyProgress.textContent.includes('z 12'));h.advance(300000);assert.equal(h.els.studyPhaseLabel.textContent,'Końcowa weryfikacja');for(let i=0;i<10;i++)await h.rate(true);assert.equal(h.writes[0].length,10);assert.equal(h.els.knownPileWords.children.length,10);
 // Read failures do not fabricate zero counts or permit sessions.
 h=harness();h.readFail=true;await h.c.refreshLearningSets();assert(h.els.learningStatus.textContent.includes('offline'));assert.equal(h.els.learningSetCards.children.length,0);await h.start('review');assert.equal(h.writes.length,0);
 console.log('PASS: schedule, early practice, categories, mixed/loose sets, language isolation, single-pass reviews, failures/relearning, learning verification/retry, timers/batches, untouched words, bottom piles, challenges, read errors');
})().catch(e=>{console.error(e);process.exit(1)});
