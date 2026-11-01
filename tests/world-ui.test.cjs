// Run with TOOWEE_JSDOM_MODULE pointing to an installed jsdom module.
const {JSDOM}=require(process.env.TOOWEE_JSDOM_MODULE || 'jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../'),html=fs.readFileSync(root+'index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;let offline=false,missing=false,calls=[];
const data={profile:{coins:50,owned:['shirt_lilac'],outfit:'shirt_lilac',accessory:'none',x:6,y:6},daily:{learned_ids:[],reviewed_ids:[],pairs_done:false,seconds:0},earned:0};
w.ready=true;w.activeLanguage='Japanese';w.languageInfo={Japanese:{name:'Japoński'},Spanish:{name:'Hiszpański'}};w.account={userId:'one',client:{rpc:async(name,args)=>{calls.push(args);if(missing)return{error:{code:'PGRST202',message:'missing'}};if(offline)return{error:{message:'offline'}};if(args.p_action==='buy'){data.profile.coins-=25;data.profile.owned.push(args.p_data.item);data.profile.outfit=args.p_data.item;}if(args.p_action==='activity'){data.earned=10;data.profile.coins+=10;}else data.earned=0;return{data:JSON.parse(JSON.stringify(data))};}}};
w.tab=id=>{for(const s of d.querySelectorAll('main section'))s.hidden=s.id!==id};
w.eval(fs.readFileSync(root+'world.js','utf8'));const tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
 w.tab('world');missing=true;await w.loadWorld(true);assert.equal(d.getElementById('worldSetupNotice').hidden,false);assert.equal(d.getElementById('worldCoins').textContent,'—');
 missing=false;await w.loadWorld(true);assert.equal(d.getElementById('worldCoins').textContent,'50');assert.equal(d.getElementById('worldSetupNotice').hidden,true);
 const avatar=d.getElementById('worldAvatar'),before=avatar.style.left;d.getElementById('worldRight').click();assert.notEqual(avatar.style.left,before);const after=avatar.style.left;d.getElementById('search').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(avatar.style.left,after);
 d.getElementById('worldShopPlace').click();assert.equal(d.getElementById('worldShop').hidden,false);const row=[...d.querySelectorAll('#worldShop .world-item')].find(r=>r.textContent.includes('Miętowa'));row.querySelector('button').click();await tick();await tick();assert.equal(avatar.dataset.outfit,'shirt_mint');assert.equal(d.getElementById('worldCoins').textContent,'25');
 d.getElementById('worldHome').click();assert.equal(d.getElementById('worldWardrobe').hidden,false);assert(d.getElementById('worldWardrobe').textContent.includes('Miętowa'));
 offline=true;await w.recordWorldStudy({event_id:w.newWorldEventId(),owner:'one',language:'Japanese',kind:'learn',ids:[],seconds:30,answers:1});assert.equal(JSON.parse(w.localStorage.getItem('toowee-world:one:pending')).length,1);
 offline=false;await w.loadWorld(true);assert.equal(JSON.parse(w.localStorage.getItem('toowee-world:one:pending')).length,0);assert.equal(d.getElementById('dashboardWorldCoins').textContent,'35');
 const beforeCalls=calls.length;await w.recordWorldStudy({event_id:w.newWorldEventId(),owner:'someone-else',language:'Japanese',ids:[]});assert.equal(calls.length,beforeCalls);
 w.activeLanguage='Spanish';await w.loadWorld();assert.equal(calls.at(-1).p_lang,'Spanish');
 w.account={userId:null};w.dispatchEvent(new w.Event('toowee-account'));assert.equal(d.getElementById('worldCoins').textContent,'—');assert.equal(avatar.dataset.outfit,'shirt_lilac');
 console.log('PASS world UI: setup fallback, cloud load, movement/form guards, purchases, equipment, pending retry, wallet, account/language isolation');w.close();
})().catch(e=>{console.error(e);process.exitCode=1;w.close()});
