#!/usr/bin/env node
// Print recent Cursor chats as JSON — evidence input for the daily status refresh.
// Usage: node scripts/cursor-recent.mjs [--days N] [--deep K]
//   --days N  look-back window in days (default 2)
//   --deep K  for the K most recent chats, also extract the first user asks (default 3)
// Reads Cursor's local SQLite store read-only; prints [] on any failure (never blocks the run).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const DB = `${homedir()}/Library/Application Support/Cursor/User/globalStorage/state.vscdb`;

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const days = argVal("--days", 2);
const deep = argVal("--deep", 3);

const fail = (msg) => {
  console.error(`cursor-recent: ${msg}`);
  console.log("[]");
  process.exit(0);
};

if (!existsSync(DB)) fail("Cursor store not found");

const q = (sql) => {
  const out = execFileSync("sqlite3", ["-json", `file:${DB}?mode=ro`, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60000,
  });
  return out.trim() ? JSON.parse(out) : [];
};

try {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const chats = q(`
    SELECT json_extract(value,'$.composerId') AS id,
           COALESCE(json_extract(value,'$.name'),'(untitled)') AS name,
           json_extract(value,'$.subtitle') AS subtitle,
           json_extract(value,'$.lastUpdatedAt') AS updatedAt,
           json_extract(value,'$.totalLinesAdded') AS linesAdded,
           json_extract(value,'$.totalLinesRemoved') AS linesRemoved
    FROM cursorDiskKV
    WHERE key LIKE 'composerData:%'
      AND json_extract(value,'$.lastUpdatedAt') >= ${cutoff}
    ORDER BY updatedAt DESC;`);

  chats.forEach((c, i) => {
    c.updatedAt = new Date(c.updatedAt).toISOString();
    if (i < deep && c.id) {
      const esc = String(c.id).replace(/'/g, "''");
      const asks = q(`
        SELECT substr(replace(COALESCE(json_extract(value,'$.text'),''), char(10), ' '), 1, 160) AS text
        FROM cursorDiskKV
        WHERE key LIKE 'bubbleId:${esc}:%'
          AND json_extract(value,'$.type') = 1
          AND length(COALESCE(json_extract(value,'$.text'),'')) > 10
        ORDER BY rowid LIMIT 3;`);
      c.asks = asks.map((a) => a.text);
    }
    delete c.id;
  });

  console.log(JSON.stringify(chats, null, 2));
} catch (e) {
  fail(e.message.split("\n")[0]);
}
