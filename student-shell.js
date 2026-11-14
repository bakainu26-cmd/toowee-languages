'use strict';
// Presentation adapter only: route through existing student controls and keep their data/handlers.
(()=>{
 const el=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const workspace=el('learningWorkspace'),picker=el('languagePicker');if(!workspace||!picker)return;
 for(const root of [workspace,picker,el('connectionsPanel'),el('accountPanel')])root?.classList.add('student-workspace');
 const sidebar=make('aside',null,'teacher-entry-grid-shell');sidebar.id='studentSidebar';sidebar.hidden=true;sidebar.setAttribute('aria-label','Nawigacja ucznia');sidebar.append(make('h2','Uczeń'));
 const menu=make('nav',null,'teacher-entry-grid');menu.setAttribute('aria-label','Panel ucznia');sidebar.append(menu);document.body.prepend(sidebar);
 const hero=make('div',null,'teacher-cozy-hero tw-page-banner'),copy=make('div',null,'teacher-cozy-welcome'),eyebrow=make('p','TWOJA PRZESTRZEŃ DO NAUKI'),title=make('h2','Wybierz język');hero.id='studentPageBanner';hero.hidden=true;copy.append(eyebrow,title);hero.append(copy);picker.before(hero);
 const labels={dashboard:'Pulpit',learning:'Zestawy do nauki i powtórki',words:'Słówka',folders:'Foldery i listy słówek',games:'Gry',tasks:'Zadania',progress:'Statystyki i postęp',world:'Mój świat',study:'Fiszki',imports:'Import słownictwa',tests:'Szybki test',connections:'Moje konto'};
 const buttons=new Map();
 function button(text,action){const b=make('button',text,'alt');b.type='button';b.onclick=action;return b;}
 function arrow(){const n=make('span',null,'teacher-language-chevron');n.setAttribute('aria-hidden','true');return n;}
 function disclosure(label,id){const b=button(label,()=>{const open=list.hidden;list.hidden=!open;b.setAttribute('aria-expanded',String(open));}),list=make('div',null,'teacher-sidebar-submenu');list.id=id;list.hidden=true;b.classList.add('teacher-language-toggle');b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',id);b.append(arrow());menu.append(b,list);return list;}
 const languages=disclosure('Języki','studentLanguageList');
 for(const [code,name,flag] of [['Japanese','Japoński','🇯🇵'],['English','Angielski','🇬🇧'],['Spanish','Hiszpański','🇪🇸']]){const b=button(flag+' '+name,()=>el('choose'+code)?.click());b.dataset.studentLanguage=code;b.setAttribute('aria-pressed','false');languages.append(b);}
 function route(view){if(window.tooweeView!=='student')return;const source=el('nav-'+view);if(source){source.click();return;}if(typeof tab==='function')tab(view);}
 for(const [view,name,icon] of [['dashboard','Pulpit','statistics'],['learning','Zestawy','words'],['words','Słówka','words'],['games','Gry','games'],['tasks','Zadania','words'],['progress','Statystyki','statistics'],['world','Mój świat','games'],['whiteboard','Tablica','words'],['notebook','Zeszyt','words'],['connections','Moje konto',null]]){
  const row=make('div',null,'teacher-sidebar-nav-row teacher-global-nav-row'),b=button('',()=>route(view));b.dataset.studentView=view;const image=make('img');if(icon){image.src='assets/profile-'+icon+'-pastel.svg';image.alt='';image.className='student-nav-icon';b.append(image);}b.append(make('span',name));row.append(b);menu.append(row);buttons.set(view,b);
  if(view==='words'){const list=make('div',null,'teacher-sidebar-submenu');list.id='studentWordViews';list.hidden=true;const toggle=button('',()=>{list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));});toggle.classList.add('teacher-sidebar-toggle');toggle.setAttribute('aria-label','Rozwiń słówka i foldery');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',list.id);toggle.append(arrow());row.append(toggle);list.append(button('Wszystkie słówka',()=>route('words')),button('Foldery i listy',()=>route('folders')),button('Importuj słownictwo',()=>route('imports')));row.after(list);}
 }
 const joinButton=button('Dołącz do gry',()=>window.openTooWeeGameJoin?.());joinButton.id='studentJoinGame';menu.append(joinButton);
 const resumeButton=button('Wróć do ostatniej gry',()=>el('resumeSophie')?.click());menu.append(resumeButton);
 const accountButton=button('Moje konto',()=>route('connections'));accountButton.id='studentAccountButton';document.querySelector('.site-header')?.append(accountButton);
 const oldDashboard=el('dashboard')?.querySelector('.dashboard-brand');if(oldDashboard){oldDashboard.querySelector('h2').textContent='Twoja przestrzeń do nauki';oldDashboard.querySelector('p').textContent='Słówka, powtórki i małe kroki każdego dnia.';}
 const dashboardHint=el('dashboard')?.querySelector('.hint');if(dashboardHint)dashboardHint.textContent='Wybierz zestaw do nauki albo wróć do zaplanowanych powtórek. Swój postęp i serię dni nauki sprawdzisz w statystykach.';
 const cardSelectors='#learningSetCards>.question,.learning-tile,.progress-stat,#dashboard .world-dashboard,.language-choice,#assignedExerciseSets article';
 function decorate(){for(const card of workspace.querySelectorAll(cardSelectors))card.classList.add('tw-cozy-card');for(const card of picker.querySelectorAll('.language-choice'))card.classList.add('tw-cozy-card');for(const card of el('games')?.querySelectorAll('.game-type')||[])card.classList.add('cozy-game-choice');}
 function sync(){const student=window.tooweeView==='student';sidebar.hidden=hero.hidden=accountButton.hidden=!student;if(!student)return;resumeButton.hidden=el('resumeSophie')?.hidden!==false;
  const language=typeof activeLanguage!=='undefined'?activeLanguage:null,view=window.tooweeCurrentTab||'learning';document.body.dataset.studentPage=view==='connections'?'connections':language?view:'languages';accountButton.textContent=(window.tooweeProfile?.display_name||'Moje konto').split(' ')[0];if(view==='connections')picker.hidden=true;
  title.textContent=view==='connections'?'Moje konto':language?(labels[view]||'Twoja nauka'):'Wybierz język';eyebrow.textContent=language?({Japanese:'JAPOŃSKI',English:'ANGIELSKI',Spanish:'HISZPAŃSKI'}[language]||'TWOJA PRZESTRZEŃ DO NAUKI'):'TWOJA PRZESTRZEŃ DO NAUKI';
  for(const b of languages.children){b.classList.toggle('active',b.dataset.studentLanguage===language);b.setAttribute('aria-pressed',String(b.dataset.studentLanguage===language));}
  const selected=['folders','imports'].includes(view)?'words':['study','tests'].includes(view)?'learning':view;
  for(const [key,b]of buttons){const active=Boolean(language)&&key===selected;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.disabled=!language&&key!=='connections';if(['whiteboard','notebook'].includes(key)){const source=el('nav-'+key);b.parentElement.hidden=!source||source.hidden;b.disabled=Boolean(source?.disabled)||!language;}}
  if(!language&&view!=='connections')el('connectionsPanel').hidden=true;
  decorate();
 }
 window.addEventListener('toowee-tab',sync);window.addEventListener('toowee-profile',sync);window.addEventListener('toowee-account',()=>{languages.hidden=true;menu.firstElementChild.setAttribute('aria-expanded','false');sidebar.hidden=hero.hidden=true;});
 let scheduled=false;const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;if(document.body&&window.tooweeView==='student')decorate();});}});observer.observe(workspace,{childList:true,subtree:true});observer.observe(picker,{childList:true,subtree:true});window.addEventListener('pagehide',()=>observer.disconnect());sync();
})();
