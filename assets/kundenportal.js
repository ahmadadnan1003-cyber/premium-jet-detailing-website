/* Public Supabase publishable key. Row access is enforced by database RLS. */
const API = "https://wfaqlfzrcvwgcfyhhymf.supabase.co";
const KEY = "sb_publishable_z9Uw29azzX3s68kqEOLRSQ_ziaUH3Pa";
const RETURN_URL = "https://www.premiumjetdetailing.de/kundenportal";
const SESSION_KEY = "pjd_customer_session";
const $ = (id) => document.getElementById(id);
let mode = "login";
let session = null;
let aircraft = [];

function notice(id, message, error = false) {
  const el = $(id);
  el.textContent = message;
  el.classList.toggle("error", error);
}
function statusError(error) {
  return error?.msg || error?.error_description || error?.message || "Die Anfrage konnte nicht verarbeitet werden.";
}
async function call(path, method = "GET", body, bearer) {
  const response = await fetch(API + path, {
    method,
    headers: {
      apikey: KEY,
      ...(bearer ? {Authorization: "Bearer " + bearer} : {}),
      ...(body ? {"Content-Type": "application/json"} : {})
    },
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(statusError(data));
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
    const updated = await call("/auth/v1/token?grant_type=refresh_token", "POST", {refresh_token: session.refresh_token});
    setSession({...updated, expires_at: Math.floor(Date.now() / 1000) + updated.expires_in});
  }
  return session.access_token;
}
async function user() {
  return call("/auth/v1/user", "GET", null, await token());
}
function showAccess() {
  $("dashboard").hidden = true;
  $("access").hidden = false;
}
async function showDashboard() {
  const current = await user();
  $("customer-name").textContent = current.user_metadata?.full_name || "im Kundenportal";
  $("customer-email").textContent = current.email || "";
  $("access").hidden = true;
  $("dashboard").hidden = false;
  try { await reload(); } catch (error) { notice("portal-message", statusError(error), true); }
}
function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-tab]").forEach(button => {
    const active = button.dataset.tab === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("name-field").hidden = mode !== "signup";
  $("email-field").hidden = mode === "update";
  $("auth-form").elements.email.required = mode !== "update";
  $("password-field").hidden = mode === "reset";
  $("auth-form").elements.password.required = mode !== "reset";
  $("auth-form").elements.password.autocomplete = mode === "signup" || mode === "update" ? "new-password" : "current-password";
  $("auth-submit").textContent = {login:"Anmelden", signup:"Konto erstellen", reset:"Link zum Zurücksetzen senden",update:"Neues Passwort speichern"}[mode];
  notice("auth-message", "");
}
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.tab)));
$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("auth-submit");
  button.disabled = true;
  notice("auth-message", "Bitte warten …");
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  try {
    if (mode === "login") {
      const data = await call("/auth/v1/token?grant_type=password", "POST", {email,password});
      setSession({...data, expires_at: Math.floor(Date.now()/1000) + data.expires_in});
      await showDashboard();
      form.reset();
    } else if (mode === "signup") {
      await call("/auth/v1/signup?redirect_to=" + encodeURIComponent(RETURN_URL), "POST", {email,password,data:{full_name:form.elements.name.value.trim()}});
      notice("auth-message", "Prüfen Sie Ihr E-Mail-Postfach und bestätigen Sie Ihr Konto. Danach können Sie sich anmelden.");
      form.reset();
    } else if (mode === "reset") {
      await call("/auth/v1/recover?redirect_to=" + encodeURIComponent(RETURN_URL), "POST", {email});
      notice("auth-message", "Falls ein Konto besteht, erhalten Sie eine E-Mail zum Zurücksetzen des Passworts.");
    } else {
      await call("/auth/v1/user", "PUT", {password}, await token());
      form.reset();
      setMode("login");
      notice("auth-message", "Passwort geändert. Bitte melden Sie sich an.");
      setSession(null);
    }
  } catch (error) { notice("auth-message", statusError(error), true); }
  finally { button.disabled = false; }
});
$("logout").addEventListener("click", async () => {
  try { await call("/auth/v1/logout", "POST", null, await token()); } catch {}
  setSession(null);
  showAccess();
});
async function init() {
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    if (fragment.get("type") === "recovery" && fragment.get("access_token")) {
      setSession({access_token:fragment.get("access_token"),refresh_token:fragment.get("refresh_token"),expires_at:Math.floor(Date.now()/1000)+Number(fragment.get("expires_in")||3600)});
      history.replaceState(null, "", location.pathname);
      setMode("update");
      notice("auth-message", "Legen Sie jetzt ein neues Passwort fest.");
      return;
    }
    if (fragment.get("access_token") && fragment.get("type") !== "recovery") {
      setSession({access_token:fragment.get("access_token"),refresh_token:fragment.get("refresh_token"),expires_at:Math.floor(Date.now()/1000)+Number(fragment.get("expires_in")||3600)});
      history.replaceState(null, "", location.pathname);
    }
    if (!session) session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (session) await showDashboard();
  } catch (error) {
    setSession(null);
    showAccess();
    notice("auth-message", "Bitte melden Sie sich an.", true);
  }
}
init();

async function records(table, columns) {
  return call("/rest/v1/" + table + "?select=" + encodeURIComponent(columns) + "&order=created_at.desc", "GET", null, await token());
}
async function insert(table, data) {
  const response = await fetch(API + "/rest/v1/" + table, {
    method: "POST",
    headers: {
      apikey: KEY, Authorization: "Bearer " + await token(),
      "Content-Type": "application/json", Prefer: "return=minimal"
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(statusError(data));
  }
}
function item(primary, secondary) {
  const li = document.createElement("li");
  li.textContent = primary;
  const small = document.createElement("small");
  small.textContent = secondary;
  li.append(small);
  return li;
}
function renderList(list, rows, format) {
  list.replaceChildren();
  if (!rows.length) list.append(item("Noch keine Einträge", ""));
  else rows.forEach(row => list.append(format(row)));
}
async function reload() {
  const [planes, requests] = await Promise.all([
    records("pjd_aircraft", "id,model_id,registration,airport,archived"),
    records("pjd_requests", "id,aircraft_id,services,airport,requested_date,status,created_at")
  ]);
  aircraft = planes.filter(plane => !plane.archived);
  renderList($("aircraft-list"), aircraft, plane => item(plane.registration + " · " + plane.model_id, plane.airport));
  $("aircraft-select").replaceChildren(new Option("Bitte wählen", ""));
  aircraft.forEach(plane => $("aircraft-select").add(new Option(plane.registration + " · " + plane.model_id, plane.id)));
  renderList($("request-list"), requests, request => item(request.services.join(", ") + " · " + request.airport, request.requested_date + " · " + ({requested:"Angefragt",confirmed:"Bestätigt",completed:"Abgeschlossen",cancelled:"Storniert"}[request.status] || request.status)));
}
$("aircraft-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const current = await user();
    await insert("pjd_aircraft", {
      owner_id: current.id, model_id: form.elements.model.value.trim(),
      registration: form.elements.registration.value.trim().toUpperCase(),
      airport: form.elements.airport.value.trim(), notes: "", interval_days: 30
    });
    form.reset();
    await reload();
    notice("portal-message", "Flugzeug hinzugefügt.");
  } catch (error) { notice("portal-message", statusError(error), true); }
  finally { button.disabled = false; }
});
$("request-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const current = await user();
    await insert("pjd_requests", {
      owner_id: current.id, aircraft_id: form.elements.aircraft_id.value,
      idempotency_key: crypto.randomUUID(), airport: form.elements.location.value.trim(),
      requested_date: form.elements.requested_date.value,
      services: [form.elements.service.value], notes: form.elements.notes.value.trim()
    });
    form.reset();
    await reload();
    notice("portal-message", "Ihre Anfrage wurde im Kundenportal gespeichert.");
  } catch (error) { notice("portal-message", statusError(error), true); }
  finally { button.disabled = false; }
});
