// This gateway uses Supabase's existing server role; anonymous database roles have no access.
const expectedHash = "515388b3527619bdb400e3da5b7536ba7cae4ca70583f19b0f547b565abe8044";
const answer=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return answer(405,{ok:false});
  const header=req.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9_-]{64}$/.test(header))return answer(401,{ok:false});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7))))).map(b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==expectedHash)return answer(401,{ok:false});
  try {
    if(Number(req.headers.get("content-length")||0)>4096)return answer(413,{ok:false});
    const raw=await req.text();if(raw.length>4096)return answer(413,{ok:false});
    const body=JSON.parse(raw);
    if(!["health","claim","prepare","finish","done"].includes(body.p_action))return answer(400,{ok:false});
    const response=await fetch(Deno.env.get("SUPABASE_URL")+"/rest/v1/rpc/pjd_portal_mail_worker",{
      method:"POST",headers:{apikey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,Authorization:"Bearer "+Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),"Content-Type":"application/json"},
      body:JSON.stringify({p_action:body.p_action,p_data:body.p_data||{}}),signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)return answer(502,{ok:false});
    return answer(200,await response.json());
  }catch{return answer(502,{ok:false});}
});
