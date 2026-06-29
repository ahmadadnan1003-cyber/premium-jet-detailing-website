(function () {
  if (window.__pjdLeadTrackingInstalled) return;
  window.__pjdLeadTrackingInstalled = true;

  var SERVICE_AREA = "Berlin / BER";
  var QUOTE_TEXT_PATTERN = /(Request Service|Request Availability|Request a Quote|Service anfragen|Verfuegbarkeit anfragen|Verfügbarkeit anfragen)/i;
  var CONTACT_TEXT_PATTERN = /(Contact|Kontakt)/i;
  var EMAIL_ADDRESS = "info@premiumjetdetailing.de";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function pagePath() {
    return window.location.pathname || "/";
  }

  function cleanText(element) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLinkUrl(element) {
    return element.href || element.getAttribute("href") || element.getAttribute("formaction") || "";
  }

  function isEmailLink(url) {
    if (!url) return false;

    try {
      var parsed = new URL(url, window.location.href);
      return parsed.protocol === "mailto:" && parsed.pathname.toLowerCase().indexOf(EMAIL_ADDRESS) === 0;
    } catch (error) {
      return url.toLowerCase().indexOf("mailto:" + EMAIL_ADDRESS) === 0;
    }
  }

  function sendEvent(eventName, params) {
    if (typeof window.gtag !== "function") return;

    window.gtag("event", eventName, Object.assign({
      page_path: pagePath(),
      service_area: SERVICE_AREA,
      transport_type: "beacon"
    }, params || {}));
  }

  window.pjdTrackLeadEvent = sendEvent;

  document.addEventListener("click", function (event) {
    if (!(event.target instanceof Element)) return;

    var target = event.target.closest("a, button");
    if (!target) return;

    var buttonText = cleanText(target);
    var linkUrl = getLinkUrl(target);

    if (QUOTE_TEXT_PATTERN.test(buttonText)) {
      sendEvent("request_quote_click", {
        button_text: buttonText,
        link_url: linkUrl
      });
      return;
    }

    if (isEmailLink(linkUrl)) {
      sendEvent("email_click", {
        button_text: buttonText,
        link_url: linkUrl
      });
      return;
    }

    if (CONTACT_TEXT_PATTERN.test(buttonText) || linkUrl.indexOf("#contact") !== -1) {
      sendEvent("contact_click", {
        button_text: buttonText,
        link_url: linkUrl
      });
    }
  }, true);

  document.addEventListener("pjd:request_quote_submit_success", function (event) {
    sendEvent("request_quote_submit", event.detail || {});
  });

  ready(function () {
    var normalizedPath = pagePath().replace(/\/$/, "");
    if (normalizedPath === "/request-quote" || normalizedPath === "/request-quote.html") {
      sendEvent("request_quote_page_view", {
        link_url: window.location.href
      });
    }
  });
}());
