const {PGlite}=require(process.env.TOOWEE_PGLITE_MODULE||'@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict'),{randomUUID}=require('crypto');
(async()=>{const db=new PGlite(),alice=randomUUID(),bob=randomUUID(),student=randomUUID();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table toowee_accounts(id uuid primary key,role text,display_name text);`);for(const [id,role,name] of [[alice,'teacher','Alicja'],[bob,'teacher','Robert'],[student,'student','Uczeń']]){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into toowee_accounts values($1,$2,$3)',[id,role,name]);}await db.exec(fs.readFileSync(__dirname+'/../vocabulary_setup.sql','utf8'));await db.exec('alter table vocabulary_folders add column lang text');await db.exec('create table toowee_material_folders(id uuid primary key,owner_id uuid,lang text,name text,parent_id uuid)');await db.exec('create table toowee_student_profiles(id uuid primary key,owner_id uuid,student_id uuid,blocked boolean default false);create table toowee_material_deliveries(owner_id uuid,profile_id uuid,kind text,source_id uuid);');const sql=fs.readFileSync(__dirname+'/../exercise-sets-setup.sql','utf8');await db.exec(sql);await db.exec(sql);const as=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]),rpc=async(a,p={})=>(await db.query('select toowee_exercise_sets($1,$2) r',[a,p])).rows[0].r;

await as(alice);
const mixedId=randomUUID(),legacy=[{id:randomUUID(),type:'question',prompt:'A',answer:'B',wrong:[]},{id:randomUUID(),type:'open',prompt:'Speak',answer:'',wrong:[]}];
await db.query('insert into toowee_exercise_sets(id,owner_id,title,lang,cards) values($1,$2,$3,$4,$5)',[mixedId,alice,'Legacy mixed','English',JSON.stringify(legacy)]);
const migration=fs.readFileSync(__dirname+'/../exercise-question-formats-20261119.sql','utf8');await db.exec(migration);await db.exec(migration);
const old=await rpc('get',{id:mixedId});assert(old.format_review);assert.equal(old.format,null);assert.deepEqual(old.cards,legacy);assert.equal(old.title,'Legacy mixed');
const folder=(await rpc('folder_create',{name:'Keep folder',lang:'English'})).id;
for(const format of ['open','quiz','write']){
 const cards=[{id:randomUUID(),type:format==='write'?'question':format,prompt:'Question',answer:format==='open'?'':'answer',wrong:format==='quiz'?['wrong1','wrong2','wrong3','wrong4','wrong5']:[]}];
 let saved=await rpc('save',{id:randomUUID(),title:'Named '+format,lang:'English',folder_id:folder,format,cards,revision:0});assert.equal(saved.format,format);assert.equal(saved.title,'Named '+format);assert.equal(saved.folder_id,folder);assert.deepEqual(saved.cards,cards);
 const read=await rpc('get',{id:saved.id});assert.deepEqual(read.cards,cards);saved=await rpc('save',{...read,title:'Edited '+format});assert.equal(saved.revision,2);assert.equal(saved.folder_id,folder);assert.equal(saved.format,format);
 await assert.rejects(rpc('save',{...read,title:'Stale revision'}));await as(bob);await assert.rejects(rpc('get',{id:saved.id}));await as(alice);
}
await assert.rejects(rpc('save',{id:randomUUID(),title:'Mixed',lang:'English',format:'quiz',cards:legacy}));
const oldAfter=await rpc('get',{id:mixedId});assert.deepEqual(oldAfter.cards,legacy);
await db.close();console.log('PASS migration twice, preserved mixed legacy data, all formats save/read/edit, arbitrary options, names/folders, revisions and owner access');
})().catch(e=>{console.error(e);process.exit(1)});
