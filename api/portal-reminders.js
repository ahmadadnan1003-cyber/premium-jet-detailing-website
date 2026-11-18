const {timingSafeEqual} = require('node:crypto');
const SUPABASE = 'https://wfaqlfzrcvwgcfyhhymf.supabase.co';
function answer(res,status,body) {
  res.statusCode=status;res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));
}
async function rpc(action,data={}) {
  const response=await fetch(SUPABASE+'/functions/v1/portal-reminder-worker',{
    method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET,'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('Reminder storage unavailable');
  return response.json();
}
async function finish(job,result) {
  // Persist delivery acknowledgement promptly; never log recipient or credentials.
  for(let attempt=0;attempt<3;attempt++) {
    try { const saved=await rpc('finish',{...job,...result});if(saved?.ok)return; } catch(_) {}
  }
  throw Error('Reminder acknowledgement unavailable');
}
module.exports=async function handler(req,res) {
  if(req.method!=='GET')return answer(res,405,{ok:false});
  const secret=process.env.CRON_SECRET;
  const received=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+(secret||''));
  if(!secret||received.length!==expected.length||!timingSafeEqual(received,expected))return answer(res,401,{ok:false});
  if(!process.env.RESEND_API_KEY||!process.env.INQUIRY_FROM_EMAIL)return answer(res,503,{ok:false});
  // Preview deployments never deliver customer mail.
  if(process.env.VERCEL_ENV!=='production')return answer(res,403,{ok:false});
  try {
    if(req.query?.health==='1')return answer(res,200,await rpc('health'));
    const jobs=await rpc('claim');let sent=0,skipped=0,failed=0;
    for(const job of jobs) {
      const item=await rpc('prepare',job);
      if(!item){skipped++;continue;}
      const p=item.payload;
      const date=new Intl.DateTimeFormat('de-DE',{dateStyle:'long',timeZone:'Europe/Berlin'}).format(new Date(p.next_due+'T12:00:00Z'));
      let result;
      try {
        const response=await fetch('https://api.resend.com/emails',{
          method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'pjd-reminder/'+item.id},
          body:JSON.stringify({from:'Premium Jet Detailing <'+process.env.INQUIRY_FROM_EMAIL+'>',to:[item.email],
            subject:'Pflege fällig · '+p.registration,
            text:['Guten Tag,','', 'für Ihr Flugzeug '+p.registration+' ist der nächste Pflegeservice am '+date+' fällig.',
              'Standort: '+p.airport,'','Sie können Ihren Service direkt im Kundenportal anfragen:',
              'https://www.premiumjetdetailing.de/kundenportal','','Erinnerungen ändern oder abbestellen: Kundenportal → Settings → E-Mail-Erinnerungen.',
              'Diese Nachricht erhalten Sie aufgrund Ihrer aktivierten Service-Erinnerungen.','', 'Premium Jet Detailing UG','https://www.premiumjetdetailing.de'].join('\n')
          }),signal:AbortSignal.timeout(12000)
        });
        const receipt=await response.json().catch(()=>({}));
        if(response.ok&&receipt.id){result={state:'sent',provider_id:receipt.id};sent++;}
        else {result={state:'failed',error:'Email provider status '+response.status};failed++;}
      } catch(_) {result={state:'failed',error:'Delivery uncertain; review provider before retrying'};failed++;}
      await finish(job,result);
    }
    await rpc('done');
    return answer(res,200,{ok:true,sent,skipped,failed});
  } catch(_) {console.error('Portal reminder run failed');return answer(res,502,{ok:false});}
};
