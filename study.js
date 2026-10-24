'use strict';
(() => {
  let queue=[],sessionWords=[],revealed=false,known=0,attempts=0;
  let direction='toTarget',busy=false,version=0,progressOwner=null;
  let progress=new Map(),progressLoaded=false;
  let active=false,paused=false,expired=false,elapsedMs=0,runningSince=null,budgetMs=0,ticker=null;
  const el=id=>document.getElementById(id);
  const available=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const settings=['studyScope','studyFolder','studyLanguage','studyDirection','studyCount','studyReading','studyMode','studyDateFrom','studyDateTo','studyMinutes','studyCustomMinutes'];
  const scope=window.TooweeStudyScope;
  function setNotice(text) {el('studyNotice').textContent=text;}
  function stopTicker() {if(ticker!==null) clearInterval(ticker);ticker=null;}
  function elapsed() {return elapsedMs+(runningSince===null ? 0 : Math.max(0,Date.now()-runningSince));}
  function settleClock() {elapsedMs=elapsed();runningSince=null;}
  function formatTime(milliseconds) {
    const seconds=Math.max(0,Math.ceil(milliseconds/1000));
    return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  }
  function updateTimer() {
    const used=elapsed();
    el('studyTimerLabel').textContent=budgetMs ? 'Pozostały czas' : 'Czas nauki';
    el('studyTimerValue').textContent=formatTime(budgetMs ? budgetMs-used : used);
    el('pauseStudy').textContent=paused ? 'Wznów' : 'Pauza';
    if(active && budgetMs && used>=budgetMs && !expired) {
      settleClock();paused=true;expired=true;stopTicker();
      if(!busy) showTimeUp();
    }
  }
  function startClock() {
    if(document.hidden) {paused=true;runningSince=null;} else {paused=false;runningSince=Date.now();}
    stopTicker();ticker=setInterval(updateTimer,250);updateTimer();
  }
  function scopeOptions() {
    return {scope:el('studyScope').value,language:el('studyLanguage').value,folder:el('studyFolder').value,from:el('studyDateFrom').value,to:el('studyDateTo').value};
  }
  function selectedWords() {return scope.select(library.words,progress,scopeOptions());}
  function updateSettings() {
    const value=el('studyScope').value;
    el('studySetField').hidden=value!=='sets';
    el('studyDateFromField').hidden=value!=='dates';el('studyDateToField').hidden=value!=='dates';
    el('studyCustomTimeField').hidden=el('studyMinutes').value!=='custom';
    const hints={all:'Wszystkie słówka w wybranym języku.',today:'Słówka, dla których nadszedł termin powtórki. Nowe, niećwiczone słówka nie należą do tego zakresu.',week:'Słówka dodane od poniedziałku tego tygodnia.',dates:'Wybierz daty dodania słówek. Obie daty są wliczone do zakresu.',sets:'Wybierz zestaw dostępny na Twoim koncie.'};
    el('studyScopeHint').textContent=hints[value]+(el('studyMode').value==='due' ? ' Tryb „Na dziś + nowe” dodatkowo pomija słówka zaplanowane na później.' : '');
    const foreign=languageInfo[activeLanguage]?.target || 'język obcy';
    const select=el('studyDirection');
    if(select.options?.length>=2) {select.options[0].textContent='Polski → '+foreign;select.options[1].textContent=(languageInfo[activeLanguage]?.name || 'Język obcy')+' → polski';}
  }
  function resetStudy() {
    ++version;busy=false;active=false;paused=false;expired=false;stopTicker();elapsedMs=0;runningSince=null;
    queue=[];sessionWords=[];known=0;attempts=0;revealed=false;
    if(progressOwner!==account?.userId) {progress.clear();progressLoaded=false;progressOwner=null;}
    for(const id of ['studySession','studySummary','studyTimer','studyTimeUp']) el(id).hidden=true;
    for(const id of ['studyPrompt','studyPromptReading','studyAnswerText','studyAnswerReading','studyProgress','studySummaryText','studyTimeUpText']) el(id).textContent='';
    el('studyAnswer').hidden=true;el('studyCard').draggable=false;el('repeatStudy').hidden=true;
    updateSettings();updateStudyControls();renderPiles();
    setNotice(available() ? 'Wybierz zakres, liczbę fiszek i czas nauki.' : 'Zaloguj się i wczytaj bibliotekę, aby rozpocząć.');
  }
  function updateStudyControls() {
    const disabled=!available() || busy;
    el('startStudy').disabled=disabled;
    for(const id of ['revealStudy','knowStudyCard','retryStudyCard']) el(id).disabled=disabled || !active || paused || expired;
    for(const id of settings) el(id).disabled=busy;
    el('pauseStudy').disabled=disabled || !active || expired;
    el('continueStudy').disabled=disabled || !expired;
    el('finishStudy').disabled=disabled || !expired;
    el('studyCard').hidden=paused;
    el('studyActionRow').hidden=paused;
    el('studyCard').draggable=active && revealed && !paused && !expired && !disabled;
  }
  function updateStudyFolders() {
    const chosen=el('studyFolder').value;
    el('studyFolder').replaceChildren(new Option('Wybierz zestaw',''));
    for(const folder of activeFolders()) el('studyFolder').add(new Option(folder.name,folder.id));
    el('studyFolder').value=activeFolders().some(f=>f.id===chosen) ? chosen : '';
    updateSettings();renderPiles();
  }
  function shuffle(rows) {
    const result=[...rows];
    for(let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function renderPiles() {
    const rows=sessionWords.length ? sessionWords : selectedWords();
    const groups=[rows.filter(w=>progress.has(w.id) && progress.get(w.id).stage===0),rows.filter(w=>(progress.get(w.id)?.stage || 0)>0)];
    for(let i=0;i<2;i++) {
      const prefix=i===0 ? 'unknownPile' : 'knownPile';el(prefix+'Count').textContent=progressLoaded ? groups[i].length : '—';el(prefix+'Words').replaceChildren();
      for(const word of groups[i]) {const li=document.createElement('li');li.textContent=word.word+(word.reading ? ' ('+word.reading+')' : '');el(prefix+'Words').append(li);}
    }
    const rowsInLanguage=library.words.filter(w=>w.lang===activeLanguage);
    const due=rowsInLanguage.filter(w=>progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id))).length;
    const unseen=rowsInLanguage.filter(w=>!progress.has(w.id)).length;
    el('studyDueSummary').textContent=progressLoaded
      ? 'W tym języku: do powtórki teraz '+due+' • niećwiczone '+unseen+' • zaplanowane na później '+(rowsInLanguage.length-due-unseen)+'.'
      : 'Rozpocznij naukę, aby wczytać zapisany postęp. Nowe słówka nie należą jeszcze do żadnej przegródki.';
  }
  async function loadProgress(snapshot) {
    const result=new Map();
    for(let start=0;;start+=500) {
      const {data,error}=await snapshot.client.from('vocabulary_progress').select('*').eq('owner_id',snapshot.userId).order('word_id').range(start,start+499);
      if(error) throw error;data.forEach(p=>result.set(p.word_id,p));if(data.length<500) return result;
    }
  }
  function renderCard() {
    const card=queue[0];revealed=false;
    el('studySummary').hidden=true;el('studySession').hidden=false;
    el('studyAnswer').hidden=true;el('revealStudy').hidden=false;el('knowStudyCard').hidden=true;el('retryStudyCard').hidden=true;
    const toTarget=direction==='toTarget';
    el('studyPrompt').textContent=toTarget ? card.translation : card.word;
    el('studyPrompt').lang=toTarget ? 'pl' : languageInfo[card.lang]?.code || 'en';
    el('studyAnswerText').textContent=toTarget ? card.word : card.translation;
    el('studyAnswerText').lang=toTarget ? languageInfo[card.lang]?.code || 'en' : 'pl';
    el('studyPromptLabel').textContent=toTarget ? 'Przetłumacz na '+(languageInfo[card.lang]?.target || 'język obcy') : 'Przetłumacz na polski';
    el('studyPromptReading').textContent=card.reading || '';el('studyPromptReading').hidden=toTarget || card.lang!=='Japanese' || !card.reading || !el('studyReading').checked;
    el('studyAnswerReading').textContent=card.reading || '';el('studyAnswerReading').hidden=!toTarget || card.lang!=='Japanese' || !card.reading;
    el('studyProgress').textContent='Umiem: '+known+' z '+sessionWords.length+' • Pozostało: '+queue.length+' • Próby: '+attempts;
    el('studyProgressBar').max=sessionWords.length;el('studyProgressBar').value=known;
    updateStudyControls();setNotice(paused ? 'Nauka wstrzymana. Kliknij „Wznów”.' : 'Przypomnij sobie odpowiedź, a potem ją odsłoń.');
  }
  function getBudget() {
    const custom=el('studyMinutes').value==='custom';const minutes=Number(custom ? el('studyCustomMinutes').value : el('studyMinutes').value);
    if(!Number.isInteger(minutes) || minutes<0 || minutes>180 || (custom && minutes<1)) return null;
    return minutes*60000;
  }
  function validateSettings() {
    if(el('studyScope').value==='sets' && !el('studyFolder').value) return 'Wybierz zestaw.';
    if(el('studyScope').value==='dates') {
      const from=scope.localDate(el('studyDateFrom').value),to=scope.localDate(el('studyDateTo').value);
      if(!from || !to) return 'Wybierz obie daty dodania słówek.';
      if(from>to) return 'Data „od” nie może być późniejsza niż data „do”.';
    }
    if(getBudget()===null) return 'Wpisz własny czas: od 1 do 180 pełnych minut.';
    return '';
  }
  async function startStudy() {
    if(!available() || busy) return;
    const invalid=validateSettings();if(invalid) {setNotice(invalid);return;}
    if(active && !confirm('Rozpocząć nową sesję? Dotychczasowe oceny są już zapisane.')) return;
    resetStudy();budgetMs=getBudget();const current=version,snapshot={...account};busy=true;updateStudyControls();setNotice('Wczytywanie zapisanych powtórek…');
    try {
      const loaded=await loadProgress(snapshot);if(current!==version || account?.userId!==snapshot.userId) return;
      progress=loaded;progressOwner=snapshot.userId;progressLoaded=true;
      let rows=selectedWords();
      if(el('studyMode').value==='due') {
        const due=rows.filter(w=>progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id))).sort((a,b)=>new Date(progress.get(a.id).due_at)-new Date(progress.get(b.id).due_at));
        rows=[...due,...shuffle(rows.filter(w=>!progress.has(w.id)))];
      } else rows=shuffle(rows);
      renderPiles();
      if(!rows.length) {setNotice('Brak słówek pasujących do wybranego zakresu i trybu nauki. Zmień zakres, daty lub tryb.');return;}
      direction=el('studyDirection').value;const count=Number(el('studyCount').value);
      sessionWords=rows.slice(0,[10,15,20,25].includes(count) ? count : 10);queue=[...sessionWords];active=true;
      startClock();el('studyTimer').hidden=false;renderCard();renderPiles();
    } catch(error) {
      if(current===version) setNotice(['PGRST205','42P01'].includes(error.code) ? 'System powtórek wymaga jednorazowej konfiguracji: uruchom spaced_repetition_setup.sql w Supabase.' : 'Nie udało się wczytać powtórek. '+(error.message || 'Spróbuj ponownie.'));
    } finally {if(current===version) {busy=false;updateStudyControls();}}
  }
  function reveal() {
    if(!available() || busy || !active || paused || expired || !queue.length || revealed) return;
    updateTimer();if(expired) return;
    revealed=true;el('studyAnswer').hidden=false;el('revealStudy').hidden=true;el('knowStudyCard').hidden=false;el('retryStudyCard').hidden=false;
    updateStudyControls();setNotice('Przeciągnij fiszkę do „Umiem” lub „Nie umiem”, albo użyj przycisków.');
  }
  function finishSession(completed) {
    settleClock();stopTicker();active=false;paused=false;expired=false;
    el('studySession').hidden=true;el('studyTimeUp').hidden=true;el('studySummary').hidden=false;el('studyTimer').hidden=true;
    el('studySummaryText').textContent=(completed ? 'Cały wybrany zestaw opanowany! ' : 'Sesja zakończona. ')+
      'Umiem: '+known+' z '+sessionWords.length+'. Pozostało: '+queue.length+'. Czas nauki: '+formatTime(elapsedMs)+'. Postęp zapisany na Twoim koncie.';
    el('repeatStudy').hidden=true;updateStudyControls();setNotice('System zachował terminy kolejnych powtórek.');
  }
  function showTimeUp() {
    if(!active || !expired || busy) return;
    el('studySession').hidden=true;el('studyTimeUp').hidden=false;
    el('studyTimeUpText').textContent='Umiem: '+known+' z '+sessionWords.length+'. Do przećwiczenia zostało '+queue.length+' słówek. Zakończ lub kontynuuj ten sam zestaw bez limitu czasu.';
    updateStudyControls();setNotice('Minął zaplanowany czas nauki.');
  }
  async function markCard(isKnown) {
    if(!available() || busy || !active || paused || expired || !revealed || !queue.length) return;
    updateTimer();if(expired) return;
    const card=queue[0],snapshot={...account},current=version;
    const next=window.TooweeSRS.next(progress.get(card.id),isKnown);busy=true;updateStudyControls();setNotice('Zapisywanie postępu…');
    try {
      const {data,error}=await snapshot.client.from('vocabulary_progress').upsert({owner_id:snapshot.userId,word_id:card.id,...next},{onConflict:'owner_id,word_id'}).select('*').single();
      if(error) throw error;if(current!==version || account?.userId!==snapshot.userId) return;
      progress.set(card.id,data);revealed=false;attempts++;queue.shift();
      if(isKnown) known++;else queue.push(card);
      renderPiles();
      if(!queue.length) finishSession(true);else if(!expired) renderCard();
    } catch(error) {if(current===version) setNotice('Nie zapisano oceny. Fiszka pozostaje na miejscu. Spróbuj ponownie. '+(error.message || ''));}
    finally {if(current===version) {busy=false;updateStudyControls();if(expired) showTimeUp();}}
  }
  el('startStudy').onclick=startStudy;el('revealStudy').onclick=reveal;
  el('knowStudyCard').onclick=()=>markCard(true);el('retryStudyCard').onclick=()=>markCard(false);
  el('pauseStudy').onclick=()=>{
    if(!active || busy || expired) return;
    if(paused) {paused=false;runningSince=Date.now();} else {settleClock();paused=true;}
    updateTimer();updateStudyControls();setNotice(paused ? 'Nauka wstrzymana. Kliknij „Wznów”.' : 'Nauka wznowiona.');
  };
  el('continueStudy').onclick=()=>{
    if(!active || busy || !expired) return;
    expired=false;budgetMs=0;el('studyTimeUp').hidden=true;startClock();renderCard();
  };
  el('finishStudy').onclick=()=>{if(active && !busy && expired) finishSession(false);};
  el('studyCard').addEventListener('dragstart',event=>{
    if(!active || !revealed || busy || paused || expired || !available() || !queue.length) {event.preventDefault();return;}
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',queue[0].id);
  });
  for(const id of ['unknownPile','knownPile']) {
    const pile=el(id);
    pile.addEventListener('dragover',event=>{if(active && revealed && !busy && !paused && !expired && available()) {event.preventDefault();pile.classList.add('drag-over');}});
    pile.addEventListener('dragleave',()=>pile.classList.remove('drag-over'));
    pile.addEventListener('drop',event=>{event.preventDefault();pile.classList.remove('drag-over');if(event.dataTransfer.getData('text/plain')===queue[0]?.id) void markCard(id==='knownPile');});
  }
  el('studyCard').addEventListener('dragend',()=>{for(const id of ['unknownPile','knownPile'])el(id).classList.remove('drag-over');});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && active && !paused && !expired) {settleClock();paused=true;updateTimer();updateStudyControls();setNotice('Pauza po opuszczeniu karty. Kliknij „Wznów”, aby kontynuować.');}
  });
  for(const id of settings) el(id).onchange=resetStudy;
  window.resetStudy=resetStudy;window.updateStudyControls=updateStudyControls;window.updateStudyFolders=updateStudyFolders;
  updateStudyFolders();resetStudy();
})();
