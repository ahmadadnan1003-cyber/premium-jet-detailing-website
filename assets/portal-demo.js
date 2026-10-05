(function () {
  "use strict";

  var STORAGE_KEY = "pjd_private_portal_demo_fleet_v1";
  var requestCount = 1;
  var renderers = [];
  var toastTimer;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function dateOffset(days) {
    var value = new Date();
    value.setHours(12, 0, 0, 0);
    value.setDate(value.getDate() + days);
    return value.toISOString().slice(0, 10);
  }

  var defaultFleet = [
    {
      id: "global-7500",
      manufacturer: "Bombardier",
      model: "Global 7500",
      registration: "D-APJD",
      category: "Ultra long range",
      airport: "EDDB / BER",
      finish: "Leather & veneer",
      hours: 42,
      lastService: dateOffset(-37),
      nextService: dateOffset(8),
      status: "Service ready",
      score: 88
    },
    {
      id: "gulfstream-g650er",
      manufacturer: "Gulfstream",
      model: "G650ER",
      registration: "9H-PLJ",
      category: "Ultra long range",
      airport: "EDAV / Finow",
      finish: "Mixed premium cabin",
      hours: 31,
      lastService: dateOffset(-19),
      nextService: dateOffset(24),
      status: "Excellent",
      score: 96
    },
    {
      id: "challenger-350",
      manufacturer: "Bombardier",
      model: "Challenger 350",
      registration: "D-CJET",
      category: "Super midsize",
      airport: "EDDB / BER",
      finish: "Leather & textile",
      hours: 24,
      lastService: dateOffset(-12),
      nextService: dateOffset(34),
      status: "Excellent",
      score: 97
    }
  ];

  function loadFleet() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      return Array.isArray(saved) && saved.length ? saved : defaultFleet;
    } catch (error) {
      return defaultFleet;
    }
  }

  var fleet = loadFleet();

  function saveFleet() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fleet));
    } catch (error) {
      // The prototype remains usable when storage is unavailable.
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function daysFromNow(value) {
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var target = new Date(value + "T12:00:00");
    return Math.round((target - now) / 86400000);
  }

  function formatDate(value, style) {
    var date = new Date(value + "T12:00:00");
    return new Intl.DateTimeFormat("en-GB", style || { day: "numeric", month: "short", year: "numeric" }).format(date);
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
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

  function renderMetrics() {
    var sorted = fleet.slice().sort(function (a, b) {
      return daysFromNow(a.nextService) - daysFromNow(b.nextService);
    });
    var next = sorted[0];
    var average = Math.round(fleet.reduce(function (sum, aircraft) { return sum + Number(aircraft.score || 90); }, 0) / fleet.length);

    document.getElementById("fleet-count").textContent = fleet.length;
    document.getElementById("nav-fleet-count").textContent = fleet.length;
    document.getElementById("request-count").textContent = requestCount;
    document.getElementById("readiness-score").textContent = average;
    document.querySelector(".score-ring").style.setProperty("--score", average);
    if (next) {
      document.getElementById("next-service-days").textContent = Math.max(0, daysFromNow(next.nextService));
      document.getElementById("next-service-name").textContent = next.model + " · " + next.registration;
    }
  }

  function renderFleet() {
    renderers.forEach(function (renderer) { renderer.destroy(); });
    renderers = [];

    var grid = document.getElementById("fleet-grid");
    grid.innerHTML = fleet.map(function (aircraft, index) {
      var dueDays = daysFromNow(aircraft.nextService);
      var progress = Math.max(8, Math.min(100, Number(aircraft.score || 90)));
      return [
        '<article class="aircraft-card" data-aircraft-id="', escapeHtml(aircraft.id), '">',
          '<div class="aircraft-visual">',
            '<span class="aircraft-badge">Interactive 3D · Drag to rotate</span>',
            '<span class="aircraft-status ', dueDays <= 10 ? 'is-due' : '', '">', dueDays <= 10 ? 'Care due soon' : escapeHtml(aircraft.status), '</span>',
            '<canvas class="aircraft-canvas" data-model="', escapeHtml(aircraft.model), '" data-category="', escapeHtml(aircraft.category), '" aria-label="Animated 3D model of ', escapeHtml(aircraft.model), '"></canvas>',
          '</div>',
          '<div class="aircraft-body">',
            '<div class="aircraft-title-row"><div><h4>', escapeHtml(aircraft.manufacturer), ' ', escapeHtml(aircraft.model), '</h4><p>', escapeHtml(aircraft.registration), '</p></div><button class="aircraft-menu" type="button" aria-label="Aircraft options">•••</button></div>',
            '<div class="aircraft-meta">',
              '<span>Home base<strong>', escapeHtml(aircraft.airport), '</strong></span>',
              '<span>Last service<strong>', formatDate(aircraft.lastService, { day: "numeric", month: "short" }), '</strong></span>',
              '<span>Cabin profile<strong>', escapeHtml(aircraft.finish), '</strong></span>',
              '<span>Next care<strong>', dueDays <= 0 ? 'Due now' : 'In ' + dueDays + ' days', '</strong></span>',
            '</div>',
            '<div class="service-progress"><div><span>Care condition</span><strong>', progress, '%</strong></div><span class="progress-track"><i style="--progress:', progress, '%"></i></span></div>',
            '<div class="aircraft-actions"><button type="button" data-action="details" data-id="', escapeHtml(aircraft.id), '">View profile</button><button type="button" data-action="request" data-id="', escapeHtml(aircraft.id), '">Request care</button></div>',
          '</div>',
        '</article>'
      ].join("");
    }).join("");

    grid.querySelectorAll(".aircraft-canvas").forEach(function (canvas, index) {
      renderers.push(createAircraftRenderer(canvas, fleet[index]));
    });

    grid.querySelectorAll('[data-action="request"]').forEach(function (button) {
      button.addEventListener("click", function () { openRequest(button.dataset.id); });
    });
    grid.querySelectorAll('[data-action="details"]').forEach(function (button) {
      button.addEventListener("click", function () {
        var aircraft = fleet.find(function (item) { return item.id === button.dataset.id; });
        if (aircraft) showToast(aircraft.model + " care profile", "AI plan active · Next recommended care " + formatDate(aircraft.nextService) + ".");
      });
    });
    grid.querySelectorAll(".aircraft-menu").forEach(function (button) {
      button.addEventListener("click", function () { showToast("Aircraft options", "Editing, documents and team access will be available in the connected version."); });
    });

    populateAircraftSelect();
  }

  function renderIntelligence(isRefresh) {
    var feed = document.getElementById("ai-feed");
    var summary = document.getElementById("ai-summary");
    var sorted = fleet.slice().sort(function (a, b) { return daysFromNow(a.nextService) - daysFromNow(b.nextService); });
    var next = sorted[0];
    var due = next ? daysFromNow(next.nextService) : 0;
    var highUse = fleet.slice().sort(function (a, b) { return Number(b.hours) - Number(a.hours); })[0];
    var protectedCabins = fleet.filter(function (aircraft) { return /veneer|premium/i.test(aircraft.finish); }).length;

    summary.innerHTML = "Your fleet is in <strong>excellent presentation condition</strong>. " +
      (next ? escapeHtml(next.model) + " is the next aircraft requiring attention in " + Math.max(0, due) + " days." : "No upcoming care is currently due.");

    var insights = [];
    if (next) {
      insights.push({ icon: "✦", title: "Suggested service window", copy: next.model + " · " + formatDate(next.nextService) + " at " + next.airport, priority: due <= 10 ? "Priority" : "Planned" });
    }
    if (highUse) {
      insights.push({ icon: "↗", title: "Usage-based adjustment", copy: highUse.registration + " records " + highUse.hours + " flight hours/month. Cabin inspection frequency increased.", priority: "Automatic" });
    }
    insights.push({ icon: "◇", title: "Material protection", copy: protectedCabins + " premium cabin" + (protectedCabins === 1 ? " is" : "s are") + " monitored for leather and veneer care cycles.", priority: "Active" });

    feed.innerHTML = insights.map(function (insight) {
      return '<div class="ai-insight"><span class="insight-icon">' + insight.icon + '</span><div><strong>' + escapeHtml(insight.title) + '</strong><small>' + escapeHtml(insight.copy) + '</small></div><span class="insight-priority">' + escapeHtml(insight.priority) + '</span></div>';
    }).join("");

    if (isRefresh) showToast("Fleet analysis refreshed", "All " + fleet.length + " aircraft profiles were reviewed successfully.");
  }

  function renderTimeline() {
    var events = [
      { offset: -5, title: "Cabin presentation service", aircraft: "G650ER · 9H-PLJ", location: "EDAV / Finow", status: "Completed" },
      { offset: -19, title: "Leather & veneer care", aircraft: "Challenger 350 · D-CJET", location: "EDDB / BER", status: "Completed" },
      { offset: -37, title: "Full interior detailing", aircraft: "Global 7500 · D-APJD", location: "EDDB / BER", status: "Completed" }
    ];
    document.getElementById("service-timeline").innerHTML = events.map(function (event) {
      var date = new Date();
      date.setDate(date.getDate() + event.offset);
      var day = new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(date);
      var month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
      return '<div class="timeline-item"><span class="timeline-date"><span><strong>' + day + '</strong><small>' + month + '</small></span></span><div class="timeline-copy"><strong>' + escapeHtml(event.title) + '</strong><span>' + escapeHtml(event.aircraft) + '</span><small>' + escapeHtml(event.location) + '</small></div><span class="timeline-status">' + event.status + '</span></div>';
    }).join("");
  }

  function populateAircraftSelect(selectedId) {
    var select = document.getElementById("request-aircraft");
    select.innerHTML = fleet.map(function (aircraft) {
      return '<option value="' + escapeHtml(aircraft.id) + '"' + (aircraft.id === selectedId ? ' selected' : '') + '>' + escapeHtml(aircraft.manufacturer + " " + aircraft.model + " · " + aircraft.registration) + '</option>';
    }).join("");
  }

  function openRequest(id) {
    populateAircraftSelect(id);
    var form = document.getElementById("request-form");
    form.elements.date.value = dateOffset(3);
    openDialog(document.getElementById("request-dialog"));
  }

  function refreshDashboard(isRefresh) {
    renderMetrics();
    renderFleet();
    renderIntelligence(isRefresh);
  }

  function setupForms() {
    var registerDialog = document.getElementById("register-dialog");
    var requestDialog = document.getElementById("request-dialog");
    var registerForm = document.getElementById("register-form");
    var requestForm = document.getElementById("request-form");

    document.getElementById("open-register").addEventListener("click", function () {
      registerForm.elements.lastService.value = dateOffset(-15);
      openDialog(registerDialog);
    });
    document.getElementById("open-request").addEventListener("click", function () { openRequest(); });
    document.getElementById("mobile-request").addEventListener("click", function () { openRequest(); });

    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (event.submitter && event.submitter.value === "cancel") {
        closeDialog(registerDialog);
        return;
      }
      if (!registerForm.reportValidity()) return;

      var data = new FormData(registerForm);
      var hours = Number(data.get("hours") || 0);
      var interval = hours >= 40 ? 28 : hours >= 25 ? 38 : 48;
      var next = new Date(String(data.get("lastService")) + "T12:00:00");
      next.setDate(next.getDate() + interval);
      var model = String(data.get("model"));
      var aircraft = {
        id: slugify(model),
        manufacturer: String(data.get("manufacturer")),
        model: model,
        registration: String(data.get("registration")).toUpperCase(),
        category: String(data.get("category")),
        airport: String(data.get("airport")),
        finish: String(data.get("finish")),
        hours: hours,
        lastService: String(data.get("lastService")),
        nextService: next.toISOString().slice(0, 10),
        status: "Profile created",
        score: 94
      };
      fleet.push(aircraft);
      saveFleet();
      closeDialog(registerDialog);
      registerForm.reset();
      refreshDashboard(false);
      showToast(model + " registered", "3D model and intelligent care plan created automatically.");
      window.setTimeout(function () {
        document.querySelector('[data-aircraft-id="' + CSS.escape(aircraft.id) + '"]').scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      }, 250);
    });

    requestForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (event.submitter && event.submitter.value === "cancel") {
        closeDialog(requestDialog);
        return;
      }
      if (!requestForm.reportValidity()) return;
      var data = new FormData(requestForm);
      var aircraft = fleet.find(function (item) { return item.id === data.get("aircraft"); });
      var services = data.getAll("service");
      if (!services.length) {
        showToast("Select a service", "Choose at least one care service before sending the request.");
        return;
      }
      requestCount += 1;
      renderMetrics();
      closeDialog(requestDialog);
      showToast("Service request created", (aircraft ? aircraft.model : "Aircraft") + " · " + formatDate(String(data.get("date"))) + " · " + services.length + " services selected.");
    });

    [registerDialog, requestDialog].forEach(function (dialog) {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  function setupDemoNavigation() {
    document.querySelectorAll(".sidebar .nav-item:not(.is-active), .mobile-nav button:not(.mobile-request):not(.is-active)").forEach(function (button) {
      button.addEventListener("click", function () {
        showToast("Interactive demo", "This section will be connected in the full client portal.");
      });
    });
    document.getElementById("profile-button").addEventListener("click", function () {
      showToast("Private profile", "Account security, team roles and notification preferences will appear here.");
    });
    document.querySelectorAll(".timeline-panel .text-button").forEach(function (button) {
      button.addEventListener("click", function () { showToast("Service archive", "The full searchable service history is part of the next portal stage."); });
    });
    document.getElementById("refresh-intelligence").addEventListener("click", function () {
      var button = this;
      button.classList.add("is-thinking");
      window.setTimeout(function () {
        button.classList.remove("is-thinking");
        renderIntelligence(true);
      }, reducedMotion ? 10 : 900);
    });
  }

  function setupLogin() {
    var form = document.getElementById("login-form");
    var view = document.getElementById("login-view");
    var portal = document.getElementById("portal-shell");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      view.classList.add("is-leaving");
      portal.hidden = false;
      document.body.classList.remove("is-locked");
      window.setTimeout(function () {
        view.hidden = true;
        renderers.forEach(function (renderer) { renderer.resize(); });
      }, reducedMotion ? 10 : 620);
    });
    form.querySelector(".text-button").addEventListener("click", function () {
      showToast("Demo sign-in", "Password recovery will be connected to verified customer accounts.");
    });
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

  updateToday();
  renderMetrics();
  renderFleet();
  renderIntelligence(false);
  renderTimeline();
  setupForms();
  setupDemoNavigation();
  setupLogin();

  window.addEventListener("resize", function () {
    renderers.forEach(function (renderer) { renderer.resize(); });
  });
})();
