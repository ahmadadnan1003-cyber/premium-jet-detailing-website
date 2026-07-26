(function () {
  "use strict";

  var STORAGE_KEY = "pjd_cookie_consent_v1";
  var MEASUREMENT_ID = "G-YQR0SWRRGS";
  var analyticsLoaded = false;

  function readChoice() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      return null;
    }
  }

  function saveChoice(analytics) {
    var choice = {
      necessary: true,
      analytics: Boolean(analytics),
      savedAt: new Date().toISOString()
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
    } catch (error) {
      // The choice remains valid for this page view if storage is unavailable.
    }

    return choice;
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  function removeAnalyticsCookies() {
    ["_ga", "_gid", "_gat"].forEach(function (name) {
      document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      document.cookie = name + "=; Max-Age=0; path=/; domain=." + window.location.hostname + "; SameSite=Lax";
    });

    document.cookie.split(";").forEach(function (part) {
      var name = part.split("=")[0].trim();
      if (name.indexOf("_ga_") === 0) {
        document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
        document.cookie = name + "=; Max-Age=0; path=/; domain=." + window.location.hostname + "; SameSite=Lax";
      }
    });
  }

  function createPanel() {
    var panel = document.createElement("section");
    panel.className = "pjd-consent";
    panel.id = "pjd-consent";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "pjd-consent-title");
    panel.innerHTML = [
      '<p class="pjd-consent__eyebrow">Privacy settings</p>',
      '<h2 id="pjd-consent-title">Your privacy. Your choice.</h2>',
      '<div data-consent-view="summary">',
      '<p>We use necessary storage for your privacy choice. Google Analytics is only activated if you agree. You can reject optional analytics without losing access to the website.</p>',
      '<p>Details are available in our <a href="/datenschutz">privacy policy</a>.</p>',
      '<div class="pjd-consent__actions">',
      '<button class="pjd-consent__button pjd-consent__button--primary" type="button" data-consent-action="accept">Accept all</button>',
      '<button class="pjd-consent__button" type="button" data-consent-action="reject">Reject all</button>',
      '<button class="pjd-consent__button" type="button" data-consent-action="settings">Settings</button>',
      "</div>",
      "</div>",
      '<div data-consent-view="settings" hidden>',
      '<p>Necessary storage is always active because it saves your privacy selection. Analytics remains optional.</p>',
      '<label class="pjd-consent__choice"><input type="checkbox" data-consent-analytics><span><strong>Google Analytics</strong><br>Helps us understand visits and improve the website.</span></label>',
      '<div class="pjd-consent__actions">',
      '<button class="pjd-consent__button pjd-consent__button--primary" type="button" data-consent-action="save">Save selection</button>',
      '<button class="pjd-consent__button" type="button" data-consent-action="reject">Reject all</button>',
      "</div>",
      "</div>"
    ].join("");

    document.body.appendChild(panel);
    return panel;
  }

  function setup() {
    var panel = createPanel();
    var summary = panel.querySelector('[data-consent-view="summary"]');
    var settings = panel.querySelector('[data-consent-view="settings"]');
    var analyticsCheckbox = panel.querySelector("[data-consent-analytics]");

    function showSummary() {
      summary.hidden = false;
      settings.hidden = true;
    }

    function showSettings() {
      var choice = readChoice();
      analyticsCheckbox.checked = Boolean(choice && choice.analytics);
      summary.hidden = true;
      settings.hidden = false;
      panel.hidden = false;
      analyticsCheckbox.focus();
    }

    function applyChoice(analytics) {
      saveChoice(analytics);
      if (analytics) {
        loadAnalytics();
      } else {
        removeAnalyticsCookies();
      }
      panel.hidden = true;
    }

    panel.addEventListener("click", function (event) {
      var button = event.target.closest("[data-consent-action]");
      if (!button) return;
      var action = button.getAttribute("data-consent-action");

      if (action === "accept") applyChoice(true);
      if (action === "reject") applyChoice(false);
      if (action === "settings") showSettings();
      if (action === "save") applyChoice(analyticsCheckbox.checked);
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-cookie-settings]")) {
        event.preventDefault();
        showSettings();
      }
    });

    window.openCookieSettings = showSettings;

    var choice = readChoice();
    if (!choice) {
      showSummary();
      panel.hidden = false;
    } else {
      panel.hidden = true;
      if (choice.analytics) loadAnalytics();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
}());
