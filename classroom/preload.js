'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cnb', {
  config:     { get: ()  => ipcRenderer.invoke('config:get'),
                save: (u) => ipcRenderer.invoke('config:save', u) },
  device:     { bind: (p) => ipcRenderer.invoke('device:bind', p) },
  ws:         { status: () => ipcRenderer.invoke('ws:status') },
  app:        { info:  () => ipcRenderer.invoke('app:info'),
                checkUpdate: () => ipcRenderer.invoke('update:check') },
  on:         (ch, fn) => ipcRenderer.on(ch, (_, ...args) => fn(...args)),
  notifyDone: (id) => ipcRenderer.send('notify:done', id),
});
