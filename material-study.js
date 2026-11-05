'use strict';
(()=>{
 let session=0;
 const dialog=document.createElement('dialog');dialog.id='materialStudyDialog';dialog.className='material-study';document.body.append(dialog);
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const close=()=>{session++;dialog.close?.();dialog.removeAttribute('open');dialog.replaceChildren();};
 const normalize=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
 window.openMaterialStudy=async(kind,id,loadContext)=>{
  const token=++session;dialog.replaceChildren(node('p','Wczytuję słówka…'),button('Zamknij',close));if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
  try{
   const context=await (loadContext?loadContext():window.getMaterialStudyContext(kind,id));if(token!==session)return;
   const words=context.words.filter(w=>w.word?.trim()&&w.translation?.trim());let index=0,mode='';
   function render(){
    dialog.replaceChildren(node('h2','Ucz się · '+context.name),button('Zamknij',close));
    const modes=node('div');modes.className='material-study-modes';for(const name of ['Fiszki','Wpisz słowo','Quiz']){const b=button(name,()=>{mode=name;index=0;render();});b.setAttribute('aria-pressed',String(mode===name));modes.append(b);}dialog.append(modes);
    if(!words.length){dialog.append(node('p','Brak słówek do nauki. Dodaj słówka do tego '+(kind==='folder'?'folderu.':'zestawu.')));return;}
    if(!mode){dialog.append(node('p','Wybierz sposób nauki · '+words.length+' słówek'));return;}
    const word=words[index],area=node('section'),feedback=node('p');feedback.setAttribute('role','status');area.className='material-study-exercise';area.append(node('p',(index+1)+' / '+words.length));
    const foreign=word.word+(word.reading?' · '+word.reading:'');
    if(mode==='Fiszki'){let flipped=false;const card=button(foreign,()=>{flipped=!flipped;card.textContent=flipped?word.translation:foreign;card.setAttribute('aria-label',flipped?'Tłumaczenie: '+word.translation:'Słowo: '+foreign);});card.className='material-study-card';area.append(card,node('small','Kliknij fiszkę, aby ją odwrócić.'));}
    if(mode==='Wpisz słowo'){const form=node('form'),input=node('input'),label=node('label','Wpisz słowo: '+word.translation);input.autocomplete='off';input.required=true;label.append(input);const submit=node('button','Sprawdź');submit.type='submit';form.append(label,submit);form.onsubmit=e=>{e.preventDefault();const answer=normalize(input.value);feedback.textContent=[normalize(word.word),normalize(word.reading)].filter(Boolean).includes(answer)?'Dobrze!':'Poprawna odpowiedź: '+foreign;};area.append(form);}
    if(mode==='Quiz'){const translations=[...new Set(words.map(w=>w.translation))];if(translations.length<2){area.append(node('p','Quiz wymaga co najmniej dwóch różnych tłumaczeń. Wybierz fiszki lub wpisywanie słowa.'));}else{area.append(node('h3',foreign));const answers=[word.translation,...translations.filter(t=>t!==word.translation).sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5),choices=node('div');choices.className='material-study-answers';for(const answer of answers)choices.append(button(answer,()=>{feedback.textContent=answer===word.translation?'Dobrze!':'Poprawna odpowiedź: '+word.translation;for(const b of choices.children)b.disabled=true;}));area.append(choices);}}
    area.append(feedback);const navigation=node('div');navigation.className='material-study-navigation';navigation.append(button('← Poprzednie',()=>{index=(index+words.length-1)%words.length;render();}),button('Następne →',()=>{index=(index+1)%words.length;render();}));area.append(navigation);dialog.append(area);
   }render();
  }catch(e){if(token===session)dialog.replaceChildren(node('p','Nie udało się wczytać słówek: '+e.message),button('Zamknij',close));}
 };
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});window.addEventListener('toowee-account',close);
})();
