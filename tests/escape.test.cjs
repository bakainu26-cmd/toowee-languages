const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../');
class Element {
 constructor(){this.children=[];this._text='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.dataset={};this.handlers={};this.attrs={};this.classes=new Set();this.classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k),toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
 set textContent(v){this._text=v;this.children=[]}get textContent(){return this._text}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}add(item){this.children.push(item)}
 setAttribute(k,v){this.attrs[k]=v}addEventListener(k,fn){this.handlers[k]=fn}
 click(){this.handlers.click?.()}
}
function setup(){
 const ids=[...fs.readFileSync(root+'index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
 els.gameCount.value='6';els.gameDirection.value='toPolish';els.gameReading.checked=true;
 let timers=new Map(),sequence=0,context=null;
 const words=Array.from({length:4},(_,i)=>({id:'w'+i,lang:'Japanese',folder_id:'a',word:'語'+i,reading:'ご'+i,translation:'PL '+i}));
 const c={console,Date,Math:Object.assign(Object.create(Math),{random:()=>0}),String,Number,Boolean,Object,Array,Set,document:{getElementById(id){assert(els[id],id);return els[id]},createElement(){return new Element()}},ready:true,saving:false,account:{userId:'owner',client:{from(){throw Error('Games must not write to database')}}},activeLanguage:'Japanese',languageInfo:{Japanese:{code:'ja'}},Option:function(t,v){this.value=v},activeWords:()=>words.filter(w=>w.lang===c.activeLanguage),activeFolders:()=>[{id:'a',name:'A'},{id:'b',name:'B'}],filterLearningWords:rows=>context?rows.filter(w=>context.includes(w.id)):rows,getLearningContext:()=>context,clearLearningContext:()=>{context=null},tab(id){c.tabbed=id},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'escape.js','utf8'),c);vm.runInContext(fs.readFileSync(root+'games.js','utf8'),c);
 return {c,els,words,set context(v){context=v},get timers(){return timers},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())},choose(kind){els['gameType-'+kind].onclick()},start(){els.startGame.onclick()}};
}
const submit=(h,id)=>h.els[id].onsubmit({preventDefault(){}});
function solve(h,object){h.els[object].onclick();let guard=0;while(!h.els.escapePuzzle.hidden){assert(++guard<30);const prompt=h.els.escapePrompt.textContent;if(object==='escapeDesk'){const word=h.words.find(w=>w.translation===prompt);h.els.escapeAnswer.value=guard%2?word.reading:word.word;submit(h,'escapeWriteForm');}else{const word=h.words.find(w=>object==='escapePainting'?prompt.startsWith(w.word+' ('):w.translation===prompt);assert(word,prompt);const choices=h.els.escapeOptions.children;const correct=choices.find(b=>b.dataset.id===word.id);assert(correct);if(object==='escapeShelf')assert.equal(correct.textContent,word.word+' ('+word.reading+')');correct.click();}assert(h.els.escapeFeedback.textContent.includes('✓')||h.els.escapeFeedback.textContent.includes('🔑'));h.els.escapeNext.onclick();}}
let h=setup();for(let i=4;i<6;i++)h.words.push({id:'w'+i,word:'語'+i,reading:'ご'+i,translation:'PL '+i,lang:'Japanese',folder_id:'a'});h.choose('escape');h.start();assert.equal(h.els.escapeRoom.hidden,false);assert.equal(h.els.gameQuiz.hidden,true);assert(h.els.escapeProgress.textContent.includes('0 / 6'));
// The door cannot be bypassed by guessing the final code before earning seals.
h.els.escapeDoor.onclick();h.els.escapeCode.value='000';submit(h,'escapeDoorForm');assert(h.els.escapeDoorFeedback.textContent.includes('Najpierw'));assert.equal(h.els.gameResult.hidden,true);
// Wrong answers don't advance; hint doesn't solve automatically or count repeatedly.
h.els.escapeShelf.onclick();let word=h.words.find(w=>w.translation===h.els.escapePrompt.textContent);let wrong=h.els.escapeOptions.children.find(b=>b.dataset.id!==word.id);wrong.click();assert(h.els.escapeFeedback.textContent.includes('nie ustąpił'));assert.equal(wrong.disabled,true);h.els.escapeHint.onclick();h.els.escapeHint.onclick();assert(h.els.escapeFeedback.textContent.includes(word.reading));assert(h.els.escapeProgress.textContent.includes('0 / 6'));
// Closing immediately after a correct response must preserve its progress exactly once.
h.els.escapeOptions.children.find(b=>b.dataset.id===word.id).click();h.els.escapeClosePuzzle.onclick();h.els.escapeShelf.onclick();assert(h.els.escapePuzzleCount.textContent.includes('2 / 2'));h.els.escapeClosePuzzle.onclick();
// Solve chests in arbitrary order with kana/kanji writing and displayed kana in choices.
solve(h,'escapeDesk');solve(h,'escapePainting');solve(h,'escapeShelf');assert(h.els.escapeProgress.textContent.includes('6 / 6'));assert(h.els.escapeProgress.textContent.includes('3 / 3'));assert.equal(h.els.escapeInventory.children.filter(x=>x.className.includes('found')).length,3);
h.els.escapeShelf.onclick();assert(h.els.escapeMessage.textContent.includes('otwarty'));assert(h.els.escapeProgress.textContent.includes('6 / 6'));
h.els.escapeDoor.onclick();h.els.escapeCode.value='111';submit(h,'escapeDoorForm');assert(h.els.escapeDoorFeedback.textContent.includes('nie ten kod'));assert.equal(h.els.gameResult.hidden,true);h.els.escapeCode.value='000';submit(h,'escapeDoorForm');assert.equal(h.els.escapeVictory.hidden,false);assert.equal(h.els.gameResult.hidden,false);assert(h.els.gameResultText.textContent.includes('Ucieczka udana'));assert(h.els.gameResultText.textContent.includes('Podpowiedzi: 1'));assert(h.els.gameResultText.textContent.includes('Błędne próby: 1'));
// Restart resets all puzzle, victory and code state.
h.els.replayGame.onclick();assert.equal(h.els.escapeVictory.hidden,true);assert(h.els.escapeProgress.textContent.includes('0 / 3'));assert.equal(h.els.escapeCode.value,'');h.choose('memory');assert.equal(h.els.escapeRoom.hidden,true);
// Owner/language changes block stale puzzle handlers; reset clears imported labels.
h.choose('escape');h.start();h.els.escapeDesk.onclick();h.c.account.userId='other';h.els.escapeAnswer.value='bad';submit(h,'escapeWriteForm');assert.equal(h.els.escapeFeedback.textContent,'');h.c.resetGame();assert.equal(h.els.escapeRoom.hidden,true);
h=setup();h.context=['w0','w1'];h.choose('escape');h.start();assert(h.els.gameStatus.textContent.includes('co najmniej 3'));assert.equal(h.els.escapeRoom.hidden,true);
h=setup();h.choose('escape');h.start();h.els.escapeDesk.onclick();submit(h,'escapeWriteForm');assert(h.els.escapeFeedback.textContent.includes('Najpierw'));h.els.escapeAnswer.value='błąd';submit(h,'escapeWriteForm');assert(h.els.escapeFeedback.textContent.includes('nie ustąpił'));
console.log('PASS: exploration, arbitrary lock order, kana/kanji, readable choices, wrong-answer retry, hints, close/resume progress, final code gating, victory, restart, owner isolation and minimum vocabulary; no database writes');
