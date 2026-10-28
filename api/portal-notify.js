const SUPABASE = "https://wfaqlfzrcvwgcfyhhymf.supabase.co";
const PUBLISHABLE = "sb_publishable_z9Uw29azzX3s68kqEOLRSQ_ziaUH3Pa";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function answer(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function supabase(path, bearer) {
  const response = await fetch(SUPABASE + path, {
    headers: { apikey: PUBLISHABLE, Authorization: "Bearer " + bearer }
  });
  if (!response.ok) throw new Error("Authentication or portal lookup failed");
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return answer(res, 405, {ok:false});
  const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || "")?.[1];
  if (!bearer) return answer(res, 401, {ok:false});
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch { return answer(res, 400, {ok:false}); }
  const id = body?.request_id;
  if (typeof id !== "string" || !UUID.test(id)) return answer(res, 400, {ok:false});
  if (!process.env.RESEND_API_KEY || !process.env.INQUIRY_TO_EMAIL || !process.env.INQUIRY_FROM_EMAIL) {
    console.error("Portal notification email configuration is missing");
    return answer(res, 503, {ok:false});
  }
  try {
    const user = await supabase("/auth/v1/user", bearer);
    if (!user.id || !user.email_confirmed_at) return answer(res, 401, {ok:false});
    const rows = await supabase("/rest/v1/pjd_requests?select=id,owner_id,aircraft_id,airport,requested_date,services,notes&" +
      "id=eq." + id + "&owner_id=eq." + user.id + "&limit=1", bearer);
    if (!Array.isArray(rows) || rows.length !== 1) return answer(res, 404, {ok:false});
    const request = rows[0];
    const planes = await supabase("/rest/v1/pjd_aircraft?select=registration,model_id&id=eq." +
      request.aircraft_id + "&owner_id=eq." + user.id + "&limit=1", bearer);
    if (!Array.isArray(planes) || planes.length !== 1) return answer(res, 404, {ok:false});
    const plane = planes[0];
    const text = [
      "Neue Kundenportal-Anfrage", "",
      "Anfrage-ID: " + request.id,
      "Kunde: " + user.email,
      "Flugzeug: " + plane.model_id,
      "Kennzeichen: " + plane.registration,
      "Flughafen: " + request.airport,
      "Wunschtermin: " + request.requested_date,
      "Leistungen: " + request.services.join(", "),
      "Nachricht: " + (request.notes || "-")
    ].join("\n");
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
        "Idempotency-Key": "portal-request/" + id
      },
      body: JSON.stringify({
        from: "Premium Jet Detailing <" + process.env.INQUIRY_FROM_EMAIL + ">",
        to: [process.env.INQUIRY_TO_EMAIL],
        reply_to: user.email,
        subject: "Neue Kundenportal-Anfrage · " + plane.registration,
        text
      })
    });
    if (!sent.ok) {
      console.error("Portal notification provider returned", sent.status);
      return answer(res, 502, {ok:false});
    }
    return answer(res, 200, {ok:true});
  } catch (error) {
    console.error("Portal notification failed:", error.message);
    return answer(res, 502, {ok:false});
  }
};
