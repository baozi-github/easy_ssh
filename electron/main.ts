import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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
};

type StoredProfile = ServerProfile & {
  encryptedPassword?: string;
};

type SshConnectInput = {
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

type SshSession = {
  conn: Client;
  stream: ClientChannel;
  window: BrowserWindow;
};

const sessions = new Map<string, SshSession>();

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0];
}

function profilesPath() {
  return path.join(app.getPath('userData'), 'server-profiles.json');
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

async function readStoredProfiles(): Promise<StoredProfile[]> {
  await ensureProfilesFile();
  const raw = await fs.readFile(profilesPath(), 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredProfiles(profiles: StoredProfile[]) {
  await ensureProfilesFile();
  await fs.writeFile(profilesPath(), JSON.stringify(profiles, null, 2), 'utf8');
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
  const profiles = await readStoredProfiles();
  const id = profileId(input);
  const existing = profiles.find((item) => item.id === id);
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
    encryptedPassword: input.password
      ? encryptPassword(input.password)
      : existing?.encryptedPassword
  };

  const next = [profile, ...profiles.filter((item) => item.id !== id)];
  await writeStoredProfiles(next);
  return publicProfile(profile);
}

async function passwordFor(input: SshConnectInput) {
  if (input.password) return input.password;
  if (!input.credentialKey) return undefined;
  const profile = (await readStoredProfiles()).find(
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

async function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    title: 'Easy SSH',
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
  if (process.platform !== 'darwin') app.quit();
});

function closeSession(tabId: string) {
  const session = sessions.get(tabId);
  if (!session) return;
  sessions.delete(tabId);
  session.stream.end();
  session.conn.end();
}

function registerIpc() {
  ipcMain.handle('profiles:list', async () => {
    const profiles = await readStoredProfiles();
    return profiles.map(publicProfile);
  });

  ipcMain.handle('profiles:delete', async (_event, id: string) => {
    const profiles = await readStoredProfiles();
    await writeStoredProfiles(profiles.filter((item) => item.id !== id));
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
