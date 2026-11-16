// Keeps the app available with no internet. Online: always tries the network first.
// Offline or slow connection: serves the last saved copy. Data calls (/api/) are never cached here.
const C='cdlms-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(['/','/logo.png'].map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.pathname.startsWith('/api/'))return;
 e.respondWith((async()=>{
  const c=await caches.open(C);
  const net=fetch(r).then(x=>{if(x.ok||x.type==='opaque')c.put(r,x.clone());return x});
  const hit=await c.match(r);
  if(!hit)return net;
  net.catch(()=>{});
  return Promise.race([net,new Promise(res=>setTimeout(()=>res(hit),2500))]).catch(()=>hit);
 })());
});
