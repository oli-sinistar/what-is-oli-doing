(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const I18N = {
    en: {
      title: "What is Oli doing?",
      focus: "Current focus",
      goals: "Goals",
      now: "Now",
      story: "The deep dive",
      ship: "Recently shipped",
      shot: "On screen",
      pulse: "Pulse",
      noShot: "No fresh capture today",
      captured: (d) => `captured ${d}`,
      updatedMin: (m) => `updated ${m} min ago`,
      updatedH: (h) => `updated ${h} h ago`,
      updatedD: (d) => `updated ${d} d ago`,
      justNow: "updated just now",
      stale: "· may be stale",
      commits: "commits 7d",
      sessions: "sessions",
      closed: "closed",
      vsWeek: "w/w",
      streak: (n) => `🔥 ${n}-day streak`,
      heatLabel: "Commit activity — last 13 weeks",
      commitWord: (n) => `${n} commit${n === 1 ? "" : "s"}`,
      onTrack: "on track",
      atRisk: "at risk",
      goalDone: "done",
      etaThisWeek: "closes this week",
      etaNextWeek: "next week",
      etaOngoing: "ongoing",
      etaShipped: "shipped",
      sumClosing: (n, d) => `${n} closing by ${d}`,
      sumOngoing: (n) => `${n} ongoing`,
      sumShipped: (n) => `${n} shipped`,
    },
    fr: {
      title: "Que fait Oli?",
      focus: "Focus actuel",
      goals: "Objectifs",
      now: "En ce moment",
      story: "En profondeur",
      ship: "Livré récemment",
      shot: "À l'écran",
      pulse: "Pouls",
      noShot: "Pas de capture aujourd'hui",
      captured: (d) => `capturé le ${d}`,
      updatedMin: (m) => `mis à jour il y a ${m} min`,
      updatedH: (h) => `mis à jour il y a ${h} h`,
      updatedD: (d) => `mis à jour il y a ${d} j`,
      justNow: "mis à jour à l'instant",
      stale: "· possiblement périmé",
      commits: "commits 7j",
      sessions: "sessions",
      closed: "réglés",
      vsWeek: "s/s",
      streak: (n) => `🔥 série de ${n} jours`,
      heatLabel: "Activité de commits — 13 dernières semaines",
      commitWord: (n) => `${n} commit${n === 1 ? "" : "s"}`,
      onTrack: "en bonne voie",
      atRisk: "à risque",
      goalDone: "atteint",
      etaThisWeek: "clôture cette semaine",
      etaNextWeek: "semaine prochaine",
      etaOngoing: "en continu",
      etaShipped: "livré",
      sumClosing: (n, d) => `${n} à clôturer d'ici ${d}`,
      sumOngoing: (n) => `${n} en cours`,
      sumShipped: (n) => `${n} livré${n === 1 ? "" : "s"}`,
    },
  };

  const TONE_COLORS = {
    shipping: "#34d399",
    building: "#7c8cff",
    debugging: "#f2c94c",
    thinking: "#a855f7",
    off: "#98a2b3",
  };
  const STATE_COLORS = {
    backlog: "#7a8599",
    todo: "#d5dbe7",
    started: "#f2c94c",
    review: "#4cb782",
    done: "#5e6ad2",
    canceled: "#ef6363",
  };
  const GOAL_COLORS = { "on-track": "#34d399", "at-risk": "#fbbf24", done: "#818cf8" };
  const GOAL_LABEL_KEYS = { "on-track": "onTrack", "at-risk": "atRisk", done: "goalDone" };

  let lang = localStorage.getItem("oli.lang");
  if (lang !== "en" && lang !== "fr") {
    lang = (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
  }
  let data = null;
  let firstRender = true;

  const L = (leaf) => (leaf && typeof leaf === "object" ? leaf[lang] || leaf.en || "" : "");
  const t = (key) => I18N[lang][key];
  const locale = () => (lang === "fr" ? "fr-CA" : "en-US");
  const fmtDay = (ymd) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString(locale(), { month: "short", day: "numeric" });

  /* ---------- chrome ---------- */

  function renderChrome() {
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    $("lang-en").setAttribute("aria-pressed", String(lang === "en"));
    $("lang-fr").setAttribute("aria-pressed", String(lang === "fr"));
  }

  function renderStatus() {
    const s = data.status;
    const pill = $("status-pill");
    pill.style.setProperty("--tone", TONE_COLORS[s.tone] || TONE_COLORS.building);
    pill.textContent = `${s.emoji} ${L(s.text)}`;
    $("flair").textContent = L(data.flair.line);
  }

  function renderFreshness() {
    if (!data) return;
    const el = $("freshness");
    const mins = Math.max(0, Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000));
    let label;
    if (mins < 2) label = t("justNow");
    else if (mins < 60) label = t("updatedMin")(mins);
    else if (mins < 48 * 60) label = t("updatedH")(Math.round(mins / 60));
    else label = t("updatedD")(Math.round(mins / (60 * 24)));
    el.classList.toggle("stale", mins > 36 * 60 && mins <= 72 * 60);
    el.classList.toggle("dead", mins > 72 * 60);
    el.textContent = mins > 36 * 60 ? `${label} ${t("stale")}` : label;
  }

  function startClock() {
    const el = $("clock");
    const tick = () => {
      el.textContent =
        new Date().toLocaleTimeString("en-CA", { hour12: false, timeZone: "America/Toronto" }) + " · QC";
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- cards ---------- */

  function renderFocus() {
    $("focus-title").textContent = L(data.focus.title);
    $("focus-blurb").textContent = L(data.focus.blurb);
    const link = $("focus-link");
    const top = (data.now || []).find((n) => n.linear);
    if (top) {
      link.hidden = false;
      link.href = top.linear.url;
      link.textContent = `↗ ${top.linear.id}`;
    } else {
      link.hidden = true;
    }
  }

  function renderShot() {
    const body = $("shot-body");
    body.querySelectorAll("img, .shot-placeholder").forEach((n) => n.remove());
    const badge = $("shot-badge");
    const shot = data.screenshot;
    if (!shot) {
      $("shot-caption").textContent = "—";
      badge.hidden = true;
      const ph = document.createElement("div");
      ph.className = "shot-placeholder";
      ph.textContent = t("noShot");
      body.appendChild(ph);
      return;
    }
    $("shot-caption").textContent = L(shot.caption);
    const img = document.createElement("img");
    img.src = `${shot.src}?v=${encodeURIComponent(shot.capturedAt)}`;
    img.alt = L(shot.caption);
    body.prepend(img);
    const capDay = shot.capturedAt.slice(0, 10);
    badge.hidden = false;
    badge.textContent = t("captured")(fmtDay(capDay));
    badge.classList.toggle("stale", capDay < data.updatedAt.slice(0, 10));
  }

  function ringSvg(progress, color) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "goal-ring");
    svg.setAttribute("viewBox", "0 0 62 62");
    const C = 2 * Math.PI * 26;
    const mk = (cls) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", "31");
      c.setAttribute("cy", "31");
      c.setAttribute("r", "26");
      c.setAttribute("fill", "none");
      c.setAttribute("stroke-width", "5");
      c.setAttribute("stroke-linecap", "round");
      c.setAttribute("class", cls);
      return c;
    };
    const track = mk("track");
    const bar = mk("bar");
    bar.setAttribute("transform", "rotate(-90 31 31)");
    bar.setAttribute("stroke-dasharray", String(C));
    bar.setAttribute("stroke-dashoffset", String(C));
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", "31");
    label.setAttribute("y", "35");
    label.setAttribute("text-anchor", "middle");
    label.textContent = `${Math.round(progress * 100)}%`;
    svg.append(track, bar, label);
    const target = C * (1 - Math.min(1, Math.max(0, progress)));
    if (reduceMotion) bar.setAttribute("stroke-dashoffset", String(target));
    else requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute("stroke-dashoffset", String(target))));
    return svg;
  }

  function fridayOfWeek() {
    const d = new Date(data.updatedAt);
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
    return d.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" });
  }

  function etaChip(g) {
    const chip = document.createElement("span");
    chip.className = "goal-eta";
    if (g.state === "done") {
      chip.classList.add("eta-done");
      chip.textContent = `✓ ${t("etaShipped")}`;
    } else if (g.eta === "this-week") {
      chip.classList.add(g.state === "at-risk" ? "eta-risk" : "eta-now");
      chip.textContent = `${g.state === "at-risk" ? "⚠" : "⚑"} ${t("etaThisWeek")}`;
    } else {
      chip.classList.add(g.state === "at-risk" ? "eta-risk" : "eta-later");
      chip.textContent = g.state === "at-risk" ? `⚠ ${t("atRisk")}` : t(g.eta === "next-week" ? "etaNextWeek" : "etaOngoing");
    }
    return chip;
  }

  function renderGoals() {
    const ul = $("goals-list");
    ul.textContent = "";
    const rank = (g) => (g.state === "done" ? 3 : { "this-week": 0, "next-week": 1, later: 2 }[g.eta] ?? 2);
    const goals = [...(data.goals || [])].sort((a, b) => rank(a) - rank(b));

    const closing = goals.filter((g) => g.state !== "done" && g.eta === "this-week").length;
    const shipped = goals.filter((g) => g.state === "done").length;
    const ongoing = goals.length - closing - shipped;
    $("goals-summary").textContent = [
      closing ? t("sumClosing")(closing, fridayOfWeek()) : null,
      ongoing ? t("sumOngoing")(ongoing) : null,
      shipped ? t("sumShipped")(shipped) : null,
    ]
      .filter(Boolean)
      .join(" · ");

    goals.forEach((g) => {
      const li = document.createElement("li");
      const color = GOAL_COLORS[g.state] || GOAL_COLORS["on-track"];
      li.style.setProperty("--gc", color);
      const row = document.createElement("div");
      row.className = "goal-row";
      row.appendChild(ringSvg(g.progress, color));
      const meta = document.createElement("div");
      meta.className = "goal-meta";
      const label = document.createElement(g.linear ? "a" : "span");
      label.className = "goal-label";
      label.textContent = L(g.label);
      if (g.linear) {
        label.href = g.linear.url;
        label.target = "_blank";
        label.rel = "noopener";
      }
      meta.append(label, etaChip(g));
      row.appendChild(meta);
      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function renderNow() {
    const ul = $("now-list");
    ul.textContent = "";
    (data.now || []).forEach((n) => {
      const li = document.createElement("li");
      const row = document.createElement(n.linear ? "a" : "div");
      row.className = "now-row";
      const stateColor = n.linear ? STATE_COLORS[n.linear.state] || STATE_COLORS.backlog : null;
      if (stateColor) row.style.setProperty("--sc", stateColor);
      if (n.linear) {
        row.href = n.linear.url;
        row.target = "_blank";
        row.rel = "noopener";
      }
      const dot = document.createElement("span");
      dot.className = "now-dot";
      row.appendChild(dot);
      if (n.linear) {
        const id = document.createElement("span");
        id.className = "now-id mono";
        id.textContent = n.linear.id;
        row.appendChild(id);
      }
      const title = document.createElement("span");
      title.className = "now-title";
      title.textContent = L(n.text);
      row.appendChild(title);
      if (n.linear) {
        const chip = document.createElement("span");
        chip.className = "now-state";
        chip.textContent = L(n.linear.stateLabel);
        row.appendChild(chip);
      }
      li.appendChild(row);
      ul.appendChild(li);
    });
  }

  function renderStory(typewrite) {
    const el = $("story-text");
    el.textContent = "";
    const prompt = document.createElement("span");
    prompt.className = "prompt";
    prompt.textContent = "❯ ";
    const textNode = document.createTextNode("");
    const caret = document.createElement("span");
    caret.className = "caret";
    el.append(prompt, textNode, caret);
    const full = L(data.story.text);
    if (!typewrite || reduceMotion) {
      textNode.nodeValue = full;
      return;
    }
    let i = 0;
    const step = () => {
      i = Math.min(full.length, i + 2);
      textNode.nodeValue = full.slice(0, i);
      if (i < full.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderShip() {
    const ticker = $("ticker");
    const box = $("ship-chips");
    ticker.classList.remove("marquee");
    box.textContent = "";
    const mkChip = (s) => {
      const chip = document.createElement("span");
      chip.className = "ship-chip";
      const glyph = document.createElement("span");
      glyph.className = "glyph";
      glyph.textContent = "✦";
      const txt = document.createElement("span");
      txt.className = "txt";
      txt.textContent = L(s.text);
      const when = document.createElement("span");
      when.className = "when mono";
      when.textContent = fmtDay(s.date);
      chip.append(glyph, txt, when);
      return chip;
    };
    (data.shipped || []).forEach((s) => box.appendChild(mkChip(s)));
    if (reduceMotion) return;
    requestAnimationFrame(() => {
      if (box.scrollWidth > ticker.clientWidth + 8) {
        (data.shipped || []).forEach((s) => box.appendChild(mkChip(s)));
        ticker.classList.add("marquee");
      }
    });
  }

  /* ---------- pulse: heatmap + stats ---------- */

  const level = (n) => (n === 0 ? "" : n === 1 ? "l1" : n <= 3 ? "l2" : n <= 6 ? "l3" : "l4");

  function renderHeatmap() {
    const grid = $("heatmap");
    grid.textContent = "";
    grid.setAttribute("aria-label", t("heatLabel"));
    const cal = data.activity.calendar;
    const lead = new Date(`${cal[0].date}T12:00:00`).getDay();
    for (let i = 0; i < lead; i++) {
      const cell = document.createElement("span");
      cell.className = "hm-cell empty";
      grid.appendChild(cell);
    }
    cal.forEach((d, i) => {
      const cell = document.createElement("span");
      cell.className = `hm-cell ${level(d.commits)}${i === cal.length - 1 ? " today" : ""}`;
      const day = new Date(`${d.date}T12:00:00`);
      cell.title = `${day.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" })} — ${t("commitWord")(d.commits)}`;
      grid.appendChild(cell);
    });
  }

  function countUp(el, target) {
    if (reduceMotion || target === 0) {
      el.textContent = target;
      return;
    }
    const start = performance.now();
    const dur = 900;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderPulse() {
    renderHeatmap();
    const cal = data.activity.calendar;
    const last7 = cal.slice(-7).reduce((s, d) => s + d.commits, 0);
    const prev7 = cal.slice(-14, -7).reduce((s, d) => s + d.commits, 0);

    let streak = 0;
    let idx = cal.length - 1;
    if (cal[idx].commits === 0) idx--; // grace: today may not have commits yet
    while (idx >= 0 && cal[idx].commits > 0) {
      streak++;
      idx--;
    }

    const stats = $("pulse-stats");
    stats.textContent = "";
    const rows = [
      [last7, t("commits"), prev7 > 0 || last7 > 0 ? { prev7, last7 } : null],
      [data.activity.sessions7d, t("sessions"), null],
      [data.activity.issuesClosed7d, t("closed"), null],
    ];
    rows.forEach(([val, lbl, delta]) => {
      const div = document.createElement("div");
      div.className = "pulse-stat";
      const v = document.createElement("span");
      v.className = "val";
      const l = document.createElement("span");
      l.className = "lbl";
      l.textContent = lbl;
      div.append(v, l);
      if (delta && delta.prev7 > 0) {
        const pct = Math.round(((delta.last7 - delta.prev7) / delta.prev7) * 100);
        if (pct !== 0) {
          const d = document.createElement("span");
          d.className = `delta ${pct > 0 ? "up" : "down"}`;
          d.textContent = `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% ${t("vsWeek")}`;
          div.appendChild(d);
        }
      }
      stats.appendChild(div);
      countUp(v, val);
    });
    if (streak >= 2) {
      const s = document.createElement("div");
      s.className = "streak";
      s.textContent = t("streak")(streak);
      stats.appendChild(s);
    }
  }

  /* ---------- fx ---------- */

  function startSpotlight() {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const cards = Array.from(document.querySelectorAll(".card"));
    let raf = null;
    document.addEventListener("mousemove", (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        for (const card of cards) {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${e.clientX - r.left}px`);
          card.style.setProperty("--my", `${e.clientY - r.top}px`);
        }
      });
    });
  }

  function startParticles() {
    if (reduceMotion || window.innerWidth < 769) return;
    const canvas = $("fx");
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W, H, pts;
    const N = 60;
    const hue = () => getComputedStyle(document.documentElement).getPropertyValue("--hue").trim() || "262";

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const seed = () => {
      pts = Array.from({ length: N }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: 1 + Math.random() * 1.3,
      }));
    };
    resize();
    seed();
    window.addEventListener("resize", () => resize());

    const frame = () => {
      if (document.hidden) {
        requestAnimationFrame(frame);
        return;
      }
      ctx.clearRect(0, 0, W, H);
      const h = hue();
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `oklch(0.78 0.12 ${h} / 0.5)`;
        ctx.fill();
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 12100) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `oklch(0.75 0.12 ${h} / ${0.11 * (1 - d2 / 12100)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- orchestration ---------- */

  function render() {
    renderChrome();
    renderStatus();
    renderFreshness();
    renderFocus();
    renderShot();
    renderGoals();
    renderNow();
    renderStory(firstRender);
    renderShip();
    renderPulse();
    const app = $("app");
    app.setAttribute("aria-busy", "false");
    if (firstRender) {
      document.querySelectorAll(".layout > .card").forEach((c, i) => c.style.setProperty("--i", i));
      if (!reduceMotion) app.classList.add("enter");
      firstRender = false;
    }
  }

  function setLang(next) {
    if (next === lang) return;
    lang = next;
    localStorage.setItem("oli.lang", lang);
    if (data) render();
    else renderChrome();
  }

  $("lang-en").addEventListener("click", () => setLang("en"));
  $("lang-fr").addEventListener("click", () => setLang("fr"));

  async function load() {
    try {
      const res = await fetch("status.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      if (data.version !== 3) throw new Error(`unknown schema version ${data.version}`);
      document.documentElement.style.setProperty("--hue", String(data.theme.hue));
      render();
    } catch (e) {
      console.error("status load failed:", e);
      $("error-overlay").hidden = false;
    }
  }

  renderChrome();
  startClock();
  startSpotlight();
  startParticles();
  load();
  setInterval(renderFreshness, 60000);
})();
