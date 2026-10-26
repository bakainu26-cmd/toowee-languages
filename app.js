'use strict';
const byId = id => document.getElementById(id);
let library = { words: [], folders: [] };
let account = null;
let libraryRevision = 0;
let ready = false;
let saving = false;
let editId = null;
let quiz = [];
let activeLanguage = null;
const languageInfo = Object.freeze({English:{name:'Angielski',genitive:'angielskiego',target:'angielski',code:'en'},Japanese:{name:'Japoński',genitive:'japońskiego',target:'japoński',code:'ja'},Spanish:{name:'Hiszpański',genitive:'hiszpańskiego',target:'hiszpański',code:'es'}});
function activeWords() { return library.words.filter(w => w.lang === activeLanguage); }
function activeFolders() {
  return library.folders.filter(folder=>{
    if(folder.lang)return folder.lang===activeLanguage;
    // Compatibility before the one-time migration: only infer an unambiguous language.
    const languages=new Set(library.words.filter(w=>w.folder_id===folder.id).map(w=>w.lang));
    return languages.size===1 && languages.has(activeLanguage);
  });
}
function renderUnassignedFolders() {
  const folders=library.folders.filter(folder=>!folder.lang && !library.words.some(w=>w.folder_id===folder.id));
  byId('unassignedFolders').hidden=!folders.length || !activeLanguage;
  byId('unassignedFolderRows').replaceChildren();
  if(!activeLanguage)return;
  for(const folder of folders){
    const row=document.createElement('div');row.className='question';
    const name=document.createElement('strong');name.textContent=folder.name;
    const button=document.createElement('button');button.type='button';button.className='alt';button.style.marginLeft='12px';button.textContent='Przypisz do '+languageInfo[activeLanguage].genitive;
    button.dataset.assignFolder=folder.id;button.disabled=!ready || saving;row.append(name,button);byId('unassignedFolderRows').append(row);
  }
}

function showLanguagePicker() {
  if (!account?.userId || saving) return;
  activeLanguage = null;
  if(window.resetLearningSets)window.resetLearningSets();
  cancelEdit();clearQuiz();if (window.resetImport) window.resetImport();
  byId('learningWorkspace').hidden = true;
  byId('languagePicker').hidden = false;
  controls();
}
function chooseLanguage(language) {
  if (!account?.userId || saving || !Object.hasOwn(languageInfo,language)) return;
  activeLanguage = language;
  if(window.resetLearningSets)window.resetLearningSets();
  cancelEdit();clearQuiz();if (window.resetImport) window.resetImport();
  byId('folderForm').reset();byId('search').value = '';byId('filterFolder').value = '';
  byId('studyFolder').value = '';
  byId('wordForm').elements.lang.value = language;
  byId('testLang').value = language;
  byId('studyLanguage').value = language;
  byId('currentLanguage').textContent = 'Uczysz się ' + languageInfo[language].genitive;
  byId('languagePicker').hidden = true;
  byId('learningWorkspace').hidden = false;
  tab(window.location?.hash?.startsWith('#/fiszki')?'study':'learning');renderLibrary();
  if (window.resetStudy) window.resetStudy();
}
byId('chooseEnglish').onclick = () => chooseLanguage('English');
byId('chooseJapanese').onclick = () => chooseLanguage('Japanese');
byId('chooseSpanish').onclick = () => chooseLanguage('Spanish');
byId('changeLanguage').onclick = showLanguagePicker;
function safe(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function libraryStatus(text, error = false) {
  byId('libraryStatus').textContent = text;
  byId('libraryStatus').style.color = error ? '#a12743' : '';
}
function controls() {
  const disabled = !ready || saving || !activeLanguage;
  document.querySelectorAll('#wordForm button,#folderForm button,#wordRows button,#unassignedFolderRows button').forEach(b => b.disabled = disabled);
  byId('refreshLibrary').disabled = !account?.userId || saving;
  byId('exportWords').disabled = disabled;
  byId('generateTest').disabled = disabled;
  byId('changeLanguage').disabled = saving;
  if (window.updateStudyControls) window.updateStudyControls();
  if (window.updateGameControls) window.updateGameControls();
  if (window.updateImportControls) window.updateImportControls();
  if(window.updateTaskControls)window.updateTaskControls();
}
function cancelEdit() {
  editId = null;
  byId('wordForm').reset();
  byId('wordForm').elements.lang.value = activeLanguage || '';
  byId('saveWord').textContent = '+ Dodaj słówko';
  byId('cancelEdit').hidden = true;
}
function clearQuiz() { quiz = []; byId('testArea').replaceChildren(); if (window.resetStudy) window.resetStudy(); if (window.resetGame) window.resetGame(); if(window.resetTasks)window.resetTasks(); }
function tab(id) {
  if(window.onStudyTabChange)window.onStudyTabChange(id);
  document.querySelectorAll('main section').forEach(x => x.hidden = x.id !== id);
  const learningNames = {words:'Lista słówek',study:'Fiszki',games:'Gry',tests:'Szybki test',imports:'Importuj słownictwo',tasks:'Zadania'};
  const navId = ['games','tasks'].includes(id) ? id : learningNames[id] ? 'learning' : id;
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('active', x.id === 'nav-' + navId));
  byId('learningBreadcrumb').hidden = !learningNames[id] || (['games','tasks'].includes(id) && !window.getLearningContext?.());
  const selectedSet=window.getLearningContext?.();
  const setName=selectedSet ? library.folders.find(f=>f.id===selectedSet.folder)?.name || 'Bez zestawu' : '';
  byId('learningViewName').textContent = (learningNames[id] || '')+(setName ? ' · '+setName : '');
  if(id!=='games' && window.pauseFallingGame)window.pauseFallingGame();
  if (id !== 'study' && window.pauseStudySession) window.pauseStudySession();
  if (id === 'learning' && window.refreshLearningSets) void window.refreshLearningSets();
  if (id === 'progress' && window.loadProgressDashboard) void window.loadProgressDashboard();
}
function renderLibrary() {
  byId('stats').textContent = activeWords().length + ' słówek • ' + activeFolders().length + ' folderów';
  const options = activeFolders().map(f => '<option value="' + safe(f.id) + '">' + safe(f.name) + '</option>').join('');
  const selected = byId('wordFolder').value;
  const filter = byId('filterFolder').value;
  byId('wordFolder').innerHTML = '<option value="">Bez folderu</option>' + options;
  byId('wordFolder').value = selected;
  byId('filterFolder').innerHTML = '<option value="">Wszystkie foldery</option>' + options;
  byId('filterFolder').value = filter;
  byId('folderRows').innerHTML = activeFolders().map(f => '<div class="question">' + safe(f.name) +
    ' <span class="tag">' + activeWords().filter(w => w.folder_id === f.id).length + ' słówek</span></div>').join('') || '<p>Brak folderów. Dodaj pierwszy folder powyżej.</p>';
  renderUnassignedFolders();
  if (window.updateStudyFolders) window.updateStudyFolders();
  if (window.updateGameFolders) window.updateGameFolders();
  if (window.updateImportFolders) window.updateImportFolders();
  if(window.updateTaskFolders)window.updateTaskFolders();
  if (window.renderMemoryStats) window.renderMemoryStats();
  renderWords();
  if(ready && window.refreshLearningSets)void window.refreshLearningSets();
  controls();
}
function renderWords() {
  const q = byId('search').value.toLocaleLowerCase().trim();
  const folder = byId('filterFolder').value;
  byId('wordRows').innerHTML = (window.filterLearningWords ? window.filterLearningWords(activeWords()) : activeWords()).filter(w => (!folder || w.folder_id === folder) &&
    [w.word,w.reading,w.translation,w.lang].some(v => String(v).toLocaleLowerCase().includes(q))).map(w =>
    '<tr><td><strong>' + safe(w.word) + '</strong></td><td>' + safe(w.reading) +
    '</td><td>' + safe(w.translation) + '</td><td>' + safe(library.folders.find(f => f.id === w.folder_id)?.name || '—') +
    '</td><td><div class="actions"><button class="alt" data-edit="' + safe(w.id) + '">Edytuj</button>' +
    '<button class="danger" data-delete="' + safe(w.id) + '">Usuń</button></div></td></tr>').join('') ||
    '<tr><td colspan="5">' + (ready ? 'Brak słówek dla tego wyszukiwania.' : 'Zaloguj się i wczytaj bibliotekę.') + '</td></tr>';
  controls();
}
function dbError(error) {
  if(['PGRST204','42703'].includes(error.code) && /lang/i.test(error.message || ''))return 'Włącz języki folderów: uruchom folder_languages.sql w SQL Editor w Supabase, a potem odśwież bibliotekę.';
  if(error.code==='23503' && /folder_language/.test(error.message || ''))return 'Słówko i folder muszą należeć do tego samego języka. Odśwież bibliotekę i wybierz właściwy folder.';
  if (['PGRST205','42P01'].includes(error.code)) return 'Brakuje tabel biblioteki. Uruchom vocabulary_setup.sql w SQL Editor w Supabase, a potem kliknij „Odśwież bibliotekę”.';
  return 'Operacja nie powiodła się. ' + (error.message || 'Sprawdź połączenie z internetem i spróbuj ponownie.');
}
async function fetchAll(table, id) {
  const all = [];
  for (let start = 0; ; start += 500) {
    const {data,error} = await account.client.from(table).select('*').eq('owner_id',id).order('id').range(start,start+499);
    if (error) throw error;
    all.push(...data);
    if (data.length < 500) return all;
  }
}
async function loadLibrary() {
  if (!account?.userId || saving) return;
  const version = ++libraryRevision;
  const id = account.userId;
  ready = false;
  libraryStatus('Wczytywanie biblioteki z Supabase…');
  controls();
  try {
    const [words,folders] = await Promise.all([fetchAll('vocabulary_words',id),fetchAll('vocabulary_folders',id)]);
    if (version !== libraryRevision || id !== account?.userId) return;
    library = {words,folders};
    ready = true;
    byId('storageBadge').textContent = 'Biblioteka w Supabase';
    libraryStatus('Biblioteka wczytana. Zmiany zapisują się na Twoim koncie w Supabase.');
    renderLibrary();
  } catch (error) {
    if (version !== libraryRevision) return;
    libraryStatus(dbError(error),true);
    byId('storageBadge').textContent = 'Biblioteka niedostępna';
    controls();
  }
}
window.addEventListener('toowee-account', event => {
  account = event.detail;
  activeLanguage = null;
  byId('learningWorkspace').hidden = true;
  byId('languagePicker').hidden = !account.userId;
  if(window.resetLearningSets)window.resetLearningSets();
  if (window.resetImport) window.resetImport();
  if (window.resetProgressDashboard) window.resetProgressDashboard();
  const version = ++libraryRevision;
  ready = false; saving = false;
  library = {words:[],folders:[]};
  cancelEdit(); byId('folderForm').reset(); byId('search').value = ''; byId('filterFolder').value = '';
  clearQuiz(); renderLibrary();
  byId('storageBadge').textContent = account.userId ? 'Ładowanie biblioteki…' : 'Zaloguj się, aby zapisywać';
  libraryStatus(account.userId ? 'Wczytywanie biblioteki…' : 'Zaloguj się, aby otworzyć swoją prywatną bibliotekę.');
  if (account.userId) setTimeout(() => { if (version === libraryRevision) void loadLibrary(); },0);
});
async function writeLibrary(operation, success) {
  if (!ready || saving || !account?.userId || !activeLanguage) return false;
  const version = libraryRevision;
  const snapshot = {...account};
  saving = true; controls(); libraryStatus('Zapisywanie w Supabase…');
  try {
    const result = await operation(snapshot);
    if (result.error) throw result.error;
    if (version !== libraryRevision) return false;
    saving = false;
    clearQuiz();
    await loadLibrary();
    if (ready) libraryStatus(success);
    return true;
  } catch (error) {
    if (version === libraryRevision) libraryStatus(dbError(error),true);
    return false;
  } finally {
    if (snapshot.userId === account?.userId) { saving = false; controls(); }
  }
}
byId('wordForm').onsubmit = async event => {
  event.preventDefault();
  const f = event.target.elements;
  if (!activeLanguage) return;
  const word = {lang:activeLanguage,word:f.word.value.trim(),reading:f.reading.value.trim(),translation:f.translation.value.trim(),folder_id:f.folder.value || null};
  if(word.folder_id && !activeFolders().some(folder=>folder.id===word.folder_id)){libraryStatus('Wybierz folder należący do aktualnego języka.',true);return;}
  if (!word.word || !word.translation) { libraryStatus('Wpisz słówko i tłumaczenie.',true); return; }
  const id = editId;
  const success = await writeLibrary(({client,userId}) => id
    ? client.from('vocabulary_words').update(word).eq('owner_id',userId).eq('id',id).select('id').single()
    : client.from('vocabulary_words').insert({...word,owner_id:userId}).select('id').single(), id ? 'Zmiany słówka zapisane.' : 'Słówko zapisane w Supabase.');
  if (success) cancelEdit();
};
byId('folderForm').onsubmit = async event => {
  event.preventDefault();
  const name = event.target.elements.name.value.trim();
  const language=activeLanguage;if(!language)return;
  if (!name) { libraryStatus('Wpisz nazwę folderu.',true); return; }
  if (await writeLibrary(({client,userId}) => client.from('vocabulary_folders').insert({name,lang:language,owner_id:userId}).select('id').single(),'Folder zapisany w Supabase.')) event.target.reset();
};
byId('unassignedFolderRows').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-assign-folder]');if(!button || !ready || saving || !activeLanguage)return;
  const id=button.dataset.assignFolder,language=activeLanguage;
  if(!library.folders.some(f=>f.id===id && !f.lang) || library.words.some(w=>w.folder_id===id))return;
  await writeLibrary(({client,userId})=>client.from('vocabulary_folders').update({lang:language}).eq('owner_id',userId).eq('id',id).is('lang',null).select('id').single(),'Folder przypisany do '+languageInfo[language].genitive+'.');
});
byId('wordRows').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || !ready || saving) return;
  if (button.dataset.edit) {
    const w = library.words.find(w => w.id === button.dataset.edit);
    if (!w) return;
    editId = w.id;
    const f = byId('wordForm').elements;
    for (const name of ['lang','word','reading','translation']) f[name].value = w[name];
    f.folder.value = w.folder_id || '';
    byId('saveWord').textContent = 'Zapisz zmiany'; byId('cancelEdit').hidden = false;
    f.word.focus();
  } else if (button.dataset.delete && confirm('Usunąć słówko z Twojej biblioteki?')) {
    const id = button.dataset.delete;
    const success = await writeLibrary(({client,userId}) => client.from('vocabulary_words').delete().eq('owner_id',userId).eq('id',id).select('id').single(),'Słówko usunięte.');
    if (success && editId === id) cancelEdit();
  }
});
byId('cancelEdit').onclick = cancelEdit;
byId('refreshLibrary').onclick = () => { if (!saving) { cancelEdit();clearQuiz();void loadLibrary(); } };
byId('filterFolder').onchange = renderWords;
byId('exportWords').onclick = () => {
  if (!ready) return;
  const blob = new Blob([JSON.stringify({version:1,exported_at:new Date().toISOString(),language:activeLanguage,words:activeWords(),folders:activeFolders()},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'toowee-vocabulary-' + new Date().toISOString().slice(0,10) + '.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function makeTest() {
  if (!ready || saving || !activeLanguage) return;
  const lang = byId('testLang').value;
  quiz = window.filterLearningWords ? window.filterLearningWords(activeWords()) : library.words.filter(w=>w.lang===lang);
  for (let i=quiz.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [quiz[i],quiz[j]]=[quiz[j],quiz[i]]; }
  quiz = quiz.slice(0,10);
  byId('testArea').innerHTML = quiz.length ? quiz.map((w,i)=>'<div class="question"><strong>'+(i+1)+'. '+safe(w.translation)+'</strong><label for="answer'+i+'">Przetłumacz na '+safe(languageInfo[lang]?.target || lang)+'</label><input id="answer'+i+'" autocomplete="off"></div>').join('')+'<button onclick="checkTest()">Sprawdź odpowiedzi</button>' : '<p>Dodaj słówka w tym języku.</p>';
}
function checkTest() {
  if (!ready || !quiz.length || !byId('answer0')) return;
  let n = 0;
  const normalize = v => v.trim().normalize('NFKC').toLocaleLowerCase();
  const rows = quiz.map((w,i)=>{
    const ok = [w.word,w.reading].filter(Boolean).map(normalize).includes(normalize(byId('answer'+i).value));
    if (ok) n++;
    return '<p>'+(ok?'✅':'❌')+' '+safe(w.translation)+' → '+safe(w.word)+(w.reading?' ('+safe(w.reading)+')':'')+'</p>';
  }).join('');
  byId('testArea').innerHTML = '<h3>Wynik: '+n+' / '+quiz.length+'</h3>'+rows+'<button onclick="makeTest()">Spróbuj ponownie</button>';
}
tab('dashboard');renderLibrary();
