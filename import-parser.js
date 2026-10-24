'use strict';
window.TooweeImport = Object.freeze({
  parse(text, options={}) {
    const errors=[],rows=[];
    text=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const delimiter=options.delimiter ?? '\t';
    const recordDelimiter=options.recordDelimiter ?? '\n';
    if(!delimiter || !recordDelimiter) return {rows,errors:[{line:0,message:'Wpisz separator.'}]};
    if(delimiter===recordDelimiter) return {rows,errors:[{line:0,message:'Separator słówka i tłumaczenia musi być inny niż separator kolejnych wpisów.'}]};
    const records=text.split(recordDelimiter);
    if(records.length>1000) return {rows,errors:[{line:0,message:'Jednorazowo zaimportuj maksymalnie 1000 wpisów.'}]};
    function splitRecord(record) {
      if(options.dash) {
        // Prefer a spaced dash so hyphens within English words stay intact.
        const match=/\s+[-–—]\s+/.exec(record) || /[-–—]/.exec(record);
        if(!match) return null;
        return [record.slice(0,match.index),record.slice(match.index+match[0].length)];
      }
      const position=record.indexOf(delimiter);
      if(position<0) return null;
      if(options.threeColumns) {
        const second=record.indexOf(delimiter,position+delimiter.length);
        if(second<0) return null;
        return [record.slice(0,position),record.slice(position+delimiter.length,second),record.slice(second+delimiter.length)];
      }
      // Split once: commas and dashes inside the meaning are preserved.
      return [record.slice(0,position),record.slice(position+delimiter.length)];
    }
    for(let i=0;i<records.length;i++) {
      const record=records[i].trim();if(!record) continue;
      if(options.threeColumns && options.dash) {errors.push({line:i+1,message:'Dla trzech kolumn wybierz tabulator lub własny separator.'});continue;}
      const parts=splitRecord(record);
      if(!parts) {errors.push({line:i+1,message:options.threeColumns ? 'Nie znaleziono trzech kolumn.' : 'Nie znaleziono separatora słówka i tłumaczenia.'});continue;}
      let word=parts[0].trim(),reading=options.threeColumns ? parts[1].trim() : '',translation=parts[parts.length-1].trim();
      if(options.reverse && !options.threeColumns) [word,translation]=[translation,word];
      if(options.language==='Japanese' && !options.threeColumns) {
        const match=/^(.*?)\s*[（(]([ぁ-ゖァ-ヺー・\s〜～]+)[）)]$/.exec(word);
        if(match) {word=match[1].trim();reading=match[2].trim();}
      }
      if(!word || !translation) {errors.push({line:i+1,message:'Brakuje słówka lub tłumaczenia.'});continue;}
      if(word.length>500 || reading.length>500 || translation.length>1000) {errors.push({line:i+1,message:'Wpis jest za długi (słówko/czytanie: 500 znaków, tłumaczenie: 1000).'});continue;}
      rows.push({word,reading,translation,line:i+1});
    }
    return {rows,errors};
  },
  unique(rows, existing, skip=true) {
    const normalize=s=>String(s || '').trim().normalize('NFC');
    const key=row=>JSON.stringify([row.word,row.reading,row.translation].map(normalize));
    const seen=new Set(existing.map(key)),result=[];let duplicates=0;
    for(const row of rows) {
      const k=key(row);if(skip && seen.has(k)) {duplicates++;continue;}
      result.push(row);seen.add(k);
    }
    return {rows:result,duplicates};
  }
});
