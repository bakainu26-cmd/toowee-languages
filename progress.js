'use strict';
(() => {
  const el=id=>document.getElementById(id),math=window.TooweeProgress;
  let records=[],days=[],dataOwner=null,daysLoaded=false,memoryLoaded=false,version=0,pending=null,recording=false;
  let shownMonth=math.dateKey().slice(0,7);
  const labels=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
  function notice(text,error=false) {el('challengeNotice').hidden=false;el('challengeNotice').textContent=text;el('challengeNotice').style.color=error ? '#a12743' : '#286040';}
  function setStatus(text) {el('progressStatus').textContent=text;}
  function renderMemoryStats() {
    el('memoryLanguage').textContent=activeLanguage ? 'Słówka w języku: '+languageInfo[activeLanguage].name+'.' : 'Wybierz język nauki.';
    if(!memoryLoaded || dataOwner!==account?.userId) {for(const id of ['memoryTodo','memoryShort','memoryLong'])el(id).textContent='—';return;}
    const counts=math.memory(activeWords(),records);
    el('memoryTodo').textContent=counts.todo;el('memoryShort').textContent=counts.short;el('memoryLong').textContent=counts.long;
    el('memoryStatus').textContent='Łącznie '+counts.total+' słówek. Dane na podstawie zapisanych wyników końcowej weryfikacji.';
  }
  function renderCalendar() {
    const today=math.dateKey(),set=new Set(days.map(d=>d.challenge_date));
    const [year,month]=shownMonth.split('-').map(Number);
    el('calendarMonth').textContent=labels[month-1]+' '+year;el('challengeCalendar').replaceChildren();
    for(const key of math.month(year,month-1)) {
      const cell=document.createElement('div');
      if(!key) {cell.setAttribute('aria-hidden','true');el('challengeCalendar').append(cell);continue;}
      cell.className='calendar-day'+(set.has(key)?' earned':'')+(key===today?' today':'')+(key>today?' future':'');
      cell.setAttribute('aria-label',key+(set.has(key) ? ': challenge zaliczony' : key>today ? ': dzień w przyszłości' : daysLoaded ? ': brak zaliczonego challenge’u' : ': dane niewczytane'));
      const day=document.createElement('span');day.textContent=String(Number(key.slice(8)));cell.append(day);
      if(set.has(key)) {const tick=document.createElement('span');tick.className='calendar-tick';tick.textContent='✓';tick.setAttribute('aria-hidden','true');cell.append(tick);}
      el('challengeCalendar').append(cell);
    }
    if(daysLoaded) {
      const streak=math.streaks(days.map(d=>d.challenge_date),today);
      el('currentStreak').textContent=streak.current;el('bestStreak').textContent=streak.best;el('challengeTotal').textContent=streak.total;
      el('todayChallenge').textContent=streak.todayDone ? '✓ Dzisiejszy challenge zaliczony!' : 'Dzisiejszy challenge czeka. Ukończ sesję fiszek wraz z weryfikacją.';
    } else {for(const id of ['currentStreak','bestStreak','challengeTotal'])el(id).textContent='—';el('todayChallenge').textContent='';}
    el('retryChallenge').hidden=!pending || pending.userId!==account?.userId;
    el('retryChallenge').disabled=recording;
  }
  async function readAll(client,table,userId,order) {
    const all=[];
    for(let start=0;;start+=500) {
      const {data,error}=await client.from(table).select('*').eq('owner_id',userId).order(order).range(start,start+499);
      if(error) throw error;all.push(...data);if(data.length<500)return all;
    }
  }
  function resetProgressDashboard() {
    ++version;records=[];days=[];dataOwner=null;daysLoaded=false;memoryLoaded=false;pending=null;recording=false;
    shownMonth=math.dateKey().slice(0,7);el('challengeNotice').hidden=true;el('memoryStatus').textContent='';
    setStatus('Otwórz zakładkę, aby wczytać postęp.');renderMemoryStats();renderCalendar();
  }
  async function loadProgressDashboard() {
    if(!account?.userId || !ready) {setStatus('Zaloguj się i wczytaj bibliotekę.');return;}
    const current=++version,snapshot={...account};setStatus('Wczytywanie postępu…');el('refreshProgress').disabled=true;
    const results=await Promise.allSettled([readAll(snapshot.client,'study_challenge_days',snapshot.userId,'challenge_date'),readAll(snapshot.client,'vocabulary_progress',snapshot.userId,'word_id')]);
    if(current!==version || snapshot.userId!==account?.userId)return;
    dataOwner=snapshot.userId;const errors=[];
    if(results[0].status==='fulfilled') {days=results[0].value;daysLoaded=true;} else {days=[];daysLoaded=false;errors.push(['PGRST205','42P01'].includes(results[0].reason?.code) ? 'Włącz challenge: uruchom daily_challenge_setup.sql w Supabase, a następnie odśwież postęp.' : 'Nie udało się odczytać kalendarza. Spróbuj ponownie.');}
    if(results[1].status==='fulfilled') {records=results[1].value;memoryLoaded=true;} else {records=[];memoryLoaded=false;el('memoryStatus').textContent='Nie udało się odczytać etapów nauki. Sprawdź konfigurację powtórek i spróbuj ponownie.';errors.push('Statystyki słówek są chwilowo niedostępne.');}
    renderMemoryStats();renderCalendar();setStatus(errors.join(' ') || 'Postęp wczytany.');el('refreshProgress').disabled=false;
  }
  async function recordStudyChallenge(detail) {
    if(!detail.userId || detail.userId!==account?.userId || !detail.review_count || recording)return;
    const today=math.dateKey();
    if(!detail.completed_all && !(detail.goal_seconds>=60 && detail.study_seconds>=detail.goal_seconds))return;
    if(daysLoaded && dataOwner===detail.userId && days.some(d=>d.challenge_date===today)) {notice('✓ Dzisiejszy challenge jest już zaliczony.');await loadProgressDashboard();return;}
    const snapshot={...account},owner=detail.userId;
    pending={...detail,earnedOn:detail.earnedOn || today};
    if(pending.earnedOn!==today) {notice('Nie można zapisać niezapisanego challenge’u jako dzisiejszego. Rozpocznij dzisiejszą sesję.',true);return;}
    recording=true;renderCalendar();
    try {
      const {userId,earnedOn,...fields}=pending;
      const {data,error}=await snapshot.client.from('study_challenge_days').insert({...fields,owner_id:owner}).select('challenge_date').single();
      if(error && error.code!=='23505')throw error;
      if(account?.userId!==owner)return;
      const day=data?.challenge_date || today;
      if(dataOwner!==owner) {days=[];records=[];memoryLoaded=false;dataOwner=owner;}
      if(!days.some(d=>d.challenge_date===day)) days.push({challenge_date:day,language:detail.language});
      // Refresh all history before claiming a streak; a single saved day is not the full calendar.
      pending=null;notice('✓ Dzienny challenge zaliczony! Zobacz swoją serię w zakładce „Postęp”.');
      await loadProgressDashboard();
    } catch(error) {
      if(account?.userId===owner) notice(['PGRST205','42P01'].includes(error.code)
        ? 'Wynik fiszek zapisany. Aby zapisać też challenge, uruchom daily_challenge_setup.sql i kliknij „Ponów zapis challenge’u” w Postępie.'
        : 'Wynik fiszek zapisany, ale nie udało się zapisać challenge’u. Otwórz Postęp i ponów zapis.',true);
    } finally {if(account?.userId===owner) {recording=false;renderCalendar();}}
  }
  el('refreshProgress').onclick=loadProgressDashboard;
  el('retryChallenge').onclick=()=>{if(pending)void recordStudyChallenge({...pending});};
  function shiftMonth(delta) {const [year,month]=shownMonth.split('-').map(Number);const date=new Date(Date.UTC(year,month-1+delta,1,12));shownMonth=date.toISOString().slice(0,7);renderCalendar();}
  el('previousMonth').onclick=()=>shiftMonth(-1);el('nextMonth').onclick=()=>shiftMonth(1);
  el('currentMonth').onclick=()=>{shownMonth=math.dateKey().slice(0,7);renderCalendar();};
  window.loadProgressDashboard=loadProgressDashboard;window.renderMemoryStats=renderMemoryStats;
  window.resetProgressDashboard=resetProgressDashboard;window.recordStudyChallenge=recordStudyChallenge;
  resetProgressDashboard();
})();
