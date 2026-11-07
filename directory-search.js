'use strict';
(()=>{
 const states=new Map(),normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pl').replace(/ł/g,'l');
 const configs=[
 ['#teacherGroupsList',':scope > .teacher-group-card','Szukaj grupy…'],
 ['#studentMaterialFolders, #teacherVocabularyContent, #folderRows',':scope > .material-folder-card, :scope > .material-set-card','Szukaj folderu lub listy słówek…'],
 ['.group-vocabulary-folders',':scope > .material-folder-card','Szukaj folderu lub listy słówek…'],
 ['.group-students-list',':scope > button','Szukaj ucznia…'],
 ['.game-types',':scope > button','Szukaj gry…'],
 ['#teacherGameCatalog',':scope > .cozy-game-student','Szukaj ucznia…']
 ];
 function searchable(card){const clone=card.cloneNode(true);clone.querySelectorAll('.material-actions,.material-menu-options,.material-copy-dropdown').forEach(n=>n.remove());return normalize(clone.textContent);}
 function apply(root,state,cards){const q=normalize(state.input.value.trim());let found=0;for(const card of cards){const match=!q||searchable(card).includes(q);card.classList.toggle('directory-search-miss',!match);if(match)found++;
 if(card.tagName==='DETAILS'){if(q){if(!state.open.has(card))state.open.set(card,card.open);if(match)card.open=true;}else if(state.open.has(card)){card.open=state.open.get(card);state.open.delete(card);}}
 }state.empty.hidden=!q||found>0;state.bar.hidden=!cards.length;}
 function refresh(){for(const [root,state]of states)if(!root.isConnected){state.bar.remove();state.empty.remove();states.delete(root);}
 for(const [selector,items,placeholder]of configs)for(const root of document.querySelectorAll(selector)){const cards=[...root.querySelectorAll(items)];let state=states.get(root);if(!state&&!cards.length)continue;
 if(!state){const bar=document.createElement('div');bar.className='directory-search';const input=document.createElement('input');input.type='search';input.placeholder=placeholder;input.setAttribute('aria-label',placeholder.replace('…',''));input.autocomplete='off';const empty=document.createElement('p');empty.className='directory-search-empty';empty.textContent='Brak wyników. Spróbuj wpisać inną nazwę.';empty.setAttribute('role','status');empty.hidden=true;bar.append(input);state={bar,input,empty,open:new Map()};states.set(root,state);input.addEventListener('input',()=>apply(root,state,[...root.querySelectorAll(items)]));}
 if(!state.bar.isConnected){if(root.id==='teacherGameCatalog')root.insertBefore(state.bar,cards[0]||null);else root.before(state.bar);}
 if(!state.empty.isConnected)root.after(state.empty);apply(root,state,cards);
 }}
 let pending=false;const observer=new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(()=>{pending=false;refresh();});}});observer.observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
 window.addEventListener('toowee-account',()=>{for(const state of states.values())state.input.value='';refresh();});refresh();
})();
