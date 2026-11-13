const {JSDOM}=require(process.env.TOOWEE_JSDOM_MODULE||'jsdom');
const fs=require('fs'),assert=require('node:assert/strict');
const dom=new JSDOM('<main></main>',{runScripts:'outside-only',url:'https://example.test/'}),w=dom.window;
w.eval(fs.readFileSync(__dirname+'/../online-lobby.js','utf8'));
const target=w.document.querySelector('main'),room={kind:'collections',title:'Kolekcje Sophisi',code:'1234ABCD',host:false,players:[{name:'Uczeń'}]};
w.TooWeeOnlineLobby.render(target,room);
const header=target.querySelector('.tw-online-header');
w.TooWeeOnlineLobby.render(target,{...room,players:[{name:'Uczeń'},{name:'Drugi'}]});
assert.strictEqual(target.querySelector('.tw-online-header'),header,'poll preserves existing shell');
// Closing and reopening a room replaces the contents but retains the target node.
target.replaceChildren(w.document.createElement('form'));
w.TooWeeOnlineLobby.render(target,room);
assert(target.querySelector('.tw-online-header'),'reopening the same room rebuilds the missing shell');
assert.equal(target.querySelectorAll('.tw-online-participants li').length,1);
assert(target.querySelector('.tw-online-game-art').style.backgroundImage.includes('collections.webp'));
w.TooWeeOnlineLobby.render(target,{...room,kind:'sophie',title:'Saszetki Sophie'});
assert(target.querySelector('.tw-online-game-art').style.backgroundImage.includes('sophie.webp'));
w.close();console.log('PASS same-room reentry restores lobby and both games retain their icons');
