# Security policy

Claude Pet receives every Claude Code hook payload you send it. Those payloads contain your prompts and tool inputs, such as file contents and shell commands, and arrive over a local HTTP endpoint. Its installer also edits your Claude Code settings. A flaw in either can matter, so please report one privately.

## Reporting a vulnerability

Use **Security → Report a vulnerability** on this repository, or go directly to <https://github.com/nervouna/claude-pet/security/advisories/new>. Please don't open a public issue.

Include:

- what an attacker can do and the steps to reproduce it,
- your macOS version and Claude Code version,
- the release or commit you tested.

You can expect an answer within a week. Fixes land on the default branch; there are no maintained release branches.

## In scope

- The local event server in `src/main/server.js`: what it accepts and where it listens.
- Handling of hook payloads: anything that stores, logs or forwards them, or lets them affect more than the animation.
- The hooks installer (`scripts/hooks.mjs`) and the changes it makes to `settings.json`.
- The Electron window setup and the preload bridge between the main process and the renderer.

## Out of scope

- Claude Code itself; report those to Anthropic.
- Bugs in Electron, Chromium or three.js; report those upstream, unless Claude Pet's use of them is the problem.
- Problems that need an attacker who already runs code as your user.
