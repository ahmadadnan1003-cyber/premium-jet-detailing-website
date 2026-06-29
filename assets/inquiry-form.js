(function () {
  if (window.__pjdInquiryFormInstalled) return;
  window.__pjdInquiryFormInstalled = true;

  var SUCCESS_MESSAGE = "Thank you. Your inquiry has been sent successfully. We will respond as soon as possible.";
  var ERROR_MESSAGE = "Something went wrong. Please email us directly at info@premiumjetdetailing.de.";

  function addStyles() {
    if (document.getElementById("pjd-inquiry-form-styles")) return;

    var style = document.createElement("style");
    style.id = "pjd-inquiry-form-styles";
    style.textContent = [
      ".inquiry-honeypot{position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;}",
      ".form-status{margin-top:14px;color:var(--text,#d9d0c2);font-size:.95rem;line-height:1.55;}",
      ".form-status.success{color:var(--gold-soft,#efd28d);}",
      ".form-status.error{color:var(--text,#d9d0c2);}",
      ".form-status[hidden]{display:none;}",
      "button[disabled]{cursor:wait;opacity:.72;}"
    ].join("");
    document.head.appendChild(style);
  }

  function getValue(formData, names) {
    for (var i = 0; i < names.length; i += 1) {
      var value = formData.get(names[i]);
      if (value) return String(value).trim();
    }
    return "";
  }

  function buildPayload(form) {
    var formData = new FormData(form);

    return {
      name: getValue(formData, ["name", "Name"]),
      company: getValue(formData, ["company", "Company"]),
      email: getValue(formData, ["email", "Email"]),
      phone: getValue(formData, ["phone", "Phone / WhatsApp"]),
      aircraftType: getValue(formData, ["aircraftType", "aircraft", "Aircraft type"]),
      aircraftRegistration: getValue(formData, ["aircraftRegistration", "registration"]),
      location: getValue(formData, ["location", "Location / airport"]),
      preferredTime: getValue(formData, ["preferredTime", "time", "Preferred time window"]),
      service: getValue(formData, ["service", "Requested service"]),
      message: getValue(formData, ["message", "Message"]),
      website: getValue(formData, ["website"]),
      sourcePage: window.location.pathname || "/"
    };
  }

  function ensureHoneypot(form) {
    if (form.querySelector('[name="website"]')) return;

    var label = document.createElement("label");
    label.className = "inquiry-honeypot";
    label.setAttribute("aria-hidden", "true");
    label.textContent = "Website";

    var input = document.createElement("input");
    input.type = "text";
    input.name = "website";
    input.tabIndex = -1;
    input.autocomplete = "off";

    label.appendChild(input);
    form.appendChild(label);
  }

  function ensureStatus(form) {
    var status = form.querySelector(".form-status");
    if (status) return status;

    status = document.createElement("p");
    status.className = "form-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    form.appendChild(status);
    return status;
  }

  function setStatus(status, type, message) {
    status.className = "form-status " + type;
    status.textContent = message;
    status.hidden = false;
  }

  function setSending(form, isSending) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;

    if (isSending) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Sending...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    }
  }

  async function submitInquiry(form, status) {
    var payload = buildPayload(form);

    var response = await fetch("/api/send-inquiry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    var result = await response.json().catch(function () {
      return { ok: false };
    });

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Inquiry could not be sent.");
    }

    form.reset();
    setStatus(status, "success", SUCCESS_MESSAGE);

    document.dispatchEvent(new CustomEvent("pjd:request_quote_submit_success", {
      detail: {
        form_id: form.id || "",
        requested_service: payload.service || "",
        link_url: window.location.href
      }
    }));
  }

  function setupForm(form) {
    addStyles();
    ensureHoneypot(form);

    var status = ensureStatus(form);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (!form.reportValidity()) return;

      setSending(form, true);
      status.hidden = true;

      try {
        await submitInquiry(form, status);
      } catch (error) {
        setStatus(status, "error", ERROR_MESSAGE);
      } finally {
        setSending(form, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("#bookingForm, #quoteForm").forEach(setupForm);
  });
}());
