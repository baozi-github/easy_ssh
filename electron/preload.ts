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
    delete: (id: string) => ipcRenderer.invoke('profiles:delete', id),
    move: (profileId: string, groupId: string) =>
      ipcRenderer.invoke('profiles:move', profileId, groupId)
  },
  groups: {
    create: (name: string) => ipcRenderer.invoke('groups:create', name),
    rename: (id: string, name: string) => ipcRenderer.invoke('groups:rename', id, name),
    delete: (id: string) => ipcRenderer.invoke('groups:delete', id)
  },
  localTerminalTags: {
    list: () => ipcRenderer.invoke('local-terminal-tags:list'),
    save: (input: unknown) => ipcRenderer.invoke('local-terminal-tags:save', input),
    delete: (id: string) => ipcRenderer.invoke('local-terminal-tags:delete', id),
    move: (tagId: string, groupId: string) =>
      ipcRenderer.invoke('local-terminal-tags:move', tagId, groupId)
  },
  localTerminalGroups: {
    create: (name: string) => ipcRenderer.invoke('local-terminal-groups:create', name),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke('local-terminal-groups:rename', id, name),
    delete: (id: string) => ipcRenderer.invoke('local-terminal-groups:delete', id)
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
  },
  localTerminal: {
    open: (input: unknown) => ipcRenderer.invoke('local-terminal:open', input),
    input: (tabId: string, data: string) =>
      ipcRenderer.invoke('local-terminal:input', tabId, data),
    resize: (tabId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('local-terminal:resize', tabId, cols, rows),
    close: (tabId: string) => ipcRenderer.invoke('local-terminal:close', tabId),
    onData: (listener: Listener) => on('local-terminal:data', listener),
    onClose: (listener: Listener) => on('local-terminal:close', listener)
  }
});
