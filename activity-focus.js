'use strict';
(() => {
  const el=id=>document.getElementById(id);let state=null,page=0,groups=[],pager=null;
  const observed=['gameWords','gameTranslations','gameMemoryBoard','taskQuestions','testArea'];
  const titles={games:'Gry',tasks:'Zadania',tests:'Szybki test'};
  function hashFor(s){return '#/'+({games:'gry',tasks:'zadania',tests:'test'}[s.id])+'/'+(s.kind || 'sesja')+(s.playing && s.id==='games'?'/gra':'');}
  function leave(){
    document.body.classList.remove('activity-focus');
    for(const id of Object.keys(titles)){el(id).classList.remove('activity-screen','activity-playing');el(id).removeAttribute('data-activity-kind');}
    for(const group of groups)for(const item of group)item.hidden=false;
    if(pager)pager.hidden=true;state=null;groups=[];page=0;
  }
  function close(){const previous=state;leave();if(previous && location.hash===hashFor(previous))history.replaceState(null,'','#/'+previous.id);}
  function back(){
    const id=state?.id;close();
    if(id==='games')window.openGamesLobby();
    else if(id==='tasks')window.openTasksLobby();
    else if(id==='tests')tab('tests');
  }
  function header(id){
    let bar=el('activityHeader-'+id);if(bar)return bar;
    bar=document.createElement('div');bar.id='activityHeader-'+id;bar.className='activity-header';
    const button=document.createElement('button');button.type='button';button.className='alt';button.textContent='← '+(id==='games'?(window.worldGameMission?'Wróć na mapę':'Wybór gry'):'Ustawienia');button.onclick=back;
    const title=document.createElement('strong');title.id='activityTitle-'+id;
    bar.append(button,title);if(id==='games'){const help=document.createElement('button');help.type='button';help.className='alt toowee-game-help';help.textContent='Jak grać?';help.onclick=()=>{if(state?.kind==='dice'&&window.TooweeMagicDice?.showHelp){window.TooweeMagicDice.showHelp();return;}const instructions={dice:'Odpowiadaj na pytania, wybieraj kostki i układaj je na planszy zgodnie z zasadami pól. W trybie klasowym każdy gracz ma własną planszę.',match:'Łącz słówka z poprawnymi tłumaczeniami.',memory:'Odkrywaj po dwie karty i szukaj pasujących par.',quiz:'Wybierz poprawne tłumaczenie spośród odpowiedzi.',write:'Wpisz poprawne tłumaczenie lub słówko.',escape:'Odpowiadaj na pytania, aby przejść kolejne etapy escape roomu.',falling:'Wybieraj poprawne odpowiedzi, zanim spadające słówka dotrą na dół.'};const dlg=document.createElement('dialog');dlg.className='toowee-game-help-dialog';dlg.style.cssText='border:1px solid #d9c4e9;border-radius:20px;padding:24px;max-width:480px;width:90vw;background:#fff9ff;color:#39274e';const h=document.createElement('h2');h.textContent='❔ Jak grać?';const p=document.createElement('p');p.textContent=instructions[state?.kind]||'Odpowiadaj na pytania i wykonuj zadania zgodnie z zasadami wybranej gry.';const done=document.createElement('button');done.textContent='Wróć do gry';done.className='alt';done.onclick=()=>dlg.close();dlg.append(h,p,done);dlg.addEventListener('close',()=>dlg.remove());document.body.append(dlg);dlg.showModal();};const actions=document.createElement('div');actions.className='activity-header-actions';actions.append(help);if(el('teacherEndGameNow'))actions.append(el('teacherEndGameNow'));bar.append(actions);}el(id).prepend(bar);return bar;
  }
  function open(id,title,playing=false,kind=''){
    if(!titles[id] || !ready || !account?.userId || !activeLanguage)return;
    if(state?.id!==id)leave();
    const before=state?hashFor(state):'';
    state={id,title,playing,kind,owner:account.userId,language:activeLanguage};page=0;
    header(id);el('activityHeader-'+id).querySelector('button').textContent='← '+(id==='games'?(window.worldGameMission?'Wróć na mapę':'Wybór gry'):'Ustawienia');el('activityTitle-'+id).textContent=title;if(id==='games'&&kind){const icon=document.createElement('img');icon.src='assets/game-icons/'+kind+'.webp';icon.alt='';icon.className='activity-game-icon';el('activityTitle-'+id).prepend(icon);}
    el(id).classList.add('activity-screen');el(id).classList.toggle('activity-playing',playing);el(id).dataset.activityKind=kind;
    document.body.classList.add('activity-focus');tab(id);
    const hash=hashFor(state);if(location.hash!==hash)history[before?'replaceState':'pushState'](null,'',hash);
    paginate();el('activityHeader-'+id).querySelector('button').focus({preventScroll:true});
  }
  function setPlaying(value){if(!state || state.id!=='games')return;const before=hashFor(state);state.playing=value;el('games').classList.toggle('activity-playing',value);if(location.hash===before)history.replaceState(null,'',hashFor(state));}
  function paginate(){
    if(!state)return;
    const oldGroups=groups;for(const group of oldGroups)for(const item of group)item.hidden=false;
    groups=[];let host;
    if(state.id==='tasks'){
      groups=[...el('taskQuestions').children].map(item=>[item]);host=el('taskWorksheet');
    }else if(state.id==='tests'){
      const questions=[...el('testArea').querySelectorAll('.question')];
      groups=questions.length?questions.map(item=>[item]):[...el('testArea').querySelectorAll('p')].reduce((out,item,i)=>{if(i%4===0)out.push([]);out.at(-1).push(item);return out;},[]);host=el('tests');
    }else if(state.playing && ['match','memory'].includes(state.kind)){
      const left=state.kind==='match'?[...el('gameWords').children]:[...el('gameMemoryBoard').children];
      const right=state.kind==='match'?[...el('gameTranslations').children]:[];
      const ids=[...new Set(left.map(item=>item.dataset.pair || item.dataset.id))];const size=state.kind==='match'?5:6;
      for(let i=0;i<ids.length;i+=size){const chunk=new Set(ids.slice(i,i+size));groups.push([...left,...right].filter(item=>chunk.has(item.dataset.pair || item.dataset.id)));}
      host=el('games');
    }
    if(!host){if(pager)pager.hidden=true;return;}
    if(!pager){pager=document.createElement('div');pager.className='activity-pagination';pager.id='activityPagination';
      const previous=document.createElement('button');previous.type='button';previous.className='alt';previous.textContent='← Poprzednia strona';previous.onclick=()=>showPage(page-1);
      const count=document.createElement('span');count.setAttribute('aria-live','polite');
      const next=document.createElement('button');next.type='button';next.textContent='Następna strona →';next.onclick=()=>showPage(page+1);
      pager.append(previous,count,next);
    }
    host.append(pager);showPage(Math.min(page,Math.max(0,groups.length-1)));
  }
  function showPage(index){
    page=Math.max(0,Math.min(index,groups.length-1));groups.forEach((items,i)=>items.forEach(item=>item.hidden=i!==page));
    if(!pager)return;pager.hidden=groups.length<2;
    pager.children[0].disabled=page<=0;pager.children[1].textContent=(page+1)+' / '+groups.length;pager.children[2].disabled=page>=groups.length-1;
  }
  window.revealActivityQuestion=input=>{const index=groups.findIndex(items=>items.some(item=>item.contains(input)));if(index>=0)showPage(index);};
  window.openActivityFocus=open;window.closeActivityFocus=close;window.setActivityPlaying=setPlaying;
  window.onActivityTabChange=id=>{if(state && (id!==state.id || state.owner!==account?.userId || state.language!==activeLanguage))close();};
  for(const id of observed)new MutationObserver(()=>{if(state)paginate();}).observe(el(id),{childList:true});
  window.addEventListener('popstate',()=>{
    if(!state || location.hash===hashFor(state))return;
    const id=state.id;leave();if(id==='games')window.pauseFallingGame?.();tab(id);
  });
})();
