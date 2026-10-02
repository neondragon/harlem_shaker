# BOOTSTRAP — harlem_shaker

Revive the dead Moovweb Harlem Shake bookmarklet as a self-contained, CSP-proof build with a public install page.

## Status
Chat handoff written 2026-10-02. Nothing implemented. No git yet.

## Context to load
- Graph: **harlem_shaker Architecture** (all locked decisions + rationale)
- Graph: **Project Bootstrap Pattern**, **Project Classification Taxonomy**
- Upstream: https://github.com/moovweb/harlem_shaker (original script, `harlem-shake-style.css`, mp3)

## Decisions locked in
- Self-contained bookmarklet: CSS + audio inlined (audio as base64 `data:` URI). No runtime fetches.
- **mp3 never committed or served as a standalone file.** Gitignored local input only; appears publicly only inlined in built output.
- Readable sources committed: unminified script, CSS. Carry the `if(A===null)` → `if(k===null)` fix.
- Build re-encodes audio (mono, low bitrate; prior build ≈249 KB bookmarklet), inlines, minifies, renders install page.
- Built install page is committed and served via GitHub Pages (CI can't build without the mp3).
- Public repo. CLAUDE.md declares `surface: public`, `visibility: public` (already written).

## Next steps for Code
1. `git init`, initial commit (include this file).
2. brainstorming/writing-plans as the Bootstrap Pattern says, then implement.
3. Fetch mp3 from `cdn.jsdelivr.net/gh/moovweb/harlem_shaker@master/harlem-shake.mp3` into the gitignored input path; add that path to `.gitignore` before the first build.
4. `gh repo create --public`, enable Pages.

## Open questions
- Build tooling (shell + ffmpeg vs Node script) — Code's call, keep deps minimal.
- Pages source: `docs/` on main vs `gh-pages` branch.

## Delete
Remove this file in a `bootstrap complete: delete brief` commit once implementation is underway.
