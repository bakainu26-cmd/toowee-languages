'use strict';
// One shared landing page; role navigation and data permissions stay in their existing panels.
(()=>{
 const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const home=make('section');home.id='portalHome';home.hidden=true;home.setAttribute('aria-labelledby','portalHomeTitle');
 const logo=make('img');logo.src='assets/toowee-logo.webp';logo.alt='TooWee Languages';logo.width=220;logo.height=220;
 const title=make('h1','TooWee Languages');title.id='portalHomeTitle';
 const slogan=make('p','Languages exist for us.');slogan.className='portal-home-slogan';
 const byline=make('p','by Magdalena Tułacz');byline.className='hint';home.append(logo,title,slogan,byline);document.querySelector('main').before(home);
 const links=[];let role=null;
 function close(){home.hidden=true;delete document.body.dataset.portalHome;for(const b of links)b.removeAttribute('aria-current');}
 function open(){if(!['student','teacher','admin'].includes(window.tooweeView))return;window.closeActivityFocus?.();window.pauseStudySession?.();home.hidden=false;document.body.dataset.portalHome='open';for(const b of links)b.setAttribute('aria-current','page');}
 window.openTooWeeHome=open;
 for(const selector of ['#teacherSidebar .teacher-entry-grid','#studentSidebar nav','.site-header']){const parent=document.querySelector(selector);if(!parent)continue;const b=make('button','Strona główna');b.type='button';b.className='alt portal-home-link';b.addEventListener('click',open);if(selector==='.site-header')b.id='adminHomeLink';parent.prepend(b);links.push(b);}
 const brand=document.querySelector('.site-logo-button');if(brand){brand.removeAttribute('onclick');brand.onclick=open;brand.setAttribute('aria-label','TooWee Languages — strona główna');}
 // Labels navigate through existing handlers; only the separate chevron expands.
 document.addEventListener('click',e=>{
  const target=e.target.closest?.('button');
  if(target?.classList.contains('portal-home-link')||target===brand||brand?.contains(e.target))return;
  if(e.target.closest?.('#teacherSidebar,#studentSidebar,#studentHeaderControls,#adminViewPanel'))close();
 },true);
 window.addEventListener('toowee-tab',close);
 const sync=()=>{const next=window.tooweeView;if(!['student','teacher','admin'].includes(next)){role=null;close();return;}if(next!==role){role=next;open();}};
 window.addEventListener('toowee-profile',sync);window.addEventListener('toowee-role',sync);window.addEventListener('toowee-account',()=>{role=null;close();});sync();
})();
