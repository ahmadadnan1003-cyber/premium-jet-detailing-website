(() => {
  'use strict';
  const account=window.PJDAccount,portal=window.PJDPortal;
  const $=id=>document.getElementById(id),dialog=$('portal-settings'),form=$('settings-form');
  let loading=false,saving=false;
  const message=$('settings-message');
  function close(){if(!saving)dialog.close();}
  async function openSettings(){
    if(!dialog.open)dialog.showModal();
    if(loading||saving)return;loading=true;message.textContent='Einstellungen werden geladen …';
    form.querySelectorAll('input,button[type="submit"]').forEach(el=>el.disabled=true);
    try {
      const p=await account.profile();
      form.elements.fullName.value=p.full_name||'';form.elements.company.value=p.company||'';
      form.elements.reminders.checked=p.reminders_enabled;form.elements.leadDays.value=p.reminder_lead_days;
      $('settings-email').textContent=p.email;message.textContent='';
      form.querySelectorAll('input,button[type="submit"]').forEach(el=>el.disabled=false);
    } catch(error){message.textContent=error.message;}
    finally{loading=false;}
  }
  window.addEventListener('pjd:open-settings',openSettings);
  document.querySelectorAll('[data-close-settings]').forEach(b=>b.addEventListener('click',close));
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||loading||!form.reportValidity())return;
    saving=true;$('settings-save').disabled=true;message.textContent='Wird gespeichert …';
    try {
      const p=await account.savePreferences({p_enabled:form.elements.reminders.checked,p_lead:Number(form.elements.leadDays.value),p_name:form.elements.fullName.value.trim(),p_company:form.elements.company.value.trim()});
      $('account-name').textContent=p.full_name||'Kundenkonto';
      $('account-initials').textContent=p.full_name?p.full_name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase():'PJD';
      message.textContent=p.reminders_enabled?'Gespeichert. E-Mail-Erinnerungen sind aktiviert.':'Gespeichert. E-Mail-Erinnerungen sind ausgeschaltet.';
    } catch(error){message.textContent=error.message;}
    finally{saving=false;$('settings-save').disabled=false;}
  });
  const explanation=$('care-explanation');
  document.querySelectorAll('[data-care-explanation]').forEach(b=>b.addEventListener('click',()=>explanation.showModal()));
  document.querySelectorAll('[data-close-care]').forEach(b=>b.addEventListener('click',()=>explanation.close()));
  explanation.addEventListener('click',e=>{if(e.target===explanation)explanation.close();});
  const hangar=document.createElement('div');hangar.className='care-condition hangar-condition';
  hangar.innerHTML='<div><span>Condition</span><strong></strong></div><progress max="100" aria-label="Pflegezustand"></progress><button class="text-button" type="button">Pflegeindex verstehen</button>';
  hangar.querySelector('button').addEventListener('click',()=>explanation.showModal());
  document.querySelector('.hangar-care').before(hangar);
  function updateHangar(){
    const a=portal.getFleet().find(a=>a.id===$('hangar-select').value);
    hangar.hidden=!a;if(!a)return;
    hangar.querySelector('strong').textContent=a.condition+'%';hangar.querySelector('progress').value=a.condition;
  }
  window.addEventListener('pjd:aircraft-selected',updateHangar);
  window.addEventListener('pjd:account-refreshed',updateHangar);updateHangar();
  const request=$('request-form'),deep=request.querySelector('[value="Deep Clean"]');
  function syncServices(){request.querySelectorAll('[name="service"]').forEach(input=>{if(input!==deep)input.disabled=deep.checked;});}
  deep.addEventListener('change',syncServices);request.addEventListener('reset',()=>queueMicrotask(syncServices));
})();
