const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/portal-reminders');
const secret='test-only-credential';
function env(){Object.assign(process.env,{CRON_SECRET:secret,RESEND_API_KEY:'test-resend',INQUIRY_FROM_EMAIL:'sender@example.invalid',VERCEL_ENV:'production'});}
async function invoke({authorization='Bearer '+secret,query={}}={}){
  let result;const res={setHeader(){},end(body){result={status:this.statusCode,body:JSON.parse(body)};}};
  await handler({method:'GET',headers:{authorization},query},res);return result;
}
test('rejects unauthenticated calls before touching customer data',async()=>{
  env();global.fetch=async()=>{throw Error('Unexpected fetch');};assert.equal((await invoke({authorization:'Bearer wrong'})).status,401);
});
test('preview deployments cannot send real reminders',async()=>{
  env();process.env.VERCEL_ENV='preview';assert.equal((await invoke()).status,403);
});
test('health check does not claim or deliver messages',async()=>{
  env();const actions=[];global.fetch=async(url,options)=>{actions.push(JSON.parse(options.body).p_action);return {ok:true,json:async()=>({configured:true})};};
  assert.equal((await invoke({query:{health:'1'}})).status,200);assert.deepEqual(actions,['health']);
});
test('rechecks eligibility and skips revoked consent without a provider call',async()=>{
  env();const actions=[];global.fetch=async(url,options)=>{assert.ok(url.endsWith('/functions/v1/portal-reminder-worker'));const b=JSON.parse(options.body);actions.push(b.p_action);return {ok:true,json:async()=>b.p_action==='claim'?[{id:'job',lease_token:'lease'}]:b.p_action==='prepare'?null:{ok:true}};};
  const r=await invoke();assert.deepEqual(r.body,{ok:true,sent:0,skipped:1,failed:0});assert.deepEqual(actions,['claim','prepare','done']);
});
test('sends only to the server-selected recipient, uses an idempotency key, acknowledges receipt',async()=>{
  env();let receipt,mail;
  global.fetch=async(url,options)=>{
    const b=JSON.parse(options.body);
    if(url==='https://api.resend.com/emails'){mail=b;assert.equal(options.headers['Idempotency-Key'],'pjd-reminder/job');return {ok:true,json:async()=>({id:'provider-receipt'})};}
    if(b.p_action==='finish')receipt=b.p_data;
    return {ok:true,json:async()=>b.p_action==='claim'?[{id:'job',lease_token:'lease'}]:b.p_action==='prepare'?{id:'job',email:'recipient@example.invalid',payload:{registration:'QA-TEST',next_due:'2026-11-20',airport:'EDDB'}}:{ok:true}};
  };
  assert.equal((await invoke()).body.sent,1);assert.deepEqual(mail.to,['recipient@example.invalid']);assert.match(mail.text,/Settings/);assert.equal(receipt.provider_id,'provider-receipt');assert.equal(receipt.state,'sent');
});
test('uncertain delivery is held for review instead of blindly resending',async()=>{
  env();let receipt;
  global.fetch=async(url,options)=>{
    if(url==='https://api.resend.com/emails')throw Error('Timeout');
    const b=JSON.parse(options.body);if(b.p_action==='finish')receipt=b.p_data;
    return {ok:true,json:async()=>b.p_action==='claim'?[{id:'job',lease_token:'lease'}]:b.p_action==='prepare'?{id:'job',email:'recipient@example.invalid',payload:{registration:'QA-TEST',next_due:'2026-11-20',airport:'EDDB'}}:{ok:true}};
  };
  assert.equal((await invoke()).body.failed,1);assert.equal(receipt.state,'failed');
});
