import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as pty from 'node-pty';
import { Client, ConnectConfig, ClientChannel } from 'ssh2';

type AuthType = 'password';

type ServerProfile = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  credentialKey: string;
  lastConnectedAt: string;
  favorite?: boolean;
  groupId?: string;
};

type StoredProfile = ServerProfile & {
  encryptedPassword?: string;
};

type ServerGroup = {
  id: string;
  name: string;
  createdAt: string;
  order: number;
};

type ProfilesState = {
  version: 2;
  groups: ServerGroup[];
  profiles: StoredProfile[];
};

type SshConnectInput = {
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

type SshSession = {
  conn: Client;
  stream: ClientChannel;
  window: BrowserWindow;
};

type LocalTerminalInput = {
  tabId: string;
  path: string;
  shell?: 'powershell' | 'cmd';
  cols?: number;
  rows?: number;
};

type LocalTerminalTag = {
  id: string;
  name: string;
  path: string;
  shell: 'powershell' | 'cmd';
  createdAt: string;
  lastOpenedAt: string;
  groupId?: string;
};

type LocalTerminalTagInput = {
  id?: string;
  name: string;
  path: string;
  shell?: 'powershell' | 'cmd';
  groupId?: string;
};

type LocalTerminalTagsState = {
  version: 2;
  groups: ServerGroup[];
  tags: LocalTerminalTag[];
};

type LocalTerminalSession = {
  pty: pty.IPty;
  window: BrowserWindow;
};

const sessions = new Map<string, SshSession>();
const localTerminalSessions = new Map<string, LocalTerminalSession>();
const DEFAULT_GROUP_ID = 'default';

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

function profilesPath() {
  return path.join(app.getPath('userData'), 'server-profiles.json');
}

function localTerminalTagsPath() {
  return path.join(app.getPath('userData'), 'local-terminal-tags.json');
}

function appIconPath() {
  return path.join(__dirname, '../../assets/app-icon.ico');
}

function createDefaultGroup(): ServerGroup {
  return {
    id: DEFAULT_GROUP_ID,
    name: '默认分组',
    createdAt: new Date().toISOString(),
    order: 0
  };
}

async function ensureProfilesFile() {
  const file = profilesPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, '[]', 'utf8');
  }
}

function normalizeProfilesState(parsed: unknown): ProfilesState {
  const defaultGroup = createDefaultGroup();

  if (Array.isArray(parsed)) {
    return {
      version: 2,
      groups: [defaultGroup],
      profiles: parsed.map((profile) => ({
        ...(profile as StoredProfile),
        groupId: (profile as StoredProfile).groupId || DEFAULT_GROUP_ID
      }))
    };
  }

  const source =
    parsed && typeof parsed === 'object'
      ? (parsed as Partial<ProfilesState>)
      : { groups: [], profiles: [] };

  const rawGroups = Array.isArray(source.groups) ? source.groups : [];
  const groups = rawGroups
    .filter((group): group is ServerGroup => Boolean(group?.id && group?.name))
    .map((group, index) => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt || new Date().toISOString(),
      order: Number.isFinite(group.order) ? group.order : index + 1
    }));

  if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) {
    groups.unshift(defaultGroup);
  }

  const groupIds = new Set(groups.map((group) => group.id));
  const profiles = (Array.isArray(source.profiles) ? source.profiles : []).map((profile) => {
    const storedProfile = profile as StoredProfile;
    const groupId = storedProfile.groupId;
    return {
      ...storedProfile,
      groupId: groupId && groupIds.has(groupId) ? groupId : DEFAULT_GROUP_ID
    };
  });

  return {
    version: 2,
    groups: groups.sort((a, b) => a.order - b.order),
    profiles
  };
}

async function readProfilesState(): Promise<ProfilesState> {
  await ensureProfilesFile();
  const raw = await fs.readFile(profilesPath(), 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return normalizeProfilesState(parsed);
  } catch {
    return normalizeProfilesState(null);
  }
}

async function writeProfilesState(state: ProfilesState) {
  await ensureProfilesFile();
  await fs.writeFile(profilesPath(), JSON.stringify(state, null, 2), 'utf8');
}

async function ensureLocalTerminalTagsFile() {
  const file = localTerminalTagsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(
      file,
      JSON.stringify({ version: 2, groups: [createDefaultGroup()], tags: [] }, null, 2),
      'utf8'
    );
  }
}

function normalizeLocalTerminalTagsState(parsed: unknown): LocalTerminalTagsState {
  const defaultGroup = createDefaultGroup();

  if (Array.isArray(parsed)) {
    return {
      version: 2,
      groups: [defaultGroup],
      tags: parsed.map((tag) => ({
        ...(tag as LocalTerminalTag),
        shell: (tag as LocalTerminalTag).shell || 'powershell',
        groupId: (tag as LocalTerminalTag).groupId || DEFAULT_GROUP_ID
      }))
    };
  }

  const source =
    parsed && typeof parsed === 'object'
      ? (parsed as Partial<LocalTerminalTagsState>)
      : { groups: [], tags: [] };

  const rawGroups = Array.isArray(source.groups) ? source.groups : [];
  const groups = rawGroups
    .filter((group): group is ServerGroup => Boolean(group?.id && group?.name))
    .map((group, index) => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt || new Date().toISOString(),
      order: Number.isFinite(group.order) ? group.order : index + 1
    }));

  if (!groups.some((group) => group.id === DEFAULT_GROUP_ID)) {
    groups.unshift(defaultGroup);
  }

  const groupIds = new Set(groups.map((group) => group.id));
  const tags = (Array.isArray(source.tags) ? source.tags : [])
    .filter((tag): tag is LocalTerminalTag => Boolean(tag?.id && tag?.name && tag?.path))
    .map((tag) => ({
      ...tag,
      shell: tag.shell || 'powershell',
      groupId: tag.groupId && groupIds.has(tag.groupId) ? tag.groupId : DEFAULT_GROUP_ID
    }));

  return {
    version: 2,
    groups: groups.sort((a, b) => a.order - b.order),
    tags
  };
}

async function readLocalTerminalTagsState(): Promise<LocalTerminalTagsState> {
  await ensureLocalTerminalTagsFile();
  const raw = await fs.readFile(localTerminalTagsPath(), 'utf8');
  try {
    return normalizeLocalTerminalTagsState(JSON.parse(raw));
  } catch {
    return normalizeLocalTerminalTagsState(null);
  }
}

async function writeLocalTerminalTagsState(state: LocalTerminalTagsState) {
  await ensureLocalTerminalTagsFile();
  await fs.writeFile(localTerminalTagsPath(), JSON.stringify(state, null, 2), 'utf8');
}

function publicProfile(profile: StoredProfile): ServerProfile {
  const { encryptedPassword: _encryptedPassword, ...rest } = profile;
  return rest;
}

function encryptPassword(password: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    return `base64:${Buffer.from(password, 'utf8').toString('base64')}`;
  }
  return `safe:${safeStorage.encryptString(password).toString('base64')}`;
}

function decryptPassword(encryptedPassword: string) {
  if (encryptedPassword.startsWith('base64:')) {
    return Buffer.from(encryptedPassword.slice('base64:'.length), 'base64').toString('utf8');
  }
  const safePayload = encryptedPassword.startsWith('safe:')
    ? encryptedPassword.slice('safe:'.length)
    : encryptedPassword;
  const buffer = Buffer.from(safePayload, 'base64');
  if (!safeStorage.isEncryptionAvailable() && !encryptedPassword.startsWith('safe:')) {
    return buffer.toString('utf8');
  }
  return safeStorage.decryptString(buffer);
}

function profileId(input: Pick<SshConnectInput, 'host' | 'port' | 'username'>) {
  return `${input.username}@${input.host}:${input.port}`;
}

async function saveSuccessfulProfile(input: SshConnectInput): Promise<ServerProfile> {
  const state = await readProfilesState();
  const id = profileId(input);
  const existing = state.profiles.find((item) => item.id === id);
  const groupIds = new Set(state.groups.map((group) => group.id));
  const now = new Date().toISOString();
  const profile: StoredProfile = {
    id,
    name: input.name?.trim() || existing?.name || input.host,
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    authType: 'password',
    credentialKey: id,
    lastConnectedAt: now,
    favorite: existing?.favorite,
    groupId:
      input.groupId && groupIds.has(input.groupId)
        ? input.groupId
        : existing?.groupId || DEFAULT_GROUP_ID,
    encryptedPassword: input.password
      ? encryptPassword(input.password)
      : existing?.encryptedPassword
  };

  const next = [profile, ...state.profiles.filter((item) => item.id !== id)];
  await writeProfilesState({ ...state, profiles: next });
  return publicProfile(profile);
}

async function passwordFor(input: SshConnectInput) {
  if (input.password) return input.password;
  if (!input.credentialKey) return undefined;
  const profile = (await readProfilesState()).profiles.find(
    (item) => item.credentialKey === input.credentialKey
  );
  return profile?.encryptedPassword ? decryptPassword(profile.encryptedPassword) : undefined;
}

function sendToTab(tabId: string, channel: string, payload: unknown) {
  const current = sessions.get(tabId);
  const target = current?.window ?? getMainWindow();
  if (!target || target.isDestroyed()) return;
  target.webContents.send(channel, payload);
}

function sendLocalTerminalToTab(tabId: string, channel: string, payload: unknown) {
  const current = localTerminalSessions.get(tabId);
  const target = current?.window ?? getMainWindow();
  if (!target || target.isDestroyed()) return;
  target.webContents.send(channel, payload);
}

function shellCommand(shellName: 'powershell' | 'cmd') {
  if (process.platform !== 'win32') {
    return process.env.SHELL || '/bin/bash';
  }
  return shellName === 'cmd' ? 'cmd.exe' : 'powershell.exe';
}

function shellArgs(shellName: 'powershell' | 'cmd') {
  if (process.platform !== 'win32') return [];
  return shellName === 'cmd'
    ? []
    : ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass'];
}

async function assertDirectory(targetPath: string) {
  const resolvedPath = path.resolve(targetPath || os.homedir());
  const stats = await fs.stat(resolvedPath);
  if (!stats.isDirectory()) throw new Error('Path is not a directory');
  return resolvedPath;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'Easy SSH',
    icon: appIconPath(),
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await ensureProfilesFile();
  await ensureLocalTerminalTagsFile();
  registerIpc();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const tabId of sessions.keys()) {
    closeSession(tabId);
  }
  for (const tabId of localTerminalSessions.keys()) {
    closeLocalTerminalSession(tabId);
  }
  if (process.platform !== 'darwin') app.quit();
});

function closeSession(tabId: string) {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);
  session.stream.end();
  session.conn.end();
}

function closeLocalTerminalSession(tabId: string) {
  const session = localTerminalSessions.get(tabId);
  if (!session) return;
  localTerminalSessions.delete(tabId);
  session.pty.kill();
}

function registerIpc() {
  ipcMain.handle('profiles:list', async () => {
    const state = await readProfilesState();
    return {
      groups: state.groups,
      profiles: state.profiles.map(publicProfile)
    };
  });

  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    const state = await readProfilesState();
    await writeProfilesState({
      ...state,
      profiles: state.profiles.filter((item) => item.id !== id)
    });
    return true;
  });

  ipcMain.handle('profiles:move', async (_event, profileIdValue: string, groupId: string) => {
    const state = await readProfilesState();
    if (!state.groups.some((group) => group.id === groupId)) {
      throw new Error('Group does not exist');
    }
    await writeProfilesState({
      ...state,
      profiles: state.profiles.map((profile) =>
        profile.id === profileIdValue ? { ...profile, groupId } : profile
      )
    });
    return true;
  });

  ipcMain.handle('groups:create', async (_event, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('Group name is required');

    const state = await readProfilesState();
    if (state.groups.some((group) => group.name === safeName)) {
      throw new Error('Group name already exists');
    }

    const group: ServerGroup = {
      id: `group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: safeName,
      createdAt: new Date().toISOString(),
      order: state.groups.length
    };
    await writeProfilesState({ ...state, groups: [...state.groups, group] });
    return group;
  });

  ipcMain.handle('groups:rename', async (_event, id: string, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('Group name is required');
    if (id === DEFAULT_GROUP_ID && safeName !== '默认分组') {
      throw new Error('Default group cannot be renamed');
    }

    const state = await readProfilesState();
    if (state.groups.some((group) => group.id !== id && group.name === safeName)) {
      throw new Error('Group name already exists');
    }
    await writeProfilesState({
      ...state,
      groups: state.groups.map((group) => (group.id === id ? { ...group, name: safeName } : group))
    });
    return true;
  });

  ipcMain.handle('groups:delete', async (_event, id: string) => {
    if (id === DEFAULT_GROUP_ID) throw new Error('Default group cannot be deleted');

    const state = await readProfilesState();
    await writeProfilesState({
      ...state,
      groups: state.groups.filter((group) => group.id !== id),
      profiles: state.profiles.map((profile) =>
        profile.groupId === id ? { ...profile, groupId: DEFAULT_GROUP_ID } : profile
      )
    });
    return true;
  });

  ipcMain.handle('local-terminal-tags:list', async () => {
    const state = await readLocalTerminalTagsState();
    return {
      groups: state.groups,
      tags: [...state.tags].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    };
  });

  ipcMain.handle('local-terminal-tags:save', async (_event, input: LocalTerminalTagInput) => {
    const safeName = input.name.trim();
    if (!safeName) throw new Error('Tag name is required');

    const resolvedPath = await assertDirectory(input.path);
    const state = await readLocalTerminalTagsState();
    const groupIds = new Set(state.groups.map((group) => group.id));
    const now = new Date().toISOString();
    const existing = input.id
      ? state.tags.find((tag) => tag.id === input.id)
      : state.tags.find((tag) => tag.path.toLowerCase() === resolvedPath.toLowerCase());

    const tag: LocalTerminalTag = {
      id: existing?.id || `local-terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: safeName,
      path: resolvedPath,
      shell: input.shell || existing?.shell || 'powershell',
      createdAt: existing?.createdAt || now,
      lastOpenedAt: now,
      groupId:
        input.groupId && groupIds.has(input.groupId)
          ? input.groupId
          : existing?.groupId || DEFAULT_GROUP_ID
    };

    await writeLocalTerminalTagsState({
      ...state,
      tags: [tag, ...state.tags.filter((item) => item.id !== tag.id)]
    });
    return tag;
  });

  ipcMain.handle('local-terminal-tags:delete', async (_event, id: string) => {
    const state = await readLocalTerminalTagsState();
    await writeLocalTerminalTagsState({
      ...state,
      tags: state.tags.filter((tag) => tag.id !== id)
    });
    return true;
  });

  ipcMain.handle('local-terminal-tags:move', async (_event, tagId: string, groupId: string) => {
    const state = await readLocalTerminalTagsState();
    if (!state.groups.some((group) => group.id === groupId)) {
      throw new Error('Group does not exist');
    }
    await writeLocalTerminalTagsState({
      ...state,
      tags: state.tags.map((tag) => (tag.id === tagId ? { ...tag, groupId } : tag))
    });
    return true;
  });

  ipcMain.handle('local-terminal-groups:create', async (_event, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('Group name is required');

    const state = await readLocalTerminalTagsState();
    if (state.groups.some((group) => group.name === safeName)) {
      throw new Error('Group name already exists');
    }

    const group: ServerGroup = {
      id: `local-group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: safeName,
      createdAt: new Date().toISOString(),
      order: state.groups.length
    };
    await writeLocalTerminalTagsState({ ...state, groups: [...state.groups, group] });
    return group;
  });

  ipcMain.handle('local-terminal-groups:rename', async (_event, id: string, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('Group name is required');
    if (id === DEFAULT_GROUP_ID && safeName !== '默认分组') {
      throw new Error('Default group cannot be renamed');
    }

    const state = await readLocalTerminalTagsState();
    if (state.groups.some((group) => group.id !== id && group.name === safeName)) {
      throw new Error('Group name already exists');
    }
    await writeLocalTerminalTagsState({
      ...state,
      groups: state.groups.map((group) => (group.id === id ? { ...group, name: safeName } : group))
    });
    return true;
  });

  ipcMain.handle('local-terminal-groups:delete', async (_event, id: string) => {
    if (id === DEFAULT_GROUP_ID) throw new Error('Default group cannot be deleted');

    const state = await readLocalTerminalTagsState();
    await writeLocalTerminalTagsState({
      ...state,
      groups: state.groups.filter((group) => group.id !== id),
      tags: state.tags.map((tag) =>
        tag.groupId === id ? { ...tag, groupId: DEFAULT_GROUP_ID } : tag
      )
    });
    return true;
  });

  ipcMain.handle('local-terminal:open', async (event, input: LocalTerminalInput) => {
    const cwd = await assertDirectory(input.path);
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('Window is not available');

    closeLocalTerminalSession(input.tabId);

    const shellName = input.shell || 'powershell';
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => Boolean(entry[1]))
    );
    env.TERM = 'xterm-256color';

    const terminal = pty.spawn(shellCommand(shellName), shellArgs(shellName), {
      name: 'xterm-256color',
      cols: input.cols || 100,
      rows: input.rows || 30,
      cwd,
      env
    });

    localTerminalSessions.set(input.tabId, { pty: terminal, window: win });

    terminal.onData((data) => {
      sendLocalTerminalToTab(input.tabId, 'local-terminal:data', {
        tabId: input.tabId,
        data
      });
    });

    terminal.onExit(({ exitCode }) => {
      localTerminalSessions.delete(input.tabId);
      sendLocalTerminalToTab(input.tabId, 'local-terminal:close', {
        tabId: input.tabId,
        exitCode
      });
    });

    return true;
  });

  ipcMain.handle('local-terminal:input', async (_event, tabId: string, data: string) => {
    localTerminalSessions.get(tabId)?.pty.write(data);
    return true;
  });

  ipcMain.handle('local-terminal:resize', async (_event, tabId: string, cols: number, rows: number) => {
    localTerminalSessions.get(tabId)?.pty.resize(cols, rows);
    return true;
  });

  ipcMain.handle('local-terminal:close', async (_event, tabId: string) => {
    closeLocalTerminalSession(tabId);
    return true;
  });

  ipcMain.handle('fs:roots', async () => {
    if (process.platform === 'win32') {
      const roots = [];
      for (let code = 65; code <= 90; code += 1) {
        const drive = `${String.fromCharCode(code)}:\\`;
        try {
          await fs.access(drive);
          roots.push({ name: drive, path: drive });
        } catch {
          // Ignore unavailable drive letters.
        }
      }
      return roots;
    }
    return [{ name: '/', path: '/' }, { name: os.homedir(), path: os.homedir() }];
  });

  ipcMain.handle('fs:list', async (_event, folderPath?: string) => {
    const targetPath = folderPath || os.homedir();
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(targetPath, entry.name);
        let size = 0;
        let modifiedAt = '';
        try {
          const stats = await fs.stat(fullPath);
          size = stats.size;
          modifiedAt = stats.mtime.toISOString();
        } catch {
          // Keep unavailable metadata empty.
        }
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size,
          modifiedAt
        };
      })
    );
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    return { path: targetPath, parent: path.dirname(targetPath), items };
  });

  ipcMain.handle('fs:createFolder', async (_event, folderPath: string, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('Folder name is required');
    await fs.mkdir(path.join(folderPath, safeName));
    return true;
  });

  ipcMain.handle('fs:createFile', async (_event, folderPath: string, name: string) => {
    const safeName = name.trim();
    if (!safeName) throw new Error('File name is required');
    await fs.writeFile(path.join(folderPath, safeName), '', { flag: 'wx' });
    return true;
  });

  ipcMain.handle('fs:rename', async (_event, sourcePath: string, newName: string) => {
    const safeName = newName.trim();
    if (!safeName) throw new Error('New name is required');
    await fs.rename(sourcePath, path.join(path.dirname(sourcePath), safeName));
    return true;
  });

  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    await fs.rm(targetPath, { recursive: true, force: false });
    return true;
  });

  ipcMain.handle('fs:open', async (_event, targetPath: string) => {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
    return true;
  });

  ipcMain.handle('ssh:connect', async (event, input: SshConnectInput) => {
    const password = await passwordFor(input);
    if (!password) throw new Error('Password is required');

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('Window is not available');

    return new Promise<ServerProfile>((resolve, reject) => {
      const conn = new Client();
      let settled = false;

      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
          return;
        }
        sendToTab(input.tabId, 'ssh:error', { tabId: input.tabId, message: error.message });
      };

      conn
        .on('ready', () => {
          const shellOptions = {
            cols: input.cols || 100,
            rows: input.rows || 30,
            term: 'xterm-256color'
          };
          conn.shell(shellOptions, async (err, stream) => {
            if (err) {
              fail(err);
              return;
            }

            sessions.set(input.tabId, { conn, stream, window: win });
            stream.on('data', (data: Buffer) => {
              sendToTab(input.tabId, 'ssh:data', { tabId: input.tabId, data: data.toString('utf8') });
            });
            stream.stderr.on('data', (data: Buffer) => {
              sendToTab(input.tabId, 'ssh:data', { tabId: input.tabId, data: data.toString('utf8') });
            });
            stream.on('close', () => {
              sessions.delete(input.tabId);
              sendToTab(input.tabId, 'ssh:close', { tabId: input.tabId });
              conn.end();
            });

            try {
              const profile = await saveSuccessfulProfile({ ...input, password });
              settled = true;
              resolve(profile);
              sendToTab(input.tabId, 'ssh:ready', { tabId: input.tabId, profile });
            } catch (saveError) {
              fail(saveError as Error);
            }
          });
        })
        .on('error', fail)
        .on('end', () => sendToTab(input.tabId, 'ssh:close', { tabId: input.tabId }))
        .connect({
          host: input.host.trim(),
          port: input.port || 22,
          username: input.username.trim(),
          password,
          readyTimeout: 15000,
          keepaliveInterval: 20000
        } satisfies ConnectConfig);
    });
  });

  ipcMain.handle('ssh:input', async (_event, tabId: string, data: string) => {
    sessions.get(tabId)?.stream.write(data);
    return true;
  });

  ipcMain.handle('ssh:resize', async (_event, tabId: string, cols: number, rows: number) => {
    sessions.get(tabId)?.stream.setWindow(rows, cols, 0, 0);
    return true;
  });

  ipcMain.handle('ssh:disconnect', async (_event, tabId: string) => {
    closeSession(tabId);
    return true;
  });
}
