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
  groupId?: string;
};

export type ServerGroup = {
  id: string;
  name: string;
  createdAt: string;
  order: number;
};

export type ProfilesState = {
  groups: ServerGroup[];
  profiles: ServerProfile[];
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

export type LocalTerminalShell = 'powershell' | 'cmd';

export type LocalTerminalTag = {
  id: string;
  name: string;
  path: string;
  shell: LocalTerminalShell;
  createdAt: string;
  lastOpenedAt: string;
  groupId?: string;
};

export type LocalTerminalTagInput = {
  id?: string;
  name: string;
  path: string;
  shell?: LocalTerminalShell;
  groupId?: string;
};

export type LocalTerminalTagsState = {
  groups: ServerGroup[];
  tags: LocalTerminalTag[];
};

export type LocalTerminalInput = {
  tabId: string;
  path: string;
  shell?: LocalTerminalShell;
  cols?: number;
  rows?: number;
};

export type SshConnectInput = {
  tabId: string;
  name?: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  credentialKey?: string;
  groupId?: string;
  cols?: number;
  rows?: number;
};

declare global {
  interface Window {
    desktopApi: {
      profiles: {
        list: () => Promise<ProfilesState>;
        delete: (id: string) => Promise<boolean>;
        move: (profileId: string, groupId: string) => Promise<boolean>;
      };
      groups: {
        create: (name: string) => Promise<ServerGroup>;
        rename: (id: string, name: string) => Promise<boolean>;
        delete: (id: string) => Promise<boolean>;
      };
      localTerminalTags: {
        list: () => Promise<LocalTerminalTagsState>;
        save: (input: LocalTerminalTagInput) => Promise<LocalTerminalTag>;
        delete: (id: string) => Promise<boolean>;
        move: (tagId: string, groupId: string) => Promise<boolean>;
      };
      localTerminalGroups: {
        create: (name: string) => Promise<ServerGroup>;
        rename: (id: string, name: string) => Promise<boolean>;
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
      localTerminal: {
        open: (input: LocalTerminalInput) => Promise<boolean>;
        input: (tabId: string, data: string) => Promise<boolean>;
        resize: (tabId: string, cols: number, rows: number) => Promise<boolean>;
        close: (tabId: string) => Promise<boolean>;
        onData: (listener: (payload: unknown) => void) => () => void;
        onCwd: (listener: (payload: unknown) => void) => () => void;
        onClose: (listener: (payload: unknown) => void) => () => void;
      };
    };
  }
}
