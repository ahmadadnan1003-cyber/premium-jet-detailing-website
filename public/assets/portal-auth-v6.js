/* Public project key. Customer records are protected by Supabase RLS. */
(() => {
  'use strict';
  const API = 'https://wfaqlfzrcvwgcfyhhymf.supabase.co';
  const KEY = 'sb_publishable_z9Uw29azzX3s68kqEOLRSQ_ziaUH3Pa';
  const RETURN_URL = 'https://www.premiumjetdetailing.de/kundenportal';
  const SESSION_KEY = 'pjd_customer_session';
  const $ = id => document.getElementById(id);
  const adminMode = /^\/adminportal(?:\.html)?$/.test(location.pathname);
  let session = null, mode = 'login', refreshing = null, currentUser = null;
  const form = $('auth-form');
  function notice(message, error = false) {
    $('auth-message').textContent = message;
    $('auth-message').classList.toggle('is-error', error);
  }
  async function call(path, method = 'GET', body, bearer, representation = false) {
    let response;
    try {
      response = await fetch(API + path, {
        method, cache: 'no-store',
        headers: {apikey:KEY, ...(bearer ? {Authorization:'Bearer ' + bearer} : {}),
          ...(body ? {'Content-Type':'application/json'} : {}), ...(representation ? {Prefer:'return=representation'} : {})},
        ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000)
      });
    } catch (_) { throw new Error('Die Verbindung zum Kundenportal ist gerade nicht möglich. Bitte versuchen Sie es erneut.'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = response.status === 429 ? 'Zu viele Versuche. Bitte warten Sie einen Moment.' :
        response.status >= 500 ? 'Das Kundenportal ist vorübergehend nicht erreichbar. Bitte versuchen Sie es später erneut.' :
        data?.msg || data?.error_description || data?.message || 'Die Anfrage konnte nicht verarbeitet werden.';
      const error=new Error(message);error.status=response.status;throw error;
    }
    return data;
  }
  function setSession(value) {
    session = value;
    try { if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); else sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  }
  async function token() {
    if (!session?.access_token) throw new Error('Bitte melden Sie sich erneut an.');
    if (!session.expires_at || session.expires_at * 1000 < Date.now() + 60000) {
      if (!refreshing) refreshing = call('/auth/v1/token?grant_type=refresh_token','POST',{refresh_token:session.refresh_token})
        .then(data => { setSession({...data, expires_at:Math.floor(Date.now()/1000)+data.expires_in}); })
        .catch(error => { setSession(null); location.replace(adminMode ? '/adminportal' : '/kundenportal'); throw error; })
        .finally(() => { refreshing = null; });
      await refreshing;
    }
    return session.access_token;
  }
  async function records(table, columns) {
    return call('/rest/v1/'+table+'?select='+encodeURIComponent(columns)+'&owner_id=eq.'+encodeURIComponent(currentUser.id)+'&order=created_at.desc','GET',null,await token());
  }
  async function reloadData() {
    const [planes, requests, services] = await Promise.all([
      records('pjd_aircraft_care','id,model_id,registration,airport,last_cleaned,next_due,archived,notes,interval_days,created_at,condition_percent,components'),
      records('pjd_requests','id,aircraft_id,services,airport,requested_date,requested_time,status,notes,created_at,version,scheduled_at,updated_at'),
      records('pjd_services','id,request_id,aircraft_id,completed_on,next_due,services,note,created_at')
    ]);
    return {planes:planes.filter(p => !p.archived),requests,services};
  }
  async function insert(table, row) {
    const result = await call('/rest/v1/'+table,'POST',{...row,owner_id:currentUser.id},await token(),true);
    if (!Array.isArray(result) || !result.length) throw new Error('Die Daten konnten nicht gespeichert werden. Bitte erneut versuchen.');
    return result[0];
  }
  function setMode(next) {
    mode = next;
    document.querySelectorAll('[data-tab]').forEach(b => {b.classList.toggle('is-active',b.dataset.tab===mode);b.setAttribute('aria-selected',String(b.dataset.tab===mode));});
    $('name-field').hidden = mode !== 'signup';
    $('email-field').hidden = mode === 'update';
    form.elements.email.required = mode !== 'update';
    $('password-field').hidden = mode === 'reset';
    form.elements.password.required = mode !== 'reset';
    form.elements.password.autocomplete = ['signup','update'].includes(mode) ? 'new-password' : 'current-password';
    $('auth-submit').textContent = {login:'Anmelden',signup:'Konto erstellen',reset:'Link senden',update:'Passwort speichern'}[mode];
    notice('');
  }
  function script(src) {
    return new Promise((resolve,reject) => {
      const el = document.createElement('script');el.src=src;el.onload=resolve;
      el.onerror=()=>{el.remove();reject(new Error('Das Portal konnte nicht geladen werden. Bitte laden Sie die Seite erneut.'));};
      document.body.append(el);
    });
  }
  async function rpc(name,body={}) { return call('/rest/v1/rpc/'+name,'POST',body,await token()); }
  async function profile() {
    const rows=await call('/rest/v1/pjd_profiles?select=full_name,company,email,reminders_enabled,reminder_lead_days&user_id=eq.'+currentUser.id,'GET',null,await token());
    return rows[0];
  }
  async function enterPortal() {
    currentUser = await call('/auth/v1/user','GET',null,await token());
    if (!currentUser.email_confirmed_at) throw new Error('Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.');
    const profiles = await call('/rest/v1/pjd_profiles?select=user_id&user_id=eq.'+encodeURIComponent(currentUser.id),'GET',null,await token());
    if (!profiles?.length) throw new Error('Ihr Zugang ist noch nicht freigeschaltet. Bitte kontaktieren Sie info@premiumjetdetailing.de.');
    const access=await rpc('pjd_portal_access');
    if(adminMode&&!access.admin)throw Error('Dieser Bereich ist ausschließlich für Administratoren. Bitte öffnen Sie das Kundenportal.');
    const data = adminMode ? null : await reloadData();
    window.PJDAccount = {
      initial:data, reload:reloadData, isAdmin:access.admin, profile,
      savePreferences:values=>rpc('pjd_portal_preferences',values),
      async adminData() {
        if(!access.admin)throw Error('Kein Adminzugang.');
        const definitions={planes:'pjd_aircraft_care?select=*&archived=eq.false',requests:'pjd_requests?select=*&order=created_at.desc',profiles:'pjd_profiles?select=user_id,email,full_name,company',services:'pjd_services?select=*&order=completed_on.desc'};
        const rows=await Promise.all(Object.entries(definitions).map(async([key,path])=>[key,await call('/rest/v1/'+path,'GET',null,await token())]));
        return {...Object.fromEntries(rows),mail:await rpc('pjd_portal_mail_status')};
      },
      adminOrder:(id,version,action,data)=>rpc('pjd_portal_admin_order',{p_id:id,p_version:version,p_action:action,p_data:data}),
      addAircraft:row => insert('pjd_aircraft',row),
      async addRequest(row) {
        try{return await insert('pjd_requests',row);}catch(error){
          if(error.status!==409)throw error;
          const saved=await call('/rest/v1/pjd_requests?select=id&owner_id=eq.'+currentUser.id+'&idempotency_key=eq.'+encodeURIComponent(row.idempotency_key),'GET',null,await token());
          if(saved?.length===1)return saved[0];throw error;
        }
      },
      async notify(requestId) {
        const response = await fetch('/api/portal-notify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await token()},body:JSON.stringify({request_id:requestId}),signal:AbortSignal.timeout(20000)}).catch(()=>null);
        return !!response?.ok;
      }
    };
    const preferences=await profile();
    const name = String(preferences?.full_name || '').trim();
    $('account-name').textContent = name || 'Kundenkonto';
    $('account-email').textContent = currentUser.email || '';
    $('account-initials').textContent = name ? name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase() : 'PJD';
    if(adminMode) {
      await script('/assets/portal-admin.js?v=20261118');
      $('portal-shell').hidden=false;$('login-view').hidden=true;document.body.classList.remove('is-locked');return;
    }
    const adminLink=$('admin-portal-link');if(adminLink)adminLink.hidden=!access.admin;
    notice('Ihr digitaler Hangar wird geladen …');
    await script('/assets/portal-posters-v6.js');
    await script('/assets/portal-engine-v6.js');
    await script('/assets/portal-ui-v6.js?v=20261118');
    await script('/assets/portal-care.js?v=20261118');
    if(!window.PJDPortal || !window.PJDModels)throw new Error('Die Portalansicht konnte nicht gestartet werden. Bitte laden Sie die Seite neu.');
    await script('/assets/portal-touch-v6.js');
    await script('/assets/portal-experience-v6.js?v=20261118');
    delete window.PJDAccount.initial;
    $('portal-shell').hidden = false; $('login-view').hidden = true;
    document.body.classList.remove('is-locked');
    window.dispatchEvent(new Event('resize'));
    $('fleet-search').value = '';
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.tab)));
  form.addEventListener('submit',async event => {
    event.preventDefault();if(!form.reportValidity())return;
    const button=$('auth-submit');button.disabled=true;notice('Bitte warten …');
    const email=form.elements.email.value.trim(),password=form.elements.password.value;
    try {
      if(mode==='login') {
        const data=await call('/auth/v1/token?grant_type=password','POST',{email,password});
        setSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});
        await enterPortal();form.reset();
      } else if(mode==='signup') {
        await call('/auth/v1/signup?redirect_to='+encodeURIComponent(RETURN_URL),'POST',{email,password,data:{full_name:form.elements.name.value.trim()}});
        form.reset();notice('Prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihr Konto. Danach können Sie sich anmelden.');
      } else if(mode==='reset') {
        await call('/auth/v1/recover?redirect_to='+encodeURIComponent(RETURN_URL),'POST',{email});
        notice('Falls ein Konto besteht, erhalten Sie eine E-Mail zum Zurücksetzen des Passworts.');
      } else {
        await call('/auth/v1/user','PUT',{password},await token());
        await call('/auth/v1/logout','POST',null,await token()).catch(()=>{});
        setSession(null);form.reset();setMode('login');notice('Passwort geändert. Bitte melden Sie sich an.');
      }
    } catch(error) {notice(error.message,true);}
    finally {button.disabled=false;}
  });
  $('account-logout').addEventListener('click',async()=>{
    $('account-logout').disabled=true;
    try {await call('/auth/v1/logout','POST',null,await token());}catch(_){}
    setSession(null);location.replace(adminMode ? '/adminportal' : '/kundenportal');
  });
  async function init() {
    $('auth-submit').disabled=true;
    try {
      const fragment=new URLSearchParams(location.hash.slice(1));
      if(fragment.has('error_description')) {history.replaceState(null,'',location.pathname);throw new Error(fragment.get('error_description'));}
      if(fragment.get('access_token')) {
        setSession({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(fragment.get('expires_in')||3600)});
        history.replaceState(null,'',location.pathname);
        if(fragment.get('type')==='recovery') {setMode('update');notice('Legen Sie jetzt ein neues Passwort fest.');return;}
      }
      if(!session) {try {session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(_) {setSession(null);}}
      if(session) await enterPortal();
    } catch(error) {setSession(null);notice(error.message,true);}
    finally {$('auth-submit').disabled=false;}
  }
  init();
})();
