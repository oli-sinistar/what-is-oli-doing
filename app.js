(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

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
      sparkLabel: "Commits over the last 7 days",
      commitWord: (n) => `${n} commit${n === 1 ? "" : "s"}`,
      onTrack: "on track",
      atRisk: "at risk",
      goalDone: "done",
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
      sparkLabel: "Commits des 7 derniers jours",
      commitWord: (n) => `${n} commit${n === 1 ? "" : "s"}`,
      onTrack: "en bonne voie",
      atRisk: "à risque",
      goalDone: "atteint",
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
  const GOAL_COLORS = {
    "on-track": "#34d399",
    "at-risk": "#fbbf24",
    done: "#818cf8",
  };
  const GOAL_LABEL_KEYS = { "on-track": "onTrack", "at-risk": "atRisk", done: "goalDone" };
  const BAR_PAST = "#5e6ad2";
  const BAR_TODAY = "#6f80fa";

  let lang = localStorage.getItem("oli.lang");
  if (lang !== "en" && lang !== "fr") {
    lang = (navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en";
  }
  let data = null;

  const L = (leaf) => (leaf && typeof leaf === "object" ? leaf[lang] || leaf.en || "" : "");
  const t = (key) => I18N[lang][key];
  const locale = () => (lang === "fr" ? "fr-CA" : "en-US");

  const fmtDay = (ymd) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString(locale(), { month: "short", day: "numeric" });

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

  function renderGoals() {
    const ul = $("goals-list");
    ul.textContent = "";
    (data.goals || []).forEach((g) => {
      const li = document.createElement("li");
      li.style.setProperty("--gc", GOAL_COLORS[g.state] || GOAL_COLORS["on-track"]);
      const head = document.createElement("div");
      head.className = "goal-head";
      const label = document.createElement("span");
      label.className = "goal-label";
      label.textContent = L(g.label);
      const state = document.createElement("span");
      state.className = "goal-state";
      state.textContent = t(GOAL_LABEL_KEYS[g.state] || "onTrack");
      head.append(label, state);
      const track = document.createElement("div");
      track.className = "goal-track";
      const fill = document.createElement("span");
      fill.className = "goal-fill";
      track.appendChild(fill);
      const pct = document.createElement("div");
      pct.className = "goal-pct mono";
      pct.textContent = `${Math.round(g.progress * 100)}%`;
      li.append(head, track, pct);
      ul.appendChild(li);
      requestAnimationFrame(() => {
        fill.style.width = `${Math.round(g.progress * 100)}%`;
      });
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

  function renderStory() {
    $("story-text").textContent = L(data.story.text);
  }

  function renderShip() {
    const box = $("ship-chips");
    box.textContent = "";
    (data.shipped || []).forEach((s) => {
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
      box.appendChild(chip);
    });
  }

  function roundedBar(x, y, w, h, r, base) {
    const rr = Math.min(r, w / 2, h);
    return `M${x},${base} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${base} Z`;
  }

  function renderPulse() {
    const svg = $("sparkline");
    svg.textContent = "";
    svg.setAttribute("aria-label", t("sparkLabel"));
    const days = data.activity.days;
    const W = 132, H = 48, bw = 12, gap = 8, base = H - 2, top = 4;
    const max = Math.max(1, ...days.map((d) => d.commits));
    const x0 = (W - (days.length * bw + (days.length - 1) * gap)) / 2;

    const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    baseline.setAttribute("x1", x0);
    baseline.setAttribute("x2", x0 + days.length * bw + (days.length - 1) * gap);
    baseline.setAttribute("y1", base + 1);
    baseline.setAttribute("y2", base + 1);
    baseline.setAttribute("stroke", "rgba(255,255,255,0.08)");
    baseline.setAttribute("stroke-width", "1");
    svg.appendChild(baseline);

    days.forEach((d, i) => {
      const isToday = i === days.length - 1;
      const day = new Date(`${d.date}T12:00:00`);
      const isWeekend = [0, 6].includes(day.getDay());
      const h = d.commits === 0 ? 2.5 : Math.max(3, (d.commits / max) * (base - top));
      const x = x0 + i * (bw + gap);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", roundedBar(x, base - h, bw, h, 3, base));
      path.setAttribute("fill", isToday ? BAR_TODAY : BAR_PAST);
      path.setAttribute("opacity", d.commits === 0 ? "0.3" : isWeekend && !isToday ? "0.45" : isToday ? "1" : "0.85");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${day.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" })} — ${t("commitWord")(d.commits)}`;
      path.appendChild(title);
      svg.appendChild(path);
    });

    const stats = $("pulse-stats");
    stats.textContent = "";
    const totalCommits = days.reduce((s, d) => s + d.commits, 0);
    [
      [totalCommits, t("commits")],
      [data.activity.sessions7d, t("sessions")],
      [data.activity.issuesClosed7d, t("closed")],
    ].forEach(([val, lbl]) => {
      const div = document.createElement("div");
      div.className = "pulse-stat";
      const v = document.createElement("span");
      v.className = "val";
      v.textContent = val;
      const l = document.createElement("span");
      l.className = "lbl";
      l.textContent = lbl;
      div.append(v, l);
      stats.appendChild(div);
    });
  }

  function render() {
    renderChrome();
    renderStatus();
    renderFreshness();
    renderFocus();
    renderShot();
    renderGoals();
    renderNow();
    renderStory();
    renderShip();
    renderPulse();
    $("app").setAttribute("aria-busy", "false");
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
      if ((data.version || 1) > 1) throw new Error(`unknown schema version ${data.version}`);
      render();
    } catch (e) {
      console.error("status load failed:", e);
      $("error-overlay").hidden = false;
    }
  }

  renderChrome();
  load();
  setInterval(renderFreshness, 60000);
})();
