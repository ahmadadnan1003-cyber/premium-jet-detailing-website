/* Public Supabase key; all customer records are protected by owner-scoped RLS. */
(() => {
  "use strict";
  const API = "https://wfaqlfzrcvwgcfyhhymf.supabase.co";
  const KEY = "sb_publishable_z9Uw29azzX3s68kqEOLRSQ_ziaUH3Pa";
  const RETURN_URL = "https://www.premiumjetdetailing.de/kundenportal";
  const SESSION_KEY = "pjd_customer_session";
  const $ = id => document.getElementById(id);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = "login";
  let session = null;
  let aircraft = [];
  let requests = [];
  let renderers = [];
  let hangar = null;

  function notice(id, message, error = false) {
    const el = $(id);
    el.textContent = message;
    el.classList.toggle("is-error", error);
  }
  function errorText(error) {
    return error?.msg || error?.error_description || error?.message || "Die Anfrage konnte nicht verarbeitet werden.";
  }
  async function call(path, method = "GET", body, bearer) {
    const response = await fetch(API + path, {
      method,
      headers: {apikey: KEY, ...(bearer ? {Authorization: "Bearer " + bearer} : {}), ...(body ? {"Content-Type": "application/json"} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!response.ok) throw new Error(errorText(data));
    return data;
  }
  function setSession(value) {
    session = value;
    if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(SESSION_KEY);
  }
  async function token() {
    if (!session?.access_token) throw new Error("Bitte erneut anmelden.");
    if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
      const updated = await call("/auth/v1/token?grant_type=refresh_token", "POST", {refresh_token:session.refresh_token});
      setSession({...updated, expires_at:Math.floor(Date.now()/1000) + updated.expires_in});
    }
    return session.access_token;
  }
  const user = async () => call("/auth/v1/user", "GET", null, await token());
  function setMode(next) {
    mode = next;
    document.querySelectorAll("[data-tab]").forEach(button => {
      const active = button.dataset.tab === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("name-field").hidden = mode !== "signup";
    $("email-field").hidden = mode === "update";
    $("auth-form").elements.email.required = mode !== "update";
    $("password-field").hidden = mode === "reset";
    $("auth-form").elements.password.required = mode !== "reset";
    $("auth-form").elements.password.autocomplete = ["signup","update"].includes(mode) ? "new-password" : "current-password";
    $("auth-submit").textContent = {login:"Anmelden →",signup:"Konto erstellen →",reset:"Link senden →",update:"Passwort speichern →"}[mode];
    notice("auth-message", "");
  }
  function hidePortal() {
    renderers.forEach(renderer => renderer.destroy());
    renderers = [];
    hangar?.destroy(); hangar = null;
    aircraft = []; requests = [];
    $("portal-shell").hidden = true;
    $("login-view").hidden = false;
    document.body.classList.add("is-locked");
  }
  async function showPortal() {
    const current = await user();
    if (!current.email_confirmed_at) throw new Error("Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.");
    const profiles = await call("/rest/v1/pjd_profiles?select=user_id&user_id=eq." + encodeURIComponent(current.id), "GET", null, await token());
    if (!profiles.length) throw new Error("Ihr Zugang ist noch nicht freigeschaltet.");
    const name = String(current.user_metadata?.full_name || "").trim();
    $("profile-name").textContent = name || "Kundenkonto";
    $("profile-email").textContent = current.email || "";
    $("welcome-name").textContent = name ? name.split(/\s+/)[0] : "im Kundenportal";
    $("today-label").textContent = new Intl.DateTimeFormat("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
    await reload();
    $("login-view").hidden = true;
    $("portal-shell").hidden = false;
    document.body.classList.remove("is-locked");
    renderFleet();
    notice("portal-message", "");
  }
  async function records(table, columns) {
    return call("/rest/v1/"+table+"?select="+encodeURIComponent(columns)+"&order=created_at.desc", "GET", null, await token());
  }
  async function reload() {
    const [planes, ownRequests] = await Promise.all([
      records("pjd_aircraft", "id,model_id,registration,airport,last_cleaned,next_due,archived,created_at"),
      records("pjd_requests", "id,aircraft_id,services,airport,requested_date,status,created_at")
    ]);
    aircraft = planes.filter(row => !row.archived);
    requests = ownRequests;
    renderMetrics();
    renderRequests();
  }
  function modelOf(plane) {
    const parts = plane.model_id.trim().split(/\s+/);
    return {model:plane.model_id, category:plane.model_id, manufacturer:parts[0] || "", registration:plane.registration, airport:plane.airport};
  }
  function renderMetrics() {
    $("fleet-count").textContent = aircraft.length;
    $("nav-fleet-count").textContent = aircraft.length;
    $("request-count").textContent = requests.filter(row => ["requested","confirmed"].includes(row.status)).length;
    const next = aircraft.filter(row => row.next_due).sort((a,b) => a.next_due.localeCompare(b.next_due))[0];
    $("next-service-date").textContent = next ? new Intl.DateTimeFormat("de-DE",{day:"numeric",month:"short",year:"numeric"}).format(new Date(next.next_due+"T12:00:00")) : "Noch keiner";
    $("next-service-name").textContent = next ? next.registration : "";
  }
  function renderRequests() {
    const list = $("request-list");
    list.replaceChildren();
    if (!requests.length) {
      const li = document.createElement("li"); li.textContent = "Noch keine Serviceanfragen."; list.append(li); return;
    }
    requests.forEach(row => {
      const li = document.createElement("li"), detail = document.createElement("div"), state = document.createElement("strong"), meta = document.createElement("span");
      const plane = aircraft.find(item => item.id === row.aircraft_id);
      detail.textContent = (plane?.registration || "Flugzeug") + " · " + row.services.join(", ");
      meta.textContent = row.airport + " · " + new Intl.DateTimeFormat("de-DE").format(new Date(row.requested_date+"T12:00:00"));
      state.textContent = ({requested:"Angefragt",confirmed:"Bestätigt",completed:"Abgeschlossen",cancelled:"Storniert"})[row.status] || row.status;
      detail.append(meta); li.append(detail,state); list.append(li);
    });
  }
  function renderFleet() {
    renderers.forEach(renderer => renderer.destroy()); renderers = [];
    hangar?.destroy(); hangar = null;
    const grid = $("fleet-grid"); grid.replaceChildren();
    $("fleet-empty").hidden = aircraft.length > 0;
    $("hangar-select").replaceChildren();
    $("request-aircraft").replaceChildren();
    for (const plane of aircraft) {
      $("hangar-select").add(new Option(plane.model_id + " · " + plane.registration,plane.id));
      $("request-aircraft").add(new Option(plane.model_id + " · " + plane.registration,plane.id));
      const card = document.createElement("article"); card.className = "aircraft-card";
      const visual = document.createElement("div"); visual.className = "aircraft-visual";
      const badge = document.createElement("span"); badge.className = "aircraft-badge"; badge.textContent = "Drehbares 3D-Modell";
      const canvas = document.createElement("canvas"); canvas.className = "aircraft-canvas"; canvas.setAttribute("aria-label","Drehbares schematisches 3D-Modell: "+plane.model_id);
      visual.append(badge,canvas);
      const body = document.createElement("div"); body.className = "aircraft-body";
      const title = document.createElement("div"); title.className = "aircraft-title-row";
      const name = document.createElement("h4"); name.textContent = plane.model_id;
      const reg = document.createElement("p"); reg.textContent = plane.registration + " · " + plane.airport;
      const label = document.createElement("div"); label.append(name,reg); title.append(label);
      const actions = document.createElement("div"); actions.className = "aircraft-actions";
      const requestButton = document.createElement("button"); requestButton.type="button"; requestButton.textContent="Service anfragen";
      requestButton.addEventListener("click",()=>openRequest(plane.id)); actions.append(requestButton);
      body.append(title,actions); card.append(visual,body); grid.append(card);
      renderers.push(createAircraftRenderer(canvas,modelOf(plane)));
    }
    const first = aircraft[0];
    $("hangar-title").textContent = first?.model_id || "Flugzeug auswählen";
    $("hangar-tail").textContent = first ? first.registration + " · " + first.airport : "Registrieren Sie Ihr erstes Flugzeug, um es hier zu sehen.";
    if (first) hangar = createAircraftRenderer($("hangar-canvas"),modelOf(first));
    else { const ctx = $("hangar-canvas").getContext("2d"); ctx?.clearRect(0,0,$("hangar-canvas").width,$("hangar-canvas").height); }
  }
  function openDialog(dialog) { if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open",""); }
  function closeDialog(dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
  function openRequest(id) {
    if (!aircraft.length) { notice("portal-message","Bitte fügen Sie zuerst ein Flugzeug hinzu.",true); openDialog($("register-dialog")); return; }
    $("request-aircraft").value = id || aircraft[0].id;
    $("request-form").elements.requested_date.min = new Date().toISOString().slice(0,10);
    openDialog($("request-dialog"));
  }
  async function insert(table, data) {
    const response = await fetch(API+"/rest/v1/"+table,{
      method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+await token(),"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(data)
    });
    const result = await response.json().catch(()=>null);
    if (!response.ok) throw new Error(errorText(result));
    return result;
  }

  document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click",()=>setMode(button.dataset.tab)));
  $("auth-form").addEventListener("submit", async event => {
    event.preventDefault(); const form=event.currentTarget, button=$("auth-submit"); button.disabled=true; notice("auth-message","Bitte warten …");
    const email=form.elements.email.value.trim(),password=form.elements.password.value;
    try {
      if (mode==="login") {
        const data=await call("/auth/v1/token?grant_type=password","POST",{email,password});
        setSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});
        await showPortal(); form.reset();
      } else if (mode==="signup") {
        await call("/auth/v1/signup?redirect_to="+encodeURIComponent(RETURN_URL),"POST",{email,password,data:{full_name:form.elements.name.value.trim()}});
        notice("auth-message","Prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihr Konto. Danach können Sie sich anmelden."); form.reset();
      } else if (mode==="reset") {
        await call("/auth/v1/recover?redirect_to="+encodeURIComponent(RETURN_URL),"POST",{email});
        notice("auth-message","Falls ein Konto besteht, erhalten Sie eine E-Mail zum Zurücksetzen des Passworts.");
      } else {
        await call("/auth/v1/user","PUT",{password},await token());
        form.reset();setSession(null);setMode("login");notice("auth-message","Passwort geändert. Bitte melden Sie sich an.");
      }
    } catch(error) { notice("auth-message",errorText(error),true); }
    finally { button.disabled=false; }
  });
  $("logout").addEventListener("click",async()=>{try{await call("/auth/v1/logout","POST",null,await token());}catch{}setSession(null);hidePortal();});
  ["open-register","hangar-register"].forEach(id=>$(id).addEventListener("click",()=>openDialog($("register-dialog"))));
  ["open-request","secondary-request","mobile-request"].forEach(id=>$(id).addEventListener("click",()=>openRequest()));
  document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>closeDialog($(button.dataset.close))));
  document.querySelectorAll("[data-section]").forEach(button=>button.addEventListener("click",()=>{
    const target={overview:"overview-section",fleet:"fleet-section",requests:"requests-section"}[button.dataset.section];
    $(target)?.scrollIntoView({behavior:reducedMotion?"instant":"smooth"});
  }));
  document.querySelectorAll("[data-scene]").forEach(button=>button.addEventListener("click",()=>{
    const apron=button.dataset.scene==="apron";
    $("hangar-stage").classList.toggle("is-apron",apron);
    document.querySelectorAll("[data-scene]").forEach(item=>{item.classList.toggle("is-active",item===button);item.setAttribute("aria-pressed",String(item===button));});
  }));
  $("hangar-select").addEventListener("change",event=>{
    const plane=aircraft.find(row=>row.id===event.target.value); if(!plane)return;
    hangar?.destroy();$("hangar-title").textContent=plane.model_id;$("hangar-tail").textContent=plane.registration+" · "+plane.airport;
    hangar=createAircraftRenderer($("hangar-canvas"),modelOf(plane));
  });
  $("register-form").addEventListener("submit",async event=>{
    event.preventDefault(); const form=event.currentTarget,button=$("register-submit");
    if(!form.reportValidity())return; button.disabled=true;
    try {
      const current=await user();
      await insert("pjd_aircraft",{owner_id:current.id,model_id:form.elements.manufacturer.value+" "+form.elements.model.value.trim(),registration:form.elements.registration.value.trim().toUpperCase(),airport:form.elements.airport.value.trim(),notes:"",interval_days:30});
      closeDialog($("register-dialog"));form.reset();await reload();renderFleet();notice("portal-message","Flugzeug hinzugefügt.");
    } catch(error){notice("portal-message",errorText(error),true);closeDialog($("register-dialog"));}finally{button.disabled=false;}
  });
  $("request-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=$("request-submit");if(!form.reportValidity())return;
    const services=[...form.querySelectorAll('[name="service"]:checked')].map(input=>input.value);
    if(!services.length){notice("portal-message","Bitte wählen Sie mindestens eine Leistung.",true);return;}
    button.disabled=true;
    try {
      const current=await user();
      const created=await insert("pjd_requests",{owner_id:current.id,aircraft_id:form.elements.aircraft_id.value,idempotency_key:crypto.randomUUID(),airport:form.elements.location.value.trim(),requested_date:form.elements.requested_date.value,services,notes:form.elements.notes.value.trim()});
      closeDialog($("request-dialog"));form.reset();await reload();renderFleet();
      const notification=await fetch("/api/portal-notify",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+await token()},body:JSON.stringify({request_id:created[0].id})}).catch(()=>null);
      notice("portal-message",notification?.ok?"Ihre Anfrage wurde gespeichert und an Premium Jet Detailing gemeldet.":"Ihre Anfrage wurde gespeichert. Die E-Mail-Benachrichtigung ist fehlgeschlagen; bitte kontaktieren Sie uns zusätzlich unter info@premiumjetdetailing.de.",!notification?.ok);
    }catch(error){notice("portal-message",errorText(error),true);}finally{button.disabled=false;}
  });
  async function init(){
    try {
      const fragment=new URLSearchParams(location.hash.slice(1));
      if(fragment.get("access_token")){
        setSession({access_token:fragment.get("access_token"),refresh_token:fragment.get("refresh_token"),expires_at:Math.floor(Date.now()/1000)+Number(fragment.get("expires_in")||3600)});
        history.replaceState(null,"",location.pathname);
        if(fragment.get("type")==="recovery"){setMode("update");notice("auth-message","Legen Sie jetzt ein neues Passwort fest.");return;}
      }
      if(!session)session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null");
      if(session)await showPortal();
    }catch(error){setSession(null);hidePortal();notice("auth-message",errorText(error),true);}
  }

  function hexToRgb(hex) {
    var value = hex.replace("#", "");
    if (value.length === 3) value = value.split("").map(function (char) { return char + char; }).join("");
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function shadeColor(hex, shade) {
    var rgb = hexToRgb(hex);
    return "rgb(" + rgb.map(function (value) { return Math.max(0, Math.min(255, Math.round(value * shade))); }).join(",") + ")";
  }

  function cross(a, b, c) {
    var ux = b.x - a.x;
    var uy = b.y - a.y;
    var uz = b.z - a.z;
    var vx = c.x - a.x;
    var vy = c.y - a.y;
    var vz = c.z - a.z;
    return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
  }

  function normalize(vector) {
    var length = Math.hypot(vector.x, vector.y, vector.z) || 1;
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
  }

  function addPrism(mesh, points, y, thickness, color) {
    var top = points.map(function (point) { mesh.vertices.push({ x: point[0], y: y + thickness, z: point[1] }); return mesh.vertices.length - 1; });
    var bottom = points.map(function (point) { mesh.vertices.push({ x: point[0], y: y - thickness, z: point[1] }); return mesh.vertices.length - 1; });
    mesh.faces.push({ indices: top, color: color });
    mesh.faces.push({ indices: bottom.slice().reverse(), color: "#77736d" });
    for (var i = 0; i < points.length; i += 1) {
      var next = (i + 1) % points.length;
      mesh.faces.push({ indices: [top[i], top[next], bottom[next], bottom[i]], color: "#a8a39a" });
    }
  }

  function addVerticalPrism(mesh, points, z, thickness, color) {
    var right = points.map(function (point) { mesh.vertices.push({ x: point[0], y: point[1], z: z + thickness }); return mesh.vertices.length - 1; });
    var left = points.map(function (point) { mesh.vertices.push({ x: point[0], y: point[1], z: z - thickness }); return mesh.vertices.length - 1; });
    mesh.faces.push({ indices: right, color: color });
    mesh.faces.push({ indices: left.slice().reverse(), color: "#8d8982" });
    for (var i = 0; i < points.length; i += 1) {
      var next = (i + 1) % points.length;
      mesh.faces.push({ indices: [right[i], right[next], left[next], left[i]], color: "#a8a39a" });
    }
  }

  function addCylinderX(mesh, center, length, radius, color) {
    var segments = 10;
    var rings = [];
    [-length / 2, length / 2].forEach(function (offset) {
      var ring = [];
      for (var i = 0; i < segments; i += 1) {
        var angle = i / segments * Math.PI * 2;
        mesh.vertices.push({ x: center.x + offset, y: center.y + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
        ring.push(mesh.vertices.length - 1);
      }
      rings.push(ring);
    });
    for (var j = 0; j < segments; j += 1) {
      var next = (j + 1) % segments;
      mesh.faces.push({ indices: [rings[0][j], rings[0][next], rings[1][next], rings[1][j]], color: color });
    }
    mesh.faces.push({ indices: rings[1], color: "#1c1b19" });
    mesh.faces.push({ indices: rings[0].slice().reverse(), color: "#68645d" });
  }

  function aircraftProfile(aircraft) {
    var text = (aircraft.model + " " + aircraft.category).toLowerCase();
    if (/global|g650|g700|falcon 8|ultra/.test(text)) return { length: 7.7, radius: 0.67, wing: 3.25, engine: 0.29, sweep: 1.05 };
    if (/challenger|falcon 2000|super midsize/.test(text)) return { length: 6.7, radius: 0.61, wing: 2.75, engine: 0.27, sweep: 0.84 };
    if (/phenom|citation|light/.test(text)) return { length: 5.75, radius: 0.52, wing: 2.35, engine: 0.23, sweep: 0.62 };
    return { length: 6.25, radius: 0.57, wing: 2.55, engine: 0.25, sweep: 0.72 };
  }

  function buildAircraftMesh(aircraft) {
    var profile = aircraftProfile(aircraft);
    var mesh = { vertices: [], faces: [] };
    var xSegments = 20;
    var radialSegments = 12;
    var rings = [];
    var base = "#d8d5cd";

    for (var i = 0; i <= xSegments; i += 1) {
      var t = i / xSegments;
      var x = -profile.length / 2 + profile.length * t;
      var shape = Math.pow(Math.sin(Math.PI * Math.max(0.012, Math.min(0.988, t))), 0.54);
      if (t < 0.17) shape *= 0.62 + t * 2.25;
      if (t > 0.78) shape *= 1 - Math.pow((t - 0.78) / 0.22, 1.7) * 0.43;
      var ring = [];
      for (var j = 0; j < radialSegments; j += 1) {
        var angle = j / radialSegments * Math.PI * 2;
        mesh.vertices.push({
          x: x,
          y: Math.cos(angle) * profile.radius * 0.88 * shape + (t < 0.18 ? (0.18 - t) * 0.55 : 0),
          z: Math.sin(angle) * profile.radius * shape
        });
        ring.push(mesh.vertices.length - 1);
      }
      rings.push(ring);
    }

    for (var xi = 0; xi < xSegments; xi += 1) {
      for (var r = 0; r < radialSegments; r += 1) {
        var rn = (r + 1) % radialSegments;
        var faceColor = base;
        if (xi > 15 && (r === 1 || r === 2 || r === 9 || r === 10)) faceColor = "#20282b";
        else if (r === 3 || r === 8) faceColor = "#c69a48";
        else if (r > 4 && r < 8) faceColor = "#aaa69e";
        mesh.faces.push({ indices: [rings[xi][r], rings[xi + 1][r], rings[xi + 1][rn], rings[xi][rn]], color: faceColor });
      }
    }

    var wingRoot = 0.35;
    addPrism(mesh, [[0.95, wingRoot], [-profile.sweep, profile.wing], [-1.45, profile.wing * 0.93], [-1.15, wingRoot]], -0.08, 0.055, "#cbc7bf");
    addPrism(mesh, [[0.95, -wingRoot], [-1.15, -wingRoot], [-1.45, -profile.wing * 0.93], [-profile.sweep, -profile.wing]], -0.08, 0.055, "#cbc7bf");

    var tailX = -profile.length * 0.39;
    addPrism(mesh, [[tailX + 0.45, 0.22], [tailX - 0.28, profile.wing * 0.48], [tailX - 0.72, profile.wing * 0.45], [tailX - 0.45, 0.22]], 0.18, 0.035, "#c9c5bd");
    addPrism(mesh, [[tailX + 0.45, -0.22], [tailX - 0.45, -0.22], [tailX - 0.72, -profile.wing * 0.45], [tailX - 0.28, -profile.wing * 0.48]], 0.18, 0.035, "#c9c5bd");

    addVerticalPrism(mesh, [[tailX - 0.55, 0.2], [tailX - 0.24, 1.55], [tailX + 0.48, 0.48], [tailX + 0.55, 0.18]], 0, 0.045, "#cfcac0");

    var engineX = -profile.length * 0.23;
    addCylinderX(mesh, { x: engineX, y: 0.12, z: profile.radius + profile.engine * 0.85 }, 1.45, profile.engine, "#a9a59d");
    addCylinderX(mesh, { x: engineX, y: 0.12, z: -profile.radius - profile.engine * 0.85 }, 1.45, profile.engine, "#a9a59d");

    var windowCount = profile.length > 7 ? 8 : profile.length > 6 ? 7 : 5;
    for (var w = 0; w < windowCount; w += 1) {
      var wx = -profile.length * 0.14 + w * (profile.length * 0.58 / windowCount);
      var wy = 0.13;
      var wz = profile.radius * 0.985;
      var size = 0.115;
      var sideOne = [];
      var sideTwo = [];
      [[-size, size * .72], [size, size * .72], [size, -size * .72], [-size, -size * .72]].forEach(function (offset) {
        mesh.vertices.push({ x: wx + offset[0], y: wy + offset[1], z: wz });
        sideOne.push(mesh.vertices.length - 1);
        mesh.vertices.push({ x: wx + offset[0], y: wy + offset[1], z: -wz });
        sideTwo.push(mesh.vertices.length - 1);
      });
      mesh.faces.push({ indices: sideOne, color: "#20272a" });
      mesh.faces.push({ indices: sideTwo.slice().reverse(), color: "#20272a" });
    }

    return mesh;
  }

  function createAircraftRenderer(canvas, aircraft) {
    var context = canvas.getContext("2d", { alpha: true });
    var mesh = buildAircraftMesh(aircraft);
    var yaw = -0.52;
    var targetYaw = yaw;
    var pitch = -0.18;
    var targetPitch = pitch;
    var pointerX = 0;
    var pointerY = 0;
    var dragging = false;
    var frame;
    var destroyed = false;
    var lastTime = performance.now();

    function resize() {
      if (destroyed) return;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var width = Math.round(rect.width * dpr);
      var height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function transform(vertex) {
      var cosY = Math.cos(yaw);
      var sinY = Math.sin(yaw);
      var x1 = vertex.x * cosY + vertex.z * sinY;
      var z1 = -vertex.x * sinY + vertex.z * cosY;
      var cosX = Math.cos(pitch);
      var sinX = Math.sin(pitch);
      return {
        x: x1,
        y: vertex.y * cosX - z1 * sinX,
        z: vertex.y * sinX + z1 * cosX
      };
    }

    function draw(time) {
      if (destroyed) return;
      resize();
      var dt = Math.min(40, time - lastTime);
      lastTime = time;
      if (!dragging && !reducedMotion) targetYaw += dt * 0.000055;
      yaw += (targetYaw - yaw) * 0.075;
      pitch += (targetPitch - pitch) * 0.075;

      var width = canvas.width;
      var height = canvas.height;
      if (!width || !height) {
        frame = requestAnimationFrame(draw);
        return;
      }
      context.clearRect(0, 0, width, height);
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var cx = width * 0.5;
      var cy = height * 0.51;
      var scale = Math.min(width / 9.7, height / 4.65);
      var transformed = mesh.vertices.map(transform);
      var projected = transformed.map(function (vertex) {
        var depth = 10.5 - vertex.z;
        var perspective = 9 / depth;
        return { x: cx + vertex.x * scale * perspective, y: cy - vertex.y * scale * perspective, z: vertex.z };
      });

      context.save();
      context.filter = "blur(" + (5 * dpr) + "px)";
      context.fillStyle = "rgba(0,0,0,.36)";
      context.beginPath();
      context.ellipse(cx, height * .73, width * .31, height * .07, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      var faces = mesh.faces.map(function (face) {
        var depth = face.indices.reduce(function (sum, index) { return sum + transformed[index].z; }, 0) / face.indices.length;
        return { face: face, depth: depth };
      }).sort(function (a, b) { return a.depth - b.depth; });

      var light = normalize({ x: 0.25, y: 0.75, z: 1 });
      faces.forEach(function (entry) {
        var face = entry.face;
        if (face.indices.length < 3) return;
        var p0 = transformed[face.indices[0]];
        var p1 = transformed[face.indices[1]];
        var p2 = transformed[face.indices[2]];
        var normal = normalize(cross(p0, p1, p2));
        var lightValue = Math.abs(normal.x * light.x + normal.y * light.y + normal.z * light.z);
        var shade = 0.54 + lightValue * 0.55;
        context.beginPath();
        face.indices.forEach(function (index, position) {
          var point = projected[index];
          if (position === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.closePath();
        context.fillStyle = shadeColor(face.color, shade);
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.035)";
        context.lineWidth = Math.max(0.5, dpr * .38);
        context.stroke();
      });

      var gradient = context.createLinearGradient(width * .25, 0, width * .75, 0);
      gradient.addColorStop(0, "rgba(201,154,67,0)");
      gradient.addColorStop(.5, "rgba(231,191,109,.18)");
      gradient.addColorStop(1, "rgba(201,154,67,0)");
      context.fillStyle = gradient;
      context.fillRect(width * .22, height * .82, width * .56, Math.max(1, dpr * .55));

      frame = requestAnimationFrame(draw);
    }

    canvas.addEventListener("pointerdown", function (event) {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      targetYaw += (event.clientX - pointerX) * 0.012;
      targetPitch = Math.max(-0.55, Math.min(0.35, targetPitch + (event.clientY - pointerY) * 0.008));
      pointerX = event.clientX;
      pointerY = event.clientY;
    });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("pointercancel", function () { dragging = false; });

    frame = requestAnimationFrame(draw);
    return {
      resize: resize,
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(frame);
      }
    };
  }


  init();
})();
