import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  History,
  LogIn,
  Monitor,
  MoreVertical,
  MoveRight,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  TerminalSquare,
  Trash2,
  X
} from 'lucide-react';
import type {
  DriveRoot,
  FileEntry,
  FileListResult,
  LocalTerminalTag,
  LocalTerminalTagInput,
  LocalTerminalTagsState,
  LocalTerminalShell,
  ProfilesState,
  ServerGroup,
  ServerProfile,
  SshConnectInput
} from './vite-env';
import appIcon from './assets/app-icon.svg';
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

type LocalTerminalStatus = 'opening' | 'ready' | 'closed' | 'error';

type LocalTerminalTab = {
  id: string;
  type: 'local-terminal';
  title: string;
  baseTitle: string;
  path: string;
  shell: LocalTerminalShell;
  status: LocalTerminalStatus;
  message?: string;
};

type AppTab = LocalTab | SshTab | LocalTerminalTab;

type SshEventPayload = {
  tabId: string;
  data?: string;
  message?: string;
  profile?: ServerProfile;
};

type LocalTerminalEventPayload = {
  tabId: string;
  data?: string;
  path?: string;
  exitCode?: number;
};

type CreateEntryKind = 'file' | 'folder';

type DialogOption = {
  id: string;
  label: string;
};

type TextDialogRequest = {
  id: string;
  kind: 'text';
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
};

type ConfirmDialogRequest = {
  id: string;
  kind: 'confirm';
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  resolve: (value: boolean) => void;
};

type SelectDialogRequest = {
  id: string;
  kind: 'select';
  title: string;
  message?: string;
  options: DialogOption[];
  resolve: (value: string | null) => void;
};

type SaveTagDialogValue = {
  name: string;
  groupId: string;
};

type SaveTagDialogRequest = {
  id: string;
  kind: 'saveTag';
  title: string;
  message?: string;
  defaultName: string;
  groupOptions: DialogOption[];
  defaultGroupId: string;
  resolve: (value: SaveTagDialogValue | null) => void;
};

type DialogRequest =
  | TextDialogRequest
  | ConfirmDialogRequest
  | SelectDialogRequest
  | SaveTagDialogRequest;

const DEFAULT_GROUP_ID = 'default';

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

function directoryName(value: string) {
  const parts = value.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || value || '本地终端';
}

function numberedTabTitle(baseTitle: string, openTitles: string[]) {
  if (!openTitles.includes(baseTitle)) return baseTitle;

  let index = 2;
  while (openTitles.includes(`${baseTitle} (${index})`)) {
    index += 1;
  }
  return `${baseTitle} (${index})`;
}

function App() {
  const [tabs, setTabs] = useState<AppTab[]>([
    { id: uid('local'), type: 'local', title: '本地文件' }
  ]);
  const [activeTabId, setActiveTabId] = useState(() => '');
  const [profileState, setProfileState] = useState<ProfilesState>({
    groups: [],
    profiles: []
  });
  const [localTerminalState, setLocalTerminalState] = useState<LocalTerminalTagsState>({
    groups: [],
    tags: []
  });
  const [dialogRequest, setDialogRequest] = useState<DialogRequest | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  useEffect(() => {
    setActiveTabId((current) => current || tabs[0]?.id || '');
  }, [tabs]);

  const refreshProfiles = async () => {
    setProfileState(await window.desktopApi.profiles.list());
  };

  const refreshLocalTerminalTags = async () => {
    setLocalTerminalState(await window.desktopApi.localTerminalTags.list());
  };

  const askText = (request: Omit<TextDialogRequest, 'id' | 'kind' | 'resolve'>) =>
    new Promise<string | null>((resolve) => {
      setDialogRequest({ ...request, id: uid('dialog'), kind: 'text', resolve });
    });

  const askConfirm = (request: Omit<ConfirmDialogRequest, 'id' | 'kind' | 'resolve'>) =>
    new Promise<boolean>((resolve) => {
      setDialogRequest({ ...request, id: uid('dialog'), kind: 'confirm', resolve });
    });

  const askSelect = (request: Omit<SelectDialogRequest, 'id' | 'kind' | 'resolve'>) =>
    new Promise<string | null>((resolve) => {
      setDialogRequest({ ...request, id: uid('dialog'), kind: 'select', resolve });
    });

  const askSaveTag = (request: Omit<SaveTagDialogRequest, 'id' | 'kind' | 'resolve'>) =>
    new Promise<SaveTagDialogValue | null>((resolve) => {
      setDialogRequest({ ...request, id: uid('dialog'), kind: 'saveTag', resolve });
    });

  useEffect(() => {
    refreshProfiles();
    refreshLocalTerminalTags();
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

  useEffect(() => {
    const offCwd = window.desktopApi.localTerminal.onCwd((payload) => {
      const event = payload as LocalTerminalEventPayload;
      if (!event.path) return;
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.tabId && tab.type === 'local-terminal'
            ? { ...tab, path: event.path! }
            : tab
        )
      );
    });

    const offClose = window.desktopApi.localTerminal.onClose((payload) => {
      const event = payload as LocalTerminalEventPayload;
      setTabs((current) =>
        current.map((tab) =>
          tab.id === event.tabId && tab.type === 'local-terminal'
            ? {
                ...tab,
                status: 'closed',
                message: `本地终端已退出${typeof event.exitCode === 'number' ? ` (${event.exitCode})` : ''}`
              }
            : tab
        )
      );
    });
    return () => {
      offCwd();
      offClose();
    };
  }, []);

  const openLocalTab = () => {
    const id = uid('local');
    setTabs((current) => [...current, { id, type: 'local', title: '本地文件' }]);
    setActiveTabId(id);
  };

  const openLocalTerminal = async (targetPath: string, tag?: LocalTerminalTag) => {
    const id = uid('local-terminal');
    const baseTitle = tag?.name || directoryName(targetPath);
    const shell = tag?.shell || 'powershell';
    setTabs((current) => {
      const openTitles = current
        .filter((tab): tab is LocalTerminalTab => tab.type === 'local-terminal')
        .map((tab) => tab.title);
      const title = numberedTabTitle(baseTitle, openTitles);

      return [
        ...current,
        {
          id,
          type: 'local-terminal',
          title,
          baseTitle,
          path: targetPath,
          shell,
          status: 'opening'
        }
      ];
    });
    setActiveTabId(id);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      await window.desktopApi.localTerminal.open({
        tabId: id,
        path: targetPath,
        shell
      });
      setTabs((current) =>
        current.map((tab) =>
          tab.id === id && tab.type === 'local-terminal' ? { ...tab, status: 'ready' } : tab
        )
      );
      if (tag) {
        await window.desktopApi.localTerminalTags.save({
          id: tag.id,
          name: tag.name,
          path: tag.path,
          shell: tag.shell,
          groupId: tag.groupId
        });
        await refreshLocalTerminalTags();
      }
    } catch (error) {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === id && tab.type === 'local-terminal'
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

  const saveLocalTerminalTag = async (
    targetPath: string,
    shell: LocalTerminalShell = 'powershell'
  ) => {
    const groupOptions =
      localTerminalState.groups.length > 0
        ? localTerminalState.groups
        : [{ id: DEFAULT_GROUP_ID, name: '默认分组', createdAt: '', order: 0 }];
    const input = await askSaveTag({
      title: '保存命令行标签',
      message: targetPath,
      defaultName: directoryName(targetPath),
      groupOptions: groupOptions.map((group) => ({ id: group.id, label: group.name })),
      defaultGroupId: groupOptions[0]?.id || DEFAULT_GROUP_ID
    });
    if (!input?.name.trim()) return;
    await window.desktopApi.localTerminalTags.save({
      name: input.name.trim(),
      path: targetPath,
      shell,
      groupId: input.groupId
    });
    await refreshLocalTerminalTags();
  };

  const updateLocalTerminalTag = async (input: LocalTerminalTagInput) => {
    await window.desktopApi.localTerminalTags.save(input);
    await refreshLocalTerminalTags();
  };

  const openSshForm = (groupId?: string) => {
    const id = uid('ssh');
    setTabs((current) => [
      ...current,
      {
        id,
        type: 'ssh',
        title: '新 SSH',
        status: 'form',
        connection: groupId ? { groupId } : undefined
      }
    ]);
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
      credentialKey: profile.credentialKey,
      groupId: profile.groupId
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
    if (tab?.type === 'local-terminal') await window.desktopApi.localTerminal.close(id);
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

  const groups = profileState.groups;
  const profiles = profileState.profiles;
  const localTerminalGroups = localTerminalState.groups;
  const localTerminalTags = localTerminalState.tags;

  return (
    <main className="shell">
      <Sidebar
        groups={groups}
        profiles={profiles}
        localTerminalTags={localTerminalTags}
        localTerminalGroups={localTerminalGroups}
        onAskText={askText}
        onAskConfirm={askConfirm}
        onAskSelect={askSelect}
        onOpenLocal={openLocalTab}
        onOpenLocalTerminal={openLocalTerminal}
        onSaveLocalTerminalTag={updateLocalTerminalTag}
        onNewSsh={openSshForm}
        onOpenProfile={openProfile}
        onDeleteProfile={async (id) => {
          await window.desktopApi.profiles.delete(id);
          await refreshProfiles();
        }}
        onMoveProfile={async (profileId, groupId) => {
          await window.desktopApi.profiles.move(profileId, groupId);
          await refreshProfiles();
        }}
        onCreateGroup={async (name) => {
          await window.desktopApi.groups.create(name);
          await refreshProfiles();
        }}
        onRenameGroup={async (id, name) => {
          await window.desktopApi.groups.rename(id, name);
          await refreshProfiles();
        }}
        onDeleteGroup={async (id) => {
          await window.desktopApi.groups.delete(id);
          await refreshProfiles();
        }}
        onDeleteLocalTerminalTag={async (id) => {
          await window.desktopApi.localTerminalTags.delete(id);
          await refreshLocalTerminalTags();
        }}
        onMoveLocalTerminalTag={async (tagId, groupId) => {
          await window.desktopApi.localTerminalTags.move(tagId, groupId);
          await refreshLocalTerminalTags();
        }}
        onCreateLocalTerminalGroup={async (name) => {
          await window.desktopApi.localTerminalGroups.create(name);
          await refreshLocalTerminalTags();
        }}
        onRenameLocalTerminalGroup={async (id, name) => {
          await window.desktopApi.localTerminalGroups.rename(id, name);
          await refreshLocalTerminalTags();
        }}
        onDeleteLocalTerminalGroup={async (id) => {
          await window.desktopApi.localTerminalGroups.delete(id);
          await refreshLocalTerminalTags();
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
          {activeTab?.type === 'local' && (
            <LocalFiles
              tab={activeTab}
              onOpenTerminal={openLocalTerminal}
              onSaveTerminalTag={saveLocalTerminalTag}
            />
          )}
          {activeTab?.type === 'ssh' && (
            <SshWorkspace tab={activeTab} groups={groups} onConnect={connectSsh} />
          )}
          {activeTab?.type === 'local-terminal' && (
            <LocalTerminalWorkspace tab={activeTab} onSaveTerminalTag={saveLocalTerminalTag} />
          )}
        </div>
      </section>
      <DialogHost
        request={dialogRequest}
        onClose={() => {
          setDialogRequest(null);
        }}
      />
    </main>
  );
}

function DialogHost({ request, onClose }: { request: DialogRequest | null; onClose: () => void }) {
  const [textValue, setTextValue] = useState('');
  const [selectedValue, setSelectedValue] = useState('');
  const textInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!request) return;
    if (request.kind === 'text' || request.kind === 'saveTag') {
      setTextValue(request.kind === 'text' ? request.defaultValue || '' : request.defaultName);
      window.setTimeout(() => textInputRef.current?.focus(), 0);
    }
    if (request.kind === 'select') {
      setSelectedValue(request.options[0]?.id || '');
    }
    if (request.kind === 'saveTag') {
      setSelectedValue(request.defaultGroupId || request.groupOptions[0]?.id || '');
    }
  }, [request]);

  if (!request) return null;

  const close = () => {
    onClose();
  };

  const cancel = () => {
    if (request.kind === 'text' || request.kind === 'select' || request.kind === 'saveTag') {
      request.resolve(null);
    } else {
      request.resolve(false);
    }
    close();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (request.kind === 'text') {
      request.resolve(textValue);
    } else if (request.kind === 'select') {
      request.resolve(selectedValue || null);
    } else if (request.kind === 'saveTag') {
      request.resolve({ name: textValue, groupId: selectedValue || request.defaultGroupId });
    } else {
      request.resolve(true);
    }
    close();
  };

  return (
    <div className="dialogBackdrop" role="presentation" onMouseDown={cancel}>
      <form
        className="dialogPanel"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialogTitle">{request.title}</div>
        {request.message && <div className="dialogMessage">{request.message}</div>}

        {request.kind === 'text' && (
          <input
            ref={textInputRef}
            value={textValue}
            onChange={(event) => setTextValue(event.target.value)}
            placeholder={request.placeholder}
          />
        )}

        {request.kind === 'select' && (
          <select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)}>
            {request.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {request.kind === 'saveTag' && (
          <div className="dialogFieldGrid">
            <label>
              标签名称
              <input
                ref={textInputRef}
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
              />
            </label>
            <label>
              保存分组
              <select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)}>
                {request.groupOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="dialogActions">
          {request.kind !== 'confirm' || request.cancelText !== '' ? (
            <button className="iconButton textButton" type="button" onClick={cancel}>
              {request.kind === 'confirm' ? request.cancelText || '取消' : '取消'}
            </button>
          ) : null}
          <button className="primaryButton compactButton" type="submit">
            {request.kind === 'confirm' ? request.confirmText || '确定' : '确定'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Sidebar({
  groups,
  profiles,
  localTerminalTags,
  localTerminalGroups,
  onAskText,
  onAskConfirm,
  onAskSelect,
  onOpenLocal,
  onOpenLocalTerminal,
  onSaveLocalTerminalTag,
  onNewSsh,
  onOpenProfile,
  onDeleteProfile,
  onMoveProfile,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onDeleteLocalTerminalTag,
  onMoveLocalTerminalTag,
  onCreateLocalTerminalGroup,
  onRenameLocalTerminalGroup,
  onDeleteLocalTerminalGroup
}: {
  groups: ServerGroup[];
  profiles: ServerProfile[];
  localTerminalTags: LocalTerminalTag[];
  localTerminalGroups: ServerGroup[];
  onAskText: (request: Omit<TextDialogRequest, 'id' | 'kind' | 'resolve'>) => Promise<string | null>;
  onAskConfirm: (request: Omit<ConfirmDialogRequest, 'id' | 'kind' | 'resolve'>) => Promise<boolean>;
  onAskSelect: (request: Omit<SelectDialogRequest, 'id' | 'kind' | 'resolve'>) => Promise<string | null>;
  onOpenLocal: () => void;
  onOpenLocalTerminal: (targetPath: string, tag?: LocalTerminalTag) => void;
  onSaveLocalTerminalTag: (input: LocalTerminalTagInput) => void;
  onNewSsh: (groupId?: string) => void;
  onOpenProfile: (profile: ServerProfile) => void;
  onDeleteProfile: (id: string) => void;
  onMoveProfile: (profileId: string, groupId: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onDeleteLocalTerminalTag: (id: string) => void;
  onMoveLocalTerminalTag: (tagId: string, groupId: string) => void;
  onCreateLocalTerminalGroup: (name: string) => void;
  onRenameLocalTerminalGroup: (id: string, name: string) => void;
  onDeleteLocalTerminalGroup: (id: string) => void;
}) {
  const [collapsedSshGroupIds, setCollapsedSshGroupIds] = useState<Set<string>>(() => new Set());
  const [collapsedLocalGroupIds, setCollapsedLocalGroupIds] = useState<Set<string>>(() => new Set());
  const fallbackGroup = {
    id: DEFAULT_GROUP_ID,
    name: '默认分组',
    createdAt: '',
    order: 0
  };
  const visibleGroups =
    groups.length > 0
      ? groups
      : [fallbackGroup];
  const visibleLocalGroups =
    localTerminalGroups.length > 0
      ? localTerminalGroups
      : [fallbackGroup];

  const profilesByGroup = useMemo(() => {
    const grouped = new Map<string, ServerProfile[]>();
    visibleGroups.forEach((group) => grouped.set(group.id, []));
    profiles.forEach((profile) => {
      const groupId = profile.groupId || DEFAULT_GROUP_ID;
      const bucket = grouped.get(groupId) || grouped.get(DEFAULT_GROUP_ID) || [];
      bucket.push(profile);
      grouped.set(grouped.has(groupId) ? groupId : DEFAULT_GROUP_ID, bucket);
    });
    return grouped;
  }, [profiles, visibleGroups]);

  const localTagsByGroup = useMemo(() => {
    const grouped = new Map<string, LocalTerminalTag[]>();
    visibleLocalGroups.forEach((group) => grouped.set(group.id, []));
    localTerminalTags.forEach((tag) => {
      const groupId = tag.groupId || DEFAULT_GROUP_ID;
      const bucket = grouped.get(groupId) || grouped.get(DEFAULT_GROUP_ID) || [];
      bucket.push(tag);
      grouped.set(grouped.has(groupId) ? groupId : DEFAULT_GROUP_ID, bucket);
    });
    return grouped;
  }, [localTerminalTags, visibleLocalGroups]);

  const toggleSshGroup = (groupId: string) => {
    setCollapsedSshGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleLocalGroup = (groupId: string) => {
    setCollapsedLocalGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const createGroup = async () => {
    const name = await onAskText({
      title: '新建远程分组',
      placeholder: '分组名称'
    });
    if (name?.trim()) onCreateGroup(name);
  };

  const createLocalTerminalGroup = async () => {
    const name = await onAskText({
      title: '新建本地分组',
      placeholder: '本地分组名称'
    });
    if (name?.trim()) onCreateLocalTerminalGroup(name);
  };

  const renameGroup = async (group: ServerGroup) => {
    const name = await onAskText({
      title: '重命名远程分组',
      defaultValue: group.name
    });
    if (name?.trim() && name !== group.name) onRenameGroup(group.id, name);
  };

  const renameLocalTerminalGroup = async (group: ServerGroup) => {
    const name = await onAskText({
      title: '重命名本地分组',
      defaultValue: group.name
    });
    if (name?.trim() && name !== group.name) onRenameLocalTerminalGroup(group.id, name);
  };

  const deleteGroup = async (group: ServerGroup) => {
    if (await onAskConfirm({
      title: '删除远程分组',
      message: `删除分组 ${group.name}？连接会移动到默认分组。`,
      confirmText: '删除'
    })) {
      onDeleteGroup(group.id);
    }
  };

  const deleteLocalTerminalGroup = async (group: ServerGroup) => {
    if (await onAskConfirm({
      title: '删除本地分组',
      message: `删除本地分组 ${group.name}？标签会移动到默认分组。`,
      confirmText: '删除'
    })) {
      onDeleteLocalTerminalGroup(group.id);
    }
  };

  const moveProfile = async (profile: ServerProfile) => {
    const options = visibleGroups.filter((group) => group.id !== (profile.groupId || DEFAULT_GROUP_ID));
    if (options.length === 0) {
      await onAskConfirm({
        title: '暂无其他分组',
        message: '请先新建一个远程分组。',
        confirmText: '知道了',
        cancelText: ''
      });
      return;
    }

    const choice = await onAskSelect({
      title: '移动到远程分组',
      options: options.map((group) => ({ id: group.id, label: group.name }))
    });
    if (!choice) return;

    const target = options.find((group) => group.id === choice);
    if (target) onMoveProfile(profile.id, target.id);
  };

  const moveLocalTerminalTag = async (tag: LocalTerminalTag) => {
    const options = visibleLocalGroups.filter((group) => group.id !== (tag.groupId || DEFAULT_GROUP_ID));
    if (options.length === 0) {
      await onAskConfirm({
        title: '暂无其他分组',
        message: '请先新建一个本地分组。',
        confirmText: '知道了',
        cancelText: ''
      });
      return;
    }

    const choice = await onAskSelect({
      title: '移动到本地分组',
      options: options.map((group) => ({ id: group.id, label: group.name }))
    });
    if (!choice) return;

    const target = options.find((group) => group.id === choice);
    if (target) onMoveLocalTerminalTag(tag.id, target.id);
  };

  const editLocalTerminalTag = async (tag: LocalTerminalTag) => {
    const name = await onAskText({
      title: '修改标签名称',
      defaultValue: tag.name
    });
    if (!name?.trim()) return;

    const tagPath = await onAskText({
      title: '修改目录路径',
      defaultValue: tag.path
    });
    if (!tagPath?.trim()) return;

    onSaveLocalTerminalTag({
      id: tag.id,
      name,
      path: tagPath,
      shell: tag.shell,
      groupId: tag.groupId
    });
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark">
          <img src={appIcon} alt="" />
        </div>
        <div>
          <strong>Easy SSH</strong>
          <span>Desktop</span>
        </div>
      </div>

      <div className="quickActions">
        <button className="primaryButton" type="button" onClick={() => onNewSsh()}>
          <LogIn size={16} />
          SSH
        </button>
        <button className="iconButton" type="button" title="本地文件" onClick={onOpenLocal}>
          <FolderOpen size={17} />
        </button>
      </div>

      <div className="sideSection terminalTagsSection">
        <div className="sideTitle">
          <span>
            <TerminalSquare size={15} />
            本地命令行
          </span>
          <button className="iconButton tiny" type="button" title="新建本地分组" onClick={createLocalTerminalGroup}>
            <FolderPlus size={14} />
          </button>
        </div>
        <div className="profileList">
          {visibleLocalGroups.map((group) => {
            const groupTags = localTagsByGroup.get(group.id) || [];
            const collapsed = collapsedLocalGroupIds.has(group.id);

            return (
              <section className="profileGroup" key={group.id}>
                <div className="groupHeader">
                  <button className="groupToggle" type="button" onClick={() => toggleLocalGroup(group.id)}>
                    {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <Folder size={15} />
                    <span>{group.name}</span>
                    <small>{groupTags.length}</small>
                  </button>
                  {group.id !== DEFAULT_GROUP_ID && (
                    <div className="groupActions">
                      <button
                        className="iconButton tiny"
                        type="button"
                        title="重命名本地分组"
                        onClick={() => renameLocalTerminalGroup(group)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="iconButton tiny danger"
                        type="button"
                        title="删除本地分组"
                        onClick={() => deleteLocalTerminalGroup(group)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {!collapsed && (
                  <div className="groupProfiles">
                    {groupTags.length === 0 && <div className="emptyState compact">空分组</div>}
                    {groupTags.map((tag) => (
                      <button
                        key={tag.id}
                        className="terminalTagItem"
                        type="button"
                        title={tag.path}
                        onClick={() => onOpenLocalTerminal(tag.path, tag)}
                      >
                        <TerminalSquare size={16} />
                        <span>
                          <strong>{tag.name}</strong>
                          <small>{tag.path}</small>
                        </span>
                        <span className="terminalTagActions">
                          <span
                            className="profileAction"
                            title="修改标签"
                            onClick={(event) => {
                              event.stopPropagation();
                              editLocalTerminalTag(tag);
                            }}
                          >
                            <Pencil size={14} />
                          </span>
                          <span
                            className="profileAction"
                            title="移动到分组"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveLocalTerminalTag(tag);
                            }}
                          >
                            <MoveRight size={14} />
                          </span>
                          <span
                            className="profileAction danger"
                            title="删除"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteLocalTerminalTag(tag.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div className="sideSection">
        <div className="sideTitle">
          <span>
            <History size={15} />
            历史连接
          </span>
          <button className="iconButton tiny" type="button" title="新建分组" onClick={createGroup}>
            <FolderPlus size={14} />
          </button>
        </div>
        <div className="profileList">
          {profiles.length === 0 && <div className="emptyState">暂无连接</div>}
          {visibleGroups.map((group) => {
            const groupProfiles = profilesByGroup.get(group.id) || [];
            const collapsed = collapsedSshGroupIds.has(group.id);

            return (
              <section className="profileGroup" key={group.id}>
                <div className="groupHeader">
                  <button className="groupToggle" type="button" onClick={() => toggleSshGroup(group.id)}>
                    {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <Folder size={15} />
                    <span>{group.name}</span>
                    <small>{groupProfiles.length}</small>
                  </button>
                  <div className="groupActions">
                    <button
                      className="iconButton tiny"
                      type="button"
                      title="在此分组新建 SSH"
                      onClick={() => onNewSsh(group.id)}
                    >
                      <Plus size={14} />
                    </button>
                    {group.id !== DEFAULT_GROUP_ID && (
                      <>
                        <button
                          className="iconButton tiny"
                          type="button"
                          title="重命名分组"
                          onClick={() => renameGroup(group)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="iconButton tiny danger"
                          type="button"
                          title="删除分组"
                          onClick={() => deleteGroup(group)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!collapsed && (
                  <div className="groupProfiles">
                    {groupProfiles.length === 0 && <div className="emptyState compact">空分组</div>}
                    {groupProfiles.map((profile) => (
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
                        <span className="profileActions">
                          <span
                            className="profileAction"
                            title="移动到分组"
                            onClick={(event) => {
                              event.stopPropagation();
                              moveProfile(profile);
                            }}
                          >
                            <MoveRight size={14} />
                          </span>
                          <span
                            className="profileAction danger"
                            title="删除"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteProfile(profile.id);
                            }}
                          >
                            <Trash2 size={14} />
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
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
            {tab.type === 'local' ? (
              <HardDrive size={15} />
            ) : tab.type === 'local-terminal' ? (
              <TerminalSquare size={15} />
            ) : (
              <Monitor size={15} />
            )}
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
  groups,
  onConnect
}: {
  tab: SshTab;
  groups: ServerGroup[];
  onConnect: (input: SshConnectInput) => void;
}) {
  if (tab.status === 'form' || tab.status === 'error') {
    return <SshForm tab={tab} groups={groups} onConnect={onConnect} />;
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
  groups,
  onConnect
}: {
  tab: SshTab;
  groups: ServerGroup[];
  onConnect: (input: SshConnectInput) => void;
}) {
  const groupOptions =
    groups.length > 0
      ? groups
      : [{ id: DEFAULT_GROUP_ID, name: '默认分组', createdAt: '', order: 0 }];
  const [name, setName] = useState(tab.profile?.name || tab.connection?.name || '');
  const [host, setHost] = useState(tab.profile?.host || tab.connection?.host || '');
  const [port, setPort] = useState(tab.profile?.port?.toString() || tab.connection?.port?.toString() || '22');
  const [username, setUsername] = useState(tab.profile?.username || tab.connection?.username || '');
  const [groupId, setGroupId] = useState(
    tab.profile?.groupId || tab.connection?.groupId || groupOptions[0]?.id || DEFAULT_GROUP_ID
  );
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConnect({
      tabId: tab.id,
      name,
      host,
      port: Number(port) || 22,
      username,
      password,
      groupId
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
        <label>
          保存分组
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
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

function LocalTerminalWorkspace({
  tab,
  onSaveTerminalTag
}: {
  tab: LocalTerminalTab;
  onSaveTerminalTag: (targetPath: string, shell?: LocalTerminalShell) => void;
}) {
  const isActive = tab.status === 'opening' || tab.status === 'ready';

  return (
    <div className="sshLayout">
      <div className="terminalHeader">
        <div className="connectionState">
          <Circle
            size={10}
            fill={tab.status === 'ready' ? '#39d98a' : tab.status === 'error' ? '#ff6b7a' : '#f5c542'}
            color={tab.status === 'ready' ? '#39d98a' : tab.status === 'error' ? '#ff6b7a' : '#f5c542'}
          />
          <span>
            {tab.status === 'ready'
              ? '本地终端'
              : tab.status === 'opening'
                ? '正在打开'
                : tab.message || '本地终端已关闭'}
          </span>
          <button
            className="primaryButton compactButton"
            type="button"
            title="保存为命令行标签"
            onClick={() => onSaveTerminalTag(tab.path, tab.shell)}
          >
            <FolderPlus size={15} />
            保存标签
          </button>
        </div>
        <div className="terminalHeaderActions">
          <span className="endpoint">
            {tab.shell === 'cmd' ? 'CMD' : 'PowerShell'} · {tab.path}
          </span>
        </div>
      </div>
      <LocalTerminalPanel tabId={tab.id} enabled={isActive} />
    </div>
  );
}

function LocalTerminalPanel({ tabId, enabled }: { tabId: string; enabled: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
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
      if (enabledRef.current) window.desktopApi.localTerminal.input(tabId, data);
    });

    const resize = () => {
      fit.fit();
      window.desktopApi.localTerminal.resize(tabId, terminal.cols, terminal.rows);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);

    terminalRef.current = terminal;

    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    const offData = window.desktopApi.localTerminal.onData((payload) => {
      const event = payload as LocalTerminalEventPayload;
      if (event.tabId === tabId && event.data) {
        terminalRef.current?.write(event.data);
      }
    });
    return offData;
  }, [tabId]);

  return <div ref={containerRef} className="terminalHost" />;
}

function LocalFiles({
  tab,
  onOpenTerminal,
  onSaveTerminalTag
}: {
  tab: LocalTab;
  onOpenTerminal: (targetPath: string) => void;
  onSaveTerminalTag: (targetPath: string, shell?: LocalTerminalShell) => void;
}) {
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
          onClick={() => listing && onOpenTerminal(listing.path)}
          disabled={!listing}
        >
          <TerminalSquare size={16} />
          终端
        </button>
        <button
          className="primaryButton"
          type="button"
          title="保存为命令行标签"
          onClick={() => listing && onSaveTerminalTag(listing.path)}
          disabled={!listing}
        >
          <FolderPlus size={16} />
          保存标签
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
