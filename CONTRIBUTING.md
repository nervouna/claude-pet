# Contributing

Claude Pet is a personal project. Bug reports and fixes are welcome. For new animations, behaviours or bigger changes, open an issue first so we can agree on the idea before you spend time on it.

## Reporting a bug

Open an issue with the bug report form: what happens, how to reproduce it, your macOS and Claude Code versions, and the release or commit you run. Security problems go through [SECURITY.md](SECURITY.md) instead.

## Making a change

```bash
npm install
npm start          # the pet itself
npm run preview    # the renderer in a browser, with a button for every state
```

There are no automated tests. Before sending a change:

- Check every state your change touches in the browser preview, and run **Play Demo** from the menu bar icon to see the whole flow in the real window.
- If you change how Claude Code events map to states (`src/main/sessions.js`), send fake hook events and check the result:

  ```bash
  echo '{"hook_event_name":"PreToolUse","session_id":"test","cwd":"/tmp/demo","tool_name":"Grep"}' \
    | curl -s --data-binary @- http://127.0.0.1:46821/event
  curl -s http://127.0.0.1:46821/state
  echo '{"hook_event_name":"SessionEnd","session_id":"test"}' | curl -s --data-binary @- http://127.0.0.1:46821/event
  ```
- If you change an animation shown in the README, regenerate the media as described under Develop in the README.
- Keep the hook command silent and always successful: it runs before every tool call in every Claude Code session.

Write commit messages as a short imperative subject line, with a body that explains why when it isn't obvious.

## Pull requests

Fork the repository, make your change on a branch, and open a pull request against `main` describing what changed and how you checked it. Keep each pull request to one change.
