'use strict';
// One code entry point; game modules retain their own sessions, tokens and rules.
(()=>{
 const dialog=document.createElement('dialog');dialog.className='tw-game-join';dialog.id='gameJoinDialog';
 dialog.innerHTML='<header><h2>Dołącz do gry</h2><button type="button" aria-label="Zamknij">×</button></header><p>Wpisz kod od nauczyciela. Właściwa gra otworzy się automatycznie.</p><form><label>Kod pokoju<input name="code" required autocomplete="off" spellcheck="false" placeholder="Kod lub link do gry"></label><label>Pseudonim w grze<input name="nickname" required maxlength="32" autocomplete="nickname"></label><button type="submit">Dołącz do gry</button></form><p role="status" aria-live="polite"></p>';
 document.body.append(dialog);const form=dialog.querySelector('form'),code=form.elements.code,name=form.elements.nickname,submit=form.querySelector('button'),status=dialog.querySelector('[role=status]');let version=0,busy=false;
 function close(){if(busy)return;version++;dialog.close();}dialog.querySelector('header button').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 function parse(value){value=value.trim();if(/^https?:\/\//i.test(value)){let u;try{u=new URL(value);}catch{throw Error('Nieprawidłowy link do gry.');}if(u.origin!==location.origin)throw Error('Wklej link do gry z TooWee Languages.');value=u.searchParams.get('room')||u.searchParams.get('kolekcje')||u.searchParams.get('pokoj')||'';}if(!/^(?:[a-f0-9]{8}|[a-f0-9]{32})$/i.test(value))throw Error('Sprawdź kod pokoju lub wklej pełny link do gry.');return value.length===32?value.toLowerCase():value.toUpperCase();}
 window.openTooWeeGameJoin=()=>{version++;status.textContent='';if(!dialog.open)dialog.showModal();code.focus();};
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;const current=version;busy=true;submit.disabled=true;status.textContent='Łączenie z grą…';try{const room=parse(code.value),nickname=name.value.trim();if(!nickname)throw Error('Wpisz pseudonim.');if(room.length===32){try{sessionStorage.setItem('toowee-join-dice',JSON.stringify({code:room,nickname}));}catch{}const url=new URL('magic-dice-player.html',location.href);url.searchParams.set('room',room);location.assign(url.href);return;}
 let joined=false;for(const join of [window.joinCollectionsByCode,window.joinSophieByCode]){if(current!==version)return;if(typeof join!=='function')continue;try{await join(room,nickname);joined=true;break;}catch(error){if(!/Nie znaleziono pokoju|jednorazowej konfiguracji bazy/.test(error.message))throw error;}}
 if(!joined)throw Error('Nie znaleziono pokoju. Sprawdź kod od nauczyciela.');if(current===version)dialog.close();
 }catch(error){if(current===version)status.textContent=error.message;}finally{busy=false;submit.disabled=false;}};
 // The public and student buttons share this neutral entry point.
 const entry=document.getElementById('openSophieJoin');if(entry)entry.onclick=()=>window.openTooWeeGameJoin();
 window.addEventListener('toowee-account',()=>{version++;if(dialog.open)dialog.close();name.value='';status.textContent='';});
})();
