const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStatus:   ()  => ipcRenderer.invoke('get-status'),
  pause:       ()  => ipcRenderer.invoke('pause'),
  resume:      ()  => ipcRenderer.invoke('resume'),
  kill:        (n) => ipcRenderer.invoke('kill', n),
  mergePR:     (n) => ipcRenderer.invoke('merge-pr', n),
  openBrowser: ()  => ipcRenderer.invoke('open-browser'),
  orchStart:   ()  => ipcRenderer.invoke('orch-start'),
  orchStop:    ()  => ipcRenderer.invoke('orch-stop'),
  orchRestart: ()  => ipcRenderer.invoke('orch-restart'),
  onRefresh:   (fn) => ipcRenderer.on('refresh', fn),
  onStatus:    (fn) => ipcRenderer.on('status-update', (_, d) => fn(d)),
  resize:      (h) => ipcRenderer.send('resize', h),
});
