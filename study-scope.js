'use strict';
window.TooweeStudyScope = Object.freeze({
  // Date inputs and calendar weeks use the learner's local calendar.
  localDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y,m,d]=value.split('-').map(Number);const date=new Date(y,m-1,d);
    return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? date : null;
  },
  select(words,progress,options,now=new Date()) {
    let from,to;
    if(options.scope==='week') {
      from=new Date(now);from.setHours(0,0,0,0);from.setDate(from.getDate()-((from.getDay()+6)%7));
      to=new Date(from);to.setDate(to.getDate()+7);
    } else if(options.scope==='dates') {
      from=this.localDate(options.from);to=this.localDate(options.to);
      if(!from || !to || from>to) return [];
      to.setDate(to.getDate()+1);
    }
    return words.filter(w=>{
      if(w.lang!==options.language) return false;
      if(options.scope==='today') return progress.has(w.id) && window.TooweeSRS.isDue(progress.get(w.id),now);
      if(options.scope==='sets') return Boolean(options.folder) && w.folder_id===options.folder;
      if(from) {const added=new Date(w.created_at);return added>=from && added<to;}
      return true;
    });
  }
});
