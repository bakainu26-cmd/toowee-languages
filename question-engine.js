'use strict';
(()=>{
 const normalize=value=>String(value??'').trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');
 const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
 function adapt(value){return{...value,prompt:String(value.prompt??value.word??value.question??''),answer:String(value.answer??value.translation??''),wrong:[...(value.wrong??value.quiz_options??[])],format:value.format||(value.type==='open'?'open':(value.wrong??value.quiz_options)?.length?'quiz':'write')};}
 function mode(question){const q=adapt(question);return q.format==='open'?'manual':q.format==='quiz'?'quiz':q.answer.trim()?'text':'manual';}
 function check(question,response){const q=adapt(question);if(mode(q)==='manual')return response===true;if(!q.answer.trim())throw Error('Brak poprawnej odpowiedzi.');return normalize(response)===normalize(q.answer);}
 function mount(host,question,onAnswer){const q=adapt(question),kind=mode(q);let done=false;const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;},submit=value=>{if(done)return;done=true;host.querySelectorAll('button,input').forEach(n=>n.disabled=true);onAnswer({correct:check(q,value),response:value,solution:q.answer,mode:kind});},button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};host.dataset.questionMode=kind;
 if(kind==='manual'){const show=button('Pokaż odpowiedź',()=>{if(q.answer)host.append(node('p',q.answer));show.disabled=true;const yes=button('Poprawna',()=>submit(true)),no=button('Niepoprawna',()=>submit(false));host.append(yes,no);});if(!q.answer){host.append(button('Poprawna',()=>submit(true)),button('Niepoprawna',()=>submit(false)));}else host.append(show);}
 else if(kind==='quiz'){const options=shuffle([q.answer,...q.wrong]);options.forEach((option,i)=>host.append(button((i<26?String.fromCharCode(65+i):String(i+1))+'. '+option,()=>submit(option))));}
 else{const form=node('form'),label=node('label','Twoja odpowiedź'),input=node('input'),send=node('button','Sprawdź odpowiedź');input.autocomplete='off';label.append(input);send.type='submit';form.append(label,send);form.onsubmit=e=>{e.preventDefault();if(input.value.trim())submit(input.value);};input.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229){if(e.key==='Enter')e.preventDefault();}});host.append(form);queueMicrotask(()=>input.isConnected&&input.focus());}
 return{get answered(){return done}};
 }
 window.TooweeQuestions=Object.freeze({adapt,mode,check,normalize,shuffle,mount});
})();