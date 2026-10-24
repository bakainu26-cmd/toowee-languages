'use strict';
(() => {
  let queue=[],pool=[],sessionWords=[],revealed=false,attempts=0,phase='idle',verificationTotal=0;
  let training=new Map(),verified=new Map(),originalProgress=new Map(),verificationIds=new Set();
  let direction='toTarget',busy=false,version=0,progressOwner=null,progress=new Map(),progressLoaded=false;
  let active=false,paused=false,elapsedMs=0,runningSince=null,budgetMs=0,sessionGoalMs=0,learningElapsedMs=0,ticker=null;
  let challengeReported=false,sessionOwner=null,sessionLanguage=null,portionSize=10;
  const el=id=>document.getElementById(id),scope=window.TooweeStudyScope;
  const available=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const settings=['studyScope','studyFolder','studyLanguage','studyDirection','studyCount','studyReading','studyMode','studyDateFrom','studyDateTo','studyMinutes','studyCustomMinutes'];
  function setNotice(text) {el('studyNotice').textContent=text;}
  function stopTicker() {if(ticker!==null) clearInterval(ticker);ticker=null;}
  function elapsed() {return elapsedMs+(runningSince===null ? 0 : Math.max(0,Date.now()-runningSince));}
  function settleClock() {elapsedMs=elapsed();runningSince=null;}
  function formatTime(ms) {const seconds=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  function learnedCount() {return [...training.values()].filter(Boolean).length;}
  function confirmedCount() {return [...verified.values()].filter(Boolean).length;}
  function updateTimer() {
    const used=elapsed();
    el('studyTimerLabel').textContent=phase==='verify' ? 'Czas weryfikacji' : budgetMs ? 'Pozostały czas nauki' : 'Czas nauki';
    el('studyTimerValue').textContent=formatTime(phase==='verify' ? used-learningElapsedMs : budgetMs ? budgetMs-used : used);
    el('pauseStudy').textContent=paused ? 'Wznów' : 'Pauza';
    if(active && phase==='learn' && budgetMs && used>=budgetMs && !busy) beginVerification('Czas nauki minął.');
  }
  function startClock() {
    if(document.hidden) {paused=true;runningSince=null;}else {paused=false;runningSince=Date.now();}
    stopTicker();ticker=setInterval(updateTimer,250);updateTimer();
  }
  function scopeOptions() {return {scope:el('studyScope').value,language:el('studyLanguage').value,folder:el('studyFolder').value,from:el('studyDateFrom').value,to:el('studyDateTo').value};}
  function selectedWords() {return scope.select(library.words,progress,scopeOptions());}
  function updateSettings() {
    const value=el('studyScope').value;
    el('studySetField').hidden=value!=='sets';el('studyDateFromField').hidden=value!=='dates';el('studyDateToField').hidden=value!=='dates';
    el('studyCustomTimeField').hidden=el('studyMinutes').value!=='custom';
    const hints={all:'Wszystkie słówka w wybranym języku.',today:'Słówka, dla których nadszedł termin powtórki. Nowe słówka nie należą do tego zakresu.',week:'Słówka dodane od poniedziałku tego tygodnia.',dates:'Wybierz daty dodania słówek. Obie daty są wliczone do zakresu.',sets:'Wybierz zestaw dostępny na Twoim koncie.'};
    el('studyScopeHint').textContent=hints[value]+(el('studyMode').value==='due' ? ' Tryb „Na dziś + nowe” dodatkowo pomija słówka zaplanowane na później.' : '');
    const select=el('studyDirection');
    if(select.options?.length>=2) {select.options[0].textContent='Polski → '+(languageInfo[activeLanguage]?.target || 'język obcy');select.options[1].textContent=(languageInfo[activeLanguage]?.name || 'Język obcy')+' → polski';}
  }
  function resetStudy() {
    ++version;busy=false;active=false;paused=false;phase='idle';stopTicker();elapsedMs=0;runningSince=null;budgetMs=0;sessionGoalMs=0;learningElapsedMs=0;
    queue=[];pool=[];sessionWords=[];training.clear();verified.clear();originalProgress.clear();verificationIds.clear();revealed=false;attempts=0;verificationTotal=0;challengeReported=false;sessionOwner=null;sessionLanguage=null;
    if(progressOwner!==account?.userId) {progress.clear();progressLoaded=false;progressOwner=null;}
    for(const id of ['studySession','studySummary','studyTimer','studyTimeUp','retryStudySave','repeatStudy'])el(id).hidden=true;
    for(const id of ['studyPrompt','studyPromptReading','studyAnswerText','studyAnswerReading','studyProgress','studySummaryText','studyTimeUpText'])el(id).textContent='';
    el('studyAnswer').hidden=true;el('studyCard').draggable=false;
    updateSettings();updateStudyControls();renderPiles();setNotice(available() ? 'Wybierz zakres, porcję słówek i czas. Na koniec czeka weryfikacja.' : 'Zaloguj się i wczytaj bibliotekę, aby rozpocząć.');
  }
  function updateStudyControls() {
    const disabled=!available() || busy;
    el('startStudy').disabled=disabled;
    for(const id of ['revealStudy','knowStudyCard','retryStudyCard'])el(id).disabled=disabled || !active || paused || !['learn','verify'].includes(phase);
    for(const id of settings)el(id).disabled=busy;
    el('pauseStudy').disabled=disabled || !active || !['learn','verify'].includes(phase);
    el('retryStudySave').disabled=disabled;
    el('studyCard').hidden=paused;el('studyActionRow').hidden=paused;
    el('studyCard').draggable=active && revealed && !paused && !disabled && ['learn','verify'].includes(phase);
  }
  function updateStudyFolders() {
    const chosen=el('studyFolder').value;el('studyFolder').replaceChildren(new Option('Wybierz zestaw',''));
    for(const folder of activeFolders())el('studyFolder').add(new Option(folder.name,folder.id));
    el('studyFolder').value=activeFolders().some(f=>f.id===chosen) ? chosen : '';updateSettings();renderPiles();
  }
  function shuffle(rows) {const out=[...rows];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function renderPiles() {
    const rows=sessionWords.length ? sessionWords : selectedWords();
    const valueFor=word=>sessionWords.length ? verified.has(word.id) ? verified.get(word.id) : training.get(word.id) : progress.has(word.id) ? progress.get(word.id).stage>0 : undefined;
    const groups=[rows.filter(w=>valueFor(w)===false),rows.filter(w=>valueFor(w)===true)];
    for(let i=0;i<2;i++) {
      const prefix=i===0 ? 'unknownPile' : 'knownPile';el(prefix+'Count').textContent=progressLoaded ? groups[i].length : '—';el(prefix+'Words').replaceChildren();
      for(const word of groups[i]){const li=document.createElement('li');li.textContent=word.word+(word.reading ? ' ('+word.reading+')' : '');el(prefix+'Words').append(li);}
    }
    const all=library.words.filter(w=>w.lang===activeLanguage),due=all.filter(w=>progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id))).length,unseen=all.filter(w=>!progress.has(w.id)).length;
    el('studyDueSummary').textContent=progressLoaded ? 'Zapisany postęp: do powtórki teraz '+due+' • niećwiczone '+unseen+' • zaplanowane na później '+(all.length-due-unseen)+'.' : 'Rozpocznij naukę, aby wczytać zapisany postęp.';
  }
  async function loadProgress(snapshot) {
    const result=new Map();for(let start=0;;start+=500){const {data,error}=await snapshot.client.from('vocabulary_progress').select('*').eq('owner_id',snapshot.userId).order('word_id').range(start,start+499);if(error)throw error;data.forEach(p=>result.set(p.word_id,p));if(data.length<500)return result;}
  }
  function renderCard() {
    const card=queue[0];if(!card)return;revealed=false;
    el('studySummary').hidden=true;el('studySession').hidden=false;el('studyAnswer').hidden=true;el('revealStudy').hidden=false;el('knowStudyCard').hidden=true;el('retryStudyCard').hidden=true;
    const toTarget=direction==='toTarget';
    el('studyPhaseLabel').textContent=phase==='verify' ? 'Końcowa weryfikacja' : 'Nauka';
    el('studyPrompt').textContent=toTarget ? card.translation : card.word;el('studyPrompt').lang=toTarget ? 'pl' : languageInfo[card.lang]?.code || 'en';
    el('studyAnswerText').textContent=toTarget ? card.word : card.translation;el('studyAnswerText').lang=toTarget ? languageInfo[card.lang]?.code || 'en' : 'pl';
    el('studyPromptLabel').textContent=phase==='verify' ? 'Sprawdź, czy nadal pamiętasz' : toTarget ? 'Przetłumacz na '+(languageInfo[card.lang]?.target || 'język obcy') : 'Przetłumacz na polski';
    el('studyPromptReading').textContent=card.reading || '';el('studyPromptReading').hidden=toTarget || card.lang!=='Japanese' || !card.reading || !el('studyReading').checked;
    el('studyAnswerReading').textContent=card.reading || '';el('studyAnswerReading').hidden=!toTarget || card.lang!=='Japanese' || !card.reading;
    el('studyProgress').textContent=phase==='verify' ? 'Sprawdzono: '+verified.size+' z '+verificationTotal+' • Potwierdzone „Umiem”: '+confirmedCount()+' • Pozostało: '+queue.length : 'Wstępnie umiem: '+learnedCount()+' z '+sessionWords.length+' • W tej porcji pozostało: '+queue.length+' • Próby: '+attempts;
    el('studyProgressBar').max=phase==='verify' ? verificationTotal : sessionWords.length;el('studyProgressBar').value=phase==='verify' ? verified.size : learnedCount();
    updateStudyControls();setNotice(paused ? 'Nauka wstrzymana. Kliknij „Wznów”.' : phase==='verify' ? 'To druga próba. Oceń szczerze, czy samodzielnie przypominasz sobie odpowiedź. Wynik tej rundy zapisze się w systemie.' : 'Uczysz się. „Nie umiem” wróci w tej samej sesji; „Umiem” sprawdzimy jeszcze na koniec.');
  }
  function getBudget() {const custom=el('studyMinutes').value==='custom',minutes=Number(custom ? el('studyCustomMinutes').value : el('studyMinutes').value);return !Number.isInteger(minutes)||minutes<0||minutes>180||(custom&&minutes<1) ? null : minutes*60000;}
  function validateSettings() {
    if(el('studyScope').value==='sets'&&!el('studyFolder').value)return 'Wybierz zestaw.';
    if(el('studyScope').value==='dates'){const from=scope.localDate(el('studyDateFrom').value),to=scope.localDate(el('studyDateTo').value);if(!from||!to)return 'Wybierz obie daty dodania słówek.';if(from>to)return 'Data „od” nie może być późniejsza niż data „do”.';}
    return getBudget()===null ? 'Wpisz własny czas: od 1 do 180 pełnych minut.' : '';
  }
  function addPortion() {const batch=pool.splice(0,portionSize);sessionWords.push(...batch);queue=[...batch];renderPiles();}
  async function startStudy() {
    if(!available()||busy)return;const invalid=validateSettings();if(invalid){setNotice(invalid);return;}
    if(active&&!confirm('Rozpocząć nową sesję? Bieżąca sesja nie zapisała jeszcze końcowej weryfikacji.'))return;
    resetStudy();budgetMs=getBudget();sessionGoalMs=budgetMs;const current=version,snapshot={...account};busy=true;updateStudyControls();setNotice('Wczytywanie zapisanych powtórek…');
    try{
      const loaded=await loadProgress(snapshot);if(current!==version||account?.userId!==snapshot.userId)return;
      progress=loaded;originalProgress=new Map(loaded);progressOwner=snapshot.userId;progressLoaded=true;let rows=selectedWords();
      if(el('studyMode').value==='due'){const due=rows.filter(w=>progress.has(w.id)&&window.TooweeSRS.isDue(progress.get(w.id))).sort((a,b)=>new Date(progress.get(a.id).due_at)-new Date(progress.get(b.id).due_at));rows=[...due,...shuffle(rows.filter(w=>!progress.has(w.id)))];}else rows=shuffle(rows);
      if(!rows.length){renderPiles();setNotice('Brak słówek pasujących do zakresu i trybu nauki.');return;}
      direction=el('studyDirection').value;portionSize=Number(el('studyCount').value);if(![10,15,20,25].includes(portionSize))portionSize=10;
      pool=[...rows];sessionOwner=snapshot.userId;sessionLanguage=activeLanguage;phase='learn';active=true;addPortion();
      startClock();el('studyTimer').hidden=false;renderCard();
    }catch(error){if(current===version)setNotice(['PGRST205','42P01'].includes(error.code)?'Uruchom spaced_repetition_setup.sql w Supabase.':'Nie udało się wczytać powtórek. '+(error.message||''));}
    finally{if(current===version){busy=false;updateStudyControls();}}
  }
  function beginVerification(reason='Część do nauki ukończona.') {
    if(!active||phase!=='learn'||busy)return;
    settleClock();learningElapsedMs=elapsedMs;stopTicker();budgetMs=0;paused=false;phase='verify';
    queue=shuffle(sessionWords.filter(w=>training.get(w.id)===true));verificationTotal=queue.length;verificationIds=new Set(queue.map(w=>w.id));revealed=false;
    el('studyTimeUp').hidden=true;
    if(!queue.length){void saveResults();return;}
    startClock();renderCard();setNotice(reason+' Teraz od początku sprawdzisz '+verificationTotal+' słówek oznaczonych „Umiem”. Weryfikacja nie ma limitu czasu.');
  }
  function reveal() {
    if(!available()||busy||!active||paused||!queue.length||revealed)return;
    const currentPhase=phase;updateTimer();if(phase!==currentPhase||!queue.length)return;
    revealed=true;el('studyAnswer').hidden=false;el('revealStudy').hidden=true;el('knowStudyCard').hidden=false;el('retryStudyCard').hidden=false;updateStudyControls();
    setNotice(phase==='verify'?'Czy pamiętasz bez podpowiedzi? Ta ocena trafi do harmonogramu powtórek.':'Przeciągnij do wybranej przegródki lub użyj przycisków.');
  }
  async function markCard(isKnown) {
    if(!available()||busy||!active||paused||!revealed||!queue.length||!['learn','verify'].includes(phase))return;
    const oldPhase=phase;updateTimer();if(oldPhase!==phase)return;
    const card=queue.shift();revealed=false;attempts++;
    if(phase==='learn'){
      training.set(card.id,isKnown);if(!isKnown)queue.push(card);renderPiles();
      if(!queue.length){
        if(sessionGoalMs&&elapsed()<sessionGoalMs&&pool.length){addPortion();renderCard();setNotice('Poprzednia porcja opanowana. Dodano kolejne '+queue.length+' słówek, bo czas nauki jeszcze trwa.');}
        else beginVerification(pool.length?'Porcja ukończona.':'Wyczerpano wybrany zakres słówek.');
      }else renderCard();
    }else{
      verified.set(card.id,isKnown);renderPiles();if(queue.length)renderCard();else await saveResults();
    }
  }
  function reportChallenge() {
    if(challengeReported||!attempts||!sessionOwner)return;
    const completed=verificationTotal>0&&[...verificationIds].every(id=>verified.has(id));
    if(!completed&&!(sessionGoalMs&&learningElapsedMs>=sessionGoalMs))return;
    challengeReported=true;
    if(window.recordStudyChallenge)void window.recordStudyChallenge({userId:sessionOwner,language:sessionLanguage,review_count:attempts,study_seconds:Math.min(86400,Math.floor(elapsedMs/1000)),goal_seconds:Math.floor(sessionGoalMs/1000),completed_all:completed});
  }
  async function saveResults() {
    if(busy||!available()||account?.userId!==sessionOwner)return;
    settleClock();stopTicker();paused=false;active=false;phase='saving';busy=true;el('studySession').hidden=true;el('studyTimer').hidden=true;el('studySummary').hidden=false;el('retryStudySave').hidden=true;updateStudyControls();
    el('studySummaryText').textContent='Zapisywanie końcowej weryfikacji…';const current=version,snapshot={...account};
    const reviewed=sessionWords.filter(w=>training.has(w.id));
    const payload=reviewed.map(w=>({owner_id:sessionOwner,word_id:w.id,...window.TooweeSRS.next(originalProgress.get(w.id),verified.get(w.id)===true)}));
    try{
      if(payload.length){const {data,error}=await snapshot.client.from('vocabulary_progress').upsert(payload,{onConflict:'owner_id,word_id'}).select('*');if(error)throw error;if(current!==version||account?.userId!==sessionOwner)return;data.forEach(p=>progress.set(p.word_id,p));}
      if(current!==version)return;phase='finished';
      const yes=confirmedCount(),no=reviewed.length-yes,untouched=sessionWords.length-reviewed.length;
      el('studySummaryText').textContent='Końcowa weryfikacja: umiem '+yes+' • do powtórki '+no+(untouched?' • nieprzećwiczone '+untouched:'')+'. Czas nauki: '+formatTime(learningElapsedMs)+', weryfikacji: '+formatTime(elapsedMs-learningElapsedMs)+'. '+(payload.length?'Wynik i terminy powtórek zapisane.':'Nie oceniono żadnej fiszki.');
      setNotice('Listy poniżej pokazują wynik końcowej weryfikacji.');
      // Cards which did not reach verification remain due for another practice.
      reviewed.forEach(w=>{if(!verified.has(w.id))verified.set(w.id,false);});renderPiles();reportChallenge();
      if(window.loadProgressDashboard)void window.loadProgressDashboard();
    }catch(error){if(current===version){phase='save-error';el('studySummaryText').textContent='Weryfikacja gotowa, ale wynik nie został zapisany. Zachowaliśmy go na tej stronie. Ponów zapis. '+(error.message||'');el('retryStudySave').hidden=false;}}
    finally{if(current===version){busy=false;updateStudyControls();}}
  }
  function pauseStudySession() {
    if(!active||paused||busy)return;settleClock();paused=true;updateTimer();updateStudyControls();setNotice('Sesja wstrzymana. Kliknij „Wznów”, aby kontynuować.');
  }
  el('startStudy').onclick=startStudy;el('revealStudy').onclick=reveal;el('knowStudyCard').onclick=()=>markCard(true);el('retryStudyCard').onclick=()=>markCard(false);
  el('retryStudySave').onclick=()=>{if(phase==='save-error')void saveResults();};
  el('pauseStudy').onclick=()=>{if(!active||busy)return;if(paused){paused=false;runningSince=Date.now();updateTimer();updateStudyControls();setNotice('Sesja wznowiona.');}else pauseStudySession();};
  el('continueStudy').onclick=()=>{};el('finishStudy').onclick=()=>{};
  el('studyCard').addEventListener('dragstart',event=>{if(!active||!revealed||busy||paused||!available()||!queue.length){event.preventDefault();return;}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',queue[0].id);});
  for(const id of ['unknownPile','knownPile']){const pile=el(id);pile.addEventListener('dragover',event=>{if(active&&revealed&&!busy&&!paused&&available()){event.preventDefault();pile.classList.add('drag-over');}});pile.addEventListener('dragleave',()=>pile.classList.remove('drag-over'));pile.addEventListener('drop',event=>{event.preventDefault();pile.classList.remove('drag-over');if(event.dataTransfer.getData('text/plain')===queue[0]?.id)void markCard(id==='knownPile');});}
  el('studyCard').addEventListener('dragend',()=>{for(const id of ['unknownPile','knownPile'])el(id).classList.remove('drag-over');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseStudySession();});
  for(const id of settings)el(id).onchange=resetStudy;
  window.resetStudy=resetStudy;window.updateStudyControls=updateStudyControls;window.updateStudyFolders=updateStudyFolders;window.pauseStudySession=pauseStudySession;
  updateStudyFolders();resetStudy();
})();
