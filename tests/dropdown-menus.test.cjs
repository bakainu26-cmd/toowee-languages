const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const dom=new JSDOM(`<details class="student-profile-menu"><summary>⋯</summary><div class="student-profile-options"><button>Edytuj</button></div></details><details class="material-copy-dropdown"><summary>⋯</summary><div class="material-menu-options"><button>Eksportuj</button><button>Usuń</button></div></details><div class="material-actions"><button class="material-menu-toggle" aria-expanded="true">⋯</button><div class="material-menu-options"><button>Edytuj listę</button></div></div>`,{runScripts:'outside-only'}),w=dom.window,d=w.document;
w.eval(fs.readFileSync(__dirname+'/../dropdown-menus.js','utf8'));
const [profile,set]=d.querySelectorAll('details'),material=d.querySelector('.material-actions'),options=material.querySelector('.material-menu-options');let actions=0;set.querySelector('button').onclick=()=>actions++;
profile.open=true;profile.querySelector('button').click();assert(profile.open,'inside actions remain interactive');assert(options.hidden,'another menu closes');
set.querySelector('summary').click();assert(!profile.open);assert(set.open);set.querySelector('button').click();assert.equal(actions,1,'action reaches its handler');assert(set.open);d.body.click();assert(!set.open);
profile.open=true;profile.querySelector('summary').focus();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!profile.open);assert.equal(d.activeElement,profile.querySelector('summary'));
options.hidden=false;d.body.click();assert(options.hidden);assert.equal(material.querySelector('button').getAttribute('aria-expanded'),'false');
w.close();console.log('PASS shared dropdown outside dismissal, Escape, single menu, focus and option handlers');
