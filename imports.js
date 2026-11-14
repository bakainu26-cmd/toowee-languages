'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let preview={rows:[],errors:[],duplicates:0},loading=false,importBusy=false,generation=0;const previewEdits=new Map();
  const canImport=()=>ready && !saving && Boolean(activeLanguage) && Boolean(account?.userId);
  const settingIds=['importDelimiter','importCustomDelimiter','importRecordDelimiter','importCustomRecord','importLayout','importFolder','importSkipDuplicates'];
  function status(text,error=false) {el('importStatus').textContent=text;el('importStatus').style.color=error ? '#a12743' : '';}
  function updateImportControls() {
    el('saveImport').disabled=!canImport() || loading || importBusy || preview.errors.length>0 || preview.rows.length===0 || window.tooweeView==='student'&&!activeFolders().some(f=>f.id===el('importFolder').value);
    for(const id of ['importFile','importText',...settingIds]) el(id).disabled=importBusy || saving || loading;
  }
  function parserOptions() {
    const delimiters={tab:'\t',comma:',',dash:'-',semicolon:';'};
    const delimiter=el('importDelimiter').value;
    const record=el('importRecordDelimiter').value;
    return {delimiter:delimiter==='custom' ? el('importCustomDelimiter').value : delimiters[delimiter],
      dash:delimiter==='dash',recordDelimiter:record==='custom' ? el('importCustomRecord').value : record==='semicolon' ? ';' : '\n',
      reverse:el('importLayout').value==='reverse',threeColumns:el('importLayout').value==='three',language:activeLanguage};
  }
  function refreshPreview() {
    el('importCustomDelimiterField').hidden=el('importDelimiter').value!=='custom';
    el('importCustomRecordField').hidden=el('importRecordDelimiter').value!=='custom';
    el('importJapaneseHint').hidden=activeLanguage!=='Japanese';
    el('importLanguageLabel').textContent=activeLanguage ? 'Import do języka: '+languageInfo[activeLanguage].name+'.' : 'Najpierw wybierz język nauki.';
    el('importErrors').replaceChildren();el('importPreview').replaceChildren();
    preview={rows:[],errors:[],duplicates:0};
    const text=el('importText').value;
    if(!text.trim()) {status('Wklej lub wczytaj listę, aby zobaczyć podgląd.');updateImportControls();return;}
    if(text.length>2*1024*1024) {preview.errors=[{line:0,message:'Lista jest za duża. Podziel ją na mniejsze części.'}];}
    else {
      const parsed=window.TooweeImport.parse(text,parserOptions());
      const folder=el('importFolder').value || null;
      const implicit=library.folders.find(f=>f.lang===activeLanguage&&f.name==='Słówka luzem')?.id;const existing=library.words.filter(w=>w.lang===activeLanguage && (folder?w.folder_id===folder:!w.folder_id||w.folder_id===implicit));
      if(window.tooweeView==='student')for(const row of parsed.rows){const edit=previewEdits.get(row.line);if(edit)Object.assign(row,edit);if(!row.word?.trim()||!row.translation?.trim())parsed.errors.push({line:row.line,message:'Wpisz słówko i tłumaczenie.'});for(const [key,max]of [['word',500],['reading',500],['translation',1000],['example',2000]])if((row[key]||'').length>max)parsed.errors.push({line:row.line,message:'Wpis jest zbyt długi.'});}
      const unique=window.TooweeImport.unique(parsed.rows,existing,el('importSkipDuplicates').checked);
      preview={rows:unique.rows,duplicates:unique.duplicates,errors:parsed.errors};
    }
    for(const error of preview.errors.slice(0,10)) {const li=document.createElement('li');li.textContent=(error.line ? 'Wpis '+error.line+': ' : '')+error.message;el('importErrors').append(li);}
    if(preview.errors.length>10) {const li=document.createElement('li');li.textContent='… i '+(preview.errors.length-10)+' kolejnych błędów.';el('importErrors').append(li);}
    for(const row of preview.rows.slice(0,50)) {
      const tr=document.createElement('tr');
      for(const [key,value] of [['line',row.line],['word',row.word],['reading',row.reading],['translation',row.translation],['example',row.example]]) {const td=document.createElement('td');if(window.tooweeView==='student'&&key!=='line'){const i=document.createElement('input');i.value=value||'';i.maxLength=key==='example'?2000:key==='translation'?1000:500;i.setAttribute('aria-label',({word:'Słówko',reading:'Czytanie',translation:'Tłumaczenie',example:'Zdanie'})[key]+' · wpis '+row.line);i.oninput=()=>{row[key]=i.value.trim();previewEdits.set(row.line,{...(previewEdits.get(row.line)||{}),[key]:row[key]});};td.append(i);}else td.textContent=String(value??'');tr.append(td);}
      el('importPreview').append(tr);
    }
    status('Do importu: '+preview.rows.length+' • Pominięte duplikaty: '+preview.duplicates+' • Błędy: '+preview.errors.length+
      (preview.rows.length>50 ? '. Podgląd pokazuje pierwsze 50 wpisów; zaimportowane zostaną wszystkie poprawne wpisy.' : '')+
      (preview.errors.length ? '. Popraw błędy przed zapisaniem.' : ''),preview.errors.length>0);
    el('saveImport').textContent='Importuj słownictwo ('+preview.rows.length+')';updateImportControls();
  }
  function updateImportFolders() {
    const chosen=el('importFolder').value;
    el('importFolder').replaceChildren(new Option(window.tooweeView==='student'?'Wybierz zestaw':'Słówka luzem (domyślna lista)',''));
    for(const folder of activeFolders()) el('importFolder').add(new Option(folder.name,folder.id));
    el('importFolder').value=activeFolders().some(f=>f.id===chosen) ? chosen : '';
    refreshPreview();
  }
  function resetImport() {
    ++generation;previewEdits.clear();loading=false;importBusy=false;
    el('importText').value='';el('importFile').value='';el('importFolder').value='';
    refreshPreview();
  }
  for(const id of ['importText',...settingIds]) {
    el(id).addEventListener(id==='importText' || id.startsWith('importCustom') ? 'input' : 'change',()=>{++generation;if(id!=='importFolder'&&id!=='importSkipDuplicates')previewEdits.clear();refreshPreview();});
  }
  el('importFile').addEventListener('change',async()=>{
    const file=el('importFile').files?.[0];if(!file) return;
    const current=++generation;loading=true;updateImportControls();status('Wczytywanie pliku…');
    try {
      if(file.size>2*1024*1024) throw new Error('Plik może mieć maksymalnie 2 MB.');
      const text=await file.text();if(current!==generation) return;
      if(text.includes('\uFFFD')) throw new Error('Nie udało się odczytać wszystkich znaków. Zapisz plik jako tekst UTF-8 i wczytaj ponownie.');
      el('importText').value=text;previewEdits.clear();refreshPreview();
    } catch(error) {if(current===generation) status(error.message || 'Nie udało się odczytać pliku.',true);}
    finally {if(current===generation) {loading=false;updateImportControls();}}
  });
  el('saveImport').onclick=async()=>{
    if(!canImport() || loading || importBusy) return;
    refreshPreview();if(preview.errors.length || !preview.rows.length) return;
    const current=generation,owner=account.userId,language=activeLanguage,folder=el('importFolder').value || null;
    if(window.tooweeView==='student'&&!folder){status('Wybierz zestaw do importu.',true);return;}
    if(folder && !activeFolders().some(f=>f.id===folder)){status('Wybierz zestaw należący do aktualnego języka.',true);return;}
    const payload=preview.rows.map(({word,reading,translation,example})=>({word,reading,translation,...(example ? {example} : {}),lang:language,folder_id:folder,owner_id:owner}));
    importBusy=true;updateImportControls();status('Zapisywanie '+payload.length+' słówek…');
    const ok=await writeLibrary(async snapshot=>{if(!folder){const id=await window.ensureLooseWordList(snapshot,language);for(const row of payload)row.folder_id=id;}if(account?.userId!==owner||activeLanguage!==language)throw Error('Konto lub język zostały zmienione.');return snapshot.client.from('vocabulary_words').insert(payload);},'Zaimportowano '+payload.length+' słówek.');
    if(current!==generation || account?.userId!==owner || activeLanguage!==language) return;
    importBusy=false;
    if(ok) {previewEdits.clear();el('importText').value='';el('importFile').value='';refreshPreview();status('Gotowe! Zaimportowano '+payload.length+' słówek do języka '+languageInfo[language].name+'. Znajdziesz je na liście słówek i w fiszkach.');if(window.tooweeView==='student'&&folder)window.openStudentVocabularySet?.(folder);}
    else {status('Import nie został potwierdzony. '+el('libraryStatus').textContent,true);updateImportControls();}
  };
  window.openVocabularyImport=target=>{
    if(!canImport() || importBusy) return;
    const chosen=typeof target==='string'?target:window.getStudentVocabularySet?.()||el('filterFolder').value||el('wordFolder').value;
    if(window.tooweeView==='student'&&!activeFolders().some(f=>f.id===chosen)){window.chooseStudentImportDestination?.();return;}
    updateImportFolders();
    el('importFolder').value=activeFolders().some(f=>f.id===chosen) ? chosen : '';
    refreshPreview();tab('imports');
  };
  window.updateImportControls=updateImportControls;window.updateImportFolders=updateImportFolders;window.resetImport=resetImport;
  updateImportFolders();
})();
