// Renders the README media offscreen: frames of a short tour for the GIF, and one still per state.
//   npx electron scripts/record.js <out-dir>
// Frames are transparent PNGs at twice the default window size.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const out = path.resolve(process.argv[2] ?? 'record-out');
const SIZE = { width: 520, height: 440 };
const FPS = 12;

// [seconds from start, script run in the page]
const TOUR = [
  [0, "pet.setState('thinking'); forceAction('ScratchHead')"],
  [2.4, "pet.setState('Edit')"],
  [7.4, "pet.setState('Grep')"],
  [10.6, "pet.setState('Read')"],
  [13.4, "pet.setState('permission')"],
  [15.8, "pet.setState('idle'); pet.pulse('celebrate')"],
  [18.2, null],
];

// [file name, script, seconds to let it play before the shot]
const STILLS = [
  ['thinking', "pet.setState('thinking'); forceAction('ScratchHead')", 1.1],
  ['typing', "pet.setState('Edit')", 3.2],
  ['searching', "pet.setState('Grep')", 2.6],
  ['reading', "pet.setState('Read')", 2.4],
  ['waiting', "pet.setState('permission')", 1.3],
  ['sleeping', "pet.setState('sleep')", 3.5],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({
    ...SIZE,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), { query: { record: '1' } });
  const run = (js) =>
    win.webContents.executeJavaScript(`(async () => {
      const A = await import('./actions.js');
      const forceAction = (name) => { pet.brain.action = new A[name](); };
      ${js}
    })().catch(() => {})`);
  const shot = async (file) => fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG());
  await sleep(800);

  await run("pet.setState('idle')");
  await sleep(1500);
  const start = Date.now();
  let step = 0;
  for (let frame = 0; ; frame++) {
    const t = (Date.now() - start) / 1000;
    while (step < TOUR.length && TOUR[step][0] <= t) {
      if (TOUR[step][1] === null) step = Infinity;
      else await run(TOUR[step++][1]);
    }
    if (step === Infinity) break;
    await shot(path.join(out, `tour-${String(frame).padStart(4, '0')}.png`));
    const next = start + ((frame + 1) * 1000) / FPS;
    await sleep(Math.max(0, next - Date.now()));
  }

  for (const [name, js, wait] of STILLS) {
    await run("pet.setState('idle')");
    await sleep(1500);
    await run(js);
    await sleep(wait * 1000);
    await shot(path.join(out, `${name}.png`));
  }
  app.quit();
}

app.whenReady().then(main);
