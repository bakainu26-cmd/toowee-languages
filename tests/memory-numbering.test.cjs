const {JSDOM}=require(process.env.TOOWEE_JSDOM_MODULE||'jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const dom=new JSDOM(read('index.html'),{runScripts:'outside-only',url:'https://example.test'}),w=dom.window,d=w.document;
const words=['猫','犬','花','本'].map((word,i)=>({id:String(i),word,translation:['kot','pies','kwiat','książka'][i],lang:'Japanese'}));
Object.assign(w,{ready:true,saving:false,account:{userId:'teacher'},activeLanguage:'Japanese',tooweeView:'teacher',languageInfo:{Japanese:{code:'ja'}},activeWords:()=>words,activeFolders:()=>[],tooweeTeacherGameContext:{words},tab(){},TooweeMagicDice:{updateControls(){},reset(){}}});
w.eval(read('games.js'));d.getElementById('gameType-memory').click();d.getElementById('startGame').click();
const cards=[...d.querySelectorAll('.memory-card')];assert.equal(cards.length,8);assert.deepEqual(cards.map(b=>b.textContent),['1','2','3','4','5','6','7','8']);cards[0].click();assert.notEqual(d.querySelector('.memory-card').textContent,'1');assert.equal(d.querySelectorAll('.memory-card')[1].textContent,'2');w.close();console.log('PASS Memory numbered backs and normal reveal');
