const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // status
  getStatus:    ()  => ipcRenderer.invoke('get-status'),
  getIssues:    ()  => ipcRenderer.invoke('get-issues'),
  getMetrics:   ()  => ipcRenderer.invoke('get-metrics'),
  getHistory:   ()  => ipcRenderer.invoke('get-history'),
  getLogs:      (n) => ipcRenderer.invoke('get-logs', n),
  // agent actions
  pause:        ()  => ipcRenderer.invoke('pause'),
  resume:       ()  => ipcRenderer.invoke('resume'),
  kill:         (n) => ipcRenderer.invoke('kill', n),
  mergePR:      (n) => ipcRenderer.invoke('merge-pr', n),
  unlockIssue:  (n) => ipcRenderer.invoke('unlock-issue', n),
  // orchestrator control
  orchStart:    ()  => ipcRenderer.invoke('orch-start'),
  orchStop:     ()  => ipcRenderer.invoke('orch-stop'),
  orchRestart:  ()  => ipcRenderer.invoke('orch-restart'),
  // misc
  openBrowser:  ()  => ipcRenderer.invoke('open-browser'),
  onRefresh:    (fn) => ipcRenderer.on('refresh', fn),
  onStatus:     (fn) => ipcRenderer.on('status-update', (_, d) => fn(d)),
  resize:       (h) => ipcRenderer.send('resize', h),
});
