const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus:   ()  => ipcRenderer.invoke('get-status'),
  pause:       ()  => ipcRenderer.invoke('pause'),
  resume:      ()  => ipcRenderer.invoke('resume'),
  kill:        (n) => ipcRenderer.invoke('kill', n),
  openBrowser: ()  => ipcRenderer.invoke('open-browser'),
  onRefresh:   (fn) => ipcRenderer.on('refresh', fn),
  onStatus:    (fn) => ipcRenderer.on('status-update', (_, d) => fn(d)),
  resize:      (h) => ipcRenderer.send('resize', h),
});
