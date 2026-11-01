# Claude Pet

A 3D voxel version of the little Claude Code mascot that lives on your desktop and acts out what Claude Code is doing: it scratches its head while Claude thinks, pulls out a laptop and types while Claude edits files or runs commands, waves at you when Claude needs permission, and falls asleep when nothing is going on.

Built with Electron and three.js. The window is transparent, always on top and click-through everywhere except on the pet itself.

## Run

```bash
npm install
npm start
```

The pet appears in the bottom-right corner and adds a menu bar icon (Size, Play Demo, Reset Position, Quit). Drag the pet to move it, click it to poke it, right-click it for the same menu.

**Play Demo** feeds a scripted session through the same pipeline as real hooks, so you can see every animation without running Claude Code.

## Connect Claude Code

The pet listens on `127.0.0.1:46821` (override with `CLAUDE_PET_PORT`). Claude Code reports to it through hooks that `curl` each hook payload there. Install them into your user settings:

```bash
npm run hooks:install
```

This edits `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` (following symlinks); pass `--settings <path>` to `node scripts/hooks.mjs install` to target another file, `npm run hooks:uninstall` removes them again, and `node scripts/hooks.mjs print` shows the JSON to paste by hand. The hook never fails or slows a session: when the pet isn't running, curl gets "connection refused" immediately and the hook exits 0. Sessions started before the install need a restart to pick up the hooks.

## What it does when

| Claude Code | Hook | Pet |
| --- | --- | --- |
| Thinking about your prompt or between tool calls | `UserPromptSubmit`, `PostToolUse` | Scratches its head, looks left and right, taps a foot, paces; "…" bubble |
| `Edit`, `Write`, `Bash`, MCP and other tools | `PreToolUse` | Sits down, pulls a laptop from behind its back, types; code (or shell) glyphs float up |
| `Grep`, `Glob`, `WebSearch`, `WebFetch` | `PreToolUse` | Holds a magnifying glass to one (now huge) eye and sweeps around |
| `Read` | `PreToolUse` | Reads a sheet of paper line by line, flipping pages |
| Waiting for permission or an answer | `PermissionRequest`, `Notification`, `AskUserQuestion` | Waves, hops, "!" or "?" bubble |
| Turn finished | `Stop` | Jumps, spins and throws sparkles |
| Tool failed or API error | `PostToolUseFailure`, `StopFailure` | Startled shake |
| Compacting context | `PreCompact` | Gets squashed flat, pops back |
| New session | `SessionStart` | Stretches awake |
| Nothing for 5 minutes | — | Sits down and sleeps (Zzz) |

With several sessions at once the pet shows the one that matters most: needs-you beats working beats thinking. Short gaps between tool calls don't make it put the laptop away. A session stuck in one state for a long time (an interrupted turn sends no `Stop`) falls back to idle. The menu bar menu lists sessions and what each is doing.

When idle it wanders, hops, stretches, sits, occasionally dances, blinks, and follows your cursor with its eyes.

## Develop

`npm run preview` serves the repo; open <http://127.0.0.1:5178/src/renderer/index.html> for the renderer in a normal browser with buttons for every state. `?zoom=3` scales it up, `?az=60&el=20` moves the camera. In the console, `pet.setState('Edit')`, `pet.pulse('celebrate')` and `pet.advance(2)` (step the simulation synchronously) help with tuning.

- `src/main/` — Electron main process: window, menu bar, cursor feed, the hook server (`server.js`) and the session state machine (`sessions.js`).
- `src/renderer/model.js` — the voxel Clawd and its pose channels; `props.js` — laptop, magnifier, paper, shadow.
- `src/renderer/actions.js` — every animation as an action with intro, loop and outro; `brain.js` — picks the next action from Claude's state.
- `scripts/hooks.mjs` — installs the hooks.
