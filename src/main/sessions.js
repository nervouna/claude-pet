const { EventEmitter } = require('node:events');
const path = require('node:path');

// What the pet does for each tool. Anything unlisted (including MCP tools) means typing.
const ACTIVITY = {
  Read: 'read',
  NotebookRead: 'read',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  WebSearch: 'search',
  WebFetch: 'search',
  ToolSearch: 'search',
  AskUserQuestion: 'ask',
  ExitPlanMode: 'ask',
};

const PRIORITY = { waiting: 3, working: 2, thinking: 1, idle: 0 };
// A session stuck in one state this long (an interrupted turn fires no Stop hook) counts as idle.
const STALE_MS = { thinking: 8 * 60e3, working: 20 * 60e3, waiting: 30 * 60e3 };
const SLEEP_AFTER_MS = 5 * 60e3;
const FORGET_MS = 6 * 60 * 60e3;

function classify(tool = '') {
  return ACTIVITY[tool] ?? 'type';
}

// Folds Claude Code hook events from every session into one state for the pet.
class SessionTracker extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.lastEventAt = Date.now();
    this.lastKey = '';
    this.timer = setInterval(() => this.refresh(), 5000);
  }

  handle(evt) {
    const name = evt.hook_event_name;
    if (!name) return;
    const id = evt.session_id || 'unknown';
    const now = Date.now();
    this.lastEventAt = now;

    if (name === 'SessionEnd') {
      this.sessions.delete(id);
      this.refresh();
      return;
    }

    const s = this.sessions.get(id) ?? { id, status: 'idle', activity: null, tool: null, waitKind: null };
    s.cwd = evt.cwd || s.cwd;
    s.updatedAt = now;
    this.sessions.set(id, s);

    switch (name) {
      case 'SessionStart':
        if (evt.source !== 'compact') this.emit('pulse', 'wake');
        break;
      case 'UserPromptSubmit':
        Object.assign(s, { status: 'thinking', tool: null });
        break;
      case 'PreToolUse': {
        const activity = classify(evt.tool_name);
        if (activity === 'ask') Object.assign(s, { status: 'waiting', waitKind: 'ask', tool: evt.tool_name });
        else Object.assign(s, { status: 'working', activity, tool: evt.tool_name });
        break;
      }
      case 'PostToolUse':
        s.status = 'thinking';
        break;
      case 'PostToolUseFailure':
        s.status = 'thinking';
        this.emit('pulse', 'oops');
        break;
      case 'PermissionRequest':
      case 'Elicitation':
        Object.assign(s, { status: 'waiting', waitKind: 'permission' });
        break;
      case 'Notification':
        // idle_prompt ("waiting for your input") arrives after Stop, nothing new to show.
        if (['permission_prompt', 'elicitation_dialog'].includes(evt.notification_type)) {
          Object.assign(s, { status: 'waiting', waitKind: 'permission' });
        }
        break;
      case 'Stop':
      case 'StopFailure':
        Object.assign(s, { status: 'idle', tool: null });
        if (name === 'StopFailure') this.emit('pulse', 'oops');
        else this.emit('pulse', this.snapshot().mode === 'idle' ? 'celebrate' : 'cheer');
        break;
      case 'PreCompact':
        this.emit('pulse', 'compact');
        break;
      default:
        break;
    }
    this.refresh();
  }

  snapshot(now = Date.now()) {
    let top = null;
    for (const [id, s] of this.sessions) {
      if (now - s.updatedAt > FORGET_MS) {
        this.sessions.delete(id);
        continue;
      }
      if (s.status !== 'idle' && now - s.updatedAt > STALE_MS[s.status]) s.status = 'idle';
      if (!top || PRIORITY[s.status] > PRIORITY[top.status] || (PRIORITY[s.status] === PRIORITY[top.status] && s.updatedAt > top.updatedAt)) {
        top = s;
      }
    }
    let mode = top?.status ?? 'idle';
    if (mode === 'idle' && now - this.lastEventAt > SLEEP_AFTER_MS) mode = 'sleep';
    return {
      mode,
      activity: mode === 'working' ? top.activity : null,
      tool: mode === 'working' || mode === 'waiting' ? top.tool : null,
      waitKind: mode === 'waiting' ? top.waitKind : null,
      sessions: [...this.sessions.values()]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((s) => ({ project: s.cwd ? path.basename(s.cwd) : s.id.slice(0, 8), status: s.status, tool: s.tool })),
    };
  }

  refresh() {
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.emit('state', snap);
    }
  }
}

module.exports = { SessionTracker, classify };
