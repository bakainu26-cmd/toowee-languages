const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
function run(firstSword,lives,mark){
 const dom=new JSDOM(fs.readFileSync(__dirname+'/../swords-bombs-hearts.html','utf8'),{url:'https://example.test/?data=qa',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.Math.random=()=>.999;let effect;w.setTimeout=fn=>(effect=fn,1);w.clearTimeout=()=>{};
 w.localStorage.setItem('qa',JSON.stringify({players:['Nauczyciel','Uczeń'],lives,count:9}));w.eval(fs.readFileSync(__dirname+'/../swords-bombs-hearts-play.js','utf8'));
 const life=()=>Array.from(d.querySelectorAll('#players .sbh-heart-icons'),x=>Number(x.dataset.count));
 const reveal=i=>{d.querySelectorAll('#board button')[i].click();const q=d.querySelector('dialog[open]');q.querySelector('.sbh-show-answer').click();q.querySelectorAll('.sbh-answer-actions button')[mark].click();const done=effect;done();return done};
 if(!firstSword){reveal(0);assert.deepEqual(life(),[lives+1,lives]);}
 const before=life(),done=reveal(2),expected=firstSword?[before[0],Math.max(0,before[1]-1)]:[Math.max(0,before[0]-1),before[1]];
 assert.deepEqual(life(),expected,'sword automatically removes the opponent heart');assert(!d.querySelector('.sbh-target-dialog'),'two players need no target confirmation');done();assert.deepEqual(life(),expected,'repeated callback cannot subtract twice');
 if(firstSword&&lives===1){assert(d.getElementById('question').textContent.includes('Nauczyciel'),'last heart ends game');assert(!d.querySelector('#board button:not(:disabled)'));}else{assert(d.querySelector('#board button:not(:disabled)'),'next turn stays playable');reveal(1);assert(life().every(x=>x>=0),'bomb cannot create negative lives');}
 w.close();return expected;
}
for(const first of [true,false])assert.deepEqual(run(first,7,0),run(first,7,1),'effect independent of assessment');run(true,1,0);
console.log('PASS teacher/student swords, automatic two-player targeting, assessment independence, single effect, final heart, next turn and bomb bounds');
