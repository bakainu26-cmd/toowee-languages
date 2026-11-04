const {PGlite}=require(process.env.TOOWEE_PGLITE_MODULE||'@electric-sql/pglite'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
(async()=>{const db=new PGlite(),host=randomUUID(),student=randomUUID(),outsider=randomUUID();const script=n=>fs.readFileSync(path.join(__dirname,'../'+n),'utf8');
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
for(const id of [host,student,outsider])await db.query('insert into auth.users values($1,$2)',[id,{display_name:'Test',role:id===host?'teacher':'student'}]);
await db.exec(script('vocabulary_setup.sql'));await db.exec('alter table vocabulary_folders add column lang text');await db.exec(script('spaced_repetition_setup.sql'));await db.exec(script('accounts_setup.sql'));await db.exec(script('collections_setup.sql'));await db.exec(script('collections_live_setup.sql'));await db.exec(script('collections_live_setup.sql'));
const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);const rpc=async(a,p={})=>(await db.query('select toowee_collections($1,$2) as v',[a,p])).rows[0].v;
for(const id of [host,student,outsider]){await as(id);await db.query("select toowee_portal('load','{}')");}
const ids=[];for(let i=0;i<5;i++){const id=randomUUID();ids.push(id);await db.query("insert into vocabulary_words(id,owner_id,lang,word,translation) values($1,$2,'Japanese',$3,$4)",[id,host,'単語'+i,'znaczenie '+i]);}const foreign=randomUUID();await db.query("insert into vocabulary_words(id,owner_id,lang,word,translation) values($1,$2,'Japanese','秘密','PRYWATNE')",[foreign,outsider]);

await as(host);let r=await rpc('create',{protocol:4,request_id:randomUUID(),ids,lang:'Japanese',questions_per_turn:1,rounds:1,seconds:0,placement_seconds:0}),code=r.code;
await as(student);r=await rpc('join',{code,nickname:'A'});const first=r.me;
await as(outsider);r=await rpc('join',{code,nickname:'B'});const second=r.me;
await as(host);r=await rpc('start',{code});assert.equal(r.phase,'questions');assert.equal(r.protocol,4);
for(const id of [student,outsider]){await as(id);r=await rpc('load',{code});assert(r.question);assert(!('solution' in r.question));const raw=(await db.query('select question from toowee_collection_quiz where player_id=$1',[r.me])).rows[0].question;r=await rpc('answer',{code,cycle:r.my_quiz.cycle,question_id:r.question.id,choice:r.question.options.indexOf(raw.solution)});}
assert.equal(r.phase,'draw');
await as(student);r=await rpc('load',{code});await assert.rejects(rpc('end_turn',{code,revision:r.revision}),/Najpierw/);
const basket=r.state.baskets.findIndex(b=>b.some(n=>n>0)),toy=r.state.baskets[basket].findIndex(n=>n>0);assert(r.state.baskets[basket][toy]>=2);r=await rpc('draw',{code,revision:r.revision,basket,toy});assert.equal(r.phase,'place');r=await rpc('end_turn',{code,revision:r.revision});
await as(outsider);r=await rpc('load',{code});let b=r.state.baskets.findIndex(b=>b.some(n=>n>0)),t=r.state.baskets[b].findIndex(n=>n>0);r=await rpc('draw',{code,revision:r.revision,basket:b,toy:t});r=await rpc('end_turn',{code,revision:r.revision});assert.equal(r.status,'finished');assert.equal(r.results.ranking.length,2);assert.equal(r.results.answers.length,1);
await as(host);r=await rpc('load',{code});assert.equal(r.results.answers.length,2);r=await rpc('add_round',{code});assert.equal(r.status,'playing');assert.equal(r.state.cycle,2);assert.equal(r.phase,'questions');
await db.query("update toowee_collection_rooms set game_deadline=now()-interval '1 second' where code=$1",[code]);r=await rpc('load',{code});assert.equal(r.phase,'time_decision');r=await rpc('finish_cycle',{code});assert.equal(r.phase,'questions');assert.equal(r.state.finish_after_cycle,true);
r=await rpc('finish',{code});assert.equal(r.status,'finished');r=await rpc('add_time',{code,minutes:2});assert.equal(r.status,'playing');assert.equal(r.end_mode,'timer');

// Wrong answers require a deliberate review, and stale answers cannot be replayed.
await as(student);r=await rpc('load',{code});let oldQuestion=r.question;let raw=(await db.query('select question from toowee_collection_quiz where player_id=$1 and cycle=2',[first])).rows[0].question;
r=await rpc('answer',{code,cycle:2,question_id:oldQuestion.id,choice:oldQuestion.options.findIndex(x=>x!==raw.solution)});assert(r.my_quiz.review);assert.equal(r.question,null);assert.equal(r.feedback.solution,raw.solution);
await assert.rejects(rpc('continue',{code,question_id:oldQuestion.id}),/3 sekundy/);
await db.query("update toowee_collection_quiz set review_until=now()-interval '1 second' where player_id=$1",[first]);r=await rpc('continue',{code,question_id:oldQuestion.id});assert(r.my_quiz.done);
await as(host);r=await rpc('skip',{code,revision:r.revision});assert.equal(r.phase,'draw');
// A carried stash is limited to five; drawing fills available space only.
await db.query("update toowee_collection_rooms set state=jsonb_set(jsonb_set(state,'{players,0,stash}','[4,0,0,0,0]'),'{baskets,0}','[0,0,0,4,0]') where code=$1",[code]);
await db.query('update toowee_collection_quiz set correct_count=1 where player_id=$1 and cycle=2',[first]);await as(student);r=await rpc('load',{code});r=await rpc('draw',{code,revision:r.revision,basket:0,toy:3});assert.deepEqual(r.state.players[0].stash,[4,0,0,1,0]);assert.equal(r.state.baskets[0][3],3);await assert.rejects(rpc('draw',{code,revision:r.revision,basket:0,toy:3}),/już dobierać/);
// Keep all five between rounds, without an overflow penalty.
await as(host);r=await rpc('finish',{code});assert(r.results.answers.some(a=>!a.correct));await as(student);let details=await rpc('details',{code});assert(details.answers.every(a=>a.player_id===first));await as(host);r=await rpc('add_round',{code});assert.deepEqual(r.state.players[0].stash,[4,0,0,1,0]);r=await rpc('load',{code});
// Put a carried toy before the draw: the draw opportunity is closed.
await as(student);r=await rpc('put',{code,revision:r.revision,cell:24,toy:0});assert.equal(r.phase,'place');await assert.rejects(rpc('draw',{code,revision:r.revision,basket:0,toy:3}),/już dobierać/);
// Demand balancing restores every needed kind, in useful stacks.
let fixture=r.state;fixture.baskets=Array.from({length:5},()=>[2,2,2,0,2]);fixture.players.forEach(p=>p.cards.forEach(c=>{c.need=[0,0,0,4,0];c.sequence=[3,3,3,3];}));let balanced=(await db.query('select toowee_collection_balance($1) s',[fixture])).rows[0].s;assert(balanced.baskets.reduce((n,b)=>n+b[3],0)>=2);
// Unauthorized users cannot inspect quiz solutions or operate teacher controls.
await as('');await db.exec('set role anon');await assert.rejects(db.exec('select * from toowee_collection_quiz'));await assert.rejects(db.exec("select toowee_collections_legacy('history','{}')"));await db.exec('reset role');await as(student);await assert.rejects(rpc('add_time',{code}),/prowadzący/);
// Configuration may be re-run in full without replacing live room data.
await db.exec(script('collections_setup.sql'));await db.exec(script('collections_live_setup.sql'));r=await rpc('load',{code});assert.equal(r.protocol,4);assert.equal(r.state.players[0].stash.reduce((a,b)=>a+b,0),4);

// If time expires after one player moved, finishing the cycle gives the other player a turn.
await as(host);let timed=await rpc('create',{protocol:4,request_id:randomUUID(),ids,lang:'Japanese',end_mode:'timer',time_limit:60,questions_per_turn:1,seconds:0,placement_seconds:0});const tc=timed.code;
await as(student);await rpc('join',{code:tc,nickname:'A'});await as(outsider);await rpc('join',{code:tc,nickname:'B'});await as(host);timed=await rpc('start',{code:tc});timed=await rpc('skip',{code:tc});assert.equal(timed.phase,'draw');await as(student);timed=await rpc('end_turn',{code:tc,revision:timed.revision});assert.equal(timed.turn_no,2);
await db.query("update toowee_collection_rooms set game_deadline=now()-interval '1 second' where code=$1",[tc]);await as(host);timed=await rpc('load',{code:tc});assert.equal(timed.phase,'time_decision');timed=await rpc('finish_cycle',{code:tc});assert.equal(timed.turn_no,2);assert.equal(timed.phase,'draw');await as(outsider);timed=await rpc('end_turn',{code:tc,revision:timed.revision});assert.equal(timed.status,'finished');assert.equal(timed.state.cycle,1);
console.log('PASS live-v4 simultaneous questions, turn choice, endings, statistics and repeatable migration');await db.close();})().catch(e=>{console.error(e);process.exitCode=1});
