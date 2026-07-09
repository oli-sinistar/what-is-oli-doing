#!/usr/bin/env node
// Authenticated screenshot of the data-sinistar app (or any URL) for the daily status page.
//
//   node scripts/capture-authed.mjs <path|url> <out.png> [options]
//     --blur "sel1,sel2"   CSS selectors to blur before capture (PII guard)
//     --wait <ms>          settle time after networkidle (default 5000)
//     --viewport WxH       default 1440x900
//     --base <url>         default https://data-sinistar.vercel.app
//     --public             skip auth (plain capture, any URL)
//
// Auth: mints a Firebase custom token with the app's own admin key
// (FIREBASE_JSON_KEY_NEXTJS_ENCODED in apps/data-sinistar-nextjs/.env.local),
// signs in via the gstatic CDN auth module — which shares IndexedDB persistence
// with the app bundle — then reloads so AuthProvider creates its own session.
// No app code is modified; only someone with this machine's key can do this.
//
// Exit codes: 0 ok · 1 setup/capture error · 2 page still shows the login screen.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = "/Users/oliviersinistar/Documents/turbo-sinistar/apps/data-sinistar-nextjs";
const MONO_DIR = "/Users/oliviersinistar/Documents/turbo-sinistar";
// .env.capture = the DEPLOYED app's config+admin key (vercel env pull, gitignored —
// never commit it). Falls back to the app's local .env.local (staging project,
// which will NOT authenticate against the production deployment).
const CAPTURE_ENV = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env.capture");
const ACCOUNT_EMAIL = "olivier.leclerc@sinistar.ca";
const CDN = "https://www.gstatic.com/firebasejs/10.14.1";

const args = process.argv.slice(2);
const positional = args.filter((a, i) => !a.startsWith("--") && (i === 0 || !args[i - 1].startsWith("--") || ["--public"].includes(args[i - 1])));
const target = positional[0];
const out = positional[1];
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : dflt;
};
const isPublic = args.includes("--public");
const blur = opt("--blur", null);
const settle = Number(opt("--wait", 5000));
const [vw, vh] = opt("--viewport", "1440x900").split("x").map(Number);
const base = opt("--base", "https://data-sinistar.vercel.app");

if (!target || !out) {
  console.error("usage: capture-authed.mjs <path|url> <out.png> [--blur sel] [--wait ms] [--viewport WxH] [--base url] [--public]");
  process.exit(1);
}
const url = target.startsWith("http") ? target : base + (target.startsWith("/") ? target : `/${target}`);

const envFile = existsSync(CAPTURE_ENV) ? CAPTURE_ENV : `${APP_DIR}/.env.local`;
const env = {};
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const appRequire = createRequire(`${APP_DIR}/package.json`);
const monoRequire = createRequire(`${MONO_DIR}/package.json`);
const { chromium } = monoRequire("playwright");

async function mintCustomToken() {
  const admin = appRequire("firebase-admin");
  const key = JSON.parse(Buffer.from(env.FIREBASE_JSON_KEY_NEXTJS_ENCODED, "base64").toString("utf8"));
  const app = admin.initializeApp({ credential: admin.credential.cert(key) }, `capture-${Date.now()}`);
  try {
    const user = await app.auth().getUserByEmail(ACCOUNT_EMAIL);
    return await app.auth().createCustomToken(user.uid);
  } finally {
    await app.delete().catch(() => {});
  }
}

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });

  if (!isPublic) {
    const customToken = await mintCustomToken();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.evaluate(
      async ({ cdn, config, token }) => {
        const { initializeApp } = await import(`${cdn}/firebase-app.js`);
        const { getAuth, signInWithCustomToken } = await import(`${cdn}/firebase-auth.js`);
        const app = initializeApp(config, "[DEFAULT]");
        await signInWithCustomToken(getAuth(app), token);
      },
      { cdn: CDN, config: firebaseConfig, token: customToken },
    );
    await page.waitForTimeout(2500); // let AuthProvider POST /api/session
  }

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(settle);

  if (!isPublic) {
    const loginVisible = await page.getByText("Sign in with Google").first().isVisible().catch(() => false);
    if (loginVisible) {
      console.error(`STILL ON LOGIN — auth did not take for ${url}`);
      process.exit(2);
    }
  }

  if (blur) {
    await page.addStyleTag({ content: `${blur} { filter: blur(7px) !important; }` });
    await page.waitForTimeout(250);
  }

  await page.screenshot({ path: out });
  console.log(JSON.stringify({ ok: true, url, out }));
} finally {
  await browser.close();
}
