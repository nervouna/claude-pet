#!/usr/bin/env node
// Adds (or removes) the Claude Code hooks that report session activity to the pet.
//
//   node scripts/hooks.mjs install   [--settings <path>]
//   node scripts/hooks.mjs uninstall [--settings <path>]
//   node scripts/hooks.mjs print
//
// The default settings file is ${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json. Symlinks are
// followed, so a settings.json kept in a dotfiles repo is edited in place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Elicitation',
  'Notification',
  'Stop',
  'StopFailure',
  'PreCompact',
];

// Posts the hook's JSON to the pet; silent and successful whether or not the pet is running.
const MARKER = 'CLAUDE_PET_PORT';
const COMMAND = `curl -s -m 1 -o /dev/null --data-binary @- "http://127.0.0.1:\${${MARKER}:-46821}/event" >/dev/null 2>&1 || true`;
const HOOK = { type: 'command', command: COMMAND, timeout: 3 };

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARKER);

function settingsPath() {
  const i = process.argv.indexOf('--settings');
  if (i > 0) return path.resolve(process.argv[i + 1]);
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

function strip(hooks) {
  for (const event of Object.keys(hooks)) {
    hooks[event] = hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((h) => !isOurs(h)) }))
      .filter((group) => group.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
}

const action = process.argv[2];
if (action === 'print') {
  const hooks = Object.fromEntries(EVENTS.map((e) => [e, [{ hooks: [HOOK] }]]));
  console.log(JSON.stringify({ hooks }, null, 2));
  process.exit(0);
}
if (!['install', 'uninstall'].includes(action)) {
  console.error('usage: node scripts/hooks.mjs install|uninstall|print [--settings <path>]');
  process.exit(2);
}

const file = fs.realpathSync.native(settingsPath());
const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
settings.hooks ??= {};
strip(settings.hooks);
if (action === 'install') {
  for (const event of EVENTS) {
    (settings.hooks[event] ??= []).push({ hooks: [HOOK] });
  }
}
if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`${action === 'install' ? 'Installed' : 'Removed'} claude-pet hooks in ${file}`);
