'use strict';
(()=>{const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
 function dismissDialogs(){if(typeof document==='undefined'||!document?.body)return;for(const d of document.querySelectorAll('dialog[open]')){if(d.querySelector(':scope>.tw-dialog-x')||[...d.querySelectorAll('button')].some(b=>b.textContent.trim()==='×'))continue;const x=button('×',()=>(()=>{const e=new Event('cancel',{cancelable:true});if(d.dispatchEvent(e))d.close();})());x.className='tw-dialog-x';x.setAttribute('aria-label','Zamknij okno');d.prepend(x);}}
 new MutationObserver(dismissDialogs).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});dismissDialogs();
})();
