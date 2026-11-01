const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, c) => cb(c)),
  onState: (cb) => ipcRenderer.on('pet:state', (_e, s) => cb(s)),
  onPulse: (cb) => ipcRenderer.on('pet:pulse', (_e, p) => cb(p)),
  setHit: (hit) => ipcRenderer.send('pet:hit', hit),
  drag: (phase) => ipcRenderer.send('pet:drag', phase),
  openMenu: () => ipcRenderer.send('pet:menu'),
  ready: () => ipcRenderer.send('pet:ready'),
});
