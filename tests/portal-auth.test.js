const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
async function bootstrap(path,{admin=false,confirmed=true}={}) {
  const nodes=new Map(),scripts=[],calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:id==='portal-shell',textContent:'',value:'',disabled:false,classList:{toggle(){},remove(){}},addEventListener(){},setAttribute(){},remove(){}});return nodes.get(id);};
  node('auth-form').elements={email:{},password:{}};
  node('portal-shell');
  const session={access_token:'test-token',refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
  const context={URLSearchParams,AbortSignal,Event,console,setTimeout,location:{pathname:path,hash:'',replace(){}},history:{replaceState(){}},sessionStorage:{getItem:()=>JSON.stringify(session),setItem(){},removeItem(){}},window:{dispatchEvent(){}},document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>({remove(){}}),body:{classList:{remove(){}},append(el){scripts.push(el.src);if(el.src.includes('portal-ui-v6')){context.window.PJDPortal={};context.window.PJDModels={};}el.onload();}}},fetch:async(url)=>{
    calls.push(url);let data;
    if(url.endsWith('/auth/v1/user'))data={id:'test-owner',email:'owner@example.invalid',email_confirmed_at:confirmed?'2026-11-18':null};
    else if(url.includes('pjd_portal_access'))data={admin};
    else if(url.includes('pjd_profiles'))data=[{user_id:'test-owner',full_name:'Test Owner'}];
    else data=[];
    return {ok:true,json:async()=>data};
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/portal-auth-v6.js'),'utf8'),context);
  for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
  return {nodes,scripts,calls,account:context.window.PJDAccount};
}
test('customer bootstrap verifies identity and scopes all record reads to the owner',async()=>{
  const r=await bootstrap('/kundenportal');assert.equal(r.nodes.get('portal-shell').hidden,false);assert.equal(r.nodes.get('admin-portal-link').hidden,true);
  for(const call of r.calls.filter(u=>/pjd_aircraft_care|pjd_requests|pjd_services/.test(u)))assert.match(call,/owner_id=eq.test-owner/);
  assert.ok(r.scripts.some(src=>src.includes('portal-care.js')));
});
test('ordinary customer cannot bootstrap the admin UI',async()=>{
  const r=await bootstrap('/adminportal');assert.equal(r.nodes.get('portal-shell').hidden,true);assert.equal(r.scripts.length,0);assert.match(r.nodes.get('auth-message').textContent,/Administrator/);
});
test('verified administrator gets the separate operations UI without the 3D bundle',async()=>{
  const r=await bootstrap('/adminportal',{admin:true});assert.equal(r.nodes.get('portal-shell').hidden,false);assert.deepEqual(r.scripts,['/assets/portal-admin.js?v=20261118']);
});
test('unconfirmed email cannot load either portal',async()=>{
  const r=await bootstrap('/kundenportal',{confirmed:false});assert.equal(r.nodes.get('portal-shell').hidden,true);assert.equal(r.scripts.length,0);
});
