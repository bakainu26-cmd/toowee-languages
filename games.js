'use strict';
(() => {
  const el = id => document.getElementById(id);
  let pairs = [], left = null, right = null, attempts = 0;
  const matched = new Set();
  const canPlay = () => ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  function status(text) { el('gameStatus').textContent = text; }
  function updateGameControls() { el('startGame').disabled = !canPlay(); }
  function resetGame() {
    pairs=[];left=null;right=null;attempts=0;matched.clear();
    el('gameWords').replaceChildren();el('gameTranslations').replaceChildren();
    status(canPlay() ? 'Wybierz zestaw i rozpocznij grę. Gra nie zmienia harmonogramu powtórek fiszek.' : 'Zaloguj się i wczytaj bibliotekę.');
    updateGameControls();
  }
  function updateGameFolders() {
    const selected = el('gameFolder').value;
    el('gameFolder').replaceChildren(new Option('Wszystkie foldery',''));
    for (const folder of activeFolders()) el('gameFolder').add(new Option(folder.name,folder.id));
    el('gameFolder').value = activeFolders().some(f=>f.id===selected) ? selected : '';
  }
  function shuffle(rows) {
    const result=[...rows];
    for(let i=result.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
    return result;
  }
  function renderColumn(id, items, side) {
    el(id).replaceChildren();
    for(const word of items) {
      const button=document.createElement('button');button.type='button';button.className='match-card';
      button.dataset.id=word.id;button.setAttribute('aria-pressed','false');
      button.textContent=side==='left' ? word.word : word.translation;
      if(side==='left' && word.reading) {const reading=document.createElement('small');reading.textContent=word.reading;button.append(reading);}
      button.lang=side==='right' ? 'pl' : languageInfo[activeLanguage]?.code || 'en';
      button.addEventListener('click',()=>choose(side,word.id));el(id).append(button);
    }
  }
  function showSelections() {
    for(const side of ['left','right']) {
      const id=side==='left' ? 'gameWords' : 'gameTranslations';
      for(const button of el(id).querySelectorAll('button')) {
        const selected=(side==='left' ? left : right)===button.dataset.id;
        button.classList.toggle('selected',selected);
        button.setAttribute('aria-pressed',String(selected));
        button.classList.toggle('matched',matched.has(button.dataset.id));
        button.disabled=matched.has(button.dataset.id) || !canPlay();
      }
    }
  }
  function choose(side,id) {
    if(!canPlay() || matched.has(id) || !pairs.some(p=>p.id===id)) return;
    if(side==='left') left=id;else right=id;
    if(left && right) {
      attempts++;
      if(left===right) {
        matched.add(left);
        status(matched.size===pairs.length
          ? 'Gotowe! Dopasowano '+pairs.length+' par w '+attempts+' próbach. Kliknij „Rozpocznij grę”, aby zagrać ponownie.'
          : 'Dobra para! Dopasowano '+matched.size+' z '+pairs.length+'. Próby: '+attempts+'.');
      } else status('Te słówka nie tworzą pary. Spróbuj ponownie. Dopasowano '+matched.size+' z '+pairs.length+'. Próby: '+attempts+'.');
      left=null;right=null;
    }
    showSelections();
  }
  function startGame() {
    if(!canPlay()) return;
    resetGame();
    const folder=el('gameFolder').value;
    // Keep both columns unambiguous when several entries share the same label.
    const seenWords=new Set(),seenTranslations=new Set();
    const words=shuffle(activeWords().filter(w=>!folder || w.folder_id===folder)).filter(w=>{
      if(seenWords.has(w.word) || seenTranslations.has(w.translation)) return false;
      seenWords.add(w.word);seenTranslations.add(w.translation);return true;
    });
    pairs=words.slice(0,6);
    if(pairs.length<2) {pairs=[];status('Do gry potrzeba co najmniej 2 różnych słówek i tłumaczeń w tym zestawie.');return;}
    renderColumn('gameWords',shuffle(pairs),'left');renderColumn('gameTranslations',shuffle(pairs),'right');
    status('Dopasuj '+pairs.length+' par. Najpierw kliknij słówko lub tłumaczenie.');
  }
  el('startGame').onclick=startGame;el('gameFolder').onchange=resetGame;
  window.updateGameControls=updateGameControls;window.updateGameFolders=updateGameFolders;window.resetGame=resetGame;
  updateGameFolders();resetGame();
})();
