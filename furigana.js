'use strict';
(() => {
  const han=/[一-龯々〆ヵヶ]/,cache=new Map(),versions=new WeakMap();let loading;
  const hira=s=>String(s).replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  // Kana anchors keep okurigana below the baseline: 進み方 → 進[すす]み方[かた].
  function align(surface,reading){
    reading=hira(reading);const groups=surface.match(/[一-龯々〆ヵヶ]+|[^一-龯々〆ヵヶ]+/g)||[];
    const failed=new Set();
    function walk(i,pos){
      const key=i+":"+pos;if(failed.has(key))return null;
      if(i===groups.length)return pos===reading.length?[]:null;
      const g=groups[i];
      if(!han.test(g)){const k=hira(g);if(!reading.startsWith(k,pos))return null;const rest=walk(i+1,pos+k.length);return rest&&[{text:g},...rest];}
      for(let end=pos+1;end<=reading.length;end++){const rest=walk(i+1,end);if(rest)return [{text:g,reading:reading.slice(pos,end)},...rest];}
      failed.add(key);return null;
    }
    return walk(0,0)||[{text:surface,reading}];
  }
  function tokenizer(){
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const start=()=>window.kuromoji.builder({dicPath:'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'}).build((error,value)=>error?reject(error):resolve(value));
      if(window.kuromoji){start();return;}
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';script.onload=start;script.onerror=()=>reject(new Error('dictionary'));document.head.append(script);
    }).catch(error=>{loading=null;throw error;});return loading;
  }
  async function segments(text,reading=''){
    if(reading && han.test(text))return align(text,reading);
    if(!han.test(text))return [{text}];
    if(cache.has(text))return cache.get(text);
    const tok=await tokenizer(),parts=[];let offset=0;
    // Manual ruby is plain text syntax, never interpreted as HTML.
    const regex=/([^\s{}]+)\{([ぁ-ゖァ-ヺー\s]+)\}/g;let match;
    function automatic(value){
      let position=0;
      for(const token of tok.tokenize(value)){
        const at=value.indexOf(token.surface_form,position);if(at<0)continue;
        if(at>position)parts.push({text:value.slice(position,at)});
        if(han.test(token.surface_form)&&token.reading&&token.reading!=='*')parts.push(...align(token.surface_form,token.reading));
        else parts.push({text:token.surface_form});
        position=at+token.surface_form.length;
      }
      if(position<value.length)parts.push({text:value.slice(position)});
    }
    while((match=regex.exec(text))){automatic(text.slice(offset,match.index));parts.push(...align(match[1],match[2]));offset=regex.lastIndex;}
    automatic(text.slice(offset));if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(text,parts);return parts;
  }
  async function render(element,text,reading='',status){
    const version={};versions.set(element,version);element.textContent=text;if(status)status.textContent=han.test(text)?'Przygotowuję furiganę…':'';
    try{
      const parts=await segments(text,reading);if(versions.get(element)!==version)return;
      element.replaceChildren();
      for(const part of parts){
        if(!part.reading){element.append(document.createTextNode(part.text));continue;}
        const ruby=document.createElement('ruby'),rt=document.createElement('rt');ruby.append(document.createTextNode(part.text));rt.textContent=part.reading;ruby.append(rt);element.append(ruby);
      }
      if(status)status.textContent=parts.some(p=>han.test(p.text)&&!p.reading)?'Nie wszystkie czytania są znane. Możesz dopisać kanji{czytanie} w zdaniu.':'';
    }catch(error){if(versions.get(element)!==version)return;if(status)status.textContent='Nie udało się pobrać słownika furigany. Zdanie nadal jest dostępne. Spróbuj ponownie po odświeżeniu.';}
  }
  window.TooweeFurigana=Object.freeze({align,segments,render,cancel(element){if(element)versions.set(element,{});}});
})();
