'use strict';
(()=>{
 let owner=null,initialized=false,restoring=false,timer=null,pending=null,roleRestoring=false,studentTimer=null;
 // Existing game/flashcard routes also write history with a null state.
 // Keep the authorized panel context on those entries without adding entries.
 for(const method of ['pushState','replaceState']){const native=history[method].bind(history);history[method]=(state,title,url)=>{if(state==null&&owner&&window.tooweeView){state={tooweeNavigation:{owner,role:window.tooweeView,...(window.captureStudentNavigation?.()||{})}};if(window.tooweeView==='teacher'){const teacher=capture();if(teacher)state.tooweeTeacher=teacher;}}return native(state,title,url);};}
 const capture=()=>{if(!owner||window.tooweeView!=='teacher')return null;const panel=window.captureTeacherPanelNavigation?.(),student=window.captureTeacherStudentNavigation?.();if(!panel||!student)return null;const game=panel.current==='games'&&!panel.home?window.captureTeacherGameNavigation?.():null;if(panel.current==='games'&&!panel.home&&!game)return null;return {owner,panel,game,resources:panel.current==='resources'?window.captureExerciseSetsNavigation?.():null,student:panel.current==='students'&&!panel.home?student:null,settings:document.body.dataset.teacherSettings==='open'};};
 const address=s=>'#/nauczyciel/'+(s.settings?'ustawienia':s.panel.home?'start':(s.panel.scope||'wszystkie')+'/'+s.panel.current+(s.student?.profile?'/uczen/'+encodeURIComponent(s.student.profile)+(s.student.editor?'/zestaw/'+encodeURIComponent(s.student.set):''):'')+(s.panel.openedSet?'/zestaw/'+encodeURIComponent(s.panel.openedSet):''));
 function record(replace=false){clearTimeout(timer);timer=setTimeout(()=>{if(restoring||roleRestoring)return;const state=capture();if(!state)return;const previous=history.state?.tooweeTeacher;if(JSON.stringify(previous)===JSON.stringify(state))return;const content=s=>{if(!s)return null;const copy=JSON.parse(JSON.stringify(s));delete copy.settings;for(const k of ['navOpen','globalListsOpen','studentListsOpen','sectionListsOpen','folders'])delete copy.panel[k];return JSON.stringify(copy);};const disclosureOnly=content(previous)===content(state);history[initialized&&!replace&&!disclosureOnly?'pushState':'replaceState']({tooweeTeacher:state,tooweeNavigation:{owner,role:'teacher'}},'',address(state));initialized=true;},0);}
 window.recordTeacherNavigation=()=>{if(window.tooweeView==='teacher')record();else recordStudent();};window.replaceTeacherNavigation=()=>record(true);
 async function restore(){if(restoring)return;restoring=true;clearTimeout(timer);try{while(pending){const state=pending;pending=null;if(state.owner!==owner||window.tooweeView!=='teacher')continue;await window.restoreTeacherPanelNavigation(state.panel);if(pending)continue;if(state.game)await window.restoreTeacherGameNavigation?.(state.game);if(state.resources)await window.restoreExerciseSetsNavigation?.(state.resources);if(pending)continue;if(state.student)await window.restoreTeacherStudentNavigation(state.student);if(pending)continue;window.restoreTeacherFolderNavigation(state.panel);if(state.settings)window.openTeacherSettings();}}catch(e){const note=document.getElementById('teacherPanelStatus');if(note)note.textContent='Nie udało się otworzyć poprzedniego widoku: '+e.message;}finally{clearTimeout(timer);restoring=false;}}
 async function restoreEntry(entry){
 const route=entry?.tooweeNavigation,state=entry?.tooweeTeacher;
 const role=route?.role||(state?'teacher':null);if(!role||((route||state).owner!==owner))return;
 if(!history.state?.tooweeNavigation&&!history.state?.tooweeTeacher)history.replaceState(entry,'');
 roleRestoring=true;clearTimeout(studentTimer);clearTimeout(timer);
 try{if(window.tooweeView!==role&&!window.restoreTooWeeRole?.(role))return;
 if(role==='teacher'&&state){pending=state;await restore();}
 else if(role==='student'&&route?.tab){window.restoreStudentNavigation?.(route);}
 }finally{clearTimeout(timer);clearTimeout(studentTimer);roleRestoring=false;}
 }
 function recordStudent(replace=false){clearTimeout(studentTimer);studentTimer=setTimeout(()=>{
 if(roleRestoring||restoring||!owner||!window.tooweeView||window.tooweeView==='teacher')return;
 const route={owner,role:window.tooweeView,...(window.captureStudentNavigation?.()||{})};
 if(JSON.stringify(history.state?.tooweeNavigation)===JSON.stringify(route))return;
 history[replace||!initialized?'replaceState':'pushState']({tooweeNavigation:route},'', '#/panel/'+route.role+'/'+encodeURIComponent(route.language||'all')+'/'+encodeURIComponent(route.tab||'dashboard'));initialized=true;
 },0);}
 window.recordPlatformNavigation=()=>{if(window.tooweeView==='teacher')record();else recordStudent();};
 window.addEventListener('toowee-tab',()=>recordStudent());
 window.addEventListener('toowee-role',()=>window.recordPlatformNavigation());
 window.addEventListener('popstate',e=>{void restoreEntry(e.state);});
 window.addEventListener('toowee-account',e=>{clearTimeout(timer);owner=e.detail?.userId||null;initialized=false;pending=null;});
 window.addEventListener('toowee-profile',()=>{
 if(roleRestoring)return;
 if(!initialized){const entry=history.state,route=entry?.tooweeNavigation;
 if((route?.owner||entry?.tooweeTeacher?.owner)===owner){initialized=true;setTimeout(()=>void restoreEntry(entry),0);return;}
 const teacherPath=location.hash.match(/^#\/nauczyciel\/(start|ustawienia|(?:English|Japanese|Spanish|wszystkie)\/(?:students|groups|games|statistics|vocabulary|resources))(.*)$/);
 if(teacherPath){const [scopeName,current]=teacherPath[1].split('/');const pupil=teacherPath[2].match(/\/uczen\/([^/]+)/),set=teacherPath[2].match(/\/zestaw\/([^/]+)/);const state={owner,panel:{scope:['English','Japanese','Spanish'].includes(scopeName)?scopeName:null,current:current||'students',home:scopeName==='start',navOpen:true,openedSet:!pupil&&set?decodeURIComponent(set[1]):null},settings:scopeName==='ustawienia',student:pupil?{section:'list',profile:decodeURIComponent(pupil[1]),lang:scopeName,set:set?decodeURIComponent(set[1]):'all',editor:Boolean(set),tab:'vocabulary'}:null};initialized=true;setTimeout(()=>void restoreEntry({tooweeTeacher:state,tooweeNavigation:{owner,role:'teacher'}}),0);return;}
 const match=location.hash.match(/^#\/panel\/(student|teacher|admin)\/(English|Japanese|Spanish|all)\/([a-z]+)$/);
 if(match){initialized=true;setTimeout(()=>void restoreEntry({tooweeNavigation:{owner,role:match[1],language:match[2]==='all'?null:match[2],tab:match[3]}}),0);return;}
 }
 if(window.tooweeView==='teacher')record();else recordStudent();
 });
})();
