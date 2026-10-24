'use strict';
// A transparent Leitner-style schedule. All dates are stored in UTC.
window.TooweeSRS = Object.freeze({
  next(previous, knows, now = new Date()) {
    const intervals = [0,1,3,7,14,30,60];
    const stage = knows ? Math.min(6,(previous?.stage || 0)+1) : 0;
    const delay = knows ? intervals[stage] * 86400000 : 600000;
    return {
      stage, reviews:(previous?.reviews || 0)+1,
      lapses:(previous?.lapses || 0)+(knows ? 0 : 1),
      due_at:new Date(now.getTime()+delay).toISOString(),
      last_reviewed_at:now.toISOString()
    };
  },
  isDue(progress, now = new Date()) { return !progress || new Date(progress.due_at).getTime() <= now.getTime(); }
});
