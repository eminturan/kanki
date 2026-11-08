'use strict';
// Müzik botu penceresi: şarkı bulma ve ses akışı adresi ana süreçten (yt-dlp) gelir
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kankiBot', {
  resolve: (query) => ipcRenderer.invoke('bot:resolve', query),
  stream: (url) => ipcRenderer.invoke('bot:stream', url),
  onStatus: (cb) => ipcRenderer.on('bot:status', (_e, text) => cb(text)),
});
