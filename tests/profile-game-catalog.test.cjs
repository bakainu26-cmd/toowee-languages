const {JSDOM}=require(process.env.TOOWEE_JSDOM_MODULE||'jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8'),pause=()=>new Promise(r=>setTimeout(r,20));
(async()=>{const dom=new JSDOM(read('index.html'),{runScripts:'outside-only',url:'https://example.test'}),w=dom.window,d=w.document;
const panel=d.createElement('div');panel.id='teacherPanel-games';panel.innerHTML='<h3>Gry</h3>';d.getElementById('teacherControls').append(panel);
const words=['猫','犬','花','本'].map((word,i)=>({id:'jp'+i,word,translation:['kot','pies','kwiat','książka'][i],lang:'Japanese',folder_id:'jp-set'}));
const en={id:'en',word:'dog',translation:'pies',lang:'English',folder_id:'en-set'};
const ctx=()=>({profile_id:'p1',lang:'Japanese',folders:[],sets:[{id:'en-set',lang:'English',name:'EN'},{id:'jp-set',lang:'Japanese',name:'JP'}],words:[en,...words]});
let special,focused,materialCalls=[],modeCalls=[],errors=[];w.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
Object.assign(w,{ready:true,saving:false,account:{userId:'teacher'},activeLanguage:'English',tooweeView:'teacher',languageInfo:{Japanese:{code:'ja'},English:{code:'en'}},activeWords:()=>[en],activeFolders:()=>[],tab(){},chooseLanguage:l=>{w.activeLanguage=l;},tooweeStudentProfiles:[{id:'p1',first_name:'Magda',last_name:'Test',languages:['English','Japanese']}],captureTeacherStudentNavigation:()=>({profile:'p1',lang:'Japanese'}),getStudentGameMaterials:async(id,l)=>{materialCalls.push([id,l]);return ctx();},TooweeGameDelivery:{pick:async(kind)=>{modeCalls.push(kind);return ['sophie','collections'].includes(kind)?'online':'classroom';}},openSophieForStudentProfile:async c=>{special=c;},openCollectionsForStudent:async c=>{special=c;},openActivityFocus:(id,name,playing,kind)=>{if(playing)focused=kind;}});
for(const [key,kind] of [['TooweeMagicDice','dice'],['TooweeEscape','escape'],['TooweeFalling','falling']])w[key]={reset(){},updateControls(){},start(rows){assert.deepEqual(Array.from(rows,r=>r.id).sort(),words.map(r=>r.id).sort());focused=kind;}};
w.TooweeSwordsBombsHearts={open:async c=>{special=c;}};
w.eval(read('games.js'));w.eval(read('teacher-game-setup.js'));w.eval(read('teacher-game-catalog.js'));
w.showTeacherSection=()=>w.openTeacherGameCatalog('English');
w.openTeacherGameCatalog(null);
const profileGrid=d.querySelector('#profileGamesPanel>.teacher-game-directory');assert(profileGrid);const expected=['dice','collections','sophie','match','memory','quiz','write','escape','falling','sbh'];
assert.deepEqual([...profileGrid.children].map(b=>b.dataset.teacherGameKind),expected);
assert.deepEqual([...d.querySelectorAll('#teacherGameCatalog>.teacher-game-directory>button')].map(b=>b.textContent),[...profileGrid.children].map(b=>b.textContent));
assert.equal(d.querySelectorAll('#profileGamesPanel>.sophie-launch').length,0);
for(const kind of expected){special=null;focused=null;profileGrid.querySelector('[data-teacher-game-kind="'+kind+'"]').click();await pause();const state=w.captureTeacherGameNavigation();assert.equal(state.context.profile_id,'p1',kind);assert.equal(state.context.lang,'Japanese',kind);assert.equal(state.language,'Japanese',kind);assert(!d.querySelector('.teacher-source-picker'),kind+' must skip pupil reselection');
 if(['sophie','collections'].includes(kind)){assert.equal(special.profile_id,'p1');assert.equal(special.lang,'Japanese');continue;}
 if(kind==='sbh'){const start=[...d.querySelectorAll('#teacherGameCatalog button')].find(b=>b.textContent==='Rozpocznij grę →');assert(start);start.click();await pause();assert(special.configured);assert.equal(special.language,'Japanese');assert.equal(special.questions.length,4);continue;}
 assert.equal(d.querySelector('[aria-label="Język gry"]').value,'Japanese');assert.equal(w.tooweeTeacherGameContext.profile_id,'p1');assert.equal(w.tooweeTeacherGameContext.words.length,4);
 d.getElementById('startGame').click();assert.equal(focused,kind,kind+' starts');
}
assert.deepEqual(errors,[]);assert.deepEqual(modeCalls,expected);assert(materialCalls.every(([id,l])=>id==='p1'&&l==='Japanese'));
w.close();console.log('PASS all ten profile games share catalog and launch with selected pupil and Japanese, without reselection');})().catch(e=>{console.error(e);process.exit(1)});
