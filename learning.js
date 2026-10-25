'use strict';
(() => {
  const el=id=>document.getElementById(id),srs=window.TooweeSRS;
  let records=new Map(),owner=null,loaded=false,loading=false,version=0,view='learn',context=null;
  const labels={learn:'Do nauki',review:'Do powtórki',learned:'Nauczone'};
  const available=()=>ready && !saving && Boolean(account?.userId) && Boolean(activeLanguage);
  function groups() {
    const result=activeFolders().map(f=>({...f,words:activeWords().filter(w=>w.folder_id===f.id)}));
    const loose=activeWords().filter(w=>!w.folder_id);
    if(loose.length)result.push({id:null,name:'Bez zestawu',words:loose});
    return result;
  }
  function clearContext(){context=null;el('learningMethods').hidden=true;el('learningSets').hidden=false;el('learningSetTitle').textContent='';}
  function chooseView(value){view=value;clearContext();render();}
  function render() {
    for(const key of Object.keys(labels)) {
      const button=el('learningView-'+key);button.classList.toggle('active',view===key);button.setAttribute('aria-pressed',String(view===key));
      const counts=loaded && owner===account?.userId ? srs.counts(activeWords(),records) : null;
      button.textContent=labels[key]+(counts ? ' ('+counts[key]+')' : '');
    }
    el('refreshLearning').disabled=!available() || loading;
    if(!loaded || owner!==account?.userId){el('learningSetCards').replaceChildren();return;}
    const all=groups();el('learningSetCards').replaceChildren();let shown=0;
    for(const group of all) {
      const counts=srs.counts(group.words,records);
      if(!(counts[view] || (view==='learn' && counts.waiting)))continue;
      shown++;
      const card=document.createElement('div');card.className='question';
      const title=document.createElement('h3');title.textContent=group.name;
      const info=document.createElement('p');info.textContent=counts.learn+' do nauki · '+counts.review+' do powtórki · '+counts.learned+' nauczone · '+counts.waiting+' w utrwalaniu';
      const button=document.createElement('button');button.type='button';button.disabled=!available();
      const mode=counts[view] ? view : 'waiting';
      button.textContent=mode==='waiting' ? 'Ćwicz dodatkowo' : 'Otwórz zestaw';
      button.onclick=()=>openSet(group,mode);
      card.append(title,info);
      const future=group.words.map(w=>records.get(w.id)).filter(p=>p?.stage>0&&!srs.isDue(p)).sort((a,b)=>new Date(a.due_at)-new Date(b.due_at))[0];
      if(future){const date=document.createElement('p');date.className='scope-hint';date.textContent='Najbliższa zaplanowana powtórka: '+new Date(future.due_at).toLocaleString('pl-PL',{dateStyle:'short',timeStyle:'short'})+'.';card.append(date);}
      card.append(button);el('learningSetCards').append(card);
    }
    el('learningEmpty').hidden=shown>0;
    el('learningEmpty').textContent=view==='learn' ? 'Nie masz teraz słówek do nauki. Dodaj nowe słownictwo lub sprawdź powtórki.' : view==='review' ? 'Na tę chwilę nie masz zaplanowanych ani zaległych powtórek.' : 'Tutaj pojawią się słówka po udanej powtórce następującej po 7-dniowej przerwie.';
    if(context){const current=all.find(g=>g.id===context.folder);if(!current)clearContext();}
  }
  function openSet(group,category) {
    if(!available())return;
    if(window.resetStudy)window.resetStudy();if(window.resetGame)window.resetGame();quiz=[];el('testArea').replaceChildren();
    context={folder:group.id,category,language:activeLanguage};
    el('learningSets').hidden=true;el('learningMethods').hidden=false;el('learningSetTitle').textContent=group.name+' — '+(labels[category] || 'W utrwalaniu');
    el('learningSetHint').textContent=category==='review' ? 'Powtórka: przypominasz sobie słówko raz. „Nie umiem” przenosi je do nauki.' : category==='learn' ? 'Nauka: ćwiczysz porcję, a na końcu potwierdzasz wynik w weryfikacji.' : 'Dodatkowe ćwiczenie nie przyspiesza etapów ani terminu powtórki. „Nie umiem” przenosi słówko do nauki.';
    el('studyMode').value=category==='learn' ? 'learn' : category==='review' ? 'review' : 'practice';
    el('search').value='';el('wordFolder').value=group.id || '';
    el('studyScope').value='all';el('filterFolder').value=group.id || '';el('gameFolder').value=group.id || '';
    if(window.resetStudy)window.resetStudy();renderWords();
  }
  function filter(words, progress=records) {
    if(!context || context.language!==activeLanguage)return words;
    return words.filter(w=>(w.folder_id || null)===context.folder && srs.category(progress.get(w.id))===context.category);
  }
  async function refresh() {
    if(!available())return;
    const current=++version,snapshot={...account};loading=true;el('learningStatus').textContent='Wczytywanie zestawów i terminów powtórek…';render();
    try{
      const next=new Map();for(let start=0;;start+=500){const {data,error}=await snapshot.client.from('vocabulary_progress').select('*').eq('owner_id',snapshot.userId).order('word_id').range(start,start+499);if(error)throw error;data.forEach(p=>next.set(p.word_id,p));if(data.length<500)break;}
      if(current!==version || snapshot.userId!==account?.userId)return;
      records=next;owner=snapshot.userId;loaded=true;el('learningStatus').textContent='Każdy zestaw może mieć słówka w kilku kategoriach. „W utrwalaniu” oznacza etapy 1–3 przed kolejną powtórką.';
    }catch(error){if(current===version){loaded=false;el('learningStatus').textContent='Nie udało się wczytać powtórek. '+(error.message || 'Spróbuj ponownie.');}}
    finally{if(current===version){loading=false;render();}}
  }
  function reset(){++version;records.clear();owner=null;loaded=false;loading=false;view='learn';clearContext();render();}
  for(const key of Object.keys(labels))el('learningView-'+key).onclick=()=>chooseView(key);
  el('backToLearningSets').onclick=()=>{clearContext();render();};el('refreshLearning').onclick=refresh;
  window.filterLearningWords=filter;window.refreshLearningSets=refresh;window.resetLearningSets=reset;
  window.clearLearningContext=()=>{clearContext();el('filterFolder').value='';el('search').value='';renderWords();};
  window.getLearningContext=()=>context;
  window.setLearningProgress=rows=>{++version;loading=false;records=new Map(rows.map(p=>[p.word_id,p]));owner=account?.userId;loaded=true;render();};
  reset();
})();
