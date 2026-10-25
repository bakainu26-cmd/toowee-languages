'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const locks=[{name:'Zaklęta biblioteczka',icon:'📚',story:'Na grzbietach książek migoczą obce słowa. Odczytaj ich znaczenie, aby odzyskać pierwszą pieczęć.',mode:'choice'}, {name:'Biurko archiwistki',icon:'✒️',story:'W dzienniku brakuje zapisów. Wpisz słówka, aby odblokować sekretną szufladę.',mode:'write'}, {name:'Sejf za obrazem',icon:'🖼️',story:'Za obrazem ukryto sejf. Rozpoznaj znaczenia wyrazów na jego zamku.',mode:'reverse'}];
  let state=null;
  const available=()=>state && ready && !saving && account?.userId===state.owner && activeLanguage===state.language && !state.finished;
  function shuffle(rows){const out=[...rows];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function label(word){return word.word+(state?.language==='Japanese' && word.reading?' ('+word.reading+')':'');}
  function normalize(text){let s=text.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');return state.language==='Japanese'?s.replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)):s;}
  function reset(){state=null;el('escapeRoom').hidden=true;el('escapePuzzle').hidden=true;el('escapeDoorPanel').hidden=true;el('escapeOptions').replaceChildren();el('escapeInventory').replaceChildren();el('escapeMessage').textContent='';el('escapeFeedback').textContent='';el('escapeCode').value='';el('escapeAnswer').value='';el('escapeVictory').hidden=true;el('escapeScene').classList.remove('escaped');}
  function controls(){
    const enabled=Boolean(available());
    for(const id of ['escapeShelf','escapeDesk','escapePainting','escapeDoor','escapeClosePuzzle','escapeCloseDoor','escapeReturn','escapeCheckCode'])el(id).disabled=!enabled;
    const questionEnabled=enabled && state.active!==null && !state.correct;
    for(const id of ['escapeCheckAnswer','escapeAnswer','escapeHint'])el(id).disabled=!questionEnabled;
    el('escapeNext').disabled=!enabled || !state.correct;
    el('escapeCode').disabled=!enabled;
    for(const button of el('escapeOptions').children)button.disabled=!questionEnabled || state.wrong.has(button.dataset.id);
  }
  function inventory(){
    el('escapeInventory').replaceChildren();
    state.solved.forEach((solved,i)=>{const item=document.createElement('span');item.className='escape-token'+(solved?' found':'');item.textContent=solved?'🔑 '+(i+1)+': '+state.code[i]:'🔒 Pieczęć '+(i+1);el('escapeInventory').append(item);});
    const count=state.solved.filter(Boolean).length;
    el('escapeProgress').textContent='Pieczęcie: '+count+' / 3 · Rozwiązane zagadki: '+state.completed+' / '+state.words.length;
    for(const [i,id] of ['escapeShelf','escapeDesk','escapePainting'].entries()){el(id).classList.toggle('solved',state.solved[i]);el(id).setAttribute('aria-label',locks[i].name+(state.solved[i]?' — pieczęć zdobyta':' — zbadaj'));}
    if(count===3)el('escapeMessage').textContent='Masz trzy pieczęcie! Cyfry w ekwipunku, w kolejności 1–2–3, otworzą drzwi. Kliknij wyjście.';
    controls();
  }
  function start(words,{owner,language,onFinish}){
    reset();if(words.length<3)return false;
    state={words:[...words],owner,language,onFinish,groups:locks.map((_,i)=>words.filter((w,j)=>j%3===i)),indexes:[0,0,0],solved:[false,false,false],code:Array.from({length:3},()=>Math.floor(Math.random()*10)),active:null,correct:false,wrong:new Set(),hinted:false,hints:0,mistakes:0,completed:0,finished:false};
    el('escapeRoom').hidden=false;el('escapeMessage').textContent='Drzwi zatrzasnęły się za Tobą. Zbadaj książki, biurko i obraz. Każdy przedmiot skrywa pieczęć z cyfrą kodu.';
    inventory();el('escapeRoom').scrollIntoView?.({block:'start'});return true;
  }
  function explore(index){
    if(!available() || !locks[index])return;
    if(state.solved[index]){el('escapeMessage').textContent='Ten schowek jest otwarty. Pieczęć '+(index+1)+' ma cyfrę '+state.code[index]+'.';return;}
    state.active=index;state.correct=false;state.wrong.clear();state.hinted=false;
    el('escapeDoorPanel').hidden=true;el('escapePuzzle').hidden=false;
    renderPuzzle();el('escapePuzzle').scrollIntoView?.({block:'start'});
  }
  function word(){return state.groups[state.active][state.indexes[state.active]];}
  function renderPuzzle(){
    const index=state.active,config=locks[index],current=word();
    el('escapePuzzleTitle').textContent=config.icon+' '+config.name;
    el('escapeStory').textContent=config.story;
    el('escapePuzzleCount').textContent='Zagadka '+(state.indexes[index]+1)+' / '+state.groups[index].length;
    el('escapePrompt').textContent=config.mode==='reverse'?label(current):current.translation;
    el('escapePrompt').lang=config.mode==='reverse'?languageInfo[state.language]?.code || 'en':'pl';
    el('escapePromptInstruction').textContent=config.mode==='write'?'Uzupełnij dziennik: wpisz słówko w języku obcym.':config.mode==='reverse'?'Wybierz polskie znaczenie napisu na sejfie.':'Wybierz słówko pasujące do znaczenia.';
    el('escapeWriteForm').hidden=config.mode!=='write';el('escapeOptions').hidden=config.mode==='write';el('escapeOptions').replaceChildren();
    el('escapeAnswer').value='';el('escapeAnswer').lang=languageInfo[state.language]?.code || 'en';el('escapeWriteHint').hidden=state.language!=='Japanese';
    el('escapeFeedback').textContent='';el('escapeNext').hidden=true;
    if(config.mode!=='write')for(const option of shuffle([current,...shuffle(state.words.filter(w=>w.id!==current.id)).slice(0,3)])){
      const button=document.createElement('button');button.type='button';button.className='escape-option';button.dataset.id=option.id;
      button.textContent=config.mode==='reverse'?option.translation:label(option);
      button.addEventListener('click',()=>choose(option.id));el('escapeOptions').append(button);
    }
    controls();
  }
  function result(correct){
    if(!available() || state.active===null || state.correct)return;
    if(!correct){state.mistakes++;el('escapeFeedback').textContent='Zamek nie ustąpił. Spróbuj jeszcze raz — zdobyte pieczęcie zostają.';controls();return;}
    state.correct=true;state.completed++;el('escapeFeedback').textContent='✓ Słychać kliknięcie. To właściwa odpowiedź!';
    const last=state.indexes[state.active]===state.groups[state.active].length-1;
    if(last){state.solved[state.active]=true;inventory();el('escapeFeedback').textContent='🔑 Schowek otwarty! Zdobywasz pieczęć '+(state.active+1)+' z cyfrą '+state.code[state.active]+'.';}
    el('escapeNext').hidden=false;el('escapeNext').textContent=last?'Wróć do pokoju':'Odczytaj kolejną zagadkę →';controls();
  }
  function choose(id){
    if(!available() || state.active===null || state.correct || state.wrong.has(id) || !Array.from(el('escapeOptions').children).some(b=>b.dataset.id===id))return;
    const correct=id===word().id;if(!correct)state.wrong.add(id);result(correct);
  }
  function write(event){
    event.preventDefault();if(!available() || state.active===null || locks[state.active].mode!=='write' || state.correct)return;
    const value=el('escapeAnswer').value;if(!value.trim()){el('escapeFeedback').textContent='Najpierw wpisz odpowiedź.';return;}
    const current=word(),accepted=[current.word,...(state.language==='Japanese' && current.reading?[current.reading]:[])];
    result(accepted.some(answer=>normalize(answer)===normalize(value)));
  }
  function closePuzzle(){if(!available())return;if(state.active!==null && state.correct && !state.solved[state.active])state.indexes[state.active]++;state.active=null;state.correct=false;el('escapePuzzle').hidden=true;controls();el('escapeScene').scrollIntoView?.({block:'start'});}
  function next(){
    if(!available() || state.active===null || !state.correct)return;
    if(state.solved[state.active]){closePuzzle();return;}
    state.indexes[state.active]++;state.correct=false;state.wrong.clear();state.hinted=false;renderPuzzle();
  }
  function hint(){
    if(!available() || state.active===null || state.correct)return;
    if(!state.hinted){state.hints++;state.hinted=true;}
    el('escapeFeedback').textContent='Podpowiedź: '+(locks[state.active].mode==='reverse'?word().translation:label(word()))+'. Wybierz lub wpisz tę odpowiedź, aby otworzyć zamek.';
  }
  function door(){
    if(!available())return;
    closePuzzle();el('escapeDoorPanel').hidden=false;el('escapeDoorFeedback').textContent=state.solved.every(Boolean)?'Wpisz cyfry pieczęci w kolejności 1–2–3.':'Potrzebujesz trzech pieczęci. Zbadaj wszystkie schowki w pokoju.';controls();el('escapeDoorPanel').scrollIntoView?.({block:'start'});
  }
  function unlock(event){
    event.preventDefault();if(!available())return;
    if(!state.solved.every(Boolean)){el('escapeDoorFeedback').textContent='Najpierw zdobądź wszystkie trzy pieczęcie. Sam kod nie wystarczy.';return;}
    if(el('escapeCode').value.trim()!==state.code.join('')){el('escapeDoorFeedback').textContent='To nie ten kod. Sprawdź cyfry w ekwipunku i ich kolejność 1–2–3.';return;}
    state.finished=true;el('escapeDoorPanel').hidden=true;el('escapeVictory').hidden=false;el('escapeScene').classList.add('escaped');
    el('escapeMessage').textContent='Światło wpada przez otwarte drzwi. Biblioteka odzyskała wszystkie słowa — jesteś na wolności!';controls();
    el('escapeScene').scrollIntoView?.({block:'start'});
    state.onFinish('Ucieczka udana! Rozwiązane zagadki: '+state.completed+'. Błędne próby: '+state.mistakes+'. Podpowiedzi: '+state.hints+'.');
  }
  for(const [index,id] of ['escapeShelf','escapeDesk','escapePainting'].entries())el(id).onclick=()=>explore(index);
  el('escapeClosePuzzle').onclick=closePuzzle;el('escapeReturn').onclick=closePuzzle;el('escapeNext').onclick=next;el('escapeHint').onclick=hint;el('escapeDoor').onclick=door;
  el('escapeCloseDoor').onclick=()=>{el('escapeDoorPanel').hidden=true;};el('escapeDoorForm').onsubmit=unlock;el('escapeWriteForm').onsubmit=write;
  window.TooweeEscape=Object.freeze({start,reset,updateControls:controls});reset();
})();
