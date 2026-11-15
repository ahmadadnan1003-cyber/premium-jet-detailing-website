(function () {
  "use strict";

  var account = window.PJDAccount;
  if (!account || !account.initial) throw new Error('Authenticated portal data missing');
  var careRequests = [];
  var requestCount = 0;
  var renderers = [];
  var toastTimer;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fleetFilter = "all";

  function filterFleet() {
    var search = document.getElementById("fleet-search");
    if (!search) return;
    var query = search.value.trim().toLocaleLowerCase();
    var count = 0;
    document.querySelectorAll("#fleet-grid .aircraft-card").forEach(function (card, index) {
      var aircraft = fleet.find(function (item) { return item.id === card.dataset.aircraftId; });
      if (!aircraft) return;
      var text = [aircraft.manufacturer, aircraft.model, aircraft.registration, aircraft.airport].join(" ").toLocaleLowerCase();
      var visible = text.includes(query) && (fleetFilter === "all" || daysFromNow(plannedDate(aircraft)) <= 10);
      card.hidden = !visible;
      if (visible) {
        count += 1;
        if (renderers[index]) renderers[index].resize();
      }
    });
    document.getElementById("fleet-result-count").textContent = count + " aircraft";
    document.getElementById("fleet-empty").hidden = count > 0;
    document.querySelectorAll("[data-fleet-filter]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.fleetFilter === fleetFilter));
    });
  }

  function resetFleetFilter() {
    fleetFilter = "all";
    document.getElementById("fleet-search").value = "";
    filterFleet();
  }

  function setupFleetControls() {
    document.getElementById("fleet-search").addEventListener("input", filterFleet);
    document.querySelectorAll("[data-fleet-filter]").forEach(function (button) {
      button.addEventListener("click", function () { fleetFilter = button.dataset.fleetFilter; filterFleet(); });
    });
    document.getElementById("reset-fleet-filter").addEventListener("click", resetFleetFilter);
  }

  function dateOffset(days) {
    var value = new Date();
    value.setHours(12, 0, 0, 0);
    value.setDate(value.getDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function mapPlane(row) {
    var profile=window.PJDScene.profileFor({model:row.model_id});
    var full=profile ? profile.name : row.model_id;
    var manufacturer=profile ? profile.manufacturer : '';
    var prefix=manufacturer+' ';
    return {id:row.id,manufacturer:manufacturer,model:manufacturer&&full.startsWith(prefix)?full.slice(prefix.length):full,
      registration:row.registration,airport:row.airport,category:profile?.category||'Aircraft',
      lastService:row.last_cleaned,nextService:row.next_due,finish:'',hours:null,notes:row.notes||''};
  }
  function useData(data) {
    fleet=data.planes.map(mapPlane);
    careRequests=data.requests.map(function(r){return {id:r.id,aircraftId:r.aircraft_id,date:r.requested_date,time:r.requested_time||'',airport:r.airport,services:r.services||[],notes:r.notes||'',status:r.status,createdAt:new Date(r.created_at).getTime()};});
    requestCount=careRequests.filter(function(r){return ['requested','confirmed'].includes(r.status);}).length;
  }
  var fleet=[];
  useData(account.initial);
  async function reloadAccount(){useData(await account.reload());refreshDashboard(false);renderTimeline();}

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function iconSvg(name) {
    var paths = {
      calendar: '<rect x="4.5" y="5.5" width="15" height="15" rx="1.8"/><path d="M8 3.5v4M16 3.5v4M4.5 10h15M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01"/>',
      chart: '<path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15V5"/>',
      shield: '<path d="m12 3.5 7 2.6v5.2c0 4.5-2.8 7.6-7 9.2-4.2-1.6-7-4.7-7-9.2V6.1l7-2.6Z"/><path d="m9 12 2 2 4-4"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
    };
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || paths.calendar) + '</svg>';
  }

  function daysFromNow(value) {
    if (!value) return Infinity;
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var target = new Date(value + "T12:00:00");
    return Math.round((target - now) / 86400000);
  }

  function formatDate(value, style) {
    if (!value || Number.isNaN(new Date(value + "T12:00:00").getTime())) return "—";
    var date = new Date(value + "T12:00:00");
    return new Intl.DateTimeFormat("en-GB", style || { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function showToast(title, copy) {
    var toast = document.getElementById("toast");
    document.getElementById("toast-title").textContent = title;
    document.getElementById("toast-copy").textContent = copy;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 3600);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function updateToday() {
    document.getElementById("today-label").textContent = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(new Date());
  }

  function plannedDate(aircraft) { return aircraft.nextService || null; }
  function requestStatus(status){return {requested:'Requested · awaiting confirmation',confirmed:'Confirmed',completed:'Completed',cancelled:'Cancelled'}[status]||'Requested';}

  function renderRequests() {
    var list=document.getElementById('request-list');
    if(!careRequests.length){list.innerHTML='<p class="request-empty">No requests yet. Service requests saved to your account will appear here.</p>';return;}
    list.innerHTML=careRequests.slice().sort(function(a,b){return b.createdAt-a.createdAt;}).map(function(r){
      var a=fleet.find(function(item){return item.id===r.aircraftId;});
      return '<div class="saved-request"><div><strong>'+escapeHtml(a?a.model:'Aircraft')+'</strong><span>'+escapeHtml((a?a.registration+' · ':'')+r.airport)+'</span><p>'+escapeHtml(r.services.join(' · '))+'</p>'+(r.notes?'<p>'+escapeHtml(r.notes)+'</p>':'')+'</div><div><time>'+escapeHtml(formatDate(r.date,{day:'numeric',month:'short'}))+(r.time?' · '+escapeHtml(r.time):'')+'</time><span>'+escapeHtml(requestStatus(r.status))+'</span></div></div>';
    }).join('');
  }
  function renderMetrics() {
    renderRequests();
    var next=fleet.filter(a=>a.nextService).sort((a,b)=>a.nextService.localeCompare(b.nextService))[0];
    document.getElementById('fleet-count').textContent=fleet.length;
    document.getElementById('nav-fleet-count').textContent=fleet.length;
    document.getElementById('request-count').textContent=requestCount;
    document.getElementById('next-service-days').textContent=next?Math.max(0,daysFromNow(next.nextService)):'—';
    document.getElementById('next-service-name').textContent=next?next.model:'No service scheduled';
  }

  function renderFleet() {
    renderers.forEach(function (renderer) { renderer.destroy(); });
    renderers = [];

    var grid = document.getElementById("fleet-grid");
    grid.innerHTML = fleet.map(function (aircraft, index) {
      var serviceDate = plannedDate(aircraft);
      var dueDays = daysFromNow(serviceDate);
      return [
        '<article class="aircraft-card" data-aircraft-id="', escapeHtml(aircraft.id), '">',
          '<div class="aircraft-visual">',
            '<span class="aircraft-badge">3D model</span>',
            '<span class="aircraft-status ', dueDays <= 10 ? 'is-due' : '', '">', !serviceDate ? 'No date set' : dueDays <= 0 ? 'Due now' : dueDays <= 10 ? 'Due soon' : 'Planned', '</span>',
            '<div class="aircraft-canvas model-placeholder" data-model="', escapeHtml(aircraft.model), '" data-category="', escapeHtml(aircraft.category), '" aria-hidden="true"></div>',
          '</div>',
          '<div class="aircraft-body">',
            '<div class="aircraft-title-row"><div><h4>', escapeHtml(aircraft.manufacturer), ' ', escapeHtml(aircraft.model), '</h4><p>', escapeHtml(aircraft.registration), ' · ', escapeHtml(aircraft.airport), '</p></div><button class="aircraft-menu" type="button" aria-label="Options">', iconSvg("more"), '</button></div>',
            '<div class="aircraft-meta">',
              '<span>Last service<strong>', formatDate(aircraft.lastService, { day: "numeric", month: "short" }), '</strong></span>',
              '<span>Next service<strong>', dueDays <= 0 ? 'Due now' : formatDate(serviceDate, { day: "numeric", month: "short" }), '</strong></span>',
            '</div>',
            '<div class="aircraft-actions"><button type="button" data-action="details" data-id="', escapeHtml(aircraft.id), '">Hangar</button><button type="button" data-action="request" data-id="', escapeHtml(aircraft.id), '">Request</button></div>',
          '</div>',
        '</article>'
      ].join("");
    }).join("");

    grid.querySelectorAll('[data-action="request"]').forEach(function (button) {
      button.addEventListener("click", function () { openRequest(button.dataset.id); });
    });
    grid.querySelectorAll('[data-action="details"]').forEach(function (button) {
      button.addEventListener("click", function () {
        var aircraft = fleet.find(function (item) { return item.id === button.dataset.id; });
        if (aircraft) window.dispatchEvent(new CustomEvent("pjd:show-aircraft", { detail: aircraft }));
      });
    });
    grid.querySelectorAll(".aircraft-menu").forEach(function (button) {
      button.addEventListener("click", function () { showToast("Options coming soon", ""); });
    });

    populateAircraftSelect();
    filterFleet();
    window.dispatchEvent(new CustomEvent("pjd:fleet-rendered"));
  }

  function renderIntelligence(isRefresh) {
    var due=fleet.filter(a=>a.nextService&&daysFromNow(a.nextService)<=10);
    document.getElementById('ai-summary').textContent=due.length ? due.length+' aircraft with an upcoming care date.' : 'Your saved care dates and requests at a glance.';
    document.getElementById('ai-feed').innerHTML=due.map(a=>'<div class="ai-insight"><span class="insight-icon">'+iconSvg('calendar')+'</span><div><strong>'+escapeHtml(a.model)+'</strong><small>'+escapeHtml(formatDate(a.nextService)+' · '+a.airport)+'</small></div><span class="insight-priority">Care due</span></div>').join('') || '<p class="request-empty">No upcoming care dates recorded.</p>';
    if(isRefresh)showToast('Overview updated','');
  }
  function renderTimeline() {
    var completed=careRequests.filter(r=>r.status==='completed');
    document.getElementById('service-timeline').innerHTML=completed.map(r=>{
      var a=fleet.find(a=>a.id===r.aircraftId);
      return '<div class="timeline-item"><span class="timeline-date">'+escapeHtml(formatDate(r.date,{day:'2-digit',month:'short'}))+'</span><div class="timeline-copy"><strong>'+escapeHtml(r.services.join(' · '))+'</strong><span>'+escapeHtml((a?a.model+' · '+a.registration:'Aircraft')+' · '+r.airport)+'</span></div><span class="timeline-status">Completed</span></div>';
    }).join('') || '<p class="request-empty">No completed service requests yet.</p>';
  }

  function populateAircraftSelect(selectedId) {
    var select = document.getElementById("request-aircraft");
    select.innerHTML = fleet.map(function (aircraft) {
      return '<option value="' + escapeHtml(aircraft.id) + '"' + (aircraft.id === selectedId ? ' selected' : '') + '>' + escapeHtml(aircraft.manufacturer + " " + aircraft.model + " · " + aircraft.registration) + '</option>';
    }).join("");
  }

  function openRequest(id) {
    if(!fleet.length){showToast("Add your first aircraft", "Create an aircraft profile before requesting a service.");document.getElementById("open-register").click();return;}
    var form = document.getElementById("request-form");
    form.reset();populateAircraftSelect(id);
    var a=fleet.find(function(item){return item.id===form.elements.aircraft.value;});
    form.elements.airport.value=a?a.airport:'';
    form.elements.date.min=dateOffset(0);form.elements.date.value=dateOffset(3);
    openDialog(document.getElementById("request-dialog"));
  }

  function refreshDashboard(isRefresh) {
    renderMetrics();
    renderFleet();
    renderIntelligence(isRefresh);
  }

  function setupForms() {
    var registerDialog=document.getElementById('register-dialog'),requestDialog=document.getElementById('request-dialog');
    var registerForm=document.getElementById('register-form'),requestForm=document.getElementById('request-form');
    function errorNode(form){var node=document.createElement('p');node.className='form-error';node.setAttribute('role','alert');form.querySelector('.dialog-actions').before(node);return node;}
    var registerError=errorNode(registerForm),requestError=errorNode(requestForm);
    document.getElementById('open-register').addEventListener('click',function(){registerError.textContent='';registerForm.elements.lastService.max=dateOffset(0);openDialog(registerDialog);});
    ['open-request','mobile-request'].forEach(id=>document.getElementById(id).addEventListener('click',()=>openRequest()));
    registerForm.addEventListener('submit',async function(event){
      event.preventDefault();if(event.submitter?.value==='cancel'){closeDialog(registerDialog);return;}
      if(!registerForm.reportValidity())return;
      var button=document.getElementById('register-submit');if(button.disabled)return;button.disabled=true;registerError.textContent='';
      try {
        var data=new FormData(registerForm),model=String(data.get('model')).trim();
        var details=[String(data.get('notes')||'').trim()];
        if(data.get('lastService'))details.push('Customer-reported last service: '+data.get('lastService'));
        if(data.get('category'))details.push('Category: '+data.get('category'));
        if(data.get('finish'))details.push('Cabin: '+data.get('finish'));
        if(data.get('hours'))details.push('Monthly flight hours: '+data.get('hours'));
        var created=await account.addAircraft({model_id:(data.get('manufacturer')+' '+model).trim(),registration:String(data.get('registration')).trim().toUpperCase(),airport:String(data.get('airport')).trim(),notes:details.filter(Boolean).join('\n'),interval_days:30});
        closeDialog(registerDialog);registerForm.reset();
        try{await reloadAccount();}catch(error){showToast('Aircraft saved','Please reload the page to display your updated fleet.');return;}
        resetFleetFilter();
        var aircraft=fleet.find(a=>a.id===created.id);
        window.dispatchEvent(new CustomEvent('pjd:aircraft-registered',{detail:aircraft}));showToast('Aircraft saved','Your aircraft is now available in your account.');
      }catch(error){registerError.textContent=error.message;}finally{button.disabled=false;}
    });
    requestForm.elements.aircraft.addEventListener('change',()=>{var a=fleet.find(a=>a.id===requestForm.elements.aircraft.value);requestForm.elements.airport.value=a?.airport||'';});
    var pendingRequestKey=null;
    requestDialog.addEventListener('close',()=>{pendingRequestKey=null;requestError.textContent='';});
    requestForm.addEventListener('submit',async function(event){
      event.preventDefault();if(event.submitter?.value==='cancel'){closeDialog(requestDialog);return;}
      if(!requestForm.reportValidity())return;
      var data=new FormData(requestForm),services=data.getAll('service');
      if(!services.length){requestError.textContent='Select at least one service.';return;}
      var button=document.getElementById('request-submit');if(button.disabled)return;button.disabled=true;requestError.textContent='';
      try {
        if(!fleet.some(a=>a.id===data.get('aircraft')))throw Error('Please select one of your aircraft.');
        pendingRequestKey=pendingRequestKey||crypto.randomUUID();
        var notes=[String(data.get('notes')||'').trim()];
        for(var key of ['time','fbo','contact','urgency'])if(data.get(key))notes.push(key+': '+data.get(key));
        var created=await account.addRequest({aircraft_id:data.get('aircraft'),idempotency_key:pendingRequestKey,airport:String(data.get('airport')).trim(),requested_date:data.get('date'),services:services,notes:notes.filter(Boolean).join('\n')});
        closeDialog(requestDialog);requestForm.reset();
        try{await reloadAccount();window.dispatchEvent(new CustomEvent('pjd:service-requested',{detail:created}));}catch(error){showToast('Request saved','Please reload the page to see your request.');}
        var notified=await account.notify(created.id);
        showToast('Request saved',notified?'Sent to Premium Jet Detailing. We will confirm your appointment.':'Email notification unavailable. Your request is saved; please contact info@premiumjetdetailing.de.');
      }catch(error){requestError.textContent=error.message;}finally{button.disabled=false;}
    });
    [registerDialog,requestDialog].forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog);}));
  }

  function setupDemoNavigation() {
    var mobileSections=['overview','fleet','requests','history','settings'];
    document.querySelectorAll('.mobile-nav button').forEach(function(b,i){b.dataset.section=mobileSections[i];});
    function navigate(section){
      var target={overview:'overview-section',fleet:'fleet-section',requests:'requests-section',history:'history-section',settings:'portal-settings'}[section];
      if(!target)return;
      var el=document.getElementById(target);if(section==='settings')el.open=true;
      el.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});
      document.querySelectorAll('.sidebar .nav-item,.mobile-nav button:not(.mobile-request)').forEach(function(b){var on=b.dataset.section===section;b.classList.toggle('is-active',on);if(on)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
    }
    document.querySelectorAll('.sidebar .nav-item,.mobile-nav button:not(.mobile-request)').forEach(function(b){b.addEventListener('click',function(){navigate(b.dataset.section);});});
    document.getElementById('profile-button').addEventListener('click',function(){navigate('settings');});
    document.querySelectorAll('.mobile-brand,.sidebar-brand').forEach(function(b){b.addEventListener('click',function(e){e.preventDefault();navigate('overview');});});
    document.getElementById('refresh-intelligence').addEventListener('click',async function(){try{await reloadAccount();window.dispatchEvent(new CustomEvent('pjd:service-requested'));showToast('Overview updated','');}catch(error){showToast('Refresh failed',error.message);}});
  }


  updateToday();
  renderMetrics();
  renderFleet();
  renderIntelligence(false);
  renderTimeline();
  setupForms();
  setupFleetControls();
  setupDemoNavigation();
  window.PJDPortal = { getFleet: function () { return fleet.slice(); }, getRequests: function () { return careRequests.slice(); }, updateAircraft: function (id, changes) { var aircraft = fleet.find(function (item) { return item.id === id; }); if (!aircraft) return null; Object.assign(aircraft, changes); renderFleet(); return Object.assign({}, aircraft); }, openRequest:openRequest, showToast: showToast, stopPreview: function (id) { var index = fleet.findIndex(function (aircraft) { return aircraft.id === id; }); if (renderers[index]) renderers[index].destroy(); } };

  window.addEventListener("resize", function () {
    renderers.forEach(function (renderer) { renderer.resize(); });
  });
})();

(function () {
  'use strict';
  var portal=window.PJDPortal;
  if(!portal||!window.PJDScene)return;
  var viewer=document.getElementById('hangar-viewer'),select=document.getElementById('hangar-select'),status=document.getElementById('model-status'),dialog=document.getElementById('model-dialog');
  var activeAircraft,engine=null,engineFailed=false,version=0,searchController,sceneMode='apron',snapshots=new Map();
  var reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var serviceNames={'Cabin Refresh':'Cabin','Leather Care':'Leather','Carpet & Textile':'Carpet & textile','Veneer & Surfaces':'Wood & surfaces','Galley & Lavatory':'Galley & lavatory','Protection':'Protection'};
  var overview=document.querySelector('.overview-grid'),stage=document.querySelector('.hangar-panel');
  stage.after(overview);
  function dateLabel(value){if(!value)return '—';return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(value+'T12:00:00'));}
  function plan(aircraft){
    if(!aircraft)return {date:null,airport:'',services:[],requested:false};
    var r=portal.getRequests().filter(r=>r.aircraftId===aircraft.id&&['requested','confirmed'].includes(r.status)).sort((a,b)=>a.date.localeCompare(b.date))[0];
    return r?{date:r.date,airport:r.airport,services:r.services,requested:true,status:r.status}:{date:aircraft.nextService,airport:aircraft.airport,services:[],requested:false};
  }
  function nextAircraft(){return portal.getFleet().sort((a,b)=>(plan(a).date||'9999').localeCompare(plan(b).date||'9999'))[0];}
  function servicesInto(target,services){target.replaceChildren();services.forEach(function(name){var item=document.createElement('span');item.textContent=serviceNames[name]||name;target.append(item);});}
  function updateBrief(){var a=nextAircraft(),p=plan(a);if(!a){document.getElementById('brief-aircraft').textContent='Welcome to your hangar';document.getElementById('brief-date').textContent='Add your first aircraft to get started.';document.getElementById('brief-note').textContent='';document.getElementById('show-next-aircraft').disabled=true;return;}document.getElementById('show-next-aircraft').disabled=false;document.getElementById('brief-aircraft').textContent=a.model+' · '+a.registration;document.getElementById('brief-date').textContent=dateLabel(p.date)+' · '+p.airport;servicesInto(document.getElementById('brief-services'),p.services);document.querySelector('.day-plan .eyebrow').textContent=p.requested?(p.status==='confirmed'?'Confirmed service':'Requested service'):'Next service';document.getElementById('brief-note').textContent=p.requested?(p.status==='confirmed'?'Confirmed':'Requested · awaiting confirmation'):(p.date?'Saved care date':'No service scheduled');}
  function populate(id){select.replaceChildren();portal.getFleet().forEach(function(a){var option=document.createElement('option');option.value=a.id;option.textContent=a.model+' · '+a.registration;select.append(option);});select.value=id||nextAircraft()?.id||'';}
  function updateInfo(a){if(!a)return;activeAircraft=a;select.value=a.id;var p=plan(a);document.getElementById('hangar-title').textContent=a.model;document.getElementById('hangar-tail').textContent=a.registration+' · '+p.airport;document.getElementById('hangar-care-date').textContent=dateLabel(p.date);document.querySelector('.hangar-care>span').textContent=p.requested?(p.status==='confirmed'?'Confirmed date':'Requested date'):'Next service';document.getElementById('hangar-plan-label').textContent=a.id===nextAircraft().id?'Next aircraft':'Selected aircraft';servicesInto(document.getElementById('hangar-services'),p.services);window.dispatchEvent(new CustomEvent('pjd:aircraft-selected',{detail:a}));}
  function showAircraftPoster(a){
    var src=window.PJDPoster(a);viewer.replaceChildren();viewer.classList.add('has-poster');
    if(src){var img=document.createElement('img');img.className='hangar-poster';img.src=src.replace('.webp','-hero.webp');img.alt=a.model+' on the airport apron';viewer.append(img);status.textContent='Aircraft preview · 3D unavailable';}
    else{var text=document.createElement('div');text.className='hangar-empty';text.textContent='3D is unavailable in this browser.';viewer.append(text);status.textContent='3D unavailable';}
    document.querySelectorAll('[data-environment],#scene-motion,#expand-hangar').forEach(function(b){b.disabled=true;b.classList.add('is-unavailable');b.title='Interactive 3D is unavailable in this browser';});
  }
  function ensureEngine(){
    if(engine)return engine;
    if(engineFailed)return null;
    try{engine=window.PJDScene.create(viewer);engine.environment(sceneMode);engine.rotation(!scenePaused);return engine;}
    catch(error){engineFailed=true;previewReady=false;queueFleetPreviews();console.error('PJD scene initialization failed',error);status.textContent='3D unavailable';showAircraftPoster(activeAircraft);return null;}
  }
  var photoCard=document.getElementById('aircraft-reference'),photo=document.getElementById('aircraft-reference-image');
  function decoded(value){var node=new DOMParser().parseFromString(String(value||''),'text/html');return (node.body.textContent||'').trim();}
  function resetPhoto(label){photoCard.hidden=true;photo.removeAttribute('src');document.getElementById('aircraft-reference-caption').textContent=label||'Searching for a reference photo …';document.getElementById('aircraft-reference-credit').textContent='';document.getElementById('aircraft-reference-license').textContent='';}
  function referenceLink(profile,aircraft){var target=document.getElementById('hangar-attribution');target.replaceChildren();var text=document.createElement('span');text.textContent='PJD model · '+profile.referenceNote+' ';target.append(text);if(profile.reference){var link=document.createElement('a');link.href=profile.reference;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Manufacturer source';target.append(link);document.getElementById('model-dialog-source').href=profile.reference;}document.getElementById('catalog-model-note').textContent=['p180','global7500','g650er','challenger350','pjd-aircraft-26'].includes(profile.id)?'Approximate model based on references; not manufacturer CAD.':'Generated from the PJD type profile; not manufacturer CAD.';resetPhoto(aircraft.model+' · searching for reference photo …');}
  var previewQueue=new Map(),previewTimer=null,previewBusy=false,previewReady=false;
  function previewKey(a){return [a.id,a.model,a.registration,'pjd-mobile-airport-v5'].join('|');}
  function previewCard(a){return Array.from(document.querySelectorAll('.aircraft-card')).find(function(c){return c.dataset.aircraftId===a.id;});}
  function applyPreview(a,image){
    var card=previewCard(a);if(!card)return;
    var img=card.querySelector('.aircraft-model-preview');
    if(!img){img=document.createElement('img');img.className='aircraft-model-preview';card.querySelector('.aircraft-visual').append(img);}
    img.src=image;img.alt='Side view of '+a.model+' on the airport apron';img.decoding='async';
    card.classList.add('has-model-preview');card.removeAttribute('aria-busy');
    card.querySelector('.aircraft-badge').textContent='3D model';
    var label=card.querySelector('.aircraft-loading-label');if(label)label.remove();
    portal.stopPreview(a.id);
  }
  function previewMessage(a,text){
    var card=previewCard(a);if(!card)return;
    var label=card.querySelector('.aircraft-loading-label');
    if(!label){label=document.createElement('span');label.className='aircraft-loading-label';card.querySelector('.aircraft-visual').append(label);}
    label.textContent=text;
  }
  function schedulePreviews(){
    if(previewTimer!==null||previewBusy||!previewReady||!engine||!previewQueue.size)return;
    previewTimer=setTimeout(function(){
      previewTimer=null;
      if(document.hidden)return;
      var next=previewQueue.entries().next().value;if(!next)return;
      var key=next[0],a=next[1];previewQueue.delete(key);previewBusy=true;
      try{
        var image=snapshots.get(key)||engine.snapshot(a);
        if(image){snapshots.set(key,image);while(snapshots.size>64)snapshots.delete(snapshots.keys().next().value);applyPreview(a,image);}
        else previewMessage(a,'No matching 3D model');
      }catch(error){console.warn('Aircraft preview unavailable',a.model,error);previewMessage(a,'Preview unavailable');}
      finally{previewBusy=false;var card=previewCard(a);if(card)card.removeAttribute('aria-busy');schedulePreviews();}
    },100);
  }
  function preview(a){
    var poster=window.PJDPoster(a);if(poster){applyPreview(a,poster);return;}
    if(!window.PJDScene.profileFor(a)){previewMessage(a,'Add a 3D model');return;}
    var key=previewKey(a),image=snapshots.get(key);
    if(image){applyPreview(a,image);return;}
    previewQueue.set(key,a);previewMessage(a,engineFailed?'Interactive preview unavailable':'Preparing side view…');
    var card=previewCard(a);if(card){if(engineFailed)card.removeAttribute('aria-busy');else card.setAttribute('aria-busy','true');}
    schedulePreviews();
  }
  function queueFleetPreviews(){portal.getFleet().forEach(preview);}
  window.addEventListener('pjd:fleet-rendered',function(){queueFleetPreviews();wireMotion();});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)schedulePreviews();});

  async function searchReference(a,current){
    if(searchController)searchController.abort();searchController=new AbortController();var controller=searchController;
    var timer=setTimeout(function(){controller.abort();},10000);
    try {
      var profile=window.PJDScene.profileFor(a),query=profile?.photoQuery||a.model+' aircraft';
      var params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrwhat:'text',gsrlimit:'12',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'1100',iiextmetadatalanguage:'en',iiextmetadatafilter:'Artist|Attribution|Credit|License|LicenseShortName|LicenseUrl'});
      var response=await fetch('https://commons.wikimedia.org/w/api.php?'+params,{credentials:'omit',signal:controller.signal,referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error('Photo reference unavailable');
      var result=await response.json();if(current!==version)return;
      var pages=Object.values(result.query?.pages||{}),output=document.getElementById('hangar-attribution'),aliases=profile?.aliases||[a.model.toLowerCase().replace(/[^a-z0-9]/g,'')];
      aliases=aliases.slice().sort(function(x,y){return y.length-x.length;});
      var valid=pages.filter(function(page){var info=page.imageinfo&&page.imageinfo[0],license=decoded(info?.extmetadata?.LicenseShortName?.value||'');var title=String(page.title||'').toLowerCase().replace(/[^a-z0-9]/g,'');var exact=aliases.find(function(alias){return alias.length>=4&&title.includes(alias);});var photoUrl=info?.thumburl||info?.url;var host='';try{host=new URL(photoUrl).hostname;}catch(e){}return info&&/^image\/(jpeg|png|webp)$/i.test(info.mime||'')&&(host==='wikimedia.org'||host.endsWith('.wikimedia.org'))&&exact&&!/\bNC\b|\bND\b|non.?commercial|no derivatives/i.test(license)&&(/CC0|public domain|CC BY/i.test(license));});
      valid.sort(function(left,right){var score=function(page){var t=page.title.toLowerCase().replace(/[^a-z0-9]/g,'');return aliases.find(function(alias){return alias.length>=4&&t.includes(alias);})?.length||0;};return score(right)-score(left);});
      var page=valid[0],info=page&&page.imageinfo[0],meta=info?.extmetadata||{};
      if(page&&info&&current===version){
        var imageUrl=new URL(info.thumburl||info.url);
        if(imageUrl.protocol!=='https:'||(imageUrl.hostname!=='wikimedia.org'&&!imageUrl.hostname.endsWith('.wikimedia.org')))throw Error('Untrusted photo URL');
        document.getElementById('aircraft-reference-link').href=info.descriptionurl;
        photo.src=imageUrl.href;photo.alt=page.title.replace(/^File:/,'')+' · echtes Referenzfoto';
        document.getElementById('aircraft-reference-caption').textContent=page.title.replace(/^File:/,'');
        var artist=decoded(meta.Artist?.value||meta.Credit?.value||'Credit on file page');
        document.getElementById('aircraft-reference-credit').textContent=artist?'Photo: '+artist:'Credit on file page';
        var licenseLink=document.getElementById('aircraft-reference-license'),licenseName=decoded(meta.LicenseShortName?.value||'CC license'),licenseUrl='';
        try{var safeLicenseUrl=new URL(meta.LicenseUrl?.value||info.descriptionurl);if(safeLicenseUrl.protocol==='https:')licenseUrl=safeLicenseUrl.href;}catch(e){}licenseLink.href=licenseUrl||info.descriptionurl;licenseLink.textContent=licenseName+' · Bildquelle';
        photoCard.hidden=false;
        var note=document.createElement('span');note.textContent=' · licensed reference photo loaded.';output.append(note);
      }else if(current===version){resetPhoto(a.model+' · no matching free photo found');var note=document.createElement('span');note.textContent=' · no matching free image found.';output.append(note);}
    }catch(error){if(current===version){var note=document.createElement('span');note.textContent=' · photo search unavailable.';document.getElementById('hangar-attribution').append(note);}}
    finally{clearTimeout(timer);}
  }
  function loadAircraft(a,online){
    if(!a)return;
    var queued=++loadSequence;status.textContent='Loading 3D model…';requestAnimationFrame(function(){setTimeout(function(){if(queued===loadSequence)loadAircraftNow(a,online);},0);});
  }
  var loadSequence=0;
  function loadAircraftNow(a,online){
    var current=++version;if(searchController)searchController.abort();updateInfo(a);
    var e=ensureEngine();if(!e){showAircraftPoster(a);return;}
    viewer.classList.remove('has-poster');
    if(e.show(a)){status.textContent=e.profile.id==='global7500'?'Global 7500 · Live 3D':'3D · '+e.profile.name;referenceLink(e.profile,a);document.getElementById('export-aircraft').disabled=false;previewReady=true;preview(a);queueFleetPreviews();}
    else{e.clear();status.textContent='No matching model';document.getElementById('export-aircraft').disabled=true;document.getElementById('hangar-attribution').textContent='No PJD model profile for this type. Add a GLB model to display it here.';document.getElementById('catalog-model-note').textContent=window.PJDScene.catalog.length+' aircraft types. Add a GLB model for other aircraft.';resetPhoto(a.model+' · searching for reference photo …');}
    if(online)searchReference(a,current);
  }
  function selected(){return portal.getFleet().find(function(a){return a.id===select.value;})||nextAircraft();}
  function bringTo(a){if(!a)return;populate(a.id);loadAircraft(a,true);stage.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});}
  select.addEventListener('change',function(){loadAircraft(selected(),true);});
  document.getElementById('show-next-aircraft').addEventListener('click',function(){bringTo(nextAircraft());});
  document.getElementById('hangar-register').addEventListener('click',function(){document.getElementById('open-register').click();});
  document.getElementById('hangar-request').addEventListener('click',function(){portal.openRequest(activeAircraft?.id);});
  document.querySelectorAll('[data-environment]').forEach(function(button){button.addEventListener('click',function(){sceneMode=button.dataset.environment;engine?.environment(sceneMode);document.querySelectorAll('[data-environment]').forEach(function(b){b.classList.toggle('is-active',b===button);});document.getElementById('scene-location').textContent=sceneMode==='hangar'?'PJD · HANGAR 01':'PJD · APRON';});});
  var motionButton=document.getElementById('scene-motion');var scenePaused=reduced;motionButton.textContent=scenePaused?'Play':'Pause';motionButton.setAttribute('aria-pressed',String(scenePaused));
  motionButton.addEventListener('click',function(){scenePaused=!scenePaused;engine?.rotation(!scenePaused);motionButton.textContent=scenePaused?'Play':'Pause';motionButton.setAttribute('aria-pressed',String(scenePaused));});
  document.getElementById('expand-hangar').addEventListener('click',function(){if(!engine||!engine.profile){portal.showToast('No 3D model loaded','Select a supported type or load a GLB model.');return;}document.getElementById('model-dialog-title').textContent=activeAircraft.model;dialog.showModal();engine.moveTo(document.getElementById('model-dialog-viewer'));});
  document.getElementById('close-model-dialog').addEventListener('click',function(){dialog.close();});dialog.addEventListener('close',function(){engine?.moveTo(viewer);});
  document.getElementById('export-aircraft').addEventListener('click',async function(){if(!engine)return;try{var bytes=await engine.export();var url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));var link=document.createElement('a');link.href=url;link.download=activeAircraft.model.replace(/[^a-z0-9]/gi,'-')+'-PJD-Demo.glb';link.click();setTimeout(function(){URL.revokeObjectURL(url);},5000);}catch(error){portal.showToast('Could not export model',error.message);}});
  document.getElementById('import-aircraft').addEventListener('change',async function(event){var file=event.target.files[0];if(!file)return;var e=ensureEngine();if(!e)return;try{await e.import(file);status.textContent='Custom GLB model · this session';referenceLink(e.profile,activeAircraft);document.getElementById('export-aircraft').disabled=false;}catch(error){portal.showToast('Could not load GLB',error.message);}event.target.value='';});
  window.addEventListener('pjd:show-aircraft',function(event){bringTo(event.detail);});
  window.addEventListener('pjd:aircraft-registered',function(event){updateBrief();populate(event.detail.id);loadAircraft(event.detail,true);queueFleetPreviews();wireMotion();setTimeout(function(){stage.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});},700);});
  window.addEventListener('pjd:service-requested',function(){updateBrief();if(activeAircraft)updateInfo(activeAircraft);});

  var bulletin=document.getElementById('public-update');
  var manufacturerSelect=document.querySelector('#register-form [name="manufacturer"]');Array.from(new Set(window.PJDScene.catalog.map(function(p){return p.manufacturer;}))).forEach(function(name){if(!Array.from(manufacturerSelect.options).some(function(o){return o.value===name;})){var option=document.createElement('option');option.value=name;option.textContent=name;manufacturerSelect.insertBefore(option,manufacturerSelect.lastElementChild);}});
  var modelInput=document.querySelector('#register-form [name="model"]');
  var modelNames=window.PJDScene.catalog.map(function(item){var prefix=item.manufacturer+' ';return item.name.indexOf(prefix)===0?item.name.slice(prefix.length):item.name;});
  modelNames.sort(new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare);
  modelNames.forEach(function(name){var option=document.createElement('option');option.value=name;document.getElementById('aircraft-model-options').append(option);});
  document.getElementById('aircraft-catalog-count').textContent=window.PJDScene.catalog.length+' aircraft types';
  modelInput.addEventListener('blur',function(event){var profile=window.PJDScene.profileFor({model:event.target.value});if(profile){document.querySelector('#register-form [name="manufacturer"]').value=profile.manufacturer;document.getElementById('aircraft-category').value=profile.category;var prefix=profile.manufacturer+' ';if(profile.name.indexOf(prefix)===0)event.target.value=profile.name.slice(prefix.length);}});

  document.getElementById('copy-public-update').addEventListener('click',async function(){try{await navigator.clipboard.writeText(bulletin.value);portal.showToast('Copied','');}catch(error){bulletin.focus();bulletin.select();portal.showToast('Text selected','Use ⌘C or Ctrl+C to copy.');}});
  function wireMotion(){}
  portal.getFleet().forEach(function(a){var profile=window.PJDScene.profileFor(a);if(!profile)return;var prefix=profile.manufacturer+' ',model=profile.name.indexOf(prefix)===0?profile.name.slice(prefix.length):profile.name;if(a.model!==model||a.manufacturer!==profile.manufacturer||a.category!==profile.category)portal.updateAircraft(a.id,{model:model,manufacturer:profile.manufacturer,category:profile.category});});
  populate();updateBrief();updateInfo(nextAircraft());wireMotion();
  window.PJDModels={loadAircraft:loadAircraft,nextAircraft:nextAircraft,plan:plan,getEngine:function(){return engine;}};
  var first=portal.getFleet().find(function(a){return window.PJDScene.profileFor(a)?.id==='global7500';})||nextAircraft();if(first){populate(first.id);loadAircraft(first,false);queueFleetPreviews();}else{viewer.innerHTML='<div class="hangar-empty"><span class="hangar-emblem">360°</span><span>Add an aircraft to open your digital hangar.</span></div>';status.textContent='Your fleet starts here';}
})();
