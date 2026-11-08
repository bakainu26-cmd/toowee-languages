'use strict';
// Shared online waiting room. New online games use TooWeeOnlineLobby.render.
(()=>{
 const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const btn=(text,fn)=>{const b=n('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn?.();}catch(e){const s=b.closest('.tw-online')?.querySelector('[role=status]');if(s)s.textContent=e.message;}finally{b.disabled=false;}};return b;};
 window.TooWeeOnlineLobby={render(target,o){
 target.classList.add('tw-online');target.replaceChildren();
 const header=n('div',undefined,'tw-online-header'),logo=n('img');logo.src='assets/toowee-logo.webp';logo.alt='TooWee Languages';logo.className='tw-online-logo';
 const art=n('span',undefined,'tw-online-game-art');art.setAttribute('aria-hidden','true');if(o.kind!=='sophie'){art.classList.add('tw-online-icon');art.style.backgroundImage=`url("assets/game-icons/${o.kind}.webp")`;}
 const title=n('div');title.append(n('h2',o.title),n('p',(o.active?'Gra online':'Poczekalnia')+' · Panel '+(o.host?'prowadzącego':'ucznia')));
 const actions=n('div',undefined,'tw-online-actions');actions.append(btn('Jak grać?',()=>{if(o.help)return o.help();help.hidden=!help.hidden;}),btn(o.host?'Zakończ':'Wyjdź',o.close));header.append(logo,art,title,actions);
 const help=n('p',o.instructions||'Dołącz do pokoju i poczekaj na rozpoczęcie gry. Odpowiadaj na pytania na swoim urządzeniu.', 'tw-online-help');help.hidden=true;
 const body=n('div',undefined,'tw-online-body'),invite=n('div',undefined,'tw-online-card tw-online-invite'),participants=n('div',undefined,'tw-online-card');
 const me=(o.players||[]).find(p=>p.me||p.id===o.me);invite.append(n('h3',o.host?'Zaproś uczniów':me?'Jesteś w grze, '+me.name+'!':'Jesteś w grze!'),n('p',o.host?'Udostępnij kod lub link do gry.':o.active?'Możesz rozpocząć rozgrywkę.':'Czekamy, aż prowadzący rozpocznie grę.'));
 const code=n('div',undefined,'tw-online-code');code.append(n('span',o.host?'Kod gry':'Gotowość do gry'),n('strong',o.host?o.code:'Jesteś w pokoju'));if(!o.host)code.append(n('span','Pokój '+o.code));invite.append(code);
 const status=n('p','', 'tw-online-feedback');status.setAttribute('role','status');
 async function copy(value){try{await navigator.clipboard.writeText(value);status.textContent='Skopiowano.';}catch{const input=n('input');input.readOnly=true;input.value=value;status.replaceChildren(input);input.focus();input.select();}}
 if(o.host){const copies=n('div',undefined,'tw-online-copies');copies.append(btn('Kopiuj kod',()=>copy(o.code)),btn('Kopiuj link',()=>copy(o.link)));invite.append(copies);}
 const note=n('div',undefined,'tw-online-note');note.append(n('span',undefined,'tw-online-envelope'),n('p',o.host?'Uczniowie mogą dołączyć bez konta.':o.active?'Graj we własnym tempie.':'Gra rozpocznie się automatycznie.'));invite.append(note,status);
 const ph=n('div',undefined,'tw-online-participants-heading');ph.append(n('h3','Uczestnicy'),n('span',(o.players||[]).length+' osób'));participants.append(ph);const list=n('ul');for(const p of o.players||[]){const row=n('li'),initial=n('span',p.name?.[0]?.toUpperCase()||'?', 'tw-online-avatar');row.append(initial,n('strong',p.name+(p.me||p.id===o.me?' (Ty)':'')),n('span',o.active?'W grze':'Gotowy','tw-online-ready'));list.append(row);}if(!list.children.length)list.append(n('li','Czekamy na pierwszego gracza…'));participants.append(list);body.append(invite,participants);
 const footer=n('div',undefined,'tw-online-footer');footer.append(n('p',o.mode||'Tryb swobodny · Każdy gra we własnym tempie'));if(o.start){const start=btn(o.startLabel||'Rozpocznij grę →',o.start);start.className='tw-online-start';start.disabled=Boolean(o.disabled);footer.append(start);}target.append(header,help,body,footer);
 }};
})();
