export const MAX_BYTES=5*1024*1024;
export class MediaError extends Error{constructor(message,status=400,code='MEDIA_ERROR'){super(message);this.status=status;this.code=code;}}
export function searchInput(data){const q=String(data.q||'').normalize('NFKC').trim().replace(/\s+/g,' ');if(!q||q.length>100)throw new MediaError('Wpisz hasło wyszukiwania (do 100 znaków).');const lang=['pl','en','ja','es'].includes(data.lang)?data.lang:'en';const type=['all','photo','illustration'].includes(data.type)?data.type:'all';const page=Number(data.page||1);if(!Number.isInteger(page)||page<1||page>25)throw new MediaError('Nieprawidłowa strona wyników.');return {q,lang,type,page,key:JSON.stringify([q.toLocaleLowerCase(lang),lang,type,page])};}
export function pixabayUrl(value){let u;try{u=new URL(value);}catch{throw new MediaError('Nieprawidłowy adres obrazu.');}if(u.protocol!=='https:'||u.username||u.password||u.port||!['pixabay.com','cdn.pixabay.com'].includes(u.hostname))throw new MediaError('Niedozwolone źródło obrazu.');return u.href;}
export function imageMime(bytes){if(bytes.length>MAX_BYTES||!bytes.length)throw new MediaError('Obraz musi mieć maksymalnie 5 MB.');if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x))return 'image/png';if(bytes.length>=16&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';throw new MediaError('Obsługiwane są obrazy JPG, PNG i WebP.');}
export async function boundedBytes(response){const reader=response.body?.getReader();if(!reader)throw new MediaError('Brak danych obrazu.');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new MediaError('Obraz przekracza 5 MB.');chunks.push(value);}}finally{await reader.cancel();}const bytes=new Uint8Array(size);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length;}return bytes;}
export function cleanHits(payload){return {total:Math.min(500,Number(payload.totalHits)||0),hits:(payload.hits||[]).map(h=>{try{return {id:String(h.id),preview:pixabayUrl(h.previewURL),download:pixabayUrl(h.webformatURL),sourceUrl:pixabayUrl(h.pageURL),author:String(h.user||'').slice(0,200),tags:String(h.tags||'').slice(0,500),type:h.type};}catch{return null;}}).filter(Boolean)};}
export function publicHits(payload){return {...payload,hits:payload.hits.map(({download,...hit})=>hit)};}
export function providerFailure(status,body=''){
 if(status===429)return new MediaError('Pixabay ogranicza teraz liczbę zapytań. Spróbuj ponownie za minutę.',429,'PROVIDER_LIMIT');
 if(status===400&&/(?:invalid|missing|not valid)[\s\S]{0,60}(?:api.?key|\bkey\b)|(?:api.?key|\bkey\b)[\s\S]{0,60}(?:invalid|missing|not valid)/i.test(body))return new MediaError('Pixabay odrzucił zapisany klucz API. W Supabase → Edge Functions → Secrets zapisz PIXABAY_API_KEY jako sam klucz, bez opisu ani linku.',503,'PIXABAY_KEY_REJECTED');
 if(status===401||status===403)return new MediaError('Pixabay odmówił dostępu (kod '+status+'). Sprawdź aktywność klucza API i dostęp aplikacji.',503,'PIXABAY_ACCESS_DENIED');
 if(status===400)return new MediaError('Pixabay odrzucił zapytanie (kod 400). Zmień hasło wyszukiwania; jeśli błąd się powtarza, wymaga sprawdzenia konfiguracja API.',503,'PIXABAY_BAD_REQUEST');
 return new MediaError('Nie udało się połączyć z Pixabay (kod '+status+'). Spróbuj później.',503,'PROVIDER_ERROR');
}

// Download only approved Pixabay hosts, rechecking every redirect. Retry transient
// transport/server failures once; expired/removed URLs require fresh metadata.
export async function downloadPixabay(value,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const initial=pixabayUrl(value);
 for(let attempt=0;attempt<2;attempt++){
  try{let url=initial;
   for(let redirects=0;redirects<4;redirects++){
    const response=await fetcher(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=pixabayUrl(new URL(response.headers.get('Location')||'',url).href);continue;}
    if(response.ok)return await boundedBytes(response);
    const status=response.status;await response.body?.cancel();
    if([401,403,404,410].includes(status))throw new MediaError('Adres grafiki wymaga odświeżenia.',503,'DOWNLOAD_EXPIRED');
    if(status===429)throw new MediaError('Pixabay ogranicza pobieranie. Spróbuj ponownie za minutę.',429,'PROVIDER_LIMIT');
    throw new MediaError('Nie udało się pobrać obrazu z Pixabay. Spróbuj ponownie lub wybierz inny obraz.',503,status>=500?'DOWNLOAD_TRANSIENT':'DOWNLOAD_UNAVAILABLE');
   }
   throw new MediaError('Nie udało się pobrać obrazu: zbyt wiele przekierowań.',503,'DOWNLOAD_UNAVAILABLE');
  }catch(e){if(e instanceof MediaError&&e.code!=='DOWNLOAD_TRANSIENT')throw e;if(attempt)throw new MediaError('Nie udało się pobrać obrazu z Pixabay. Spróbuj ponownie lub wybierz inny obraz.',503,'DOWNLOAD_TRANSIENT');await pause(500);}
 }
}
