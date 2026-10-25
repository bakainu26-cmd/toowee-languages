'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const names={match:'Połącz w pary',memory:'Memory',quiz:'Wybierz tłumaczenie',write:'Wpisz słówko',escape:'Escape room',falling:'Spadające słówka'};
  let kind='match',pairs=[],left=null,right=null,attempts=0,deck=[],flipped=[],lock=false,hideTimer=null;
  let questions=[],questionIndex=0,score=0,answered=false,startedAt=null,sessionOwner=null,sessionLanguage=null,finished=false;
  const matched=new Set();
  const canPlay=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const inSession=()=>canPlay() && sessionOwner===account.userId && sessionLanguage===activeLanguage && !finished;
  function status(text){el('gameStatus').textContent=text;}
  function shuffle(rows){const out=[...rows];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function updateGameControls(){
    el('startGame').disabled=!canPlay();
    for(const id of ['gameCount','gameDirection','gameReading','fallSpeed'])el(id).disabled=!canPlay();
    el('gameFolder').disabled=!canPlay() || Boolean(window.getLearningContext?.());
    el('nextGameQuestion').disabled=!inSession() || !answered;
    el('checkGameWrite').disabled=!inSession() || answered;el('gameWriteAnswer').disabled=!inSession() || answered;
    if(window.TooweeEscape)window.TooweeEscape.updateControls();
    if(window.TooweeFalling)window.TooweeFalling.updateControls();
    if(pairs.length){if(kind==='match')showSelections();else if(kind==='memory')renderMemory();else for(const button of el('gameQuizOptions').children)button.disabled=!inSession() || answered;}
  }
  function resetGame(){
    if(window.TooweeEscape)window.TooweeEscape.reset();
    if(window.TooweeFalling)window.TooweeFalling.reset();
    if(hideTimer!==null)clearTimeout(hideTimer);hideTimer=null;
    pairs=[];left=null;right=null;attempts=0;matched.clear();deck=[];flipped=[];lock=false;
    questions=[];questionIndex=0;score=0;answered=false;startedAt=null;sessionOwner=null;sessionLanguage=null;finished=false;
    for(const id of ['gameWords','gameTranslations','gameMemoryBoard','gameQuizOptions'])el(id).replaceChildren();
    for(const id of ['gameMatch','gameMemory','gameQuiz','gameResult','nextGameQuestion'])el(id).hidden=true;
    el('gameScore').textContent='';el('gameQuizFeedback').textContent='';el('gameWriteAnswer').value='';
    for(const key of Object.keys(names)){el('gameType-'+key).classList.toggle('active',kind===key);el('gameType-'+key).setAttribute('aria-pressed',String(kind===key));}
    el('gameDirectionField').hidden=!['quiz','falling'].includes(kind);el('fallSpeedField').hidden=kind!=='falling';
    el('gameWriteHint').textContent=activeLanguage==='Japanese' ? 'Możesz wpisać kanji lub czytanie w hiraganie. Używamy czytania zapisanego przy słówku.' : 'Wpisz słówko w języku, którego się uczysz.';el('gameReadingField').hidden=activeLanguage!=='Japanese' || ['escape','falling'].includes(kind);
    el('gameInstructions').textContent=kind==='falling' ? 'Wybierz tłumaczenie, zanim słówko dotknie dolnej granicy. Masz trzy życia, a tempo rośnie co trzy trafienia. Możesz wybrać tempo i język pytania.' : kind==='escape' ? 'Zbadaj przedmioty w Bibliotece zaginionych słów. Rozwiązuj zagadki, zbierz trzy pieczęcie z cyframi i otwórz drzwi. Potrzebujesz co najmniej 3 słówek.' : kind==='match' ? 'Wybierz słówko po lewej i jego tłumaczenie po prawej. Dopasuj wszystkie pary.' : kind==='memory' ? 'Odkrywaj po dwie karty. Znajdź pary: słówko w języku obcym i jego polskie tłumaczenie.' : kind==='write' ? 'Przeczytaj polskie znaczenie i wpisz słówko z pamięci. Zatwierdź klawiszem Enter lub przyciskiem.' : 'Wybierz właściwe tłumaczenie spośród podanych odpowiedzi. Po każdej próbie zobaczysz poprawną odpowiedź.';
    status(canPlay() ? 'Wybierz grę i rozpocznij. Gry nie zmieniają harmonogramu powtórek ani nie zaliczają dziennego challenge’u.' : 'Zaloguj się i wczytaj bibliotekę.');
    updateGameControls();
  }
  function updateGameFolders(){
    const selected=el('gameFolder').value;el('gameFolder').replaceChildren(new Option('Wszystkie zestawy',''));
    for(const folder of activeFolders())el('gameFolder').add(new Option(folder.name,folder.id));
    el('gameFolder').value=activeFolders().some(f=>f.id===selected) ? selected : '';updateGameControls();
  }
  function addLabel(button,word,side){
    button.textContent=side==='target' ? word.word : word.translation;
    button.lang=side==='target' ? languageInfo[activeLanguage]?.code || 'en' : 'pl';
    if(side==='target' && activeLanguage==='Japanese' && word.reading && el('gameReading').checked){const reading=document.createElement('small');reading.textContent=word.reading;button.append(reading);}
  }
  function finish(text){
    finished=true;el('gameResult').hidden=false;el('gameResultText').textContent=text+' Czas: '+Math.max(0,Math.floor((Date.now()-startedAt)/1000))+' s.';
    status('Runda ukończona! Możesz zagrać ponownie albo wybrać inną grę.');updateGameControls();
  }
  function renderColumn(id,items,side){
    el(id).replaceChildren();
    for(const word of items){const button=document.createElement('button');button.type='button';button.className='match-card';button.dataset.id=word.id;button.setAttribute('aria-pressed','false');addLabel(button,word,side==='left'?'target':'polish');button.addEventListener('click',()=>choose(side,word.id));el(id).append(button);}
  }
  function showSelections(){
    for(const side of ['left','right'])for(const button of el(side==='left'?'gameWords':'gameTranslations').children){
      const selected=(side==='left'?left:right)===button.dataset.id;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.classList.toggle('matched',matched.has(button.dataset.id));button.disabled=matched.has(button.dataset.id) || !inSession();
    }
  }
  function choose(side,id){
    if(kind!=='match' || !inSession() || matched.has(id) || !pairs.some(p=>p.id===id))return;
    if(side==='left')left=id;else right=id;
    if(left&&right){attempts++;if(left===right){matched.add(left);status('Dobra para!');}else status('Te słówka nie tworzą pary. Spróbuj ponownie.');left=null;right=null;}
    el('gameScore').textContent='Pary: '+matched.size+' / '+pairs.length+' · Próby: '+attempts;showSelections();
    if(matched.size===pairs.length)finish('Dopasowano '+pairs.length+' par w '+attempts+' próbach.');
  }
  function renderMemory(){
    el('gameMemoryBoard').replaceChildren();
    deck.forEach((card,index)=>{
      const button=document.createElement('button');button.type='button';button.className='match-card memory-card';button.dataset.index=String(index);
      const found=matched.has(card.word.id),shown=found || flipped.includes(index);
      button.classList.toggle('matched',found);button.classList.toggle('selected',shown&&!found);button.setAttribute('aria-pressed',String(shown));
      if(shown)addLabel(button,card.word,card.side);else {button.textContent='?';button.setAttribute('aria-label','Odkryj kartę '+(index+1));}
      button.disabled=!inSession() || found || flipped.includes(index) || lock;
      button.addEventListener('click',()=>flip(index));el('gameMemoryBoard').append(button);
    });
  }
  function flip(index){
    if(kind!=='memory' || !inSession() || lock || flipped.includes(index) || !deck[index] || matched.has(deck[index].word.id))return;
    flipped.push(index);
    if(flipped.length===2){attempts++;const [a,b]=flipped.map(i=>deck[i]);if(a.word.id===b.word.id){matched.add(a.word.id);flipped=[];status('Znaleziono parę!');}else {lock=true;status('Zapamiętaj te karty i spróbuj ponownie.');hideTimer=setTimeout(()=>{hideTimer=null;flipped=[];lock=false;renderMemory();},1000);}}
    el('gameScore').textContent='Pary: '+matched.size+' / '+pairs.length+' · Próby: '+attempts;renderMemory();
    if(matched.size===pairs.length)finish('Odnaleziono '+pairs.length+' par w '+attempts+' próbach.');
  }
  function renderQuestion(){
    const word=questions[questionIndex];answered=false;el('nextGameQuestion').hidden=true;el('gameQuizFeedback').textContent='';
    const toTarget=kind==='write' || el('gameDirection').value==='toTarget';
    el('gamePromptInstruction').textContent=kind==='write' ? 'Wpisz słówko w języku obcym' : 'Wybierz tłumaczenie';
    el('gameWriteForm').hidden=kind!=='write';el('gameQuizOptions').hidden=kind==='write';
    el('gameWriteAnswer').value='';el('gameWriteAnswer').disabled=false;el('checkGameWrite').disabled=false;
    addLabel(el('gameQuizPrompt'),word,toTarget?'polish':'target');
    el('gameScore').textContent='Pytanie '+(questionIndex+1)+' / '+questions.length+' · Punkty: '+score;
    el('gameQuizOptions').replaceChildren();
    if(kind==='write'){el('gameWriteAnswer').focus?.();return;}
    const choices=shuffle([word,...shuffle(pairs.filter(p=>p.id!==word.id)).slice(0,3)]);
    for(const choice of choices){const button=document.createElement('button');button.type='button';button.className='match-card';button.dataset.id=choice.id;addLabel(button,choice,toTarget?'target':'polish');button.addEventListener('click',()=>answer(choice.id));el('gameQuizOptions').append(button);}
  }
  function normalizeAnswer(value){
    let result=value.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');
    if(activeLanguage==='Japanese')result=result.replace(/\s/g,'').replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60));
    return result;
  }
  function checkWritten(event){
    event.preventDefault();if(kind!=='write' || !inSession() || answered)return;
    const value=el('gameWriteAnswer').value;if(!value.trim()){el('gameQuizFeedback').textContent='Najpierw wpisz odpowiedź.';return;}
    const word=questions[questionIndex];
    const accepted=[word.word,...(activeLanguage==='Japanese' && word.reading ? [word.reading] : [])].map(normalizeAnswer);
    showAnswer(accepted.includes(normalizeAnswer(value)),word);
  }
  function showAnswer(correct,word,chosenId=null){
    answered=true;attempts++;if(correct)score++;
    for(const button of el('gameQuizOptions').children){button.disabled=true;button.classList.toggle('matched',button.dataset.id===word.id);button.classList.toggle('incorrect',button.dataset.id===chosenId&&!correct);}
    el('gameWriteAnswer').disabled=true;el('checkGameWrite').disabled=true;
    const answerText=kind==='write' || el('gameDirection').value==='toTarget' ? word.word+(word.reading&&activeLanguage==='Japanese'?' ('+word.reading+')':'') : word.translation;
    el('gameQuizFeedback').textContent=(correct?'✓ Dobrze! ':'✗ Tym razem nie. ')+'Poprawna odpowiedź: '+answerText;
    el('gameScore').textContent='Odpowiedzi: '+(questionIndex+1)+' / '+questions.length+' · Punkty: '+score;
    if(questionIndex===questions.length-1)finish('Twój wynik: '+score+' / '+questions.length+' ('+Math.round(100*score/questions.length)+'%).');
    else {el('nextGameQuestion').hidden=false;el('nextGameQuestion').disabled=false;}
  }
  function answer(id){
    if(kind!=='quiz' || !inSession() || answered || !Array.from(el('gameQuizOptions').children).some(b=>b.dataset.id===id))return;
    const word=questions[questionIndex];showAnswer(id===word.id,word,id);
  }
  function startGame(){
    if(!canPlay())return;resetGame();const folder=el('gameFolder').value;
    const seenWords=new Set(),seenTranslations=new Set(),normalize=s=>s.trim().normalize('NFKC').toLocaleLowerCase();
    const words=shuffle((window.filterLearningWords?window.filterLearningWords(activeWords()):activeWords()).filter(w=>!folder || w.folder_id===folder)).filter(w=>{
      const term=normalize(w.word),meaning=normalize(w.translation);if(!term || !meaning || seenWords.has(term) || seenTranslations.has(meaning))return false;seenWords.add(term);seenTranslations.add(meaning);return true;
    });
    const count=Number(el('gameCount').value);pairs=words.slice(0,[6,10,15,20,25].includes(count)?count:6);
    if(pairs.length<(kind==='escape'?3:2)){pairs=[];status('Do gry potrzeba co najmniej '+(kind==='escape'?3:2)+' różnych słówek i tłumaczeń w wybranym zestawie i kategorii.');return;}
    sessionOwner=account.userId;sessionLanguage=activeLanguage;startedAt=Date.now();
    status('Grasz: '+names[kind]+'. W tej rundzie: '+pairs.length+' słówek'+(pairs.length<count?' (tyle jest dostępnych)':'')+'.');
    if(kind==='falling'){if(window.TooweeFalling)window.TooweeFalling.start(pairs,{owner:sessionOwner,language:sessionLanguage,direction:el('gameDirection').value,speed:el('fallSpeed').value,onFinish:finish});else status('Odśwież stronę, aby wczytać grę.');}
    else if(kind==='escape'){if(window.TooweeEscape)window.TooweeEscape.start(pairs,{owner:sessionOwner,language:sessionLanguage,onFinish:finish});else status('Odśwież stronę, aby wczytać escape room.');}
    else if(kind==='match'){el('gameMatch').hidden=false;renderColumn('gameWords',shuffle(pairs),'left');renderColumn('gameTranslations',shuffle(pairs),'right');el('gameScore').textContent='Pary: 0 / '+pairs.length;}
    else if(kind==='memory'){el('gameMemory').hidden=false;deck=shuffle(pairs.flatMap(word=>[{word,side:'target'},{word,side:'polish'}]));renderMemory();el('gameScore').textContent='Pary: 0 / '+pairs.length;}
    else {el('gameQuiz').hidden=false;questions=shuffle(pairs);renderQuestion();}
  }
  for(const key of Object.keys(names))el('gameType-'+key).onclick=()=>{kind=key;resetGame();};
  for(const id of ['gameFolder','gameCount','gameDirection','gameReading','fallSpeed'])el(id).onchange=resetGame;
  el('startGame').onclick=startGame;el('replayGame').onclick=startGame;
  el('nextGameQuestion').onclick=()=>{if(['quiz','write'].includes(kind) && inSession() && answered && questionIndex<questions.length-1){questionIndex++;renderQuestion();}};
  el('gameWriteForm').onsubmit=checkWritten;
  window.openGamesLobby=()=>{if(window.clearLearningContext)window.clearLearningContext();el('gameFolder').value='';resetGame();tab('games');};
  window.updateGameControls=updateGameControls;window.updateGameFolders=updateGameFolders;window.resetGame=resetGame;
  updateGameFolders();resetGame();
})();
