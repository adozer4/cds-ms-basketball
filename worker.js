// Covenant Day Lions Middle School Basketball: tiny server. One shared passcode (SITE_PASS) protects everything.
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','cache-control':'no-store'}});
const eq=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const UP="INSERT INTO meta(k,json,u) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET json=excluded.json,u=excluded.u";
export default{async fetch(req,env){
 const url=new URL(req.url),p=url.pathname;
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 const db=env.DB,pass=req.headers.get('x-pass')||'';
 if(!env.SITE_PASS||!eq(pass,env.SITE_PASS))return J({error:'auth'},401);
 if(p==='/api/auth')return J({ok:1});
 if(req.method==='GET'&&p==='/api/data'){
  const since=+url.searchParams.get('since')||0;
  const g=await db.prepare('SELECT json FROM games WHERE u>? ORDER BY id').bind(since).all();
  const c=await db.prepare("SELECT json,u FROM meta WHERE k='cfg'").first();
  const dl=await db.prepare("SELECT k FROM meta WHERE k LIKE 'del:%'").all();
  return J({games:g.results.map(x=>JSON.parse(x.json)),cfg:c&&c.u>since?JSON.parse(c.json):null,cu:c?c.u:0,deleted:dl.results.map(x=>x.k.slice(4))});
 }
 const m=p.match(/^\/api\/game\/(\d+)$/);
 if(m&&req.method==='PUT'){
  const t=await req.text();if(t.length>1500000)return J({error:'too big'},413);
  let g;try{g=JSON.parse(t)}catch(e){return J({error:'bad json'},400)}
  if(String(g.id)!==m[1])return J({error:'id mismatch'},400);
  // A deleted game stays deleted, even if an out-of-date device tries to save it again.
  if(await db.prepare('SELECT 1 FROM meta WHERE k=?').bind('del:'+m[1]).first())return J({ok:1,deleted:1});
  await db.prepare('INSERT INTO games(id,json,u) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,u=excluded.u').bind(m[1],t,g.u||Date.now()).run();
  return J({ok:1});
 }
 if(m&&req.method==='DELETE'){
  let b={};try{b=await req.json()}catch(e){}
  const row=await db.prepare('SELECT json FROM games WHERE id=?').bind(m[1]).first(),gj=b&&b.game?JSON.stringify(b.game):(row?row.json:null);
  if(gj)await db.prepare(UP).bind('trash:'+m[1],gj,Date.now()).run();
  await db.prepare("DELETE FROM meta WHERE k LIKE 'trash:%' AND u<?").bind(Date.now()-30*864e5).run();
  await db.prepare('DELETE FROM games WHERE id=?').bind(m[1]).run();
  await db.prepare(UP).bind('del:'+m[1],'1',Date.now()).run();
  return J({ok:1});
 }
 if(p==='/api/trash'&&req.method==='GET'){
  await db.prepare("DELETE FROM meta WHERE k LIKE 'trash:%' AND u<?").bind(Date.now()-30*864e5).run();
  const t=await db.prepare("SELECT k,json,u FROM meta WHERE k LIKE 'trash:%' ORDER BY u DESC").all();
  return J({trash:t.results.map(x=>({id:x.k.slice(6),at:x.u,game:JSON.parse(x.json)}))});
 }
 const rm=p.match(/^\/api\/(restore|purge)\/(\d+)$/);
 if(rm&&req.method==='POST'){
  const id=rm[2],row=await db.prepare('SELECT json FROM meta WHERE k=?').bind('trash:'+id).first();
  if(!row)return J({error:'not found'},404);
  if(rm[1]==='restore'){
   const g=JSON.parse(row.json);g.u=Date.now();
   await db.prepare('INSERT INTO games(id,json,u) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,u=excluded.u').bind(id,JSON.stringify(g),g.u).run();
   await db.prepare('DELETE FROM meta WHERE k=?').bind('del:'+id).run();
   await db.prepare('DELETE FROM meta WHERE k=?').bind('trash:'+id).run();
   return J({game:g});
  }
  await db.prepare('DELETE FROM meta WHERE k=?').bind('trash:'+id).run();
  return J({ok:1});
 }
 if(p==='/api/cfg'&&req.method==='PUT'){
  const b=await req.json();if(!b||typeof b.cfg!=='object')return J({error:'bad cfg'},400);
  await db.prepare(UP).bind('cfg',JSON.stringify(b.cfg),b.cu||Date.now()).run();
  return J({ok:1});
 }
 return J({error:'not found'},404);
}};
