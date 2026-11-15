const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.join(__dirname,'../');
class Element {
 constructor(){this.style={};this.children=[];this._text='';this.value='';this.hidden=false;this.disabled=false;this.checked=false;this.dataset={};this.handlers={};this.attrs={};this.classes=new Set();this.classList={toggle:(k,on)=>on?this.classes.add(k):this.classes.delete(k)};}
 set textContent(v){this._text=v;this.children=[]}get textContent(){return this._text}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}add(item){this.children.push(item)}
 get options(){return this.children}
 querySelectorAll(){return this.children}focus(){}
 setAttribute(k,v){this.attrs[k]=v}addEventListener(k,fn){this.handlers[k]=fn}
 click(){this.handlers.click?.()}
}
function setup(){
 const ids=[...fs.readFileSync(root+'index.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
 els.gameCount.value='6';els.gameDirection.value='toPolish';els.gameReading.checked=true;
 let timers=new Map(),sequence=0,context=null;
 const words=Array.from({length:4},(_,i)=>({id:'w'+i,lang:'Japanese',folder_id:'a',word:'語'+i,reading:'ご'+i,translation:'PL '+i}));
 const c={handlers:{},addEventListener(type,fn){this.handlers[type]=fn},console,Date,Math:Object.assign(Object.create(Math),{random:()=>0}),String,Number,Boolean,Object,Array,Set,document:{getElementById(id){assert(els[id],id);return els[id]},createElement(){return new Element()}},ready:true,saving:false,account:{userId:'owner',client:{from(){throw Error('Games must not write to database')}}},activeLanguage:'Japanese',languageInfo:{Japanese:{code:'ja'}},Option:function(t,v){this.value=v},activeWords:()=>words.filter(w=>w.lang===c.activeLanguage),activeFolders:()=>[{id:'a',name:'A'},{id:'b',name:'B'}],filterLearningWords:rows=>context?rows.filter(w=>context.includes(w.id)):rows,getLearningContext:()=>context,clearLearningContext:()=>{context=null},tab(id){c.tabbed=id},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(root+'games.js','utf8'),c);
 return {c,els,words,set context(v){context=v},get timers(){return timers},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn())},choose(kind){els['gameType-'+kind].onclick()},start(){els.startGame.onclick()}};
}

const h=setup();h.choose('write');h.start();let count=0;while(h.els.gameResult.hidden){const prompt=h.els.gameQuizPrompt.textContent;const word=h.words.find(w=>w.word===prompt);h.els.gameWriteAnswer.value=word.translation;h.els.gameWriteForm.onsubmit({preventDefault(){}});count++;if(!h.els.gameResult.hidden)break;for(const extra of [{isComposing:true},{repeat:true},{keyCode:229}]){h.c.handlers.keydown({key:'Enter',...extra});assert.equal(h.els.gameQuizPrompt.textContent,prompt);}let prevented=false;h.c.handlers.keydown({key:'Enter',preventDefault(){prevented=true}});assert(prevented);assert.notEqual(h.els.gameQuizPrompt.textContent,prompt);}assert.equal(count,4);assert(h.els.gameResultText.textContent.includes('4 / 4'));console.log('PASS Enter advances answered written questions, respects Japanese composition and key repeat, and finishes once');
