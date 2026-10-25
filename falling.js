'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let state=null,frame=null;
  const current=()=>state && ready && !saving && account?.userId===state.owner && activeLanguage===state.language && !state.finished;
  function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;}
  function shuffle(items){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function target(word){return word.word+(state.language==='Japanese' && word.reading?' ('+word.reading+')':'');}
  function controls(){
    const enabled=Boolean(current());el('fallPause').disabled=!enabled;el('fallStop').disabled=!enabled;el('fallNext').disabled=!enabled || state.paused || !state.feedback || state.roundEnd;
    el('fallNextRound').disabled=!enabled || state.paused || !state.roundEnd;
    for(const button of el('fallAnswers').children)button.disabled=!enabled || state.paused || state.feedback;
    el('fallPause').textContent=state?.paused?'▶ Wznów':'Ⅱ Pauza';
    el('fallOverlay').hidden=!state?.paused;el('fallWord').hidden=Boolean(state?.paused);el('fallAnswers').hidden=Boolean(state?.paused);
  }
  function reset(){stop();state=null;el('fallingGame').hidden=true;el('fallAnswers').replaceChildren();el('fallWord').textContent='';el('fallFeedback').textContent='';el('fallNext').hidden=true;el('fallOverlay').hidden=true;el('fallRoundEnd').hidden=true;}
  function stats(){
    el('fallPoints').textContent=state.points;el('fallLives').textContent=state.unlimitedLives?'∞':'♥'.repeat(state.lives)+'♡'.repeat(3-state.lives);
    el('fallLives').setAttribute('aria-label',state.unlimitedLives?'Bez limitu żyć':'Pozostałe życia: '+state.lives+' z 3');
    el('fallLevel').textContent=1+Math.floor(state.correct/3);el('fallCounter').textContent=state.endless?String(state.answered+(state.feedback?0:1)):Math.min(state.index+1,state.words.length)+' / '+state.words.length;
    el('fallRoundCounter').textContent=state.endless?(state.unlimitedLives?'∞ Endless · pula ':'♥ Do utraty żyć · pula ')+state.words.length+' słówek · obieg '+state.cycle:'Runda '+(state.round+1)+' / '+state.roundEnds.length;
    el('fallCombo').textContent='Seria: '+state.combo+' · Rekord gry: '+state.best;
  }
  function duration(){const base={slow:16000,normal:12000,fast:9000}[state.speed] || 12000;return Math.max(5000,base-Math.floor(state.correct/3)*900);}
  function draw(){
    const distance=Math.max(0,(el('fallSky').clientHeight || 360)-(el('fallWord').offsetHeight || 90)-24);
    el('fallWord').style.top=Math.round(distance*Math.min(1,state.used/state.duration))+'px';
    el('fallTime').max=state.duration;el('fallTime').value=Math.max(0,state.duration-state.used);
    el('fallTimeText').textContent=Math.max(0,Math.ceil((state.duration-state.used)/1000))+' s';
  }
  function loop(){
    frame=null;if(!current())return;
    if(!state.paused && !state.feedback){state.used+=Math.max(0,Date.now()-state.since);state.since=Date.now();draw();if(state.used>=state.duration){resolve(false,true);return;}}
    if(!state.paused && !state.feedback)frame=requestAnimationFrame(loop);
  }
  function nextWord(){
    if(!current())return;stop();state.feedback=false;state.roundEnd=false;el('fallRoundEnd').hidden=true;state.paused=Boolean(document.hidden);state.used=0;state.duration=duration();state.since=Date.now();
    el('fallFeedback').textContent='';el('fallNext').hidden=true;el('fallWord').classList.remove('fall-hit','fall-miss');
    const word=state.words[state.index],toTarget=state.direction==='toTarget';
    el('fallWord').textContent=toTarget?word.translation:target(word);el('fallWord').lang=toTarget?'pl':languageInfo[state.language]?.code || 'en';
    el('fallAnswers').replaceChildren();
    const choices=shuffle([word,...shuffle(state.words.filter(w=>w.id!==word.id)).slice(0,3)]);
    choices.forEach((option,i)=>{const button=document.createElement('button');button.type='button';button.className='fall-answer';button.dataset.id=option.id;button.textContent=(i+1)+'. '+(toTarget?target(option):option.translation);button.addEventListener('click',()=>choose(option.id));el('fallAnswers').append(button);});
    stats();draw();controls();el('fallSky').focus?.({preventScroll:true});if(!state.paused)frame=requestAnimationFrame(loop);
  }
  function finish(manual=false){
    if(!current())return;
    const completed=state.round+(state.roundEnd?1:0);
    stop();state.finished=true;state.paused=false;state.roundEnd=false;el('fallRoundEnd').hidden=true;controls();el('fallNext').hidden=true;
    const won=!manual && !state.endless && state.lives>0;
    el('fallFeedback').textContent+=' '+(manual?'Gra zakończona na Twoje życzenie.':won?'✦ Gra ukończona! Wszystkie rundy za Tobą.':'Koniec gry — zabrakło serduszek. Spróbuj ponownie lub wybierz wolniejsze tempo.');
    const summary=state.endless?(state.unlimitedLives?'Tryb endless. ':'Tryb do utraty żyć. ')+'Ocenione słówka: '+state.answered+'. Błędne odpowiedzi / upadki: '+state.mistakes+'. ':'Rundy ukończone: '+(won?state.roundEnds.length:completed)+' / '+state.roundEnds.length+'. ';
    state.onFinish((won?'Gra ukończona! ':'Koniec gry. ')+summary+'Punkty: '+state.points+'. Trafienia: '+state.correct+' / '+(state.endless?state.answered:state.words.length)+'. Najlepsza seria: '+state.best+'.');
  }
  function resolve(correct,timeout=false){
    if(!current() || state.paused || state.feedback)return;
    stop();state.feedback=true;state.answered++;
    if(correct){state.correct++;state.combo++;state.best=Math.max(state.best,state.combo);state.points+=100+Math.min(100,(state.combo-1)*20);}
    else {state.mistakes++;if(!state.unlimitedLives)state.lives--;state.combo=0;}
    const word=state.words[state.index];el('fallWord').classList.add(correct?'fall-hit':'fall-miss');
    el('fallFeedback').textContent=(correct?'✓ Trafione! ':timeout?'⌛ Słówko spadło. '+(state.unlimitedLives?'':'Tracisz serduszko. '):'✗ To nie ta odpowiedź. '+(state.unlimitedLives?'':'Tracisz serduszko. '))+target(word)+' — '+word.translation;
    for(const button of el('fallAnswers').children)button.classList.toggle('correct',button.dataset.id===word.id);
    stats();controls();el('fallSky').focus?.({preventScroll:true});
    if(state.lives===0 || (!state.endless && state.index===state.words.length-1)){finish();return;}
    if(!state.endless && state.index+1===state.roundEnds[state.round]){
      state.roundEnd=true;el('fallNext').hidden=true;el('fallRoundEnd').hidden=false;
      const start=state.round===0?0:state.roundEnds[state.round-1];
      el('fallRoundTitle').textContent='Runda '+(state.round+1)+' ukończona!';
      el('fallRoundSummary').textContent='Trafienia: '+(state.correct-state.roundCorrect)+' / '+(state.roundEnds[state.round]-start)+'. Punkty w rundzie: '+(state.points-state.roundPoints)+'. Pozostałe życia: '+state.lives+'.';
      controls();el('fallRoundEnd').scrollIntoView?.({block:'nearest'});return;
    }
    el('fallNext').hidden=false;el('fallNext').textContent='Kolejne słówko →';
  }
  function choose(id){
    if(!current() || state.paused || state.feedback || !Array.from(el('fallAnswers').children).some(b=>b.dataset.id===id))return;
    // Settle the clock at click time, even if the browser has not drawn a frame yet.
    state.used+=Math.max(0,Date.now()-state.since);state.since=Date.now();draw();
    if(state.used>=state.duration){resolve(false,true);return;}
    resolve(id===state.words[state.index].id);
  }
  function pause(){
    if(!current() || state.paused)return;
    if(!state.feedback){state.used+=Math.max(0,Date.now()-state.since);draw();if(state.used>=state.duration){resolve(false,true);return;}}
    state.paused=true;stop();controls();
  }
  function togglePause(){
    if(!current())return;if(!state.paused){pause();return;}
    if(document.hidden)return;state.paused=false;state.since=Date.now();controls();el('fallSky').focus?.({preventScroll:true});if(!state.feedback)frame=requestAnimationFrame(loop);
  }
  function start(words,{owner,language,direction='toPolish',speed='normal',mode='rounds',onFinish}){
    reset();if(words.length<2)return false;
    const roundCount=Math.ceil(words.length/5),base=Math.floor(words.length/roundCount),extra=words.length%roundCount;
    let total=0;const roundEnds=Array.from({length:roundCount},(_,i)=>total+=base+(i<extra?1:0));
    state={endless:['endless','survival'].includes(mode),unlimitedLives:mode==='endless',mistakes:0,answered:0,cycle:1,round:0,roundEnds,roundEnd:false,roundPoints:0,roundCorrect:0,words:shuffle(words),owner,language,direction,speed,onFinish,index:0,points:0,correct:0,lives:3,combo:0,best:0,paused:false,feedback:false,finished:false,used:0,duration:0,since:Date.now()};
    el('fallingGame').hidden=false;nextWord();el('fallingGame').scrollIntoView?.({block:'start'});return true;
  }
  el('fallPause').onclick=togglePause;el('fallStop').onclick=()=>finish(true);
  function advance(){if(!current() || state.paused || !state.feedback || state.roundEnd)return;state.index++;
    if(state.endless && state.index>=state.words.length){const last=state.words[state.words.length-1].id;state.words=shuffle(state.words);if(state.words[0].id===last)[state.words[0],state.words[1]]=[state.words[1],state.words[0]];state.index=0;state.cycle++;}
    nextWord();}
  function advanceRound(){if(!current() || state.paused || !state.roundEnd)return;state.round++;state.roundPoints=state.points;state.roundCorrect=state.correct;state.index++;nextWord();}
  el('fallNext').onclick=advance;el('fallNextRound').onclick=advanceRound;
  el('fallEndGame').onclick=()=>{if(window.openGamesLobby)window.openGamesLobby();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  document.addEventListener('keydown',event=>{
    if(!current() || el('games').hidden || event.repeat || event.isComposing || event.target?.isContentEditable || event.ctrlKey || event.metaKey || event.altKey || ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
    if(['Enter',' ','Spacebar'].includes(event.key)){
      // Keep native keyboard activation for Pause, End game and other controls.
      const target=event.target;
      if(target?.tagName==='BUTTON' && !Array.from(el('fallAnswers').children).includes(target) && !['fallNext','fallNextRound'].includes(target.id))return;
      if(state.paused)return;
      event.preventDefault();
      if(state.feedback){if(state.roundEnd)advanceRound();else advance();}
      return;
    }
    if(/^[1-4]$/.test(event.key) && !state.feedback && !state.paused){const button=el('fallAnswers').children[Number(event.key)-1];if(button){event.preventDefault();choose(button.dataset.id);}}
  });
  window.TooweeFalling=Object.freeze({start,reset,pause,updateControls:controls});window.pauseFallingGame=pause;reset();
})();
