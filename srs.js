'use strict';
// Intervals run from the actual review, never from a missed scheduled date.
window.TooweeSRS = Object.freeze({
  next(previous, knows, now = new Date()) {
    const intervals = [0,1,3,7,14,30,60];
    const early=knows && previous?.stage>0 && !this.isDue(previous,now);
    const stage=knows ? early ? previous.stage : Math.min(6,(previous?.stage || 0)+1) : 0;
    return {
      stage,reviews:(previous?.reviews || 0)+1,
      lapses:(previous?.lapses || 0)+(knows ? 0 : 1),
      due_at:early ? previous.due_at : new Date(now.getTime()+(knows ? intervals[stage]*86400000 : 600000)).toISOString(),
      last_reviewed_at:now.toISOString()
    };
  },
  isDue(progress, now = new Date()) {return !progress || new Date(progress.due_at).getTime()<=now.getTime();},
  category(progress, now = new Date()) {
    if(!progress || progress.stage===0)return 'learn';
    if(this.isDue(progress,now))return 'review';
    return progress.stage>=4 ? 'learned' : 'waiting';
  },
  counts(words, progress, now = new Date()) {
    const counts={learn:0,review:0,learned:0,waiting:0};
    for(const word of words)counts[this.category(progress.get(word.id),now)]++;
    return counts;
  }
});
