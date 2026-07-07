import { contextBridge, ipcRenderer } from 'electron';

type Listener = (payload: unknown) => void;

function on(channel: string, listener: Listener) {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('desktopApi', {
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id)
  },
  files: {
    roots: () => ipcRenderer.invoke('fs:roots'),
    list: (folderPath?: string) => ipcRenderer.invoke('fs:list', folderPath),
    createFolder: (folderPath: string, name: string) =>
      ipcRenderer.invoke('fs:createFolder', folderPath, name),
    createFile: (folderPath: string, name: string) =>
      ipcRenderer.invoke('fs:createFile', folderPath, name),
    rename: (sourcePath: string, newName: string) =>
      ipcRenderer.invoke('fs:rename', sourcePath, newName),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    open: (targetPath: string) => ipcRenderer.invoke('fs:open', targetPath)
  },
  ssh: {
    connect: (input: unknown) => ipcRenderer.invoke('ssh:connect', input),
    input: (tabId: string, data: string) => ipcRenderer.invoke('ssh:input', tabId, data),
    resize: (tabId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('ssh:resize', tabId, cols, rows),
    disconnect: (tabId: string) => ipcRenderer.invoke('ssh:disconnect', tabId),
    onData: (listener: Listener) => on('ssh:data', listener),
    onReady: (listener: Listener) => on('ssh:ready', listener),
    onError: (listener: Listener) => on('ssh:error', listener),
    onClose: (listener: Listener) => on('ssh:close', listener)
  }
});
