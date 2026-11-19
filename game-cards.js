'use strict';
(()=>{
 const definitions={
 dice:['Magic Dice','assets/game-icons/dice.webp'],
 collections:['Kolekcje Sophisi','assets/game-icons/collections.webp'],
 sophie:['Saszetki Sophie','assets/game-icons/sophie.webp'],
 match:['Połącz w pary','assets/game-icons/match.webp'],
 memory:['Memory','assets/game-icons/memory.webp'],
 quiz:['Quiz','assets/game-icons/quiz.webp'],
 write:['Wpisz odpowiedź','assets/game-icons/write.webp'],
 escape:['Escape room','assets/game-icons/escape.webp'],
 falling:['Spadające słówka','assets/game-icons/falling.webp'],
 sbh:['Miecze, Bomby i Serduszka','assets/game-icons/sbh.webp'],
 board:['Plansza pytań','assets/sofi-book.webp'],
 flashcards:['Fiszki','assets/exercise-set-cards.webp']
 };
 const config=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([kind,[name,icon]])=>[kind,Object.freeze({name,icon})])));
 function decorate(card,kind,{available=true,message=''}={}){
  const game=config[kind];if(!game)return card;
  card.classList.add('toowee-game-card');card.dataset.gameKind=kind;card.dataset.available=String(available);
  card.querySelectorAll(':scope>.toowee-game-icon,:scope>.toowee-game-title,:scope>.toowee-game-requirements').forEach(n=>n.remove());
  const image=document.createElement('img');image.className='toowee-game-icon';image.src=game.icon;image.alt='';image.width=100;image.height=100;
  const title=document.createElement(card.tagName==='BUTTON'?'span':'h3');title.className='toowee-game-title';title.textContent=game.name;
  if(card.tagName==='BUTTON')card.replaceChildren(image,title);else card.prepend(image,title);
  if(message){const note=document.createElement('p');note.className='toowee-game-requirements';note.textContent=message;card.insertBefore(note,title.nextSibling);}
  return card;
 }
 window.TooweeGameCards=Object.freeze({config,decorate});
 // Existing student/legacy game selectors keep their handlers and use the same artwork.
 function decorateLegacy(){for(const b of document.querySelectorAll('.game-types .game-type[id^="gameType-"]'))decorate(b,b.id.slice(9));}
 decorateLegacy();
})();