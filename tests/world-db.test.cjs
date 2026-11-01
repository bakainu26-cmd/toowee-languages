// Run with TOOWEE_PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
const {PGlite}=require(process.env.TOOWEE_PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
(async()=>{
 const db=new PGlite(),owner=randomUUID(),other=randomUUID();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table public.vocabulary_words(id uuid primary key,owner_id uuid,lang text);create table public.vocabulary_progress(owner_id uuid,word_id uuid,stage integer,last_reviewed_at timestamptz);`);
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 const migration=fs.readFileSync(path.join(__dirname,'../world_setup.sql'),'utf8');await db.exec(migration);await db.exec(migration);
 const as=async user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await as(owner);
 const rpc=async(action,data={},lang='Japanese')=>(await db.query('select public.toowee_world($1,$2,$3::jsonb) as value',[action,lang,JSON.stringify(data)])).rows[0].value;
 let result=await rpc('load');assert.equal(result.profile.coins,0);
 const ids=Array.from({length:10},()=>randomUUID());for(const id of ids){await db.query('insert into vocabulary_words values($1,$2,$3)',[id,owner,'Japanese']);await db.query('insert into vocabulary_progress values($1,$2,1,now())',[owner,id]);}
 const event={event_id:randomUUID(),kind:'learn',ids,seconds:300,answers:10};result=await rpc('activity',event);assert.equal(result.earned,50);assert.equal(result.profile.coins,50);assert.equal(result.daily.learned_ids.length,10);
 result=await rpc('activity',event);assert.equal(result.earned,0);assert.equal(result.profile.coins,50);
 result=await rpc('buy',{item:'shirt_mint'});assert.equal(result.profile.coins,25);assert.equal(result.profile.outfit,'shirt_mint');result=await rpc('buy',{item:'shirt_mint'});assert.equal(result.profile.coins,25);assert.equal(result.profile.owned.filter(i=>i==='shirt_mint').length,1);
 await assert.rejects(rpc('buy',{item:'headphones'}));await assert.rejects(rpc('equip',{item:'headphones'}));
 result=await rpc('activity',{event_id:randomUUID(),kind:'pairs',ids:ids.slice(0,6)});assert.equal(result.earned,20);result=await rpc('activity',{event_id:randomUUID(),kind:'pairs',ids});assert.equal(result.earned,0);
 result=await rpc('activity',{event_id:randomUUID(),kind:'review',ids:ids.slice(0,5),seconds:3000,answers:1});assert.equal(result.earned,25);assert.equal(result.daily.seconds,330);
 const before=result.profile.coins;result=await rpc('activity',{event_id:randomUUID(),kind:'practice',seconds:360000,answers:10000});assert.equal(result.daily.seconds,3600);assert.equal(result.profile.coins,before+110);
 result=await rpc('activity',{event_id:randomUUID(),kind:'practice',seconds:3600,answers:200});assert.equal(result.earned,0);
 result=await rpc('load',{},'Spanish');assert.equal(result.daily.learned_ids.length,0);assert.equal(result.daily.seconds,0);assert(result.profile.owned.includes('shirt_mint'));
 result=await rpc('activity',{event_id:randomUUID(),kind:'learn',ids},'Spanish');assert.equal(result.daily.learned_ids.length,0);
 await as(other);result=await rpc('load');assert.equal(result.profile.coins,0);assert.deepEqual(result.profile.owned,['shirt_lilac']);result=await rpc('activity',{event_id:randomUUID(),kind:'learn',ids});assert.equal(result.earned,0);assert.equal(result.daily.learned_ids.length,0);
 await as(owner);
 const sessionRpc=async(payload=null,revision=null)=>(await db.query('select public.toowee_world_study($1,$2,$3::jsonb,$4) as value',['Japanese','learn',payload===null?null:JSON.stringify(payload),revision])).rows[0].value;
 let session=await sessionRpc();assert.equal(session.revision,0);session=await sessionRpc({phase:'learn',queue:['first']},0);assert.equal(session.revision,1);assert.equal(session.state.queue[0],'first');await assert.rejects(sessionRpc({phase:'learn',queue:[]},0));session=await sessionRpc();assert.equal(session.state.queue.length,1);
 await as(other);session=await sessionRpc();assert.equal(session.state,null);await db.exec('set role authenticated');await assert.rejects(db.exec('update world_study_sessions set revision=0'));await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(db.exec('update world_profiles set coins=999'));await db.exec('reset role');await as('');await assert.rejects(rpc('load'));
 console.log('PASS real PostgreSQL: idempotent migration, rewards, event deduplication, purchases, limits, language/account isolation, RLS and unauthenticated rejection');await db.close();
})().catch(error=>{console.error(error);process.exitCode=1});
