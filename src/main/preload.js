'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kanki', {
  info: () => ipcRenderer.invoke('app:info'),
  ensurePermissions: () => ipcRenderer.invoke('media:ensure-permissions'),
  ensureCamera: () => ipcRenderer.invoke('media:ensure-camera'),
  openScreenSettings: () => ipcRenderer.invoke('media:open-screen-settings'),
  getSources: () => ipcRenderer.invoke('screen:get-sources'),
  selectSource: (id, audio) => ipcRenderer.invoke('screen:select-source', id, audio),
  hostServer: (opts) => ipcRenderer.invoke('server:host', opts),
  stopServer: () => ipcRenderer.invoke('server:stop'),
  serverStatus: () => ipcRenderer.invoke('server:status'),
  startTunnel: (opts) => ipcRenderer.invoke('tunnel:start', opts),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', title, body),
  flash: () => ipcRenderer.invoke('app:flash'),
  shake: () => ipcRenderer.invoke('app:shake'),
  setPtt: (keycode) => ipcRenderer.invoke('ptt:set', keycode),
  capturePttKey: () => ipcRenderer.invoke('ptt:capture'),
  onPtt: (cb) => ipcRenderer.on('ptt', (_e, down) => cb(down)),
  updateState: () => ipcRenderer.invoke('update:state'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  idleTime: () => ipcRenderer.invoke('app:idle-time'),
  // Uzaktan kontrol (yayıncı tarafı)
  rcCheck: () => ipcRenderer.invoke('rc:check'),
  rcStart: (sourceId, who) => ipcRenderer.invoke('rc:start', sourceId, who),
  rcInput: (msg) => ipcRenderer.send('rc:input', msg),
  rcStop: () => ipcRenderer.invoke('rc:stop'),
  onRcStopped: (cb) => ipcRenderer.on('rc:stopped-locally', (_e, reason) => cb(reason)),
  onUpdate: (cb) => ipcRenderer.on('update', (_e, state) => cb(state)),
  autotest: process.env.KANKI_AUTOTEST ? JSON.parse(process.env.KANKI_AUTOTEST) : null,
});
