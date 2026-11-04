'use strict';
(()=>{
 const el=id=>document.getElementById(id),panel=el('teacherPanel-games'),catalog=document.createElement('div');catalog.id='teacherGameCatalog';panel.append(catalog);
 const names={collections:'Kolekcje Sophisi',sophie:'Saszetki Sophie',match:'Połącz w pary',memory:'Memory',quiz:'Wybierz tłumaczenie',write:'Wpisz słówko',escape:'Escape room',falling:'Spadające słówka'};
 let language=null,version=0;
 function text(tag,value){const n=document.createElement(tag);n.textContent=value;return n;}
 function button(label,fn){const b=text('button',label);b.type='button';b.className='alt';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){catalog.append(text('p',e.message));}finally{b.disabled=false;}};return b;}
 const solo=el('games'),originalParent=solo.parentNode,originalNext=solo.nextSibling;
 function reset(){version++;window.tooweeTeacherGameContext=null;if(solo.parentNode!==originalParent){originalParent.insertBefore(solo,originalNext);solo.hidden=true;}solo.querySelector('.game-types').hidden=false;el('gameFolder').parentElement.hidden=false;catalog.replaceChildren();}
 function listGames(){reset();catalog.append(text('h3','Wybierz grę'));const grid=document.createElement('div');grid.className='game-types';for(const [kind,name] of Object.entries(names))grid.append(button(name,()=>listStudents(kind)));catalog.append(grid,button('Historia Kolekcji Sophisi',()=>window.openCollectionsHistory()));}
 function listStudents(kind){reset();catalog.append(button('← Wszystkie gry',listGames),text('h3',names[kind]+' — wybierz ucznia'));const profiles=(window.tooweeStudentProfiles||[]).filter(p=>!language||(p.languages||window.teacherProfileLanguages(p.id)).includes(language));for(const p of profiles)catalog.append(button(p.first_name+' '+p.last_name,()=>configure(kind,p)));if(!profiles.length)catalog.append(text('p','Brak uczniów w tym widoku. Dodaj ich w zakładce „Moi uczniowie”.'));}
 async function configure(kind,p){const token=++version;const context=await window.getStudentGameMaterials(p.id,language||p.languages?.[0]||'English');if(token!==version)return;context.name=p.first_name+' '+p.last_name;if(kind==='collections'){await window.openCollectionsForStudent(context);return;}if(kind==='sophie'){await window.openSophieForStudentProfile(context);return;}
 reset();catalog.append(button('← Lista uczniów',()=>listStudents(kind)),text('h3',names[kind]+' · '+context.name));
 const lang=document.createElement('select'),scope=document.createElement('select');lang.setAttribute('aria-label','Język gry');scope.setAttribute('aria-label','Zakres materiałów ucznia');const languages=language?[language]:[...new Set([...(p.languages||[]),...context.sets.map(s=>s.lang)])];if(!languages.length)languages.push(context.lang);for(const l of languages)lang.add(new Option(({Japanese:'Japoński',English:'Angielski',Spanish:'Hiszpański'})[l]||l,l));
 function ranges(){scope.replaceChildren(new Option('Całe słownictwo','all'));for(const f of context.folders.filter(f=>f.lang===lang.value))scope.add(new Option('Folder: '+f.name,'folder:'+f.id));for(const s of context.sets.filter(s=>s.lang===lang.value))scope.add(new Option('Zestaw: '+s.name,'set:'+s.id));apply();}
 function apply(){let ids=null;if(scope.value.startsWith('set:'))ids=new Set([scope.value.slice(4)]);if(scope.value.startsWith('folder:'))ids=new Set(context.sets.filter(s=>s.folder_id===scope.value.slice(7)).map(s=>s.id));window.tooweeTeacherGameContext={lang:lang.value,words:context.words.filter(w=>w.lang===lang.value&&(!ids||ids.has(w.folder_id)))};if(typeof chooseLanguage==='function')chooseLanguage(lang.value);solo.hidden=false;el('words').hidden=true;el('gameFolder').value='';el('gameFolder').disabled=true;}
 lang.onchange=ranges;scope.onchange=apply;catalog.append(text('p','Wybierz język i zakres słownictwa ucznia, następnie ustaw parametry gry.'),lang,scope);catalog.append(solo);solo.hidden=false;solo.querySelector('.game-types').hidden=true;el('gameFolder').parentElement.hidden=true;el('gameType-'+kind).click();ranges();
 }
 const legacy=panel.querySelector('.sophie-launch');if(legacy)legacy.hidden=true;panel.querySelector('h3').hidden=true;
 window.openTeacherGameKind=kind=>{if(Object.hasOwn(names,kind))listStudents(kind);};
 window.openTeacherGameCatalog=scope=>{language=scope;listGames();};
 window.addEventListener('toowee-account',reset);
 window.addEventListener('toowee-profile',()=>{if(window.tooweeView!=='teacher')reset();});
 window.returnToTeacherGameCatalog=()=>{if(window.tooweeView!=='teacher'||!window.tooweeTeacherGameContext)return false;window.closeActivityFocus?.();if(typeof tab==='function')tab('connections');window.showTeacherSection('games');return true;};
})();
