const assert=require('node:assert/strict');
(async()=>{const {downloadPixabay}=await import('../supabase/functions/toowee-images/core.mjs');let calls=0;const bytes=await downloadPixabay('https://cdn.pixabay.com/a.jpg',{pause:async()=>{},fetcher:async()=>++calls===1?new Response('',{status:503}):new Response(new Uint8Array([255,216,255]))});assert.equal(calls,2);assert.equal(bytes.length,3);
calls=0;await assert.rejects(downloadPixabay('https://pixabay.com/get/expired.jpg',{fetcher:async()=>{calls++;return new Response('',{status:403})}}),e=>e.code==='DOWNLOAD_EXPIRED');assert.equal(calls,1);
await assert.rejects(downloadPixabay('https://cdn.pixabay.com/a.jpg',{fetcher:async()=>new Response('',{status:302,headers:{Location:'https://example.com/private'}})}),/Niedozwolone/);
calls=0;await assert.rejects(downloadPixabay('https://cdn.pixabay.com/a.jpg',{fetcher:async()=>{calls++;return new Response('',{status:429})}}),e=>e.code==='PROVIDER_LIMIT');assert.equal(calls,1);
console.log('PASS download transient retry, expired-link classification, redirect host validation, no rate-limit retry');})().catch(e=>{console.error(e);process.exit(1)});
