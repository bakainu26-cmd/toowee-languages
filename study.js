'use strict';
(() => {
  let queue=[],pool=[],sessionWords=[],revealed=false,attempts=0,phase='idle',verificationTotal=0;
  let training=new Map(),verified=new Map(),originalProgress=new Map(),verificationIds=new Set();
  let direction='toTarget',busy=false,version=0,progressOwner=null,progress=new Map(),progressLoaded=false;
  let active=false,paused=false,elapsedMs=0,runningSince=null,budgetMs=0,sessionGoalMs=0,learningElapsedMs=0,ticker=null;
  let challengeReported=false,sessionOwner=null,sessionLanguage=null,portionSize=10,sessionKind='learn';
  let focused=false,pendingRating=null,cardHistory=[],historyIndex=null;
  const el=id=>document.getElementById(id),scope=window.TooweeStudyScope;
  const available=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const settings=['studyScope','studyFolder','studyLanguage','studyDirection','studyCount','studyReading','studyMode','studyDateFrom','studyDateTo','studyMinutes','studyCustomMinutes'];
  function setNotice(text) {el('studyNotice').textContent=text;}
  const hasSession=()=>sessionOwner===account?.userId && phase!=='idle';
  function route(hash,push=false){if(!window.history || !window.location || window.location.hash===hash)return;window.history[push?'pushState':'replaceState'](null,'',hash);}
  function setFocus(value){focused=value;document.body?.classList.toggle('study-focus',value);}
  function openFocus(){if(!hasSession())return;if(active && paused && !document.hidden){paused=false;runningSince=Date.now();}setFocus(true);route('#/fiszki/sesja',true);updateStudyControls();el('studyNext').focus?.({preventScroll:true});}
  function closeFocus(){pauseStudySession();setFocus(false);route('#/fiszki');updateStudyControls();el('resumeStudy').focus?.({preventScroll:true});}
  function tabChanged(id){
    if(id==='study'){route(focused?'#/fiszki/sesja':'#/fiszki');return;}
    if(focused || window.location?.hash?.startsWith('#/fiszki')){pauseStudySession();setFocus(false);route('#/'+id);}
  }
  function syncRoute(){
    const hash=window.location?.hash || '';
    if(!available())return;
    if(hash==='#/fiszki/sesja' && hasSession()){setFocus(true);if(typeof tab==='function')tab('study');updateStudyControls();return;}
    if(focused || hash.startsWith('#/fiszki')){pauseStudySession();setFocus(false);const id=hash.startsWith('#/fiszki')?'study':['learning','games','tasks','progress','folders','words'].find(id=>hash==='#/'+id) || 'learning';if(typeof tab==='function')tab(id);updateStudyControls();}
  }
  function paintCard(card){
    const toTarget=direction==='toTarget';
    el('studyPrompt').textContent=toTarget ? card.translation : card.word;el('studyPrompt').lang=toTarget ? 'pl' : languageInfo[card.lang]?.code || 'en';
    el('studyAnswerText').textContent=toTarget ? card.word : card.translation;el('studyAnswerText').lang=toTarget ? languageInfo[card.lang]?.code || 'en' : 'pl';
    el('studyPromptReading').textContent=card.reading || '';el('studyPromptReading').hidden=toTarget || card.lang!=='Japanese' || !card.reading || !el('studyReading').checked;
    el('studyAnswerReading').textContent=card.reading || '';el('studyAnswerReading').hidden=!toTarget || card.lang!=='Japanese' || !card.reading;
  }
  function showHistory(){
    const item=cardHistory[historyIndex];if(!item)return;
    paintCard(item.card);el('studyAnswer').hidden=false;el('revealStudy').hidden=true;el('knowStudyCard').hidden=true;el('retryStudyCard').hidden=true;
    el('studyPhaseLabel').textContent='Poprzednia fiszka';el('studyProgress').textContent='Podgląd '+(historyIndex+1)+' / '+cardHistory.length+' · Twoja ocena: '+(item.known?'Umiem':'Nie umiem');
    el('studyPromptLabel').textContent='Podgląd wcześniejszej fiszki';setNotice('Przeglądasz wcześniejszą fiszkę. „Następny” wróci do bieżącej — podgląd nie zmienia zapisanych ocen.');updateStudyControls();
  }
  function previous(){if(!active || busy || paused || !cardHistory.length)return;historyIndex=historyIndex===null?cardHistory.length-1:Math.max(0,historyIndex-1);showHistory();}
  async function next(){
    if(!available() || busy || !active || paused)return;
    if(historyIndex!==null){historyIndex++;if(historyIndex<cardHistory.length)showHistory();else{historyIndex=null;renderCard(true);}return;}
    if(!revealed){reveal();return;}
    if(pendingRating===null){setNotice('Wybierz „Umiem” lub „Nie umiem”, a potem kliknij „Następny” albo naciśnij spację lub Enter.');return;}
    await markCard(pendingRating);
  }
  function selectRating(known){
    if(!available() || busy || !active || paused || historyIndex!==null || !revealed)return;
    pendingRating=known;updateStudyControls();setNotice('Wybrano „'+(known?'Umiem':'Nie umiem')+'”. Przejdź dalej przyciskiem „Następny”, spacją lub Enterem.');el('studyNext').focus?.({preventScroll:true});
  }

  function stopTicker() {if(ticker!==null) clearInterval(ticker);ticker=null;}
  function elapsed() {return elapsedMs+(runningSince===null ? 0 : Math.max(0,Date.now()-runningSince));}
  function settleClock() {elapsedMs=elapsed();runningSince=null;}
  function formatTime(ms) {const seconds=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
  function learnedCount() {return [...training.values()].filter(Boolean).length;}
  function confirmedCount() {return [...verified.values()].filter(Boolean).length;}
  function updateTimer() {
    const used=elapsed();
    el('studyTimerLabel').textContent=phase==='verify' ? 'Czas weryfikacji' : phase==='review' ? 'Czas powtórki' : budgetMs ? 'Pozostały czas nauki' : 'Czas nauki';
    el('studyTimerValue').textContent=formatTime(phase==='verify' ? used-learningElapsedMs : budgetMs ? budgetMs-used : used);
    el('pauseStudy').textContent=paused ? 'Wznów' : 'Pauza';
    if(active && budgetMs && used>=budgetMs && !busy){if(pendingRating!==null && revealed)void markCard(pendingRating,false);if(active && phase==='learn')beginVerification('Czas nauki minął.');else if(active && phase==='review' && !busy)void saveResults();}
  }
  function startClock() {
    if(document.hidden) {paused=true;runningSince=null;}else {paused=false;runningSince=Date.now();}
    stopTicker();ticker=setInterval(updateTimer,250);updateTimer();
  }
  function scopeOptions() {return {scope:el('studyScope').value,language:el('studyLanguage').value,folder:el('studyFolder').value,from:el('studyDateFrom').value,to:el('studyDateTo').value};}
  function selectedWords() {
    let words=scope.select(library.words,progress,scopeOptions());
    if(window.filterLearningWords)words=window.filterLearningWords(words,progress);
    const mode=el('studyMode').value;
    return words.filter(w=>mode==='learn' ? window.TooweeSRS.category(progress.get(w.id))==='learn' : mode==='review' ? window.TooweeSRS.category(progress.get(w.id))==='review' : true);
  }
  function updateSettings() {
    const value=el('studyScope').value;
    el('studySetField').hidden=value!=='sets';el('studyDateFromField').hidden=value!=='dates';el('studyDateToField').hidden=value!=='dates';
    el('studyCustomTimeField').hidden=el('studyMinutes').value!=='custom';
    const hints={all:'Wszystkie słówka w wybranym języku.',today:'Słówka, dla których nadszedł termin powtórki. Nowe słówka nie należą do tego zakresu.',week:'Słówka dodane od poniedziałku tego tygodnia.',dates:'Wybierz daty dodania słówek. Obie daty są wliczone do zakresu.',sets:'Wybierz zestaw dostępny na Twoim koncie.'};
    el('studyScopeHint').textContent=hints[value]+(el('studyMode').value==='review' ? ' Powtórka obejmuje wyłącznie słówka z terminem na teraz lub zaległe.' : el('studyMode').value==='learn' ? ' Nauka obejmuje nowe i nieopanowane słówka.' : ' Dodatkowe ćwiczenie przed terminem nie podnosi etapu.');
    const select=el('studyDirection');
    if(select.options?.length>=2) {select.options[0].textContent='Polski → '+(languageInfo[activeLanguage]?.target || 'język obcy');select.options[1].textContent=(languageInfo[activeLanguage]?.name || 'Język obcy')+' → polski';}
  }
  function resetStudy() {
    if(focused){setFocus(false);route('#/fiszki');}
    pendingRating=null;cardHistory=[];historyIndex=null;
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
    for(const id of ['revealStudy','knowStudyCard','retryStudyCard'])el(id).disabled=disabled || !active || paused || !['learn','verify','review'].includes(phase);
    for(const id of settings)el(id).disabled=busy;
    el('studyMode').disabled=busy || Boolean(window.getLearningContext?.());
    el('pauseStudy').disabled=disabled || !active || !['learn','verify','review'].includes(phase);
    el('retryStudySave').disabled=disabled;
    el('studyPrevious').disabled=disabled || !active || paused || !cardHistory.length || historyIndex===0;
    el('studyNext').disabled=disabled || !active || paused;
    el('studyNext').textContent='Następny →';
    el('closeStudyFocus').disabled=busy;
    el('resumeStudy').hidden=!hasSession() || focused;el('resumeStudy').disabled=busy;
    for(const [id,value] of [['knowStudyCard',true],['retryStudyCard',false]]){el(id).classList.toggle('selected-rating',historyIndex===null && pendingRating===value);el(id).setAttribute('aria-pressed',String(historyIndex===null && pendingRating===value));}

    el('studyCard').hidden=paused;el('studyActionRow').hidden=paused;
    el('studyCard').draggable=historyIndex===null && active && revealed && !paused && !disabled && ['learn','verify','review'].includes(phase);
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
    const all=library.words.filter(w=>w.lang===activeLanguage),due=all.filter(w=>window.TooweeSRS.category(progress.get(w.id))==='review').length,unseen=all.filter(w=>!progress.has(w.id)).length;
    el('studyDueSummary').textContent=progressLoaded ? 'Zapisany postęp: do powtórki teraz '+due+' • niećwiczone '+unseen+' • do ponownej nauki '+all.filter(w=>progress.get(w.id)?.stage===0).length+' • zaplanowane na później '+all.filter(w=>progress.get(w.id)?.stage>0 && !window.TooweeSRS.isDue(progress.get(w.id))).length+'.' : 'Rozpocznij naukę, aby wczytać zapisany postęp.';
  }
  async function loadProgress(snapshot) {
    const result=new Map();for(let start=0;;start+=500){const {data,error}=await snapshot.client.from('vocabulary_progress').select('*').eq('owner_id',snapshot.userId).order('word_id').range(start,start+499);if(error)throw error;data.forEach(p=>result.set(p.word_id,p));if(data.length<500)return result;}
  }
  function renderCard(preserve=false) {
    const card=queue[0];if(!card)return;if(!preserve){revealed=false;pendingRating=null;}historyIndex=null;
    el('studySummary').hidden=true;el('studySession').hidden=false;el('studyAnswer').hidden=true;el('revealStudy').hidden=false;el('knowStudyCard').hidden=true;el('retryStudyCard').hidden=true;
    const toTarget=direction==='toTarget';
    el('studyPhaseLabel').textContent=phase==='verify' ? 'Końcowa weryfikacja' : phase==='review' ? 'Powtórka' : 'Nauka';
    paintCard(card);
    el('studyPromptLabel').textContent=phase==='verify' ? 'Sprawdź, czy nadal pamiętasz' : toTarget ? 'Przetłumacz na '+(languageInfo[card.lang]?.target || 'język obcy') : 'Przetłumacz na polski';
    el('studyAnswer').hidden=!revealed;el('revealStudy').hidden=revealed;el('knowStudyCard').hidden=!revealed;el('retryStudyCard').hidden=!revealed;
    el('studyProgress').textContent=['verify','review'].includes(phase) ? 'Sprawdzono: '+verified.size+' z '+verificationTotal+' • Potwierdzone „Umiem”: '+confirmedCount()+' • Pozostało: '+queue.length : 'Wstępnie umiem: '+learnedCount()+' z '+sessionWords.length+' • W tej porcji pozostało: '+queue.length+' • Próby: '+attempts;
    el('studyProgressBar').max=phase==='verify' ? verificationTotal : sessionWords.length;el('studyProgressBar').value=['verify','review'].includes(phase) ? verified.size : learnedCount();
    updateStudyControls();setNotice(paused ? 'Nauka wstrzymana. Kliknij „Wznów”.' : phase==='review' ? 'Przypomnij sobie odpowiedź samodzielnie. Jedna ocena wystarczy; trudne słówka wrócą do nauki.' : phase==='verify' ? 'To druga próba. Oceń szczerze, czy samodzielnie przypominasz sobie odpowiedź. Wynik tej rundy zapisze się w systemie.' : 'Uczysz się. „Nie umiem” wróci w tej samej sesji; „Umiem” sprawdzimy jeszcze na koniec.');
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
      sessionKind=el('studyMode').value;
      if(sessionKind==='review')rows.sort((a,b)=>new Date(progress.get(a.id).due_at)-new Date(progress.get(b.id).due_at));else rows=shuffle(rows);
      if(!rows.length){renderPiles();setNotice('Brak słówek pasujących do zakresu i trybu nauki.');return;}
      direction=el('studyDirection').value;portionSize=Number(el('studyCount').value);if(![10,15,20,25].includes(portionSize))portionSize=10;
      pool=[...rows];sessionOwner=snapshot.userId;sessionLanguage=activeLanguage;phase=sessionKind==='review' ? 'review' : 'learn';active=true;addPortion();if(phase==='review')verificationTotal=sessionWords.length;
      startClock();el('studyTimer').hidden=false;renderCard();openFocus();
    }catch(error){if(current===version)setNotice(['PGRST205','42P01'].includes(error.code)?'Uruchom spaced_repetition_setup.sql w Supabase.':'Nie udało się wczytać powtórek. '+(error.message||''));}
    finally{if(current===version){busy=false;updateStudyControls();}}
  }
  function beginVerification(reason='Część do nauki ukończona.') {
    if(!active||phase!=='learn'||busy)return;
    pendingRating=null;cardHistory=[];historyIndex=null;
    settleClock();learningElapsedMs=elapsedMs;stopTicker();budgetMs=0;paused=false;phase='verify';
    queue=shuffle(sessionWords.filter(w=>training.get(w.id)===true));verificationTotal=queue.length;verificationIds=new Set(queue.map(w=>w.id));revealed=false;
    el('studyTimeUp').hidden=true;
    if(!queue.length){void saveResults();return;}
    startClock();renderCard();setNotice(reason+' Teraz od początku sprawdzisz '+verificationTotal+' słówek oznaczonych „Umiem”. Weryfikacja nie ma limitu czasu.');
  }
  function reveal() {
    if(!available()||busy||!active||paused||!queue.length||revealed||historyIndex!==null)return;
    const currentPhase=phase;updateTimer();if(phase!==currentPhase||!queue.length)return;
    revealed=true;el('studyAnswer').hidden=false;el('revealStudy').hidden=true;el('knowStudyCard').hidden=false;el('retryStudyCard').hidden=false;updateStudyControls();
    setNotice(['verify','review'].includes(phase)?'Czy pamiętasz bez podpowiedzi? Ta ocena trafi do harmonogramu powtórek.':'Przeciągnij do wybranej przegródki lub użyj przycisków.');
  }
  async function markCard(isKnown,checkTime=true) {
    if(!available()||busy||!active||(paused && checkTime)||!revealed||!queue.length||!['learn','verify','review'].includes(phase))return;
    const oldPhase=phase;if(checkTime)updateTimer();if(oldPhase!==phase)return;
    const card=queue.shift();cardHistory.push({card,known:isKnown,phase});historyIndex=null;pendingRating=null;revealed=false;attempts++;
    if(phase==='review'){
      training.set(card.id,isKnown);verified.set(card.id,isKnown);renderPiles();
      if(queue.length)renderCard();
      else if(sessionGoalMs&&elapsed()<sessionGoalMs&&pool.length){addPortion();verificationTotal=sessionWords.length;renderCard();}
      else await saveResults();
    }else if(phase==='learn'){
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
    const completed=sessionKind==='review' ? sessionWords.length>0 && sessionWords.every(w=>verified.has(w.id)) : verificationTotal>0&&[...verificationIds].every(id=>verified.has(id));
    if(!completed&&!(sessionGoalMs&&learningElapsedMs>=sessionGoalMs))return;
    challengeReported=true;
    if(window.recordStudyChallenge)void window.recordStudyChallenge({userId:sessionOwner,language:sessionLanguage,review_count:attempts,study_seconds:Math.min(86400,Math.floor(elapsedMs/1000)),goal_seconds:Math.floor(sessionGoalMs/1000),completed_all:completed});
  }
  async function saveResults() {
    if(busy||!available()||account?.userId!==sessionOwner)return;
    settleClock();if(sessionKind==='review')learningElapsedMs=elapsedMs;stopTicker();paused=false;active=false;phase='saving';busy=true;el('studySession').hidden=true;el('studyTimer').hidden=true;el('studySummary').hidden=false;el('retryStudySave').hidden=true;updateStudyControls();
    el('studySummaryText').textContent='Zapisywanie końcowej weryfikacji…';const current=version,snapshot={...account};
    const reviewed=sessionWords.filter(w=>training.has(w.id));
    const payload=reviewed.map(w=>({owner_id:sessionOwner,word_id:w.id,...window.TooweeSRS.next(originalProgress.get(w.id),verified.get(w.id)===true)}));
    try{
      if(payload.length){const {data,error}=await snapshot.client.from('vocabulary_progress').upsert(payload,{onConflict:'owner_id,word_id'}).select('*');if(error)throw error;if(current!==version||account?.userId!==sessionOwner)return;data.forEach(p=>progress.set(p.word_id,p));}
      if(current!==version)return;phase='finished';
      const yes=confirmedCount(),no=reviewed.length-yes,untouched=sessionWords.length-reviewed.length;
      el('studySummaryText').textContent=(sessionKind==='review'?'Powtórka: umiem ':'Końcowa weryfikacja: umiem ')+yes+' • do ponownej nauki '+no+(untouched?' • nieprzećwiczone '+untouched:'')+'. Czas nauki: '+formatTime(learningElapsedMs)+', weryfikacji: '+formatTime(elapsedMs-learningElapsedMs)+'. '+(payload.length?'Wynik i terminy powtórek zapisane.':'Nie oceniono żadnej fiszki.');
      setNotice(sessionKind==='review'?'Powtórka zapisana. „Nie umiem” wraca do nauki. Listy poniżej zachowują Twój wynik.':'Listy poniżej pokazują wynik końcowej weryfikacji.');
      // Cards which did not reach verification remain due for another practice.
      reviewed.forEach(w=>{if(!verified.has(w.id))verified.set(w.id,false);});renderPiles();reportChallenge();
      if(window.setLearningProgress)window.setLearningProgress([...progress.values()]);
      if(window.loadProgressDashboard)void window.loadProgressDashboard();
    }catch(error){if(current===version){phase='save-error';el('studySummaryText').textContent='Weryfikacja gotowa, ale wynik nie został zapisany. Zachowaliśmy go na tej stronie. Ponów zapis. '+(error.message||'');el('retryStudySave').hidden=false;}}
    finally{if(current===version){busy=false;updateStudyControls();}}
  }
  function pauseStudySession() {
    if(!active||paused||busy)return;settleClock();paused=true;updateTimer();if(active && !paused){settleClock();paused=true;}updateStudyControls();setNotice('Sesja wstrzymana. Kliknij „Wznów”, aby kontynuować.');
  }
  el('startStudy').onclick=startStudy;el('revealStudy').onclick=reveal;el('knowStudyCard').onclick=()=>selectRating(true);el('retryStudyCard').onclick=()=>selectRating(false);
  el('studyPrevious').onclick=previous;el('studyNext').onclick=next;el('closeStudyFocus').onclick=closeFocus;el('resumeStudy').onclick=openFocus;
  el('retryStudySave').onclick=()=>{if(phase==='save-error')void saveResults();};
  el('pauseStudy').onclick=()=>{if(!active||busy)return;if(paused){paused=false;runningSince=Date.now();updateTimer();updateStudyControls();setNotice('Sesja wznowiona.');}else pauseStudySession();};
  el('continueStudy').onclick=()=>{};el('finishStudy').onclick=()=>{};
  el('studyCard').addEventListener('dragstart',event=>{if(!active||!revealed||busy||paused||historyIndex!==null||!available()||!queue.length){event.preventDefault();return;}event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',queue[0].id);});
  for(const id of ['unknownPile','knownPile']){const pile=el(id);pile.addEventListener('dragover',event=>{if(active&&revealed&&!busy&&!paused&&available()){event.preventDefault();pile.classList.add('drag-over');}});pile.addEventListener('dragleave',()=>pile.classList.remove('drag-over'));pile.addEventListener('drop',event=>{event.preventDefault();pile.classList.remove('drag-over');if(event.dataTransfer.getData('text/plain')===queue[0]?.id)selectRating(id==='knownPile');});}
  el('studyCard').addEventListener('dragend',()=>{for(const id of ['unknownPile','knownPile'])el(id).classList.remove('drag-over');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseStudySession();});
  document.addEventListener('keydown',event=>{
    if(!focused || !active || busy || paused || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target?.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
    if(!['Enter',' ','Spacebar'].includes(event.key))return;
    const target=event.target;if(target?.tagName==='BUTTON' && !['studyNext','studyCard'].includes(target.id))return;
    event.preventDefault();void next();
  });
  window.addEventListener?.('popstate',syncRoute);window.addEventListener?.('hashchange',syncRoute);
  window.onStudyTabChange=tabChanged;window.openStudyFocus=openFocus;window.isStudyFocus=()=>focused;
  for(const id of settings)el(id).onchange=resetStudy;
  window.resetStudy=resetStudy;window.updateStudyControls=updateStudyControls;window.updateStudyFolders=updateStudyFolders;window.pauseStudySession=pauseStudySession;
  updateStudyFolders();resetStudy();
})();
