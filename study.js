'use strict';
(() => {
  let cards = [], missed = [], position = 0, revealed = false, known = 0, round = 1;
  let direction = 'toTarget', busy = false, version = 0, progressOwner = null;
  let progress = new Map();
  let progressLoaded = false;
  const el = id => document.getElementById(id);
  const available = () => ready && !saving && Boolean(account?.userId);
  const settings = ['studyFolder','studyLanguage','studyDirection','studyCount','studyReading','studyMode'];
  function setNotice(text) { el('studyNotice').textContent = text; }
  function resetStudy() {
    ++version;busy = false;
    cards = [];missed = [];position = 0;known = 0;revealed = false;round = 1;
    if (progressOwner !== account?.userId) { progress.clear();progressLoaded = false;progressOwner = null; }
    el('studySession').hidden = true;el('studySummary').hidden = true;
    for (const id of ['studyPrompt','studyPromptReading','studyAnswerText','studyAnswerReading','studyProgress','studySummaryText']) el(id).textContent = '';
    el('studyAnswer').hidden = true;el('studyCard').draggable = false;
    updateStudyControls();renderPiles();
  }
  function updateStudyControls() {
    const disabled = !available() || busy;
    for (const id of ['startStudy','revealStudy','knowStudyCard','retryStudyCard','repeatStudy']) el(id).disabled = disabled;
    for (const id of settings) el(id).disabled = busy;
    if (!available()) setNotice('Zaloguj się i wczytaj bibliotekę, aby rozpocząć.');
    else if (!busy && !cards.length) setNotice('Wybierz zestaw i rozpocznij naukę.');
  }
  function updateStudyFolders() {
    const chosen = el('studyFolder').value;
    el('studyFolder').replaceChildren(new Option('Wszystkie foldery',''));
    for (const folder of library.folders) el('studyFolder').add(new Option(folder.name,folder.id));
    el('studyFolder').value = library.folders.some(f=>f.id === chosen) ? chosen : '';
    renderPiles();
  }
  function shuffle(rows) {
    const result = [...rows];
    for (let i=result.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]; }
    return result;
  }
  function selectedWords() {
    return library.words.filter(w=>w.lang === el('studyLanguage').value && (!el('studyFolder').value || w.folder_id === el('studyFolder').value));
  }
  function renderPiles() {
    const rows = selectedWords();
    const grouped = [rows.filter(w=>progress.has(w.id) && progress.get(w.id).stage === 0),rows.filter(w=>(progress.get(w.id)?.stage || 0)>0)];
    for (let i=0;i<2;i++) {
      const prefix = i === 0 ? 'unknownPile' : 'knownPile';
      el(prefix+'Count').textContent = progressLoaded ? grouped[i].length : '—';
      el(prefix+'Words').replaceChildren();
      for (const word of grouped[i].slice(0,8)) {
        const li = document.createElement('li');li.textContent = word.word + (word.reading ? ' ('+word.reading+')' : '');
        el(prefix+'Words').append(li);
      }
      if (grouped[i].length>8) { const li=document.createElement('li');li.textContent='… i '+(grouped[i].length-8)+' kolejnych';el(prefix+'Words').append(li); }
    }
    const due = rows.filter(w=>progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id))).length;
    const unseen = rows.filter(w=>!progress.has(w.id)).length;
    el('studyDueSummary').textContent = progressLoaded
      ? 'W wybranym zestawie: do powtórki teraz '+due+' • nowe '+unseen+' • zaplanowane na później '+(rows.length-due-unseen)+'.'
      : 'Kliknij „Rozpocznij naukę”, aby wczytać zapisany postęp. Nowe słówka nie należą jeszcze do żadnej przegródki.';
  }
  async function loadProgress(snapshot) {
    const result = new Map();
    for (let start=0;;start+=500) {
      const {data,error} = await snapshot.client.from('vocabulary_progress').select('*').eq('owner_id',snapshot.userId).order('word_id').range(start,start+499);
      if (error) throw error;
      data.forEach(p=>result.set(p.word_id,p));
      if (data.length<500) return result;
    }
  }
  function renderCard() {
    const card = cards[position];revealed = false;
    el('studySummary').hidden = true;el('studySession').hidden = false;
    el('studyAnswer').hidden = true;el('revealStudy').hidden = false;
    el('knowStudyCard').hidden = true;el('retryStudyCard').hidden = true;el('studyCard').draggable = false;
    const toTarget = direction === 'toTarget';
    el('studyPrompt').textContent = toTarget ? card.translation : card.word;
    el('studyPrompt').lang = toTarget ? 'pl' : card.lang === 'Japanese' ? 'ja' : 'en';
    el('studyAnswerText').textContent = toTarget ? card.word : card.translation;
    el('studyAnswerText').lang = toTarget ? card.lang === 'Japanese' ? 'ja' : 'en' : 'pl';
    el('studyPromptLabel').textContent = toTarget ? 'Przetłumacz na '+(card.lang === 'Japanese' ? 'japoński' : 'angielski') : 'Przetłumacz na polski';
    el('studyPromptReading').textContent = card.reading || '';
    el('studyPromptReading').hidden = toTarget || card.lang !== 'Japanese' || !card.reading || !el('studyReading').checked;
    el('studyAnswerReading').textContent = card.reading || '';
    el('studyAnswerReading').hidden = !toTarget || card.lang !== 'Japanese' || !card.reading;
    el('studyProgress').textContent = 'Runda '+round+' • Fiszka '+(position+1)+' z '+cards.length+' • Umiem: '+known+' • Nie umiem: '+missed.length;
    el('studyProgressBar').max = cards.length;el('studyProgressBar').value = position;
    setNotice('Przypomnij sobie odpowiedź, a potem ją odsłoń.');
  }
  async function startStudy() {
    if (!available() || busy) return;
    resetStudy();const current = version;const snapshot = {...account};
    busy = true;updateStudyControls();setNotice('Wczytywanie zapisanych powtórek…');
    try {
      const loaded = await loadProgress(snapshot);
      if (current !== version || account?.userId !== snapshot.userId) return;
      progress = loaded;progressOwner = snapshot.userId;progressLoaded = true;
      let rows = selectedWords();
      if (el('studyMode').value === 'due') {
        const due = rows.filter(w=>progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id))).sort((a,b)=>new Date(progress.get(a.id).due_at)-new Date(progress.get(b.id).due_at));
        rows = [...due,...shuffle(rows.filter(w=>!progress.has(w.id)))];
      } else rows = shuffle(rows);
      renderPiles();
      if (!rows.length) {
        setNotice(selectedWords().length ? 'Na teraz wszystko powtórzone! Terminy zobaczysz poniżej. Możesz też wybrać tryb „Wszystkie słówka”.' : 'W tym zestawie nie ma słówek w wybranym języku.');
        return;
      }
      direction = el('studyDirection').value;
      const count = el('studyCount').value;
      cards = rows.slice(0,count === 'all' ? rows.length : Number(count));renderCard();
    } catch (error) {
      if (current !== version) return;
      setNotice(['PGRST205','42P01'].includes(error.code)
        ? 'System powtórek wymaga jednorazowej konfiguracji: uruchom spaced_repetition_setup.sql w Supabase. Słówka pozostają bez zmian.'
        : 'Nie udało się wczytać powtórek. '+(error.message || 'Sprawdź połączenie i spróbuj ponownie.'));
    } finally {
      if (current === version) { busy = false;const text=el('studyNotice').textContent;updateStudyControls();setNotice(text); }
    }
  }
  function reveal() {
    if (!available() || busy || !cards.length || position >= cards.length || revealed) return;
    revealed = true;el('studyAnswer').hidden = false;el('revealStudy').hidden = true;
    el('knowStudyCard').hidden = false;el('retryStudyCard').hidden = false;el('studyCard').draggable = true;
    setNotice('Przeciągnij fiszkę do „Umiem” lub „Nie umiem”, albo użyj przycisków.');
  }
  async function markCard(isKnown) {
    if (!available() || busy || !revealed || position >= cards.length) return;
    const card = cards[position];const snapshot = {...account};const current = version;
    const next = window.TooweeSRS.next(progress.get(card.id),isKnown);
    busy = true;el('studyCard').draggable = false;updateStudyControls();setNotice('Zapisywanie postępu…');
    try {
      const {data,error} = await snapshot.client.from('vocabulary_progress').upsert({owner_id:snapshot.userId,word_id:card.id,...next},{onConflict:'owner_id,word_id'}).select('*').single();
      if (error) throw error;
      if (current !== version || account?.userId !== snapshot.userId) return;
      progress.set(card.id,data);revealed = false;
      if (isKnown) known++;else missed.push(card);
      position++;renderPiles();
      if (position<cards.length) renderCard();
      else {
        el('studySession').hidden = true;el('studySummary').hidden = false;
        el('studySummaryText').textContent = 'Runda '+round+': umiem '+known+' z '+cards.length+'. Nie umiem: '+missed.length+'. Postęp zapisany na Twoim koncie.';
        el('repeatStudy').hidden = missed.length===0;
        setNotice('Powtórki zaplanowane. Trudniejsze słówka wrócą po 10 minutach; możesz je też przećwiczyć od razu.');
      }
    } catch (error) {
      if (current === version) {
        el('studyCard').draggable = true;
        setNotice('Nie zapisano oceny. Fiszka pozostaje na miejscu. Spróbuj ponownie. '+(error.message || ''));
      }
    } finally {
      if (current === version) {busy = false;const text=el('studyNotice').textContent;updateStudyControls();setNotice(text);}
    }
  }
  function repeatMissed() {
    if (!available() || busy || !missed.length || position<cards.length) return;
    cards=shuffle(missed);missed=[];position=0;known=0;round++;renderCard();
  }
  el('startStudy').onclick=startStudy;el('revealStudy').onclick=reveal;
  el('knowStudyCard').onclick=()=>markCard(true);el('retryStudyCard').onclick=()=>markCard(false);
  el('repeatStudy').onclick=repeatMissed;
  el('studyCard').addEventListener('dragstart',event=>{
    if (!revealed || busy || !available() || position>=cards.length) {event.preventDefault();return;}
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',cards[position].id);
  });
  for (const id of ['unknownPile','knownPile']) {
    const pile=el(id);
    pile.addEventListener('dragover',event=>{if (revealed && !busy && available()) {event.preventDefault();pile.classList.add('drag-over');}});
    pile.addEventListener('dragleave',()=>pile.classList.remove('drag-over'));
    pile.addEventListener('drop',event=>{
      event.preventDefault();pile.classList.remove('drag-over');
      if (event.dataTransfer.getData('text/plain') === cards[position]?.id) void markCard(id==='knownPile');
    });
  }
  el('studyCard').addEventListener('dragend',()=>{for(const id of ['unknownPile','knownPile'])el(id).classList.remove('drag-over');});
  for (const id of settings) el(id).onchange=resetStudy;
  window.resetStudy=resetStudy;window.updateStudyControls=updateStudyControls;window.updateStudyFolders=updateStudyFolders;
  updateStudyFolders();resetStudy();
})();
