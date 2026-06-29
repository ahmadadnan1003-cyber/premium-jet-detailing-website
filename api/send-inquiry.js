const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_FIELD_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitStore = globalThis.__pjdInquiryRateLimit || new Map();
globalThis.__pjdInquiryRateLimit = rateLimitStore;

const FIELD_LABELS = {
  name: "Name",
  company: "Company",
  email: "Email",
  phone: "Phone / WhatsApp",
  aircraftType: "Aircraft type",
  aircraftRegistration: "Aircraft registration",
  location: "Location / airport",
  preferredTime: "Preferred time window",
  service: "Requested service",
  message: "Message",
  sourcePage: "Source page"
};

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sanitize(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getEmailConfig() {
  const config = {
    apiKey: process.env.RESEND_API_KEY,
    toEmail: process.env.INQUIRY_TO_EMAIL,
    fromEmail: process.env.INQUIRY_FROM_EMAIL
  };

  const missing = [];
  if (!config.apiKey) missing.push("RESEND_API_KEY");
  if (!config.toEmail) missing.push("INQUIRY_TO_EMAIL");
  if (!config.fromEmail) missing.push("INQUIRY_FROM_EMAIL");

  if (missing.length) {
    console.error("Inquiry API missing required environment variables:", missing.join(", "));
    return { ok: false };
  }

  const invalid = [];
  if (!isEmail(config.toEmail)) invalid.push("INQUIRY_TO_EMAIL");
  if (!isEmail(config.fromEmail)) invalid.push("INQUIRY_FROM_EMAIL");

  if (invalid.length) {
    console.error("Inquiry API has invalid email environment variables:", invalid.join(", "));
    return { ok: false };
  }

  return { ok: true, ...config };
}

function buildPayload(body) {
  const data = {
    name: sanitize(body.name || body.Name),
    company: sanitize(body.company || body.Company),
    email: sanitize(body.email || body.Email),
    phone: sanitize(body.phone || body["Phone / WhatsApp"]),
    aircraftType: sanitize(body.aircraftType || body.aircraft || body["Aircraft type"]),
    aircraftRegistration: sanitize(body.aircraftRegistration || body.registration),
    location: sanitize(body.location || body["Location / airport"]),
    preferredTime: sanitize(body.preferredTime || body.time || body["Preferred time window"]),
    service: sanitize(body.service || body["Requested service"]),
    message: sanitize(body.message || body.Message),
    sourcePage: sanitize(body.sourcePage),
    website: sanitize(body.website)
  };

  return data;
}

function validate(data) {
  if (data.website) return "Spam submission rejected.";
  if (!data.name || !data.email || !data.aircraftType || !data.location || !data.preferredTime) {
    return "Please complete all required fields.";
  }
  if (!isEmail(data.email)) return "Please enter a valid email address.";
  return "";
}

function rateLimitKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(req) {
  const now = Date.now();
  const key = rateLimitKey(req);
  const current = rateLimitStore.get(key) || [];
  const recent = current.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(key, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(key, recent);
  return false;
}

function formatEmail(data) {
  const lines = Object.entries(FIELD_LABELS).map(([key, label]) => {
    return `${label}: ${data[key] || "-"}`;
  });

  return [
    "New aircraft detailing inquiry received from premiumjetdetailing.de.",
    "",
    ...lines,
    "",
    "Reply-to:",
    data.email
  ].join("\n");
}

function formatHtml(data) {
  const rows = Object.entries(FIELD_LABELS).map(([key, label]) => {
    const value = String(data[key] || "-").replace(/\n/g, "<br>");
    return `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #eee;">${label}</th><td style="padding:8px 12px;border-bottom:1px solid #eee;">${value}</td></tr>`;
  }).join("");

  return `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
    <h2>New Aircraft Detailing Inquiry</h2>
    <p>New inquiry received from premiumjetdetailing.de.</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:720px;">${rows}</table>
  </body>
</html>`;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  if (isRateLimited(req)) {
    return json(res, 429, { ok: false, error: "Too many requests. Please try again later." });
  }

  try {
    const emailConfig = getEmailConfig();

    if (!emailConfig.ok) {
      return json(res, 500, { ok: false, error: "Email service is not configured." });
    }

    const body = await readBody(req);
    const data = buildPayload(body);
    const validationError = validate(data);

    if (validationError) {
      return json(res, 400, { ok: false, error: validationError });
    }

    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${emailConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Premium Jet Detailing <${emailConfig.fromEmail}>`,
        to: [emailConfig.toEmail],
        reply_to: data.email,
        subject: "New Aircraft Detailing Inquiry – Premium Jet Detailing",
        text: formatEmail(data),
        html: formatHtml(data)
      })
    });

    if (!resendResponse.ok) {
      const details = await resendResponse.text();
      console.error("Resend error:", details);
      return json(res, 502, { ok: false, error: "Email could not be sent." });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Inquiry API error:", error);
    return json(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
