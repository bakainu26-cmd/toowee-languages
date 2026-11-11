'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const names={dice:'Magic Dice',match:'Połącz w pary',memory:'Memory',quiz:'Wybierz tłumaczenie',write:'Wpisz słówko',escape:'Escape room',falling:'Spadające słówka'};
  let kind='match',pairs=[],left=null,right=null,attempts=0,deck=[],flipped=[],lock=false,hideTimer=null;
  let questions=[],questionIndex=0,score=0,answered=false,startedAt=null,sessionOwner=null,sessionLanguage=null,finished=false;
  let worldRewardId=null;
  const matched=new Set();
  const canPlay=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const inSession=()=>canPlay() && sessionOwner===account.userId && sessionLanguage===activeLanguage && !finished;
  function status(text){el('gameStatus').textContent=text;}
  function shuffle(rows){const out=[...rows];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function updateDirectionLabels(){
    const language=window.tooweeTeacherGameContext?.lang||activeLanguage;
    const label=({Japanese:'Japoński',English:'Angielski',Spanish:'Hiszpański'})[language]||language||'Wybrany język';
    const words=window.tooweeTeacherGameContext?.words||activeWords();const target=window.TooWeeTools?.languages[words[0]?.translation_lang||window.TooWeeTools.wordTarget(words[0]||{})]||'Polski';for(const option of el('gameDirection').options){if(option.value==='toPolish')option.textContent=label+' → '+target.toLocaleLowerCase('pl');else if(option.value==='toTarget')option.textContent=target+' → '+label.toLocaleLowerCase('pl');}
  }
  function updateGameControls(){
    updateDirectionLabels();
    el('startGame').disabled=!canPlay();el('startGame').hidden=window.tooweeView==='teacher'&&window.tooweeTeacherGameContext?.deliveryMode==='online';
    const stop=el('teacherEndGameNow');if(stop){stop.hidden=!pairs.length||(!finished&&window.tooweeView!=='teacher');stop.disabled=finished?false:!inSession();stop.textContent=finished?'Wyjdź':'Zakończ';}
    const share=el('shareMagicDice');if(share){share.hidden=kind!=='dice'||window.tooweeView!=='teacher'||window.tooweeTeacherGameContext?.deliveryMode==='classroom';share.disabled=!canPlay();}
    for(const id of ['gameCount','gameDirection','gameReading','fallSpeed','fallMode'])el(id).disabled=!canPlay();
    el('gameCount').disabled=!canPlay() || (kind==='falling' && ['endless','survival'].includes(el('fallMode').value));
    el('gameFolder').disabled=!canPlay() || Boolean(window.getLearningContext?.() || window.tooweeTeacherGameContext);
    el('nextGameQuestion').disabled=!inSession() || !answered;
    el('checkGameWrite').disabled=!inSession() || answered;el('gameWriteAnswer').disabled=!inSession() || answered;
    if(window.TooweeEscape)window.TooweeEscape.updateControls();
    if(window.TooweeFalling)window.TooweeFalling.updateControls();
    window.TooweeMagicDice?.updateControls();
    if(pairs.length){if(kind==='match')showSelections();else if(kind==='memory')renderMemory();else for(const button of el('gameQuizOptions').children)button.disabled=!inSession() || answered;}
  }
  function resetGame(){
    window.setActivityPlaying?.(false);
    const shared=el('magicDiceShareResult');if(shared){shared.hidden=true;shared.replaceChildren();}
    if(window.TooweeEscape)window.TooweeEscape.reset();
    if(window.TooweeFalling)window.TooweeFalling.reset();
    window.TooweeMagicDice?.reset();
    if(hideTimer!==null)clearTimeout(hideTimer);hideTimer=null;
    pairs=[];left=null;right=null;attempts=0;matched.clear();deck=[];flipped=[];lock=false;
    questions=[];questionIndex=0;score=0;answered=false;startedAt=null;sessionOwner=null;sessionLanguage=null;finished=false;
    for(const id of ['gameWords','gameTranslations','gameMemoryBoard','gameQuizOptions'])el(id).replaceChildren();
    for(const id of ['gameMatch','gameMemory','gameQuiz','gameResult','nextGameQuestion'])el(id).hidden=true;
    el('gameScore').textContent='';el('gameQuizFeedback').textContent='';el('gameWriteAnswer').value='';
    for(const key of Object.keys(names)){el('gameType-'+key).classList.toggle('active',kind===key);el('gameType-'+key).setAttribute('aria-pressed',String(kind===key));}
    el('gameDirectionField').hidden=!['quiz','falling','dice'].includes(kind)||Boolean(window.tooweeTeacherGameContext?.exerciseSet);if(window.tooweeTeacherGameContext?.exerciseSet)el('gameDirection').value='toPolish';el('fallSpeedField').hidden=kind!=='falling';el('fallModeField').hidden=kind!=='falling';el('magicDiceSettings').hidden=kind!=='dice';const classroomDice=kind==='dice'&&window.tooweeView==='teacher'&&window.tooweeTeacherGameContext?.deliveryMode==='classroom';el('magicDiceClassroomPlayers').hidden=!classroomDice;el('gameCountField').hidden=kind==='dice'||kind==='falling' && ['endless','survival'].includes(el('fallMode').value);
    el('gameWriteHint').textContent=activeLanguage==='Japanese' ? 'Możesz wpisać kanji lub czytanie w hiraganie. Używamy czytania zapisanego przy słówku.' : 'Wpisz słówko w języku, którego się uczysz.';el('gameReadingField').hidden=activeLanguage!=='Japanese' || ['escape','falling'].includes(kind);
    el('gameInstructions').textContent=kind==='dice'?'Odpowiadaj na pytania, wybierz jedną z trzech kostek i ułóż ją zgodnie z warunkami pola. Stwórz magiczny witraż na planszy 3×3, 4×4 lub 5×5.':kind==='falling' ? 'Wybierz tłumaczenie, zanim słówko dotknie dolnej granicy. Wybierz rundy, endless bez limitu żyć albo grę do utraty 3 serduszek. Tempo rośnie co trzy trafienia; możesz ustawić tempo początkowe i język pytania.' : kind==='escape' ? 'Zbadaj przedmioty w Bibliotece zaginionych słów. Rozwiązuj zagadki, zbierz trzy pieczęcie z cyframi i otwórz drzwi. Potrzebujesz co najmniej 3 słówek.' : kind==='match' ? 'Wybierz słówko po lewej i jego tłumaczenie po prawej. Dopasuj wszystkie pary.' : kind==='memory' ? 'Odkrywaj po dwie karty. Znajdź pary: słówko w języku obcym i jego polskie tłumaczenie.' : kind==='write' ? 'Przeczytaj polskie znaczenie i wpisz słówko z pamięci. Zatwierdź klawiszem Enter lub przyciskiem.' : 'Wybierz właściwe tłumaczenie spośród podanych odpowiedzi. Po każdej próbie zobaczysz poprawną odpowiedź.';
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
    if(finished)return;
    if(!finished && kind==='match' && matched.size>=6 && matched.size===pairs.length && worldRewardId && window.recordWorldGame)void window.recordWorldGame({event_id:worldRewardId,owner:sessionOwner,language:sessionLanguage,ids:[...matched]});
    finished=true;el('gameResult').hidden=false;el('gameResultText').textContent=text+' Czas: '+Math.max(0,Math.floor((Date.now()-startedAt)/1000))+' s.';
    status('Gra zakończona! Zagraj ponownie lub wybierz „Wyjdź” u góry, aby wrócić do wyboru gier.');updateGameControls();el('gameResult').scrollIntoView?.({block:'nearest'});
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
      const button=document.createElement('button');button.type='button';button.className='match-card memory-card';button.dataset.index=String(index);button.dataset.pair=card.word.id;
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
  window.addEventListener('toowee-game-delivery',updateGameControls);
  const shareDice=el('shareMagicDice'),shareResult=el('magicDiceShareResult');
  shareDice.onclick=async()=>{if(kind!=='dice'||!canPlay()||window.tooweeTeacherGameContext?.deliveryMode==='classroom')return;shareDice.disabled=true;shareResult.hidden=false;shareResult.replaceChildren();try{
    const folder=el('gameFolder').value,seen=new Set(),meanings=new Set();
    const words=((window.tooweeView==='teacher'&&window.tooweeTeacherGameContext?.words)||(window.filterLearningWords?window.filterLearningWords(activeWords()):activeWords())).filter(w=>!folder||w.folder_id===folder).filter(w=>{const term=w.word.trim().normalize('NFKC').toLocaleLowerCase(),meaning=w.translation.trim().normalize('NFKC').toLocaleLowerCase();if(!term||!meaning||seen.has(term)||(meanings.has(meaning)&&!w.quiz_options))return false;seen.add(term);meanings.add(meaning);return true;});
    const url=await window.MagicDiceClassroom.create({language:activeLanguage,words,size:Number(el('magicDiceSize').value),quota:Number(el('magicDiceQuota').value),direction:el('gameDirection').value},account.client,account.userId,shareResult);
    const label=document.createElement('label');label.textContent='Link dla ucznia';const input=document.createElement('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Link do Magic Dice dla ucznia');input.onclick=()=>input.select();label.append(input);const copy=document.createElement('button');copy.type='button';copy.textContent='Kopiuj link';copy.onclick=async()=>{try{await navigator.clipboard.writeText(url);copy.textContent='Skopiowano!';}catch{input.focus();input.select();copy.textContent='Zaznaczono — skopiuj link';}};const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener';open.textContent='Otwórz grę ucznia';const note=document.createElement('p');note.textContent='Uczeń dołącza bez logowania. W panelu nauczyciela możesz zakończyć grę i zobaczyć zapisane statystyki. Każdy, kto otrzyma link, może dołączyć.';shareResult.append(label,copy,open,note);
  }catch(error){const errorNote=document.createElement('p');errorNote.textContent=error.message;shareResult.append(errorNote);}finally{shareDice.disabled=!canPlay();}};
  function updateDicePlayerNames(){const host=el('magicDicePlayerNames'),old=[...host.querySelectorAll('input')].map(x=>x.value),n=Math.max(1,Math.min(12,Number(el('magicDicePlayerCount').value)||2));host.replaceChildren();for(let i=0;i<n;i++){const field=document.createElement('input');field.type='text';field.placeholder='Imię gracza '+(i+1);field.setAttribute('aria-label','Imię gracza '+(i+1));field.value=old[i]||'';field.style.maxWidth='180px';host.append(field);}}
  el('magicDicePlayerCount').addEventListener('input',updateDicePlayerNames);updateDicePlayerNames();
  function startGame(){
    if(!canPlay()||(window.tooweeView==='teacher'&&window.tooweeTeacherGameContext?.deliveryMode==='online'))return;resetGame();const folder=el('gameFolder').value;
    const seenWords=new Set(),seenTranslations=new Set(),normalize=s=>s.trim().normalize('NFKC').toLocaleLowerCase();
    const words=shuffle(((window.tooweeView==='teacher'&&window.tooweeTeacherGameContext?.words) || (window.filterLearningWords?window.filterLearningWords(activeWords()):activeWords())).filter(w=>!folder || w.folder_id===folder)).filter(w=>{
      const term=normalize(w.word),meaning=normalize(w.translation);if(!term || !meaning || seenWords.has(term) || (seenTranslations.has(meaning)&&!w.quiz_options))return false;seenWords.add(term);seenTranslations.add(meaning);return true;
    });
    const endless=kind==='falling' && ['endless','survival'].includes(el('fallMode').value);
    const count=Number(el('gameCount').value);pairs=(endless||kind==='dice')?words:words.slice(0,[6,10,15,20,25].includes(count)?count:6);
    if(pairs.length<(kind==='escape'?3:2)){pairs=[];status('Do gry potrzeba co najmniej '+(kind==='escape'?3:2)+' różnych słówek i tłumaczeń w wybranym zestawie i kategorii.');return;}
    worldRewardId=window.newWorldEventId?.();sessionOwner=account.userId;sessionLanguage=activeLanguage;startedAt=Date.now();
    window.openActivityFocus?.('games',names[kind],true,kind);
    status('Grasz: '+names[kind]+(endless?' · Endless. Pula: ':'. W tej grze: ')+pairs.length+' słówek'+(!endless && pairs.length<count?' (tyle jest dostępnych)':'')+'.');
    updateGameControls();
    if(kind==='dice'){window.TooweeMagicDice.start(pairs,{owner:sessionOwner,language:sessionLanguage,size:el('magicDiceSize').value,quota:el('magicDiceQuota').value,direction:el('gameDirection').value,classroomPlayers:el('magicDiceClassroomPlayers').hidden?null:[...el('magicDicePlayerNames').querySelectorAll('input')].map((input,i)=>input.value.trim()||'Gracz '+(i+1)),onFinish:finish});}
    else if(kind==='falling'){if(window.TooweeFalling)window.TooweeFalling.start(pairs,{owner:sessionOwner,language:sessionLanguage,direction:el('gameDirection').value,speed:el('fallSpeed').value,mode:el('fallMode').value,onFinish:finish});else status('Odśwież stronę, aby wczytać grę.');}
    else if(kind==='escape'){if(window.TooweeEscape)window.TooweeEscape.start(pairs,{owner:sessionOwner,language:sessionLanguage,onFinish:finish});else status('Odśwież stronę, aby wczytać escape room.');}
    else if(kind==='match'){el('gameMatch').hidden=false;renderColumn('gameWords',shuffle(pairs),'left');renderColumn('gameTranslations',shuffle(pairs),'right');el('gameScore').textContent='Pary: 0 / '+pairs.length;}
    else if(kind==='memory'){el('gameMemory').hidden=false;deck=shuffle(pairs.flatMap(word=>[{word,side:'target'},{word,side:'polish'}]));renderMemory();el('gameScore').textContent='Pary: 0 / '+pairs.length;}
    else {el('gameQuiz').hidden=false;questions=shuffle(pairs);renderQuestion();}
  }
  for(const key of Object.keys(names))el('gameType-'+key).onclick=()=>{kind=key;resetGame();window.openActivityFocus?.('games',names[kind],false,kind);};
  for(const id of ['gameFolder','gameCount','gameDirection','gameReading','fallSpeed','fallMode','magicDiceSize','magicDiceQuota'])el(id).onchange=resetGame;
  el('teacherEndGameNow').onclick=()=>{if(finished){window.openGamesLobby();return;}if(window.tooweeView!=='teacher'||!inSession())return;if(kind==='dice'){window.TooweeMagicDice.finish('Nauczyciel zakończył grę.');return;}if(kind==='falling'){window.TooweeFalling.finish();return;}if(kind==='escape'){window.TooweeEscape.finish();return;}if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}const summary=['match','memory'].includes(kind)?'Dopasowane pary: '+matched.size+' / '+pairs.length+' · Próby: '+attempts+' · Nietrafione próby: '+(attempts-matched.size):'Poprawne: '+score+' · Błędne: '+(attempts-score)+' · Odpowiedzi: '+attempts+' / '+questions.length;finish('Nauczyciel zakończył grę. '+summary+'.');};
  el('startGame').onclick=startGame;el('replayGame').onclick=startGame;
  el('nextGameQuestion').onclick=()=>{if(['quiz','write'].includes(kind) && inSession() && answered && questionIndex<questions.length-1){questionIndex++;renderQuestion();}};
  el('gameWriteForm').onsubmit=checkWritten;
  window.openGamesLobby=(allowWorld=true)=>{if(window.returnToTeacherGameCatalog?.())return;const toWorld=allowWorld && window.worldGameMission===true;window.worldGameMission=false;window.closeActivityFocus?.();if(window.clearLearningContext)window.clearLearningContext();el('gameFolder').value='';resetGame();tab(toWorld?'world':'games');if(!toWorld)el('games').scrollIntoView?.({block:'start'});};
  window.updateGameControls=updateGameControls;window.updateGameFolders=updateGameFolders;window.resetGame=resetGame;
  window.addEventListener('toowee-game-delivery',updateDirectionLabels);
  updateGameFolders();resetGame();
})();
