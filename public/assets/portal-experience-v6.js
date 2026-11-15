
(() => {
  'use strict';
  const portal = window.PJDPortal;
  if (!portal) return;
  const $ = (selector) => document.querySelector(selector);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const key = 'pjd_interface_motion_v1';
  let preference = true;
  try { preference = localStorage.getItem(key) !== 'off'; } catch (_) {}
  let enabled = preference && !media.matches;
  const active = new Set();
  const visited = new WeakSet();
  const ease = 'cubic-bezier(.2,.75,.25,1)';
  const welcome = document.createElement('p');
  welcome.className = 'welcome-description';
  welcome.innerHTML = 'Exceptional care. <em>Every aircraft.</em>';
  $('.welcome-row h2').after(welcome);

  const tile = document.createElement('div');
  tile.className = 'service-date-tile';
  tile.setAttribute('aria-hidden', 'true');
  tile.innerHTML = '<strong></strong><span></span>';
  $('.day-plan').prepend(tile);
  const facts = document.createElement('dl');
  facts.className = 'aircraft-facts';
  facts.innerHTML = '<div><dt>Aircraft class</dt><dd data-fact="class"></dd></div><div><dt>Home base</dt><dd data-fact="base"></dd></div><div><dt>Monthly use</dt><dd data-fact="hours"></dd></div>';
  $('.hangar-picker').after(facts);
  const setting = document.createElement('div');
  setting.className = 'motion-setting';
  setting.innerHTML = '<div><strong>Interface animations</strong><small id="motion-help">Soft transitions and gentle reveals.</small></div><label class="motion-switch"><input id="interface-motion" type="checkbox" aria-label="Interface animations" aria-describedby="motion-help"><i aria-hidden="true"></i></label>';
  $('.settings-content').append(setting);
  const toggle = $('#interface-motion');

  function syncPreference() {
    enabled = preference && !media.matches;
    document.body.classList.toggle('pjd-motion', enabled);
    document.body.classList.toggle('pjd-no-motion', !enabled);
    toggle.checked = enabled;
    toggle.disabled = media.matches;
    $('#motion-help').textContent = media.matches ? 'Reduced motion follows your device setting.' : 'Soft transitions and gentle reveals.';
    if (!enabled) for (const animation of active) animation.cancel();
  }
  toggle.addEventListener('change', () => {
    preference = toggle.checked;
    try { localStorage.setItem(key, preference ? 'on' : 'off'); } catch (_) {}
    syncPreference();
  });
  media.addEventListener('change', syncPreference);
  syncPreference();

  function animate(el, frames, options = {}) {
    if (!enabled || !el?.animate) return;
    const animation = el.animate(frames, { duration: 650, easing: ease, ...options });
    active.add(animation);
    const cleanup = () => active.delete(animation);
    animation.addEventListener('finish', cleanup, {once:true});
    animation.addEventListener('cancel', cleanup, {once:true});
  }
  // No hidden-content classes or perpetual frame loops. Reveal each element once.
  function reveal(el, delay = 0) {
    if (visited.has(el)) return;
    visited.add(el);
    animate(el, [{opacity:0, translate:'0 15px'}, {opacity:1, translate:'0 0'}], {delay});
    el.querySelectorAll('.progress-track i').forEach(bar => animate(bar, [{scale:'0 1'},{scale:'1 1'}], {duration:950,delay:delay+120}));
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    let order = 0;
    for (const entry of entries) if (entry.isIntersecting) {
      reveal(entry.target, Math.min(order++ * 65, 195));
      observer.unobserve(entry.target);
    }
  }, {threshold:.08}) : null;
  function observe(el) { if (observer) observer.observe(el); else reveal(el); }

  let selectedId = $('#hangar-select').value;
  function highlight() {
    document.querySelectorAll('.aircraft-card').forEach(card => {
      card.classList.toggle('is-selected', card.dataset.aircraftId === selectedId);
      if (!card.querySelector('.selected-caption')) {
        const label = document.createElement('span');
        label.className = 'selected-caption';
        label.textContent = 'Selected in hangar';
        card.querySelector('.aircraft-visual').append(label);
      }
    });
  }
  function selectedAircraft(aircraft, transition = false) {
    if (!aircraft) return;
    const changed = selectedId !== aircraft.id;
    selectedId = aircraft.id;
    facts.querySelector('[data-fact="class"]').textContent = aircraft.category || 'Business aircraft';
    facts.querySelector('[data-fact="base"]').textContent = aircraft.airport || '—';
    facts.querySelector('[data-fact="hours"]').textContent = aircraft.hours != null && Number.isFinite(Number(aircraft.hours)) ? aircraft.hours + ' h' : '—';
    highlight();
    if (transition && changed) {
      animate($('#hangar-title'), [{opacity:.25,translate:'0 5px'},{opacity:1,translate:'0 0'}], {duration:450});
      animate(facts, [{opacity:.3},{opacity:1}], {duration:450});
    }
  }
  function updateDate() {
    const aircraft = window.PJDModels?.nextAircraft();
    if (!aircraft) return;
    const date = new Date(window.PJDModels.plan(aircraft).date + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return;
    tile.querySelector('strong').textContent = new Intl.DateTimeFormat('en-GB',{day:'2-digit'}).format(date);
    tile.querySelector('span').textContent = new Intl.DateTimeFormat('en-GB',{month:'short'}).format(date);
  }
  function cards() {
    highlight();
    document.querySelectorAll('.aircraft-card').forEach(observe);
  }
  $('.welcome-row').id = 'pjd-overview-intro';
  document.querySelectorAll('.welcome-row,.day-brief,.hangar-panel,.metric-card,.section-heading,.requests-panel,.insights-grid,.portal-settings').forEach(observe);
  cards();
  updateDate();
  selectedAircraft(portal.getFleet().find(a => a.id === selectedId));
  window.addEventListener('pjd:fleet-rendered', cards);
  window.addEventListener('pjd:aircraft-selected', event => selectedAircraft(event.detail, true));
  window.addEventListener('pjd:aircraft-registered', updateDate);
  window.addEventListener('pjd:service-requested', updateDate);

  // Image arrival/selection fades once; live WebGL rendering is left untouched.
  const viewer = $('#hangar-viewer');
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLImageElement)) continue;
      const ready = () => { if (node.isConnected) animate(node,[{opacity:.25,scale:'1.015'},{opacity:1,scale:'1'}],{duration:650}); };
      if (node.complete) ready(); else node.addEventListener('load',ready,{once:true});
    }
  }).observe(viewer,{childList:true});

  // Section highlighting follows reading position without scroll event handlers.
  if ('IntersectionObserver' in window) {
    const sections = { 'pjd-overview-intro':'overview','fleet-section':'fleet','requests-section':'requests','history-section':'history','portal-settings':'settings' };
    const navigation = new IntersectionObserver(entries => {
      const item = entries.filter(e => e.isIntersecting).sort((a,b) => a.boundingClientRect.top-b.boundingClientRect.top)[0];
      if (!item) return;
      document.querySelectorAll('.sidebar .nav-item,.mobile-nav button:not(.mobile-request)').forEach(button => {
        const selected = button.dataset.section === sections[item.target.id];
        button.classList.toggle('is-active',selected);
        if (selected) button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current');
      });
    }, {rootMargin:'-15% 0px -65% 0px'});
    Object.keys(sections).forEach(id => navigation.observe(document.getElementById(id)));
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) for(const animation of active) animation.finish(); });
})();
