'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const catalog=[
    {id:'shirt_lilac',name:'Lawendowa koszulka',price:0,icon:'💜',group:'outfit'},
    {id:'shirt_mint',name:'Miętowa koszulka',price:25,icon:'🌿',group:'outfit'},
    {id:'shirt_coral',name:'Koralowa koszulka',price:25,icon:'🌷',group:'outfit'},
    {id:'hoodie_night',name:'Bluza nocnego odkrywcy',price:60,icon:'🌌',group:'outfit'},
    {id:'hat_sun',name:'Słomkowy kapelusz',price:40,icon:'👒',group:'accessory'},
    {id:'headphones',name:'Słuchawki do przygód',price:50,icon:'🎧',group:'accessory'},
    {id:'none',name:'Bez dodatku',price:0,icon:'✧',group:'accessory'}
  ];
  let profile=null,daily=null,cloud=false,busy=false,epoch=0,owner=null,mode='missions',chain=Promise.resolve(),saveTimer=null;
  let position={x:6,y:6},pending=[],setupMissing=false,lastLoad=0,loadedLanguage=null;
  const locations={missions:{x:6,y:3,title:'Magda i Sofi: czas na małą misję!',text:'Wybierz zadanie poniżej. Każdy krok robisz na własnym słownictwie — w języku wybranym na platformie.'},shop:{x:10,y:4,title:'Sofi pilnuje sklepiku 🐾',text:'Tutaj wydajesz zdobyte monety. Kupiony przedmiot od razu pojawi się na Twojej postaci.'},wardrobe:{x:2,y:3,title:'Twój domek, Twój styl',text:'W garderobie znajdziesz wszystkie kupione ubrania i dodatki. Możesz zmieniać je bez dodatkowych opłat.'}};
  const key=suffix=>'toowee-world:'+owner+':'+suffix;
  function read(suffix,fallback){try{return JSON.parse(localStorage.getItem(key(suffix))) ?? fallback;}catch{return fallback;}}
  function write(suffix,value){try{localStorage.setItem(key(suffix),JSON.stringify(value));return true;}catch{return false;}}
  function notice(message){el('worldStatus').textContent=message;}
  function reset(){++epoch;clearTimeout(saveTimer);saveTimer=null;owner=account?.userId || null;profile=null;daily=null;cloud=false;busy=false;setupMissing=false;lastLoad=0;loadedLanguage=null;chain=Promise.resolve();position={x:6,y:6};pending=[];
    if(owner){const saved=read('position',position);if(Number.isInteger(saved.x)&&Number.isInteger(saved.y)&&saved.x>=0&&saved.x<12&&saved.y>=0&&saved.y<8)position=saved;pending=read('pending',[]);if(!Array.isArray(pending))pending=[];}
    render();
  }
  function valid(){return ready && account?.userId && activeLanguage;}
  function missing(error){return ['PGRST202','42883','42P01'].includes(error?.code);}
  async function send(action,data={},language=activeLanguage){
    const current=epoch,user=account?.userId,client=account?.client;if(!user||!language||!client)throw new Error('Najpierw zaloguj się i wybierz język.');
    const task=chain.catch(()=>{}).then(async()=>{
      if(current!==epoch||account?.userId!==user)throw new Error('Konto zostało zmienione.');
      const result=await client.rpc('toowee_world',{p_action:action,p_lang:language,p_data:data});
      if(current!==epoch||account?.userId!==user)return null;
      if(result.error){if(missing(result.error)){setupMissing=true;cloud=false;render();}throw result.error;}
      cloud=true;setupMissing=false;profile=result.data.profile;
      if(language===activeLanguage){daily=result.data.daily;loadedLanguage=language;}
      render();return result.data;
    });chain=task;return task;
  }
  async function flush(){
    for(const event of [...pending]){
      if(event.owner!==account?.userId)continue;
      const data=await send('activity',event.data,event.language);if(!data)return;
      pending=pending.filter(p=>p.data.event_id!==event.data.event_id);write('pending',pending);
      if(data.earned)notice('Zdobywasz '+data.earned+' monet! ✦ Zajrzyj do sklepiku.');
    }
  }
  async function load(force=false){
    if(!valid())return;if(owner!==account.userId)reset();
    if(!force && Date.now()-lastLoad<5000 && cloud && loadedLanguage===activeLanguage){render();return;}
    lastLoad=Date.now();const current=epoch;notice('Wczytuję Twój świat…');
    try{const result=await send('load');if(!result||current!==epoch)return;position={x:result.profile.x,y:result.profile.y};if(!passable(position.x,position.y))position={x:6,y:6};paintAvatar();await flush();if(current===epoch)notice(pending.length?'Część nagród czeka na zapis. Kliknij „Odśwież zapis”.':'Postęp zapisuje się na Twoim koncie. Miłej przygody!');}
    catch(error){if(current!==epoch)return;notice(setupMissing?'Włącz zapis poniżej. Do tego czasu możesz zwiedzać mapę, a ukończone aktywności będą czekały na rozliczenie.':'Nie udało się połączyć ze światem. '+(error.message || 'Spróbuj odświeżyć zapis.'));}
  }
  function paintAvatar(){const avatar=el('worldAvatar');avatar.style.left=((position.x+.5)/12*100)+'%';avatar.style.top=((position.y+1)/8*100)+'%';avatar.dataset.outfit=profile?.outfit || 'shirt_lilac';avatar.dataset.accessory=profile?.accessory || 'none';}
  function makeButton(text,handler,disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=disabled;b.onclick=handler;return b;}
  function renderMissions(){
    const missions=[{id:'learn',name:'Pierwsze 10 słówek',text:'Naucz się 10 nowych słówek i potwierdź je w końcowej weryfikacji.',value:daily?.learned_ids?.length||0,total:10,reward:40,done:daily?.learned_paid,button:'Ucz się fiszek'},
      {id:'review',name:'Odśwież pamięć',text:'Poprawnie przypomnij sobie 5 słówek w trybie Powtórka.',value:daily?.reviewed_ids?.length||0,total:5,reward:25,done:daily?.review_paid,button:'Zrób powtórkę'},
      {id:'pairs',name:'Sofi szuka par',text:'Ukończ grę „Połącz w pary” z co najmniej 6 parami.',value:daily?.pairs_done?1:0,total:1,reward:20,done:daily?.pairs_paid,button:'Dopasuj pary'}];
    const container=el('worldMissions');container.replaceChildren();
    const title=document.createElement('p');title.className='world-note';title.textContent='Misje na dziś · '+(languageInfo[activeLanguage]?.name || 'Wybierz język')+'. Każda nagroda raz dziennie. Postęp można zebrać w kilku sesjach.';container.append(title);
    for(const mission of missions){const card=document.createElement('div');card.className='world-mission'+(mission.done?' done':'');const h=document.createElement('h4');h.textContent=(mission.done?'✓ ':'')+mission.name;const text=document.createElement('p');text.textContent=mission.text;const info=document.createElement('p');info.className='world-reward';info.textContent=Math.min(mission.total,mission.value)+' / '+mission.total+' · '+mission.reward+' monet'+(mission.done?' · odebrane':'');card.append(h,text,info,makeButton(mission.done?'Poćwicz dodatkowo':mission.button,()=>startMission(mission.id),!valid()));container.append(card);}
    const time=document.createElement('div');time.className='world-mission';const h=document.createElement('h4');h.textContent='✦ Każde 5 minut ma znaczenie';const text=document.createElement('p');const seconds=daily?.seconds||0;text.textContent='10 monet / 5 min aktywnej nauki. Dziś: '+Math.floor(seconds/60)+' min '+seconds%60+' s. '+(seconds>=3600?'Dzisiejszy limit nagród za czas osiągnięty.':'Do następnej nagrody: '+(300-seconds%300)+' s.')+' W misjach zapisujemy czas po każdej odpowiedzi; zwykła nauka nalicza go po ukończeniu sesji.';time.append(h,text);container.append(time);
  }
  function renderItems(id,wardrobe){const container=el(id);container.replaceChildren();for(const item of catalog){const owned=item.id==='none'||profile?.owned?.includes(item.id);if(wardrobe&&!owned)continue;if(!wardrobe&&item.id==='none')continue;const equipped=profile?.[item.group]===item.id;const row=document.createElement('div');row.className='world-item';const icon=document.createElement('span');icon.className='world-item-swatch';icon.textContent=item.icon;const label=document.createElement('div');const name=document.createElement('strong');name.textContent=item.name;const price=document.createElement('small');price.textContent=owned?'W Twojej garderobie':item.price+' monet';label.append(name,price);row.append(icon,label,makeButton(equipped?'Założone':owned?'Załóż':'Kup',()=>buy(item,owned),!cloud||busy||equipped||(!owned&&(profile?.coins||0)<item.price)));container.append(row);}}
  function render(){el('worldCoins').textContent=profile?String(profile.coins):'—';el('dashboardWorldCoins').textContent=profile?String(profile.coins):'—';el('worldLanguage').textContent=languageInfo[activeLanguage]?.name || '';el('worldSetupNotice').hidden=!setupMissing;paintAvatar();renderMissions();renderItems('worldShop',false);renderItems('worldWardrobe',true);el('worldRefresh').disabled=busy||!valid();}
  async function buy(item,owned){if(!cloud||busy||!valid())return;busy=true;render();try{const data=await send(owned?'equip':'buy',{item:item.id});if(data)notice((owned?'Założono: ':'Kupiono i założono: ')+item.name+'.');}catch(error){notice(error.message || 'Nie udało się zapisać zakupu.');}finally{busy=false;render();}}
  function show(place){mode=place;for(const name of ['missions','shop','wardrobe']){el('world'+name[0].toUpperCase()+name.slice(1)).hidden=place!==name;el('worldTab'+name[0].toUpperCase()+name.slice(1)).classList.toggle('alt',place!==name);}el('worldGuideTitle').textContent=locations[place].title;el('worldGuideText').textContent=locations[place].text;}
  function passable(x,y){return x>=1&&x<11&&y>=0&&y<8&&!(x<=3&&y<=2)&&!(x>=9&&y<=3)&&!(y<=1&&x>=5&&x<=7)&&!(x<=3&&y>=4);}
  function savePosition(){write('position',position);clearTimeout(saveTimer);if(!cloud)return;const user=owner,point={...position};saveTimer=setTimeout(()=>{if(owner===user&&account?.userId===user)void send('position',point).catch(()=>notice('Pozycja czeka na połączenie. Odśwież zapis, gdy wróci internet.'));},600);}
  function move(dx,dy){if(!valid()||el('world').hidden)return;const x=position.x+dx,y=position.y+dy;if(!passable(x,y))return;position={x,y};paintAvatar();savePosition();}
  function interact(){const near=Object.entries(locations).sort((a,b)=>(Math.abs(position.x-a[1].x)+Math.abs(position.y-a[1].y))-(Math.abs(position.x-b[1].x)+Math.abs(position.y-b[1].y)))[0];if(near&&Math.abs(position.x-near[1].x)+Math.abs(position.y-near[1].y)<=2)show(near[0]);else notice('Podejdź bliżej domku, placu misji lub sklepiku — albo kliknij wybrane miejsce.');}
  function startMission(kind){if(!valid())return;window.clearLearningContext?.();if(kind==='pairs'){window.worldGameMission=true;tab('games');el('gameType-match').click();el('gameFolder').value='';el('gameCount').value='6';el('startGame').click();return;}window.openWorldStudy?.(kind);}
  async function record(event){if(event.owner!==account?.userId)return;const entry={owner:event.owner,language:event.language,data:{event_id:event.event_id,kind:event.kind,ids:event.ids||[],seconds:Math.max(0,Math.floor(event.seconds||0)),answers:event.answers||0}};if(pending.some(p=>p.data.event_id===event.event_id))return;pending.push(entry);const persisted=write('pending',pending);if(!persisted)notice('Nagroda czeka na zapis w tej karcie. Nie zamykaj jej do zakończenia połączenia.');try{await flush();return true;}catch{notice('Nagroda czeka na zapis. Otwórz „Mój świat” i odśwież zapis.');return false;}}
  window.newWorldEventId=()=>window.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);});
  window.recordWorldStudy=event=>record(event);
  window.recordWorldGame=event=>record({...event,kind:'pairs',seconds:0,answers:0});
  window.loadWorld=load;
  window.addEventListener('toowee-account',reset);
  el('worldRefresh').onclick=()=>load(true);
  for(const [id,place] of [['worldHome','wardrobe'],['worldMissionsPlace','missions'],['worldShopPlace','shop'],['worldTabMissions','missions'],['worldTabShop','shop'],['worldTabWardrobe','wardrobe']])el(id).onclick=()=>show(place);
  for(const [id,dx,dy] of [['worldUp',0,-1],['worldDown',0,1],['worldLeft',-1,0],['worldRight',1,0]])el(id).onclick=()=>move(dx,dy);
  el('worldInteract').onclick=interact;
  let lastMove=0;
  document.addEventListener('keydown',event=>{if(el('world').hidden||el('worldStudyDialog')?.open||!valid()||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;const moves={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};const step=moves[event.key];if(step){event.preventDefault();if(Date.now()-lastMove>=110){lastMove=Date.now();move(...step);}}else if(event.key==='Enter' && event.target?.tagName!=='BUTTON'){event.preventDefault();interact();}});
  el('worldMap').addEventListener('click',event=>{if(!event.target.closest('button'))el('worldMap').focus({preventScroll:true});});
  el('worldShowSetup').onclick=async()=>{el('worldSetupCode').hidden=!el('worldSetupCode').hidden;if(!el('worldSql').value)try{const response=await fetch('world_setup.sql');if(!response.ok)throw new Error();el('worldSql').value=await response.text();}catch{notice('Nie udało się pobrać kodu konfiguracji. Odśwież stronę i spróbuj ponownie.');}};
  el('worldCopySetup').onclick=async()=>{if(!el('worldSql').value){notice('Poczekaj na wczytanie kodu konfiguracji.');return;}try{await navigator.clipboard.writeText(el('worldSql').value);notice('Kod skopiowany. Wklej go w SQL Editor w Supabase i kliknij Run.');}catch{el('worldSql').focus();el('worldSql').select();notice('Zaznaczony kod skopiuj klawiszami ⌘C lub Ctrl+C.');}};
  show('missions');reset();
})();
