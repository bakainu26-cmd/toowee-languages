'use strict';
(() => {
  const el=id=>document.getElementById(id);let state=null,revision=0,dirty=false,busy=false,revealed=false,epoch=0,stamp=null,mode='learn',client=null,owner=null,language=null,saveError='';
  const storageKey=()=>['toowee-world-study',owner,language,mode].join(':');
  const alive=token=>token===epoch && account?.userId===owner && activeLanguage===language;
  const word=id=>library.words.find(w=>w.id===id && w.lang===language);
  function localSave(){try{localStorage.setItem(storageKey(),JSON.stringify({state,revision,dirty}));return true;}catch{return false;}}
  function localRead(){try{return JSON.parse(localStorage.getItem(storageKey()))}catch{return null;}}
  function status(text){el('worldStudyStatus').textContent=text;}
  function showSetup(){el('worldStudySetup').hidden=false;el('worldStudyRetry').hidden=false;el('worldStudyRetry').textContent='Sprawdź zapis po konfiguracji';}
  async function persist(token){
    dirty=true;localSave();const {data,error}=await client.rpc('toowee_world_study',{p_lang:language,p_mode:mode,p_payload:JSON.parse(JSON.stringify(state)),p_revision:revision});
    if(!alive(token))return false;if(error)throw error;revision=data.revision;dirty=false;localSave();return true;
  }
  function draw(){
    const card=state&&word(state.queue[0]),done=state?.phase==='done';
    el('worldStudyTitle').textContent=mode==='review'?'Mój świat · Powtórka':'Mój świat · Fiszki misji';
    el('worldStudyTime').textContent='Zapisany aktywny czas: '+Math.floor((state?.seconds||0)/60)+' min '+Math.floor((state?.seconds||0)%60)+' s';
    el('worldStudyProgress').textContent=state?(mode==='review'?'Sprawdzono '+state.processed.length:'Potwierdzono '+state.completed.length)+' / '+state.targets.length+' · '+(languageInfo[language]?.name||''):'';
    el('worldStudyBar').max=state?.targets.length||1;el('worldStudyBar').value=mode==='review'?state?.processed.length||0:state?.completed.length||0;
    el('worldStudyPhase').textContent=done?'Sesja ukończona':state?.phase==='verify'?'Weryfikacja z pamięci':mode==='review'?'Powtórka':'Nauka — ćwicz do zapamiętania';
    el('worldStudyCard').hidden=!card || done;
    el('worldStudyReveal').hidden=!card||done||revealed;el('worldStudyKnown').hidden=!card||done||!revealed;el('worldStudyUnknown').hidden=!card||done||!revealed;
    for(const id of ['worldStudyReveal','worldStudyKnown','worldStudyUnknown'])el(id).disabled=busy||dirty||Boolean(state?.checkpoint)||!el('worldStudySetup').hidden;
    el('worldStudyRetry').hidden=!saveError;el('worldStudyRetry').disabled=busy;
    if(!card)return;
    const prompt=el('worldStudyPrompt'),answer=el('worldStudyWord'),example=el('worldStudyExample');
    window.TooweeFurigana?.cancel(prompt);window.TooweeFurigana?.cancel(answer);window.TooweeFurigana?.cancel(example);
    prompt.textContent=card.translation;answer.textContent=card.word;answer.lang=languageInfo[language]?.code||'en';
    el('worldStudyReading').textContent=card.reading||'';el('worldStudyReading').hidden=language!=='Japanese'||!card.reading;
    example.textContent=card.example||'';example.hidden=!card.example;el('worldStudyAnswer').hidden=!revealed;
    if(language==='Japanese' && window.TooweeFurigana){window.TooweeFurigana.render(answer,card.word,card.reading||'');el('worldStudyReading').hidden=true;if(card.example)window.TooweeFurigana.render(example,card.example);}
  }
  function transition(checkpoint){
    const id=state.queue.shift();state.answers++;state.seconds+=checkpoint.event.seconds;
    if(state.phase==='learn'){
      if(checkpoint.known){if(!state.trained.includes(id))state.trained.push(id);}else state.queue.push(id);
      if(!state.queue.length){state.phase='verify';state.queue=[...state.trained];state.trained=[];}
    }else{
      if(checkpoint.progress)state.progress[id]=checkpoint.progress;
      if(checkpoint.known&&!state.completed.includes(id))state.completed.push(id);
      if(!state.processed.includes(id))state.processed.push(id);
      if(!checkpoint.known&&mode==='learn')state.failed.push(id);
      if(!state.queue.length){if(mode==='learn'&&state.failed.length){state.phase='learn';state.queue=[...state.failed];state.failed=[];}else state.phase='done';}
    }
    state.checkpoint=null;revealed=false;
  }
  async function runCheckpoint(token){
    const checkpoint=state.checkpoint;if(!checkpoint){if(dirty)await persist(token);return;}
    if(dirty&&!await persist(token))return;
    if(checkpoint.progress){const {error}=await client.from('vocabulary_progress').upsert([{owner_id:owner,word_id:checkpoint.id,...checkpoint.progress}],{onConflict:'owner_id,word_id'}).select('*');if(!alive(token))return;if(error)throw error;}
    const paid=await window.recordWorldStudy(checkpoint.event);if(!alive(token))return;
    state.pendingCoins=paid===false;
    transition(checkpoint);dirty=true;localSave();
    if(!await persist(token))return;
    // The normal learning view reads the same vocabulary_progress rows when next opened.
    if(window.refreshLearningSets)void window.refreshLearningSets();
  }
  async function rate(known){
    if(busy||dirty||!revealed||!state||state.checkpoint||state.phase==='done'||!el('worldStudySetup').hidden)return;
    const card=word(state.queue[0]);if(!card)return;
    const seconds=Math.floor(Math.min(30,Math.max(0,(Date.now()-(stamp??Date.now()))/1000)));
    const verification=state.phase!=='learn',progress=verification?window.TooweeSRS.next(state.progress[card.id]||null,known):null;
    const kind=verification?mode:'practice';
    state.checkpoint={id:card.id,known,progress,event:{event_id:window.newWorldEventId(),owner,language,kind,ids:verification&&known?[card.id]:[],seconds,answers:1}};
    dirty=true;localSave();const token=epoch;busy=true;saveError='';status('Zapisuję odpowiedź i czas nauki…');draw();
    try{await runCheckpoint(token);if(!alive(token))return;status(state.phase==='done'?'Sesja zapisana! Wróć na mapę, aby zobaczyć monety i postęp misji.':state.pendingCoins?'Odpowiedź zapisana. Monety czekają na połączenie — ponowimy zapis po powrocie na mapę.':'Odpowiedź i czas zapisane. Możesz kontynuować albo wrócić na mapę.');}
    catch(error){if(alive(token)){saveError=error.message||'Brak połączenia.';status('Odpowiedź czeka na zapis. '+saveError+' Możesz wrócić na mapę — przy następnym wejściu ponowimy zapis.');}}
    finally{if(alive(token)){busy=false;stamp=el('worldStudyDialog').open&&!document.hidden?Date.now():null;draw();}}
  }
  async function records(){const result={};for(let start=0;;start+=500){const {data,error}=await client.from('vocabulary_progress').select('*').eq('owner_id',owner).order('word_id').range(start,start+499);if(error)throw error;for(const row of data)result[row.word_id]=row;if(data.length<500)return result;}}
  async function open(kind){
    if(!ready||!account?.userId||!activeLanguage)return;
    if(busy){if(!el('worldStudyDialog').open)el('worldStudyDialog').showModal();return;}
    const token=++epoch;mode=kind==='review'?'review':'learn';owner=account.userId;language=activeLanguage;client=account.client;state=null;revision=0;dirty=false;revealed=false;saveError='';stamp=null;
    el('worldStudySetup').hidden=true;el('worldStudyRetry').textContent='Ponów zapis';if(!el('worldStudyDialog').open)el('worldStudyDialog').showModal();busy=true;draw();status('Wczytuję zapisaną misję…');
    try{
      const {data,error}=await client.rpc('toowee_world_study',{p_lang:language,p_mode:mode});if(!alive(token))return;if(error)throw error;
      revision=data.revision;const local=localRead();state=data.state;
      if(local?.state && local.revision===revision && local.dirty && (!state||local.state.id===state.id)){state=local.state;dirty=true;}
      if(!state||state.phase==='done'){
        const progress=await records();if(!alive(token))return;
        const now=Date.now(),eligible=library.words.filter(w=>(!window.learningSourceAccepts||window.learningSourceAccepts(w))&&w.lang===language&&(mode==='learn'?!(progress[w.id]?.stage>0):progress[w.id]?.stage>0&&Date.parse(progress[w.id].due_at)<=now));
        for(let i=eligible.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
        const targets=eligible.slice(0,10).map(w=>w.id);
        if(!targets.length){state=null;status(mode==='learn'?'Nie masz teraz nowych słówek do nauki. Dodaj słownictwo albo wybierz misję powtórek.':'Na tę chwilę nie ma słówek z terminem powtórki. Wróć na mapę lub wybierz naukę.');return;}
        state={sourceLabel:el('materialSource')?.selectedOptions[0]?.textContent||'Wszystkie dostępne',id:window.newWorldEventId(),phase:mode==='learn'?'learn':'review',targets,queue:[...targets],trained:[],failed:[],completed:[],processed:[],progress:Object.fromEntries(targets.filter(id=>progress[id]).map(id=>[id,progress[id]])),seconds:0,answers:0,checkpoint:null};dirty=true;await persist(token);
      }else{
        // Deleted vocabulary cannot leave an unanswerable card at the head of the queue.
        state.queue=state.queue.filter(id=>word(id));state.targets=state.targets.filter(id=>word(id));
        if(!state.queue.length&&!state.checkpoint)state.phase='done';
        if(state.checkpoint||dirty)await runCheckpoint(token);
      }
      if(!alive(token))return;status(state.phase==='done'?'Zapisana sesja jest ukończona. Wróć na mapę.':'Wznawiasz zapisaną misję · '+(state.sourceLabel||'Wszystkie dostępne')+'. Każda odpowiedź ma własny zapis; „Wróć na mapę” zachowuje postęp. Zmiana źródła dotyczy kolejnej nowej misji.');
    }catch(error){if(!alive(token))return;saveError=error.message||'Brak połączenia.';if(['PGRST202','42883','42P01'].includes(error.code)){status('Najpierw włącz zapis misji na koncie. Skopiuj poprawkę poniżej i uruchom ją w Supabase.');showSetup();}else status('Nie udało się wczytać/zapisać misji. '+saveError);}
    finally{if(alive(token)){busy=false;stamp=!document.hidden&&el('worldStudyDialog').open?Date.now():null;draw();}}
  }
  function close(){stamp=null;revealed=false;el('worldStudyDialog').close();if(window.loadWorld)void window.loadWorld(true);}
  function flip(){if(!busy&&!dirty&&state&&!state.checkpoint&&state.phase!=='done'&&el('worldStudySetup').hidden){revealed=!revealed;draw();}}
  el('worldStudyBack').onclick=close;el('worldStudyDialog').addEventListener('cancel',event=>{event.preventDefault();close();});
  el('worldStudyReveal').onclick=flip;el('worldStudyKnown').onclick=()=>rate(true);el('worldStudyUnknown').onclick=()=>rate(false);
  el('worldStudyRetry').onclick=async()=>{if(busy)return;if(!state||!el('worldStudySetup').hidden){await open(mode);return;}const token=epoch;busy=true;draw();try{await runCheckpoint(token);if(!alive(token))return;saveError='';status('Zapis potwierdzony. Możesz kontynuować.');}catch(error){if(alive(token)){saveError=error.message;status('Zapis nadal czeka. '+saveError);}}finally{if(alive(token)){busy=false;stamp=Date.now();draw();}}};
  el('worldStudyCopySetup').onclick=async()=>{try{const response=await fetch('world_setup.sql');if(!response.ok)throw new Error();const sql=await response.text();el('worldStudySql').value=sql;el('worldStudySql').hidden=false;try{await navigator.clipboard.writeText(sql);status('Kod skopiowany. Wklej w Supabase → SQL Editor → New query i kliknij Run. Potem kliknij „Sprawdź zapis po konfiguracji”.');}catch{el('worldStudySql').focus();el('worldStudySql').select();status('Skopiuj zaznaczony kod (⌘C / Ctrl+C), uruchom w Supabase i sprawdź zapis ponownie.');}}catch{status('Nie udało się wczytać kodu poprawki. Odśwież stronę i spróbuj ponownie.');}};
  document.addEventListener('keydown',event=>{if(!el('worldStudyDialog').open||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey||['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
    if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();flip();}
    else if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(revealed)void rate(event.key==='ArrowRight');}
    else if([' ','Enter'].includes(event.key)&&event.target?.tagName!=='BUTTON'){event.preventDefault();if(!revealed)flip();}
  });
  document.addEventListener('visibilitychange',()=>{stamp=document.hidden?null:Date.now();});
  window.addEventListener('toowee-account',()=>{++epoch;stamp=null;state=null;busy=false;client=null;el('worldStudyDialog').close();});
  window.openWorldStudy=open;
})();
