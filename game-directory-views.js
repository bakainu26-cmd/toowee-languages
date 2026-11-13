'use strict';
(()=>{
 const states=new Map();
 const definitions=[['#teacherGameCatalog>.teacher-game-directory','catalog','tiles'],['#profileGamesPanel>.teacher-game-directory','profile','tiles']];
 const read=(key,fallback)=>{try{return localStorage.getItem('toowee-games-view-'+key)||fallback;}catch{return fallback;}};
 function enhance(root,key,fallback){
  if(states.has(root))return;
  const cards=()=>[...root.children].filter(n=>n.tagName==='BUTTON');
  if(!cards().length)return;
  const toolbar=document.createElement('div');toolbar.className='material-view-switch game-directory-view-switch';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Widok gier');
  let view=read(key,fallback);if(!['tiles','list'].includes(view))view=fallback;
  const buttons={};
  function apply(next,persist=false){
   const top=toolbar.getBoundingClientRect().top,scroll=window.scrollY;
   view=next;root.dataset.gameDirectoryView=view;
   for(const [kind,b] of Object.entries(buttons))b.setAttribute('aria-pressed',String(kind===view));
   if(persist){try{localStorage.setItem('toowee-games-view-'+key,view);}catch{}
    requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,scroll+toolbar.getBoundingClientRect().top-top),behavior:'instant'}));
   }
  }
  for(const [kind,label] of [['tiles','▦ Kafelki'],['list','≡ Lista']]){
   const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>apply(kind,true));buttons[kind]=b;toolbar.append(b);
  }
  root.before(toolbar);
  states.set(root,toolbar);apply(view);
 }
 let pending=false;
 function scan(){pending=false;for(const [root,bar] of states)if(!root.isConnected){bar.remove();states.delete(root);}for(const [selector,key,fallback] of definitions)for(const root of document.querySelectorAll(selector))enhance(root,key,fallback);}
 new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(scan);}}).observe(document.body,{childList:true,subtree:true});
 scan();
})();