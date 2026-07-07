/// <reference types="vite/client" />

export type ServerProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password';
  credentialKey: string;
  lastConnectedAt: string;
  favorite?: boolean;
};

export type FileEntry = {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  modifiedAt: string;
};

export type FileListResult = {
  path: string;
  parent: string;
  items: FileEntry[];
};

export type DriveRoot = {
  name: string;
  path: string;
};

export type SshConnectInput = {
  tabId: string;
  name?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  credentialKey?: string;
  cols?: number;
  rows?: number;
};

declare global {
  interface Window {
    desktopApi: {
      profiles: {
        list: () => Promise<ServerProfile[]>;
        delete: (id: string) => Promise<boolean>;
      };
      files: {
        roots: () => Promise<DriveRoot[]>;
        list: (folderPath?: string) => Promise<FileListResult>;
        createFolder: (folderPath: string, name: string) => Promise<boolean>;
        createFile: (folderPath: string, name: string) => Promise<boolean>;
        rename: (sourcePath: string, newName: string) => Promise<boolean>;
        delete: (targetPath: string) => Promise<boolean>;
        open: (targetPath: string) => Promise<boolean>;
      };
      ssh: {
        connect: (input: SshConnectInput) => Promise<ServerProfile>;
        input: (tabId: string, data: string) => Promise<boolean>;
        resize: (tabId: string, cols: number, rows: number) => Promise<boolean>;
        disconnect: (tabId: string) => Promise<boolean>;
        onData: (listener: (payload: unknown) => void) => () => void;
        onReady: (listener: (payload: unknown) => void) => () => void;
        onError: (listener: (payload: unknown) => void) => () => void;
        onClose: (listener: (payload: unknown) => void) => () => void;
      };
    };
  }
}
