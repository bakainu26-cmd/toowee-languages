'use strict';
(()=>{
 const names={English:'Angielski',Japanese:'Japoński',Spanish:'Hiszpański'};
 const node=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt)n.textContent=txt;if(cls)n.className=cls;return n;};
 const button=(txt,fn)=>{const b=node('button',txt);b.type='button';b.onclick=fn;return b;};
 window.mountTeacherGameSetup=({catalog,solo,kind,context,lang,scope,p,onContext})=>{
  window.cleanupTeacherGameSetup?.();
  let ctx=context,student=p?.id||context.profile_id||'',request=0,destroyed=false;
  const root=node('div','', 'toowee-setup');catalog.append(root);
  const header=node('header','', 'toowee-setup-heading'),icon=node('img');icon.src='assets/game-icons/'+kind+'.webp';icon.alt='';const title=node('div');title.append(node('h3','Przygotuj rozgrywkę'),node('p',catalog.querySelector('h3')?.textContent||''));header.append(icon,title);root.append(header);
  const grid=node('div','', 'toowee-setup-columns'),materials=node('section','', 'toowee-setup-card toowee-materials'),form=node('div','', 'toowee-material-fields');materials.append(node('h4','Materiały'),form);grid.append(materials);root.append(grid);
  const originalLangParent=lang.parentNode,originalScopeParent=scope.parentNode;
  lang.classList.add('toowee-native-source');scope.classList.add('toowee-native-source');materials.append(lang,scope);
  const pickers=[];
  function searchable(label,placeholder,options,value,select){
   const box=node('div','', 'toowee-search-field'),caption=node('span',label),details=node('details'),summary=node('summary'),input=document.createElement('input'),items=node('div','', 'toowee-search-options');
   input.type='search';input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);details.append(summary,input,items);box.append(caption,details);form.append(box);
   const api={options,value,refresh(){summary.textContent=api.options.find(o=>o.value===api.value)?.name||'Wybierz';const q=input.value.trim().toLocaleLowerCase('pl');items.replaceChildren();for(const o of api.options.filter(o=>o.name.toLocaleLowerCase('pl').includes(q)))items.append(button(o.name,async()=>{details.open=false;input.value='';await select(o.value);api.value=o.value;api.refresh();}));if(!items.childElementCount)items.append(node('p','Brak wyników.'));}};
   input.oninput=()=>api.refresh();details.addEventListener('toggle',()=>{if(details.open)input.focus();});api.refresh();pickers.push(details);return api;
  }
  const language=searchable('Język','Szukaj języka…',Object.entries(names).map(([value,name])=>({value,name})),lang.value,async value=>reload(value,student));
  const students=searchable('Uczeń','Szukaj ucznia…',[],student,async value=>reload(language.value,value));
  function studentOptions(){students.options=[{value:'',name:'Bez konkretnego ucznia'},...(window.tooweeStudentProfiles||[]).filter(x=>(x.languages||window.teacherProfileLanguages?.(x.id)||[]).includes(language.value)).map(x=>({value:x.id,name:[x.first_name,x.last_name].filter(Boolean).join(' ')}))];if(!students.options.some(x=>x.value===student)&&student)students.options.push({value:student,name:ctx.name||'Wybrany uczeń'});students.value=student;students.refresh();}
  const browser=node('div','', 'toowee-material-browser'),selected=node('div','', 'toowee-material-selected'),expand=button('Zmień',()=>{browser.hidden=!browser.hidden;}),selectedText=node('strong');selected.append(selectedText,expand);materials.append(selected,browser);
  const tabs=node('div','', 'toowee-material-tabs'),toolbar=node('div','', 'toowee-material-toolbar'),search=document.createElement('input'),views=node('div','', 'material-view-switch'),results=node('div','', 'toowee-material-results'),crumb=node('div','', 'toowee-material-crumb');
  search.type='search';search.placeholder='Szukaj folderu…';search.setAttribute('aria-label','Szukaj materiałów');
  let tab='folders',folder=null,view='tiles';try{view=localStorage.getItem('toowee-setup-material-view')||view;}catch{}
  const folderTab=button('Foldery',()=>{tab='folders';folder=null;search.value='';draw();}),setTab=button('Wszystkie zestawy',()=>{tab='sets';folder=null;search.value='';draw();}),tiles=button('▦ Kafelki',()=>setView('tiles')),list=button('≡ Lista',()=>setView('list'));
  function setView(v){view=v;try{localStorage.setItem('toowee-setup-material-view',v);}catch{}draw();}
  tabs.append(folderTab,setTab);views.append(tiles,list);toolbar.append(search,views);browser.append(tabs,toolbar,crumb,results);browser.hidden=true;
  function words(){return window.tooweeTeacherGameContext?.words||[];}
  function choose(value){scope.value=value;scope.onchange?.();browser.hidden=true;refresh();}
  function draw(){
   results.replaceChildren();crumb.replaceChildren();results.dataset.view=view;tiles.setAttribute('aria-pressed',String(view==='tiles'));list.setAttribute('aria-pressed',String(view==='list'));folderTab.setAttribute('aria-pressed',String(tab==='folders'));setTab.setAttribute('aria-pressed',String(tab==='sets'));search.placeholder=folder||tab==='sets'?'Szukaj zestawu…':'Szukaj folderu…';
   const q=search.value.toLocaleLowerCase('pl'),match=x=>x.name.toLocaleLowerCase('pl').includes(q);let entries;
   if(tab==='folders'&&!folder)entries=(ctx.folders||[]).filter(f=>!f.lang||f.lang===lang.value).map(f=>({...f,folder:true}));else entries=(ctx.sets||[]).filter(s=>(!s.lang||s.lang===lang.value)&&(!folder||s.folder_id===folder));
   crumb.append(button('Wszystkie słówka',()=>choose('all')));
   if(folder){crumb.append(button('← Foldery',()=>{folder=null;search.value='';draw();}),button('Wybierz cały folder',()=>choose('folder:'+folder)));}
   for(const e of entries.filter(match)){const b=button('',()=>{if(e.folder){folder=e.id;search.value='';draw();}else choose('set:'+e.id);});b.className='toowee-material-option';const icon=node('span','', 'material-icon material-icon-'+(e.folder?'folder':'set'));const copy=node('span');copy.append(node('strong',e.name));if(!e.folder){const f=ctx.folders.find(f=>f.id===e.folder_id);copy.append(node('small',f?.name||'Bez folderu'));}b.append(icon,copy);results.append(b);}
   if(!results.childElementCount)results.append(node('p','Brak pasujących materiałów.'));
  }
  search.oninput=draw;
  const oldSoloParent=solo.parentNode,oldSoloNext=solo.nextSibling;grid.append(solo);solo.classList.add('toowee-setup-game');
  const settingsHeading=node('h4','Ustawienia rozgrywki','toowee-settings-title');solo.prepend(settingsHeading);
  const footer=node('footer','', 'toowee-setup-footer'),summary=node('div'),count=node('strong'),detail=node('small'),actions=node('div','', 'toowee-setup-actions');summary.append(count,detail);footer.append(summary,actions);root.append(footer);
  const originalStart=document.getElementById('startGame'),originalShare=document.getElementById('shareMagicDice'),start=button('Rozpocznij grę →',()=>originalStart.click()),share=button('Wygeneruj link dla ucznia →',()=>originalShare.click());actions.append(start,share);
  const size=document.getElementById('magicDiceSize');let sizeChoices=null,sizeButtons=[];
  if(kind==='dice'&&size){sizeChoices=node('div','', 'toowee-size-choices');size.parentNode.append(sizeChoices);size.classList.add('toowee-native-source');for(const n of [3,4,5]){const b=button('',()=>{size.value=String(n);size.dispatchEvent(new Event('change',{bubbles:true}));refresh();});const mini=node('span','', 'toowee-mini-board');mini.style.setProperty('--size',n);mini.setAttribute('aria-hidden','true');for(let i=0;i<n*n;i++)mini.append(node('i'));b.append(mini,node('strong',n+' × '+n),node('small',n*n+' tur'));b.dataset.size=n;sizeChoices.append(b);sizeButtons.push(b);}}
  const status=node('p','', 'toowee-setup-status');materials.append(status);
  function refresh(){
   const option=scope.selectedOptions[0];let label=option?.textContent||ctx.name||'Wszystkie słówka';
   if(scope.value.startsWith('set:')){const s=ctx.sets.find(s=>s.id===scope.value.slice(4)),f=ctx.folders.find(f=>f.id===s?.folder_id);label=[f?.name,s?.name].filter(Boolean).join(' → ')||label;}
   selectedText.textContent=label+' · '+words().length+' słówek';count.textContent=(names[lang.value]||lang.value)+' · '+words().length+' słówek'+(kind==='dice'?' · Plansza '+size.value+' × '+size.value:'');detail.textContent=label;
   start.disabled=originalStart.disabled;start.hidden=originalStart.hidden;share.disabled=originalShare?.disabled??true;share.hidden=originalShare?.hidden??true;
   footer.hidden=document.getElementById('gameSetup').hidden;for(const b of sizeButtons)b.setAttribute('aria-pressed',String(b.dataset.size===size.value));draw();
  }
  async function reload(l,id,preserve=false){
   const token=++request;status.textContent='Wczytywanie materiałów…';start.disabled=share.disabled=true;
   try{const next=await(id?window.getStudentGameMaterials(id,l):window.getTeacherGameMaterials(l));if(token!==request||destroyed)return;student=id;ctx={...next,name:id?(window.tooweeStudentProfiles||[]).find(p=>p.id===id)?.first_name||'Uczeń':names[l],deliveryMode:context.deliveryMode};lang.replaceChildren(...Object.entries(names).map(([value,name])=>new Option(name,value)));lang.value=l;language.value=l;language.refresh();onContext(ctx);if(preserve){const chosenSet=ctx.sets.find(s=>s.name===context.name),chosenFolder=ctx.folders.find(f=>f.name===context.name);if(chosenSet)scope.value='set:'+chosenSet.id;else if(chosenFolder)scope.value='folder:'+chosenFolder.id;scope.onchange?.();}studentOptions();folder=null;refresh();status.textContent='';}catch(e){status.textContent=e.message;refresh();}
  }
  studentOptions();refresh();if(!context.exerciseSet)void reload(lang.value,student,true);
  const watch=new MutationObserver(()=>{start.disabled=originalStart.disabled;start.hidden=originalStart.hidden;share.disabled=originalShare?.disabled??true;share.hidden=originalShare?.hidden??true;footer.hidden=document.getElementById('gameSetup').hidden;});
  for(const n of [originalStart,originalShare,document.getElementById('gameSetup')].filter(Boolean))watch.observe(n,{attributes:true,attributeFilter:['disabled','hidden']});
  solo.addEventListener('change',refresh);scope.addEventListener('change',refresh);
  window.cleanupTeacherGameSetup=()=>{destroyed=true;watch.disconnect();solo.removeEventListener('change',refresh);scope.removeEventListener('change',refresh);sizeChoices?.remove();size?.classList.remove('toowee-native-source');settingsHeading.remove();lang.classList.remove('toowee-native-source');scope.classList.remove('toowee-native-source');originalLangParent.append(lang);originalScopeParent.append(scope);if(oldSoloNext?.parentNode===oldSoloParent)oldSoloParent.insertBefore(solo,oldSoloNext);else oldSoloParent.append(solo);solo.classList.remove('toowee-setup-game');root.remove();window.cleanupTeacherGameSetup=null;};
 };
})();