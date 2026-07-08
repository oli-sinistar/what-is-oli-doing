#!/usr/bin/env node
// Authoritative contract for status.json. Exit 0 = publishable, exit 1 = never commit.
// Usage: node scripts/validate.mjs [path/to/status.json] [--allow-stale]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const allowStale = args.includes("--allow-stale");
const fileArg = args.find((a) => !a.startsWith("--"));
const path = resolve(fileArg ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "status.json"));

const errors = [];
const err = (p, msg) => errors.push(`  ${p}: ${msg}`);

let doc;
try {
  doc = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`INVALID — ${path} is not parseable JSON: ${e.message}`);
  process.exit(1);
}

const TONES = ["shipping", "building", "debugging", "thinking", "off"];
const STATES = ["backlog", "todo", "started", "review", "done", "canceled"];
const GOAL_STATES = ["on-track", "at-risk", "done"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const isStr = (v) => typeof v === "string";
const isInt = (v) => Number.isInteger(v) && v >= 0;
const chars = (s) => [...s].length;

function leaf(p, v, max) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return err(p, "must be a bilingual {en, fr} object");
  for (const l of ["en", "fr"]) {
    const s = v[l];
    if (!isStr(s) || !s.trim()) err(`${p}.${l}`, "missing or empty");
    else if (max && chars(s) > max) err(`${p}.${l}`, `${chars(s)} chars > budget of ${max}`);
  }
}

function isoDate(p, v) {
  if (!isStr(v) || Number.isNaN(new Date(v).getTime())) err(p, `not a parseable ISO timestamp: ${JSON.stringify(v)}`);
}

const localYmd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = localYmd();

// --- top level ---
if (doc.version !== 1) err("version", `must be 1, got ${JSON.stringify(doc.version)}`);
isoDate("updatedAt", doc.updatedAt);
if (!allowStale && isStr(doc.updatedAt) && localYmd(new Date(doc.updatedAt)) !== today)
  err("updatedAt", `must be today (${today}); got ${doc.updatedAt} — use --allow-stale to bypass in dev`);

// --- status ---
if (!doc.status || typeof doc.status !== "object") err("status", "missing");
else {
  if (!isStr(doc.status.emoji) || !doc.status.emoji.trim() || chars(doc.status.emoji) > 4)
    err("status.emoji", "must be a short emoji string");
  if (!TONES.includes(doc.status.tone)) err("status.tone", `must be one of ${TONES.join("|")}`);
  leaf("status.text", doc.status.text, 40);
}

// --- focus ---
if (!doc.focus || typeof doc.focus !== "object") err("focus", "missing");
else {
  leaf("focus.title", doc.focus.title, 70);
  leaf("focus.blurb", doc.focus.blurb, 200);
}

// --- now ---
if (!Array.isArray(doc.now) || doc.now.length < 1 || doc.now.length > 4)
  err("now", `must be an array of 1–4 items, got ${Array.isArray(doc.now) ? doc.now.length : typeof doc.now}`);
else
  doc.now.forEach((n, i) => {
    leaf(`now[${i}].text`, n.text, 80);
    if ("linear" in n) {
      const l = n.linear;
      if (!l || typeof l !== "object") return err(`now[${i}].linear`, "must be an object or omitted entirely");
      if (!isStr(l.id) || !/^[A-Z]+-\d+$/.test(l.id)) err(`now[${i}].linear.id`, `bad issue id: ${JSON.stringify(l.id)}`);
      if (!isStr(l.url) || !l.url.startsWith("https://linear.app/")) err(`now[${i}].linear.url`, "must be a linear.app URL");
      if (!STATES.includes(l.state)) err(`now[${i}].linear.state`, `must be one of ${STATES.join("|")}`);
      leaf(`now[${i}].linear.stateLabel`, l.stateLabel, 30);
    }
  });

// --- goals ---
if (!Array.isArray(doc.goals) || doc.goals.length < 1 || doc.goals.length > 3)
  err("goals", "must be an array of 1–3 items");
else
  doc.goals.forEach((g, i) => {
    leaf(`goals[${i}].label`, g.label, 60);
    if (!GOAL_STATES.includes(g.state)) err(`goals[${i}].state`, `must be one of ${GOAL_STATES.join("|")}`);
    if (typeof g.progress !== "number" || g.progress < 0 || g.progress > 1)
      err(`goals[${i}].progress`, "must be a number in [0, 1]");
  });

// --- shipped ---
if (!Array.isArray(doc.shipped) || doc.shipped.length > 3) err("shipped", "must be an array of 0–3 items");
else
  doc.shipped.forEach((s, i) => {
    leaf(`shipped[${i}].text`, s.text, 80);
    if (!isStr(s.date) || !YMD.test(s.date)) err(`shipped[${i}].date`, "must be YYYY-MM-DD");
  });

// --- story ---
if (!doc.story || typeof doc.story !== "object") err("story", "missing");
else leaf("story.text", doc.story.text, 420);

// --- screenshot ---
if (doc.screenshot !== null) {
  if (!doc.screenshot || typeof doc.screenshot !== "object") err("screenshot", "must be null or an object");
  else {
    if (!isStr(doc.screenshot.src) || !doc.screenshot.src.startsWith("assets/"))
      err("screenshot.src", "must be a path under assets/");
    leaf("screenshot.caption", doc.screenshot.caption, 80);
    isoDate("screenshot.capturedAt", doc.screenshot.capturedAt);
  }
}

// --- activity ---
if (!doc.activity || typeof doc.activity !== "object") err("activity", "missing");
else {
  const days = doc.activity.days;
  if (!Array.isArray(days) || days.length !== 7) err("activity.days", `must have exactly 7 entries, got ${Array.isArray(days) ? days.length : typeof days}`);
  else {
    days.forEach((d, i) => {
      if (!isStr(d.date) || !YMD.test(d.date)) err(`activity.days[${i}].date`, "must be YYYY-MM-DD");
      if (!isInt(d.commits)) err(`activity.days[${i}].commits`, "must be a non-negative integer");
      if (i > 0 && days[i - 1].date >= d.date) err(`activity.days[${i}].date`, "dates must be strictly ascending");
    });
    if (!allowStale && days[6]?.date !== today) err("activity.days[6].date", `last entry must be today (${today})`);
  }
  if (!isInt(doc.activity.sessions7d)) err("activity.sessions7d", "must be a non-negative integer");
  if (!isInt(doc.activity.issuesClosed7d)) err("activity.issuesClosed7d", "must be a non-negative integer");
}

if (errors.length) {
  console.error(`INVALID — ${errors.length} problem(s) in ${path}:`);
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`VALID — ${path} passes the v1 contract${allowStale ? " (freshness checks skipped)" : ""}.`);
