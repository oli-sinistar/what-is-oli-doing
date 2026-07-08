# What is Oli doing?

A public, single-page, no-scroll status page showing what Olivier is building at Sinistar right now — current focus, in-flight Linear work, inferred goals, a daily deep-dive story, and a 7-day activity pulse. Bilingual EN/FR.

## How it stays fresh

A **local Claude Code scheduled task** (`~/.claude/scheduled-tasks/what-is-oli-doing/SKILL.md`, daily at 17:45) gathers:

- Linear issues, cycles and projects (Linear MCP)
- git activity across `turbo-sinistar` (`git log --all --author=…`)
- Claude Code session transcripts (the day's actual work arcs)
- Claude memory files (project vocabulary and priorities)

…then rewrites `status.json` (bilingual), validates it with `node scripts/validate.mjs` (never commits invalid data), commits, pushes, and deploys with `vercel deploy --prod`.

## Stack

Pure static — no framework, no build step, zero npm dependencies. `index.html` + `style.css` + `app.js` fetch `status.json` at runtime.

- `scripts/validate.mjs` — the authoritative schema contract (char budgets, enums, freshness). `--allow-stale` skips the must-be-today checks for local dev.
- `vercel.json` — `status.json` is `no-store`; fonts immutable; everything else revalidates.
- Local preview: the `.claude/launch.json` config serves the folder on port 4173 (`npx serve`).

The page's freshness badge turns amber after 36 h and red after 72 h — that's the user-visible alarm if the schedule misses a day (it only runs while the Claude desktop app is open).
