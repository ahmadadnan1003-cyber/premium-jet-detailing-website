(() => {
  'use strict';
  const account=window.PJDAccount,$=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status={requested:'Angefragt',confirmed:'Bestätigt',completed:'Abgeschlossen',cancelled:'Storniert'};
  const serviceNames=['Deep Clean','Cabin Refresh','Leather Care','Carpet & Textile','Veneer & Surfaces','Galley & Lavatory','Protection'];
  const weights={'Cabin Refresh':25,'Leather Care':20,'Carpet & Textile':20,'Veneer & Surfaces':15,'Galley & Lavatory':15,'Protection':5};
  const dialog=$('admin-order-dialog'),form=$('admin-order-form');
  let state=null,filter='open',active=null,action=null,busy=false,loading=null;
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function plusDays(day,count){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return date.toISOString().slice(0,10);}
  function date(value){if(!value)return 'Noch offen';return new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeZone:'Europe/Berlin'}).format(new Date(value.length===10?value+'T12:00:00Z':value));}
  function render(){
    if(!state)return;
    $('admin-open-count').textContent=state.requests.filter(r=>['requested','confirmed'].includes(r.status)).length;
    $('admin-fleet-count').textContent=state.planes.length;
    $('admin-condition').textContent=state.planes.length?Math.round(state.planes.reduce((sum,p)=>sum+p.condition_percent,0)/state.planes.length)+'%':'—';
    const query=$('admin-search').value.trim().toLowerCase();
    const rows=state.requests.filter(r=>(filter==='all'||(filter==='open'?['requested','confirmed'].includes(r.status):r.status===filter))).filter(r=>{
      const a=state.planes.find(a=>a.id===r.aircraft_id),p=state.profiles.find(p=>p.user_id===r.owner_id);
      return [a?.model_id,a?.registration,p?.email,p?.full_name,p?.company].join(' ').toLowerCase().includes(query);
    });
    $('admin-orders').innerHTML=rows.map(r=>{
      const a=state.planes.find(a=>a.id===r.aircraft_id),p=state.profiles.find(p=>p.user_id===r.owner_id),s=state.services.find(s=>s.request_id===r.id);
      const open=['requested','confirmed'].includes(r.status);
      return '<article class="admin-order"><div><span class="order-status">'+escape(status[r.status])+'</span><h3>'+escape(a?.model_id||'Flugzeug')+'</h3><p>'+escape([a?.registration,p?.full_name||p?.email,p?.company].filter(Boolean).join(' · '))+'</p><p>'+escape(p?.email||'')+'</p><p>'+escape((s?.services||r.services).join(' · '))+'</p><div class="order-meta"><span>'+escape(r.status==='completed'?'Erledigt: '+date(s?.completed_on):'Wunsch: '+date(r.requested_date))+'</span>'+(r.scheduled_at&&open?'<span>Termin: '+escape(new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(r.scheduled_at)))+' (Berlin)</span>':'')+'<span>'+escape(a?.registration||'')+' · '+(a?.condition_percent??0)+' %</span><span>'+escape(r.airport)+'</span></div></div><div class="order-actions">'+(open?'<button class="gold-button" data-id="'+r.id+'" data-action="completed">Service abschließen</button><button class="outline-button" data-id="'+r.id+'" data-action="confirmed">Termin bestätigen</button><button class="text-button" data-id="'+r.id+'" data-action="cancelled">Stornieren</button>':'<button class="outline-button" data-id="'+r.id+'" data-action="view">Details</button>')+'</div></article>';
    }).join('')||'<p class="request-empty">Keine Aufträge in dieser Ansicht.</p>';
    document.querySelectorAll('[data-admin-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.adminFilter===filter)));
    const mail=state.mail;
    $('admin-mail-status').innerHTML='<strong>E-Mail-Erinnerungen</strong><br>Tägliche Prüfung · '+mail.sent+' gesendet · '+mail.pending+' ausstehend'+(mail.failed?' · <span class="admin-error">'+mail.failed+' fehlgeschlagen – Versand prüfen</span>':'')+'<br>'+(mail.last_success?'Letzter Durchlauf: '+escape(new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(mail.last_success))):'Der erste automatische Durchlauf steht noch aus.')+'<br>Nur für Kunden mit aktivierten Erinnerungen. Ein offener Auftrag pausiert die Erinnerung.';
  }
  async function reload(quiet=false){
    if(loading)return loading;
    if(!quiet)$('admin-message').textContent='Wird aktualisiert …';
    loading=(async()=>{try{state=await account.adminData();render();if(!quiet)$('admin-message').textContent='';}catch(error){$('admin-message').textContent=error.message;}})();
    try{await loading;}finally{loading=null;}
  }
  function selectedServices(){const checked=[...form.querySelectorAll('[name="service"]:checked')].map(i=>i.value);return checked.includes('Deep Clean')?['Deep Clean']:checked;}
  function preview(){
    const services=selectedServices(),deep=services.includes('Deep Clean');
    form.querySelectorAll('[name="service"]').forEach(i=>{i.disabled=deep&&i.value!=='Deep Clean';});
    const covered=deep?100:services.reduce((sum,s)=>sum+weights[s],0);
    $('admin-care-preview').textContent=deep?'Deep Clean: alle sechs Bereiche werden am Servicetag auf 100 % gesetzt.':'Diese Leistungen erneuern '+covered+' % der gewichteten Pflegebereiche. Die übrigen Bereiche behalten ihren bisherigen Verlauf.';
  }
  function open(id,nextAction){
    active=state.requests.find(r=>r.id===id);if(!active)return;action=nextAction;form.reset();
    const a=state.planes.find(a=>a.id===active.aircraft_id),service=state.services.find(s=>s.request_id===id);
    $('admin-dialog-action').textContent={completed:'SERVICE ABSCHLIESSEN',confirmed:'TERMIN BESTÄTIGEN',cancelled:'AUFTRAG STORNIEREN',view:'SERVICEBERICHT'}[action];
    $('admin-order-title').textContent=a?.registration||'Serviceauftrag';
    $('admin-order-notes').textContent=[a?.model_id,'Angefragt: '+active.services.join(' · '),active.notes,
      service?'Erledigt am '+date(service.completed_on)+': '+service.services.join(' · '):'',service?.note||active.admin_note].filter(Boolean).join('\n');
    $('admin-order-error').textContent='';
    $('admin-completion-fields').hidden=action!=='completed';$('admin-appointment-fields').hidden=action!=='confirmed';
    form.elements.completedOn.required=form.elements.nextDue.required=action==='completed';form.elements.scheduledAt.required=action==='confirmed';
    form.elements.completedOn.value=today();form.elements.completedOn.max=today();form.elements.completedOn.min=active.created_at.slice(0,10);
    form.elements.nextDue.value=plusDays(today(),a?.interval_days||30);
    form.elements.scheduledAt.value=active.scheduled_at?new Date(new Date(active.scheduled_at).getTime()-new Date(active.scheduled_at).getTimezoneOffset()*60000).toISOString().slice(0,16):active.requested_date+'T10:00';
    form.elements.note.closest('label').hidden=action==='view';
    form.querySelector('.admin-services').innerHTML='<legend>Tatsächlich ausgeführte Leistungen</legend>'+serviceNames.map(s=>'<label class="care-checkbox"><input name="service" type="checkbox" value="'+escape(s)+'" '+(active.services.includes(s)?'checked':'')+'><span>'+escape(s)+(s==='Deep Clean'?' · 100 %':' · '+weights[s]+' %')+'</span></label>').join('');
    form.querySelectorAll('[name="service"]').forEach(i=>i.addEventListener('change',preview));preview();
    $('admin-save').hidden=action==='view';$('admin-save').textContent={completed:'Auftrag abschließen',confirmed:'Termin bestätigen',cancelled:'Auftrag stornieren'}[action]||'Speichern';
    dialog.showModal();
  }
  $('admin-orders').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)open(b.dataset.id,b.dataset.action);});
  function close(){if(!busy)dialog.close();}
  $('admin-close').addEventListener('click',close);$('admin-cancel-dialog').addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.elements.completedOn.addEventListener('change',()=>{if(form.elements.completedOn.value)form.elements.nextDue.value=plusDays(form.elements.completedOn.value,state.planes.find(a=>a.id===active.aircraft_id)?.interval_days||30);});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!active||!form.reportValidity())return;
    if(action==='completed'&&!selectedServices().length){$('admin-order-error').textContent='Bitte die ausgeführten Leistungen wählen.';return;}
    busy=true;$('admin-save').disabled=true;$('admin-order-error').textContent='';
    try{
      const data={note:form.elements.note.value.trim()};
      if(action==='completed')Object.assign(data,{completed_on:form.elements.completedOn.value,next_due:form.elements.nextDue.value,services:selectedServices()});
      if(action==='confirmed')data.scheduled_at=new Date(form.elements.scheduledAt.value).toISOString();
      await account.adminOrder(active.id,active.version,action,data);dialog.close();
      await reload(true);$('admin-message').textContent=action==='completed'?'Auftrag abgeschlossen. Der Pflegezustand ist im Kundenkonto aktualisiert.':'Auftrag gespeichert.';
    }catch(error){$('admin-order-error').textContent=error.message;}
    finally{busy=false;$('admin-save').disabled=false;}
  });
  $('admin-search').addEventListener('input',render);
  document.querySelectorAll('[data-admin-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.adminFilter;render();}));
  $('admin-refresh').addEventListener('click',()=>reload());
  window.addEventListener('focus',()=>{if(!dialog.open)reload(true);});
  window.setInterval(()=>{if(!document.hidden&&!dialog.open)reload(true);},45000);
  reload();
})();
