'use strict';
(()=>{
 const selector='.student-profile-menu,.material-copy-dropdown,.material-actions';
 function close(menu,focus=false){
  const trigger=menu.querySelector(':scope > summary,:scope > .material-menu-toggle');
  if(menu.tagName==='DETAILS')menu.open=false;
  else{const options=menu.querySelector('.material-menu-options');if(options)options.hidden=true;}
  trigger?.setAttribute('aria-expanded','false');
  if(focus)trigger?.focus();
 }
 const isOpen=menu=>menu.tagName==='DETAILS'?menu.open:menu.querySelector('.material-menu-options')?.hidden===false;
 // Capture closes other menus without consuming the option's own click.
 document.addEventListener('click',e=>{for(const menu of document.querySelectorAll(selector))if(isOpen(menu)&&!menu.contains(e.target))close(menu);},true);
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;for(const menu of document.querySelectorAll(selector))if(isOpen(menu)){close(menu,menu.contains(document.activeElement));e.preventDefault();}},true);
 document.addEventListener('toggle',e=>{const menu=e.target;if(!menu.matches?.('details.student-profile-menu,details.material-copy-dropdown'))return;menu.querySelector(':scope > summary')?.setAttribute('aria-expanded',String(menu.open));if(menu.open)for(const other of document.querySelectorAll(selector))if(other!==menu&&isOpen(other))close(other);},true);
})();
