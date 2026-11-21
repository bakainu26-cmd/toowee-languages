import {request} from 'node:https';
import {Buffer} from 'node:buffer';
import {lookup} from 'node:dns/promises';
const resolve4=async host=>(await lookup(host,{all:true,family:4})).map(item=>item.address);
import {MediaError,MAX_BYTES,imageMime} from './core.mjs';
export function remoteImageUrl(value){let u;try{if(String(value).length>4096)throw Error();u=new URL(value);}catch{throw new MediaError('Wklej pełny adres HTTPS pliku graficznego.');}if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.length>253||!u.hostname.includes('.')||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(u.hostname)||/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname))throw new MediaError('Wklej publiczny adres HTTPS obrazu.');u.hash='';return u;}
export function publicIPv4(ip){const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;const [a,b]=p;return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
export async function fetchRemoteImage(value,{resolve=resolve4,send=request}={}){
 let url=remoteImageUrl(value);const source=url.href;
 for(let redirects=0;redirects<5;redirects++){const ips=await resolve(url.hostname);if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw new MediaError('Ten adres nie jest publicznym źródłem obrazu.');
 const result=await new Promise((ok,fail)=>{const req=send(url,{method:'GET',agent:false,servername:url.hostname,headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'TooWee-Image-Importer/1.0'},lookup:(_host,opts,cb)=>opts?.all?cb(null,[{address:ips[0],family:4}]):cb(null,ips[0],4)},res=>{
 if([301,302,303,307,308].includes(res.statusCode)){res.resume();ok({redirect:res.headers.location});return;}
 if(res.statusCode!==200){res.resume();fail(new MediaError('Strona odrzuciła pobranie obrazu. Wybierz inny link lub prześlij plik.',422));return;}
 if(!/^image\/(jpeg|png|webp)(;|$)/i.test(res.headers['content-type']||'')){res.resume();fail(new MediaError('Link prowadzi do strony, a nie do pliku JPG, PNG lub WebP.',422));return;}
 if(Number(res.headers['content-length'])>MAX_BYTES){res.destroy();fail(new MediaError('Obraz przekracza 5 MB.'));return;}
 const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){res.destroy();fail(new MediaError('Obraz przekracza 5 MB.'));}else chunks.push(chunk);});res.on('end',()=>{const bytes=new Uint8Array(Buffer.concat(chunks));try{imageMime(bytes);ok({bytes});}catch(e){fail(e);}});res.on('error',fail);
 });const timer=setTimeout(()=>req.destroy(new Error('Przekroczono czas pobierania obrazu.')),15000);req.on('close',()=>clearTimeout(timer));req.on('error',fail);req.end();});
 if(result.bytes)return {bytes:result.bytes,source};if(!result.redirect)throw new MediaError('Strona nie podała adresu obrazu.');url=remoteImageUrl(new URL(result.redirect,url).href);
 }throw new MediaError('Link ma zbyt wiele przekierowań.');
}
