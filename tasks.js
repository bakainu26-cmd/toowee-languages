'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let rows=[],submitted=false,sessionOwner=null,sessionLanguage=null,sessionKind='write',sessionDirection='toTarget';
  const available=()=>ready && !saving && Boolean(account?.userId) && Boolean(activeLanguage);
  const current=()=>available() && sessionOwner===account.userId && sessionLanguage===activeLanguage;
  function shuffle(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function normalize(value,japanese=false){let s=String(value).trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');return japanese?s.replace(/\s/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)):s;}
  function updateTaskControls(){
    el('generateTasks').disabled=!available();
    for(const id of ['taskType','taskCount','taskDirection'])el(id).disabled=!available();
    el('taskDirection').disabled=!available() || ['gaps','match'].includes(el('taskType').value);
    el('taskFolder').disabled=!available() || Boolean(window.getLearningContext?.());
    el('checkTasks').disabled=!current() || submitted || !rows.length;
    for(const row of rows)row.input.disabled=!current() || submitted;
  }
  function resetTasks(){
    rows=[];submitted=false;sessionOwner=null;sessionLanguage=null;
    if(el('taskType').value==='match')el('taskDirection').value='toPolish';
    if(el('taskType').value==='gaps')el('taskDirection').value='toTarget';
    el('taskQuestions').replaceChildren();el('taskResults').replaceChildren();el('checkTasks').hidden=true;
    el('taskStatus').textContent=available()?'Wybierz rodzaj zadania, zestaw i liczbę słówek.':'Zaloguj się i wczytaj bibliotekę.';
    el('taskReadingHint').hidden=activeLanguage!=='Japanese';
    updateTaskControls();
  }
  function updateTaskFolders(){
    const selected=el('taskFolder').value;el('taskFolder').replaceChildren(new Option('Wszystkie zestawy',''));
    for(const folder of activeFolders())el('taskFolder').add(new Option(folder.name,folder.id));
    el('taskFolder').value=activeFolders().some(f=>f.id===selected)?selected:'';resetTasks();
  }
  function mask(value){
    const letters=Array.from(value),positions=letters.map((c,i)=>/\p{L}|\p{N}/u.test(c)?i:-1).filter(i=>i>=0);
    const hidden=new Set(shuffle(positions).slice(0,Math.max(1,Math.ceil(positions.length/2))));
    return letters.map((c,i)=>hidden.has(i)?'＿':c).join('');
  }
  function targetLabel(word){return word.word+(activeLanguage==='Japanese' && word.reading?' ('+word.reading+')':'');}
  function generate(){
    if(!available())return;resetTasks();
    const folder=el('taskFolder').value,kind=el('taskType').value;
    if(!['write','choice','match','gaps'].includes(kind))return;
    const seenTerms=new Set(),seenMeanings=new Set();
    let words=window.filterLearningWords?window.filterLearningWords(activeWords()):activeWords();
    words=shuffle(words.filter(w=>!folder || w.folder_id===folder)).filter(w=>{
      const term=normalize(w.word),meaning=normalize(w.translation);if(!term||!meaning||seenTerms.has(term)||seenMeanings.has(meaning))return false;
      seenTerms.add(term);seenMeanings.add(meaning);return true;
    });
    const count=Number(el('taskCount').value),limit=[6,10,15,20,25].includes(count)?count:10;
    const selected=words.slice(0,limit);
    if(selected.length<(['choice','match'].includes(kind)?2:1)){el('taskStatus').textContent=['choice','match'].includes(kind)?'Potrzeba co najmniej 2 różnych słówek i tłumaczeń w tym zestawie i kategorii.':'Brak słówek w wybranym zestawie i kategorii.';return;}
    sessionOwner=account.userId;sessionLanguage=activeLanguage;sessionKind=kind;sessionDirection=kind==='match'?'toPolish':kind==='gaps'?'toTarget':el('taskDirection').value;
    const toTarget=sessionDirection==='toTarget',choicesForMatch=shuffle(selected);
    selected.forEach((word,index)=>{
      const card=document.createElement('div');card.className='question';const prompt=document.createElement('label');const inputId='taskAnswer-'+index;
      prompt.setAttribute('for',inputId);prompt.textContent=(index+1)+'. '+(toTarget?word.translation:targetLabel(word));card.append(prompt);
      if(kind==='gaps'){const hint=document.createElement('p');hint.className='task-mask';hint.textContent=mask(activeLanguage==='Japanese' && word.reading?word.reading:word.word);hint.lang=languageInfo[activeLanguage]?.code || 'en';card.append(hint);}
      const input=document.createElement(['choice','match'].includes(kind)?'select':'input');input.id=inputId;
      if(['choice','match'].includes(kind)){
        input.add(new Option('Wybierz odpowiedź',''));
        const choices=kind==='match'?choicesForMatch:shuffle([word,...shuffle(words.filter(w=>w.id!==word.id)).slice(0,3)]);
        for(const option of choices)input.add(new Option(toTarget?targetLabel(option):option.translation,option.id));
      }else{input.type='text';input.autocomplete='off';input.spellcheck=false;input.maxLength=1000;input.setAttribute('autocapitalize','off');input.placeholder=kind==='gaps'?'Wpisz całe uzupełnione słówko':'Wpisz tłumaczenie';}
      const feedback=document.createElement('p');feedback.hidden=true;feedback.className='task-feedback';card.append(input,feedback);el('taskQuestions').append(card);rows.push({word,input,feedback});
    });
    el('taskStatus').textContent='Przygotowano '+rows.length+' zadań'+(rows.length<limit?' — tyle różnych słówek jest dostępnych':'')+'. '+(kind==='match'?'Dopasuj tłumaczenia w rozwijanych listach. Każde wykorzystaj raz.':kind==='gaps'?'Wpisz całe słowo, uzupełniając brakujące litery lub kana.':'Uzupełnij odpowiedzi i sprawdź cały zestaw.');
    el('checkTasks').hidden=false;updateTaskControls();
  }
  function check(event){
    event.preventDefault();if(!current() || submitted || !rows.length)return;
    const empty=rows.find(r=>!r.input.value.trim());if(empty){el('taskStatus').textContent='Uzupełnij wszystkie odpowiedzi przed sprawdzeniem.';empty.input.focus?.();return;}
    submitted=true;let score=0;
    for(const {word,input,feedback} of rows){
      const toTarget=sessionDirection==='toTarget',japanese=toTarget && activeLanguage==='Japanese';
      const accepted=toTarget?[word.word,...(japanese && word.reading?[word.reading]:[])]:[word.translation];
      const correct=['choice','match'].includes(sessionKind)?input.value===word.id:accepted.some(answer=>normalize(answer,japanese)===normalize(input.value,japanese));
      if(correct)score++;
      feedback.hidden=false;feedback.className='task-feedback '+(correct?'task-correct':'task-wrong');feedback.textContent=(correct?'✓ Dobrze. ':'✗ Poprawna odpowiedź: ')+(correct?'':japanese?targetLabel(word):accepted.join(' / '));
    }
    const result=document.createElement('h3');result.textContent='Wynik: '+score+' / '+rows.length+' ('+Math.round(100*score/rows.length)+'%)';el('taskResults').append(result);
    el('taskStatus').textContent='Zadania sprawdzone. Kliknij „Przygotuj zadania”, aby rozpocząć kolejną rundę.';updateTaskControls();
  }
  for(const id of ['taskType','taskFolder','taskCount','taskDirection'])el(id).onchange=resetTasks;
  el('generateTasks').onclick=generate;el('taskWorksheet').onsubmit=check;
  window.openTasksLobby=()=>{if(window.clearLearningContext)window.clearLearningContext();el('taskFolder').value='';resetTasks();tab('tasks');};
  window.resetTasks=resetTasks;window.updateTaskFolders=updateTaskFolders;window.updateTaskControls=updateTaskControls;
  updateTaskFolders();
})();
