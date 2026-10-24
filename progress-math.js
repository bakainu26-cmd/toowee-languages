'use strict';
window.TooweeProgress = Object.freeze({
  dateKey(date=new Date()) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=type=>parts.find(p=>p.type===type).value;
    return get('year')+'-'+get('month')+'-'+get('day');
  },
  shift(key,days) {
    const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
  },
  streaks(dates,today=this.dateKey()) {
    const keys=[...new Set(dates)].filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k) && k<=today).sort();
    const set=new Set(keys);let current=0,best=0,run=0,previous=null;
    let key=set.has(today) ? today : this.shift(today,-1);
    while(set.has(key)) {current++;key=this.shift(key,-1);}
    for(const date of keys) {run=previous && this.shift(previous,1)===date ? run+1 : 1;best=Math.max(best,run);previous=date;}
    return {current,best,total:keys.length,todayDone:set.has(today)};
  },
  memory(words,records) {
    const map=new Map(records.map(p=>[p.word_id,p]));const counts={todo:0,short:0,long:0,total:words.length};
    for(const word of words) {
      const stage=map.get(word.id)?.stage || 0;
      if(stage>=4) counts.long++;else if(stage>=1) counts.short++;else counts.todo++;
    }
    return counts;
  },
  month(year,month) {
    const first=new Date(Date.UTC(year,month,1,12)),offset=(first.getUTCDay()+6)%7;
    const count=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
    const cells=Array(offset).fill(null);
    for(let day=1;day<=count;day++) cells.push(year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'));
    while(cells.length%7) cells.push(null);
    return cells;
  }
});
