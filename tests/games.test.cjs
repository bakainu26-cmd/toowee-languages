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
 els.gameCount.value='6';els.gameDirection.value='toPolish';els.gameReading.checked=true;
 let timers=new Map(),sequence=0,context=null;
 const words=Array.from({length:4},(_,i)=>({id:'w'+i,lang:'Japanese',folder_id:'a',word:'語'+i,reading:'ご'+i,translation:'PL '+i}));
 const c={console,Date,Math:Object.assign(Object.create(Math),{random:()=>0}),String,Number,Boolean,Object,Array,Set,document:{getElementById(id){assert(els[id],id);return els[id]},createElement(){return new Element()}},ready:true,saving:false,account:{userId:'owner',client:{from(){throw Error('Games must not write to database')}}},activeLanguage:'Japanese',languageInfo:{Japanese:{code:'ja'}},Option:function(t,v){this.value=v},activeWords:()=>words.filter(w=>w.lang===c.activeLanguage),activeFolders:()=>[{id:'a',name:'A'},{id:'b',name:'B'}],filterLearningWords:rows=>context?rows.filter(w=>context.includes(w.id)):rows,getLearningContext:()=>context,clearLearningContext:()=>{context=null},tab(id){c.tabbed=id},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'games.js','utf8'),c);
 return {c,els,words,set context(v){context=v},get timers(){return timers},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())},choose(kind){els['gameType-'+kind].onclick()},start(){els.startGame.onclick()}};
}
let h=setup();h.start();assert.equal(h.els.gameWords.children.length,4);assert.equal(h.els.gameMatch.hidden,false);
for(const b of h.els.gameWords.children){b.click();h.els.gameTranslations.children.find(x=>x.dataset.id===b.dataset.id).click()}
assert.equal(h.els.gameResult.hidden,false);assert(h.els.gameResultText.textContent.includes('4 par w 4 próbach'));h.els.replayGame.onclick();assert.equal(h.els.gameResult.hidden,true);
// Memory: wrong pairs lock the board, matched cards stay visible, all pairs can finish.
h=setup();h.choose('memory');h.start();assert.equal(h.els.gameMemoryBoard.children.length,8);assert(h.els.gameMemoryBoard.children.every(x=>x.textContent==='?'));
for(let i=0;i<8 && h.els.gameResult.hidden;i++)for(let j=i+1;j<8 && h.els.gameResult.hidden;j++){
 let board=h.els.gameMemoryBoard.children;if(board[i].classes.has('matched')||board[j].classes.has('matched'))continue;
 board[i].click();h.els.gameMemoryBoard.children[j].click();
 if(h.timers.size){assert(h.els.gameMemoryBoard.children.every(b=>b.disabled));h.tick();}
}
assert.equal(h.els.gameResult.hidden,false);assert(h.els.gameMemoryBoard.children.every(x=>x.classes.has('matched')));
// Switching games cancels pending memory flips and clears previous results.
h=setup();h.choose('memory');h.start();let found=false;for(let j=1;j<8&&!found;j++){h.els.gameMemoryBoard.children[0].click();h.els.gameMemoryBoard.children[j].click();found=h.timers.size>0;if(!found){h.c.resetGame();h.start()}}
assert(found);h.choose('quiz');assert.equal(h.timers.size,0);h.tick();assert.equal(h.els.gameMemoryBoard.children.length,0);
// Quiz: actual alternatives, one answer per question, both directions, reading toggle.
h=setup();h.choose('quiz');h.start();let first=true;
while(h.els.gameResult.hidden){const prompt=h.els.gameQuizPrompt.textContent;const target=h.words.find(w=>w.word===prompt);assert(target);let options=h.els.gameQuizOptions.children;assert.equal(options.length,4);assert.equal(new Set(options.map(b=>b.textContent)).size,4);const choice=options.find(b=>first?b.dataset.id!==target.id:b.dataset.id===target.id);choice.click();const score=h.els.gameScore.textContent;choice.click();assert.equal(h.els.gameScore.textContent,score);assert(h.els.gameQuizFeedback.textContent.includes(target.translation));first=false;if(h.els.gameResult.hidden)h.els.nextGameQuestion.onclick();}
assert(h.els.gameResultText.textContent.includes('3 / 4 (75%)'));
h.els.gameDirection.value='toTarget';h.els.gameDirection.onchange();h.start();assert(h.words.some(w=>w.translation===h.els.gameQuizPrompt.textContent));assert(h.els.gameQuizOptions.children.every(b=>b.children.length===1));h.els.gameReading.checked=false;h.els.gameReading.onchange();h.start();assert(h.els.gameQuizOptions.children.every(b=>b.children.length===0));
// Scope and data safeguards: category, folder, language, duplicate labels, empty sets.
h=setup();h.context=['w0','w1'];h.start();assert.equal(h.els.gameWords.children.length,2);assert.equal(h.els.gameFolder.disabled,true);h.c.openGamesLobby();assert.equal(h.c.tabbed,'games');h.start();assert.equal(h.els.gameWords.children.length,4);
h.words.push({...h.words[0],id:'duplicate',word:' 語0 '});h.start();assert.equal(h.els.gameWords.children.length,4);
h.els.gameFolder.value='b';h.start();assert(h.els.gameStatus.textContent.includes('co najmniej 2'));assert.equal(h.els.gameWords.children.length,0);
h.els.gameFolder.value='';h.start();h.c.account.userId='different';h.els.gameWords.children[0].click();assert.equal(h.els.gameScore.textContent,'Pary: 0 / 4');h.c.resetGame();assert.equal(h.els.gameWords.children.length,0);
h.c.activeLanguage='Spanish';h.start();assert.equal(h.els.gameWords.children.length,0);assert.equal(h.els.gameReadingField.hidden,true);
// Labels are text nodes, including potentially hostile imported vocabulary.
h=setup();h.words[0].word='<img src=x onerror=alert(1)>';h.start();assert(h.els.gameWords.children.some(b=>b.textContent==='<img src=x onerror=alert(1)>'));
// Written answers accept the stored kanji OR kana, without duplicate scoring.
h=setup();h.words[0].word='記憶';h.words[0].reading='きおく';h.choose('write');h.start();
const submit=()=>h.els.gameWriteForm.onsubmit({preventDefault(){}});
const before=h.els.gameScore.textContent;h.els.gameWriteAnswer.value=' ';submit();assert.equal(h.els.gameScore.textContent,before);assert(h.els.gameQuizFeedback.textContent.includes('Najpierw'));
let index=0;
while(h.els.gameResult.hidden){
 const word=h.words.find(w=>w.translation===h.els.gameQuizPrompt.textContent);assert(word);
 h.els.gameWriteAnswer.value=index===0 ? '  '+word.reading+'  ' : word.word;submit();const score=h.els.gameScore.textContent;submit();assert.equal(h.els.gameScore.textContent,score);assert(h.els.gameQuizFeedback.textContent.includes('Dobrze'));index++;
 if(h.els.gameResult.hidden)h.els.nextGameQuestion.onclick();
}
assert(h.els.gameResultText.textContent.includes('4 / 4 (100%)'));
// Kana-only input also works for the specific kanji term 記憶, regardless of order.
h.els.replayGame.onclick();while(h.els.gameResult.hidden){const word=h.words.find(w=>w.translation===h.els.gameQuizPrompt.textContent);h.els.gameWriteAnswer.value=word.reading;submit();assert(h.els.gameQuizFeedback.textContent.includes('Dobrze'));if(h.els.gameResult.hidden)h.els.nextGameQuestion.onclick();}
// Wrong spelling stays wrong and displays both kanji and reading as feedback.
h.els.replayGame.onclick();h.els.gameWriteAnswer.value='niepoprawna';submit();assert(h.els.gameQuizFeedback.textContent.includes('Tym razem nie'));assert(h.els.gameScore.textContent.includes('Punkty: 0'));
// Spanish spelling retains accents; Japanese reading fields are not alternative Spanish answers.
h=setup();h.words.splice(0,h.words.length,{id:'s1',lang:'Spanish',word:'teléfono',reading:'telephone',translation:'telefon'},{id:'s2',lang:'Spanish',word:'azul',reading:'blue',translation:'niebieski'});h.c.activeLanguage='Spanish';h.choose('write');h.start();const spanish=h.words.find(w=>w.translation===h.els.gameQuizPrompt.textContent);h.els.gameWriteAnswer.value=spanish.reading;h.els.gameWriteForm.onsubmit({preventDefault(){}});assert(h.els.gameQuizFeedback.textContent.includes('Tym razem nie'));
// Common end action returns from a completed game to a clean games lobby.
h=setup();h.start();for(const button of h.els.gameWords.children){button.click();h.els.gameTranslations.children.find(b=>b.dataset.id===button.dataset.id).click();}assert.equal(h.els.gameResult.hidden,false);h.els.endGame.onclick();assert.equal(h.c.tabbed,'games');assert.equal(h.els.gameResult.hidden,true);assert.equal(h.els.gameWords.children.length,0);assert.equal(h.els.gameMatch.hidden,true);
console.log('PASS: matching, memory locks/completion/reset, quiz scoring/directions/reading, category/folder/language isolation, insufficient words, duplicate labels, owner changes, text safety, written kanji/kana answers, blank/incorrect answers, double-submit protection; no database writes');
