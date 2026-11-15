'use strict';
// All language surfaces share the approved painted artwork.
window.createTooWeeLanguageFlag=code=>{
 const flag=document.createElement('span');flag.className='toowee-language-flag';flag.dataset.languageFlag=code;flag.setAttribute('aria-hidden','true');return flag;
};
