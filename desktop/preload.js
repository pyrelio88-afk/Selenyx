const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld('selenyx', Object.freeze({
  health: () => invoke('app:health'),
  listSkills: () => invoke('skill:list'),
  runSkill: (payload) => invoke('skill:run', payload),
  readProfile: () => invoke('profile:read'),
  pushProfileEvent: (event) => invoke('profile:event', event),
  searchLiterature: (payload) => invoke('literature:search', payload),
  listSources: () => invoke('literature:sources', {}),
  openExternal: (url) => invoke('external:open', { url }),
  providers: Object.freeze({
    list: () => invoke('provider:list'),
    save: (payload) => invoke('provider:save', payload),
    remove: (id) => invoke('provider:delete', { id }),
    activate: (id) => invoke('provider:activate', { id }),
    test: (id) => invoke('provider:test', { id }),
    chat: (payload) => invoke('provider:chat', payload),
  }),
  browser: Object.freeze({
    show: (payload) => invoke('browser:show', payload),
    setBounds: (bounds) => invoke('browser:bounds', bounds),
    hide: () => invoke('browser:hide'),
    openExternal: (url) => invoke('external:open', { url }),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('browser:status', listener);
      return () => ipcRenderer.removeListener('browser:status', listener);
    },
  }),
  platform: process.platform,
}));
