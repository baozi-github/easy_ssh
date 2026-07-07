import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  ChevronLeft,
  Circle,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  History,
  LogIn,
  Monitor,
  MoreVertical,
  Plus,
  RefreshCw,
  Server,
  TerminalSquare,
  Trash2,
  X
} from 'lucide-react';
import type { DriveRoot, FileEntry, FileListResult, ServerProfile, SshConnectInput } from './vite-env';
import './styles.css';

type LocalTab = {
  id: string;
  type: 'local';
  title: string;
  path?: string;
};

type SshTabStatus = 'form' | 'connecting' | 'connected' | 'closed' | 'error';

type SshTab = {
  id: string;
  type: 'ssh';
  title: string;
  status: SshTabStatus;
  profile?: ServerProfile;
  connection?: Partial<SshConnectInput>;
  message?: string;
};

type AppTab = LocalTab | SshTab;

type SshEventPayload = {
  tabId: string;
  data?: string;
  message?: string;
  profile?: ServerProfile;
};

type CreateEntryKind = 'file' | 'folder';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function App() {
  const [tabs, setTabs] = useState<AppTab[]>([
    { id: uid('local'), type: 'local', title: '本地文件' }
  ]);
  const [activeTabId, setActiveTabId] = useState(() => '');
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  useEffect(() => {
    setActiveTabId((current) => current || tabs[0]?.id || '');
  }, [tabs]);

  const refreshProfiles = async () => {
    setProfiles(await window.desktopApi.profiles.list());
  };

  useEffect(() => {
    refreshProfiles();
  }, []);

  useEffect(() => {
    const offReady = window.desktopApi.ssh.onReady((payload) => {
      const event = payload as SshEventPayload;
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.tabId && tab.type === 'ssh'
            ? {
                ...tab,
                status: 'connected',
                title: event.profile?.name || tab.title,
                profile: event.profile,
                message: undefined
              }
            : tab
        )
      );
      refreshProfiles();
    });

    const offError = window.desktopApi.ssh.onError((payload) => {
      const event = payload as SshEventPayload;
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.tabId && tab.type === 'ssh'
            ? { ...tab, status: 'error', message: event.message || '连接异常' }
            : tab
        )
      );
    });

    const offClose = window.desktopApi.ssh.onClose((payload) => {
      const event = payload as SshEventPayload;
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.tabId && tab.type === 'ssh' && tab.status === 'connected'
            ? { ...tab, status: 'closed', message: '连接已断开' }
            : tab
        )
      );
    });

    return () => {
      offReady();
      offError();
      offClose();
    };
  }, []);

  const openLocalTab = () => {
    const id = uid('local');
    setTabs((current) => [...current, { id, type: 'local', title: '本地文件' }]);
    setActiveTabId(id);
  };

  const openSshForm = () => {
    const id = uid('ssh');
    setTabs((current) => [...current, { id, type: 'ssh', title: '新 SSH', status: 'form' }]);
    setActiveTabId(id);
  };

  const openProfile = (profile: ServerProfile) => {
    const id = uid('ssh');
    const input = {
      tabId: id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      credentialKey: profile.credentialKey
    };
    setTabs((current) => [
      ...current,
      {
        id,
        type: 'ssh',
        title: profile.name,
        status: 'connecting',
        profile,
        connection: input
      }
    ]);
    setActiveTabId(id);
    connectSsh(input);
  };

  const closeTab = async (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (tab?.type === 'ssh') await window.desktopApi.ssh.disconnect(id);
    setTabs((current) => {
      const next = current.filter((item) => item.id !== id);
      return next;
    });
    if (activeTabId === id) {
      const index = tabs.findIndex((item) => item.id === id);
      setActiveTabId(tabs[index - 1]?.id || tabs[index + 1]?.id || '');
    }
  };

  const connectSsh = async (input: SshConnectInput) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === input.tabId && tab.type === 'ssh'
          ? { ...tab, status: 'connecting', title: input.name || input.host, connection: input }
          : tab
      )
    );
    try {
      const profile = await window.desktopApi.ssh.connect(input);
      setTabs((current) =>
        current.map((tab) =>
          tab.id === input.tabId && tab.type === 'ssh'
            ? { ...tab, status: 'connected', profile, title: profile.name }
            : tab
        )
      );
      await refreshProfiles();
    } catch (error) {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === input.tabId && tab.type === 'ssh'
            ? {
                ...tab,
                status: 'error',
                message: error instanceof Error ? error.message : String(error)
              }
            : tab
        )
      );
    }
  };

  return (
    <main className="shell">
      <Sidebar
        profiles={profiles}
        onOpenLocal={openLocalTab}
        onNewSsh={openSshForm}
        onOpenProfile={openProfile}
        onDeleteProfile={async (id) => {
          await window.desktopApi.profiles.delete(id);
          await refreshProfiles();
        }}
      />
      <section className="workspace">
        <TabBar
          tabs={tabs}
          activeTabId={activeTab?.id || ''}
          onActivate={setActiveTabId}
          onClose={closeTab}
          onNew={openSshForm}
        />
        <div className="tabSurface">
          {activeTab?.type === 'local' && <LocalFiles tab={activeTab} />}
          {activeTab?.type === 'ssh' && <SshWorkspace tab={activeTab} onConnect={connectSsh} />}
        </div>
      </section>
    </main>
  );
}

function Sidebar({
  profiles,
  onOpenLocal,
  onNewSsh,
  onOpenProfile,
  onDeleteProfile
}: {
  profiles: ServerProfile[];
  onOpenLocal: () => void;
  onNewSsh: () => void;
  onOpenProfile: (profile: ServerProfile) => void;
  onDeleteProfile: (id: string) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark">
          <TerminalSquare size={20} />
        </div>
        <div>
          <strong>XXLL SSH</strong>
          <span>Desktop</span>
        </div>
      </div>

      <div className="quickActions">
        <button className="primaryButton" type="button" onClick={onNewSsh}>
          <LogIn size={16} />
          SSH
        </button>
        <button className="iconButton" type="button" title="本地文件" onClick={onOpenLocal}>
          <FolderOpen size={17} />
        </button>
      </div>

      <div className="sideSection">
        <div className="sideTitle">
          <History size={15} />
          历史连接
        </div>
        <div className="profileList">
          {profiles.length === 0 && <div className="emptyState">暂无连接</div>}
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className="profileItem"
              type="button"
              onClick={() => onOpenProfile(profile)}
              title={`${profile.username}@${profile.host}:${profile.port}`}
            >
              <Server size={17} />
              <span className="profileText">
                <strong>{profile.name}</strong>
                <small>
                  {profile.username}@{profile.host}
                </small>
              </span>
              <span className="profileMeta">{formatTime(profile.lastConnectedAt)}</span>
              <span
                className="deleteProfile"
                title="删除"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteProfile(profile.id);
                }}
              >
                <Trash2 size={14} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
  onNew
}: {
  tabs: AppTab[];
  activeTabId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <header className="tabBar">
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            type="button"
            onClick={() => onActivate(tab.id)}
          >
            {tab.type === 'local' ? <HardDrive size={15} /> : <Monitor size={15} />}
            <span>{tab.title}</span>
            <X
              size={14}
              className="tabClose"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.id);
              }}
            />
          </button>
        ))}
      </div>
      <button className="iconButton addTab" type="button" title="新建 SSH 标签" onClick={onNew}>
        <Plus size={18} />
      </button>
    </header>
  );
}

function SshWorkspace({
  tab,
  onConnect
}: {
  tab: SshTab;
  onConnect: (input: SshConnectInput) => void;
}) {
  if (tab.status === 'form' || tab.status === 'error') {
    return <SshForm tab={tab} onConnect={onConnect} />;
  }

  return (
    <div className="sshLayout">
      <div className="terminalHeader">
        <div className="connectionState">
          <Circle
            size={10}
            fill={tab.status === 'connected' ? '#39d98a' : '#f5c542'}
            color={tab.status === 'connected' ? '#39d98a' : '#f5c542'}
          />
          <span>{tab.status === 'connected' ? '已连接' : tab.message || '连接中'}</span>
        </div>
        {tab.profile && (
          <span className="endpoint">
            {tab.profile.username}@{tab.profile.host}:{tab.profile.port}
          </span>
        )}
      </div>
      <TerminalPanel tabId={tab.id} enabled={tab.status === 'connected'} />
    </div>
  );
}

function SshForm({
  tab,
  onConnect
}: {
  tab: SshTab;
  onConnect: (input: SshConnectInput) => void;
}) {
  const [name, setName] = useState(tab.profile?.name || tab.connection?.name || '');
  const [host, setHost] = useState(tab.profile?.host || tab.connection?.host || '');
  const [port, setPort] = useState(tab.profile?.port?.toString() || tab.connection?.port?.toString() || '22');
  const [username, setUsername] = useState(tab.profile?.username || tab.connection?.username || '');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConnect({
      tabId: tab.id,
      name,
      host,
      port: Number(port) || 22,
      username,
      password
    });
  };

  return (
    <div className="formWrap">
      <form className="sshForm" onSubmit={submit}>
        <div className="formTitle">
          <Server size={20} />
          <h1>SSH 连接</h1>
        </div>
        {tab.message && <div className="errorBanner">{tab.message}</div>}
        <label>
          名称
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="生产服务器" />
        </label>
        <label>
          主机
          <input
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="192.168.1.10"
            required
          />
        </label>
        <div className="fieldGrid">
          <label>
            端口
            <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            用户名
            <input value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
        </div>
        <label>
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        <button className="primaryButton submitButton" type="submit">
          <LogIn size={17} />
          连接
        </button>
      </form>
    </div>
  );
}

function TerminalPanel({ tabId, enabled }: { tabId: string; enabled: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: '#101216',
        foreground: '#d8dee9',
        cursor: '#f5c542',
        selectionBackground: '#36506a'
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(containerRef.current);
    fit.fit();
    terminal.focus();

    terminal.onData((data) => {
      if (enabledRef.current) window.desktopApi.ssh.input(tabId, data);
    });

    const resize = () => {
      fit.fit();
      window.desktopApi.ssh.resize(tabId, terminal.cols, terminal.rows);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);

    terminalRef.current = terminal;
    fitRef.current = fit;

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    const offData = window.desktopApi.ssh.onData((payload) => {
      const event = payload as SshEventPayload;
      if (event.tabId === tabId && event.data) {
        terminalRef.current?.write(event.data);
      }
    });
    return offData;
  }, [tabId]);

  return <div ref={containerRef} className="terminalHost" />;
}

function LocalFiles({ tab }: { tab: LocalTab }) {
  const [roots, setRoots] = useState<DriveRoot[]>([]);
  const [listing, setListing] = useState<FileListResult | null>(null);
  const [pathInput, setPathInput] = useState(tab.path || '');
  const [error, setError] = useState('');
  const [createKind, setCreateKind] = useState<CreateEntryKind | null>(null);
  const [newEntryName, setNewEntryName] = useState('');
  const newEntryInputRef = useRef<HTMLInputElement | null>(null);

  const load = async (targetPath?: string) => {
    try {
      setError('');
      const result = await window.desktopApi.files.list(targetPath);
      setListing(result);
      setPathInput(result.path);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  };

  useEffect(() => {
    window.desktopApi.files.roots().then(setRoots);
    load(tab.path);
  }, [tab.id]);

  useEffect(() => {
    if (createKind) newEntryInputRef.current?.focus();
  }, [createKind]);

  const startCreateEntry = (kind: CreateEntryKind) => {
    if (!listing) return;
    setError('');
    setNewEntryName('');
    setCreateKind(kind);
  };

  const cancelCreateEntry = () => {
    setCreateKind(null);
    setNewEntryName('');
    setError('');
  };

  const createEntry = async (event: FormEvent) => {
    event.preventDefault();
    if (!listing || !createKind) return;
    const name = newEntryName.trim();
    if (!name) {
      setError(createKind === 'folder' ? '请输入文件夹名称' : '请输入文件名');
      newEntryInputRef.current?.focus();
      return;
    }

    try {
      setError('');
      if (createKind === 'folder') {
        await window.desktopApi.files.createFolder(listing.path, name);
      } else {
        await window.desktopApi.files.createFile(listing.path, name);
      }
      setCreateKind(null);
      setNewEntryName('');
      await load(listing.path);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
      newEntryInputRef.current?.focus();
    }
  };

  const renameEntry = async (entry: FileEntry) => {
    const newName = window.prompt('新名称', entry.name);
    if (!newName || newName === entry.name) return;
    await window.desktopApi.files.rename(entry.path, newName);
    await load(listing?.path);
  };

  const deleteEntry = async (entry: FileEntry) => {
    if (!window.confirm(`删除 ${entry.name}？`)) return;
    await window.desktopApi.files.delete(entry.path);
    await load(listing?.path);
  };

  return (
    <div className="fileLayout">
      <div className="fileToolbar">
        <button
          className="iconButton"
          type="button"
          title="上一级"
          onClick={() => listing?.parent && load(listing.parent)}
        >
          <ChevronLeft size={18} />
        </button>
        <form
          className="pathForm"
          onSubmit={(event) => {
            event.preventDefault();
            load(pathInput);
          }}
        >
          <input value={pathInput} onChange={(event) => setPathInput(event.target.value)} />
        </form>
        <button className="iconButton" type="button" title="刷新" onClick={() => load(listing?.path)}>
          <RefreshCw size={17} />
        </button>
        <button
          className="primaryButton"
          type="button"
          onClick={() => startCreateEntry('folder')}
          disabled={!listing}
        >
          <Folder size={16} />
          文件夹
        </button>
        <button
          className="primaryButton"
          type="button"
          onClick={() => startCreateEntry('file')}
          disabled={!listing}
        >
          <File size={16} />
          文件
        </button>
        {createKind && (
          <form className="newEntryForm" onSubmit={createEntry}>
            <input
              ref={newEntryInputRef}
              value={newEntryName}
              onChange={(event) => setNewEntryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelCreateEntry();
                }
              }}
              placeholder={createKind === 'folder' ? '文件夹名称' : '文件名，例如 notes.txt'}
            />
            <button className="primaryButton compactButton" type="submit">
              确定
            </button>
            <button
              className="iconButton"
              type="button"
              title="取消"
              onClick={cancelCreateEntry}
            >
              <X size={16} />
            </button>
          </form>
        )}
      </div>

      <div className="fileBody">
        <nav className="driveRail">
          {roots.map((root) => (
            <button key={root.path} type="button" onClick={() => load(root.path)}>
              <HardDrive size={16} />
              {root.name}
            </button>
          ))}
        </nav>
        <section className="fileTable">
          {error && <div className="errorBanner">{error}</div>}
          <div className="fileHeader">
            <span>名称</span>
            <span>大小</span>
            <span>修改时间</span>
            <span />
          </div>
          <div className="fileRows">
            {listing?.items.map((entry) => (
              <div
                key={entry.path}
                className="fileRow"
                onDoubleClick={() =>
                  entry.type === 'directory' ? load(entry.path) : window.desktopApi.files.open(entry.path)
                }
              >
                <span className="fileName">
                  {entry.type === 'directory' ? <Folder size={17} /> : <File size={17} />}
                  {entry.name}
                </span>
                <span>{entry.type === 'directory' ? '--' : formatSize(entry.size)}</span>
                <span>{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString('zh-CN') : ''}</span>
                <span className="rowActions">
                  <button className="iconButton small" type="button" title="重命名" onClick={() => renameEntry(entry)}>
                    <MoreVertical size={15} />
                  </button>
                  <button className="iconButton small danger" type="button" title="删除" onClick={() => deleteEntry(entry)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
