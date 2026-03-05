import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SquareTerminal,
  RefreshCw,
  Terminal,
  SquarePlus,
  SplitSquareHorizontal,
  Palette,
  Type,
  X,
  Pencil,
  Trash2,
  Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';
import { TERMINAL_FONT_OPTIONS } from '@/config/terminal-themes';
import { DEFAULT_FONT_VALUE } from '@/config/ui-font-options';
import { useAvailableTerminals } from '@/components/views/board-view/worktree-panel/hooks/use-available-terminals';
import { getTerminalIcon } from '@/components/icons/terminal-icons';
import { TerminalConfigSection } from './terminal-config-section';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { useUpdateGlobalSettings } from '@/hooks/mutations/use-settings-mutations';
import type { SshHostKeyPolicy, VpsProfile } from '@taktician/types';

const DEFAULT_SSH_PORT = 22;
const DEFAULT_HOST_KEY_POLICY: SshHostKeyPolicy = 'accept-new';

interface VpsProfileDraft {
  name: string;
  host: string;
  port: string;
  username: string;
  identityFile: string;
  hostKeyPolicy: SshHostKeyPolicy;
}

function createEmptyVpsProfileDraft(): VpsProfileDraft {
  return {
    name: '',
    host: '',
    port: String(DEFAULT_SSH_PORT),
    username: '',
    identityFile: '',
    hostKeyPolicy: DEFAULT_HOST_KEY_POLICY,
  };
}

export function TerminalSection() {
  const {
    terminalState,
    setTerminalDefaultRunScript,
    setTerminalScreenReaderMode,
    setTerminalFontFamily,
    setTerminalScrollbackLines,
    setTerminalLineHeight,
    setTerminalDefaultFontSize,
    defaultTerminalId,
    setDefaultTerminalId,
    setOpenTerminalMode,
    setTerminalBackgroundColor,
    setTerminalForegroundColor,
  } = useAppStore();

  const {
    defaultRunScript,
    screenReaderMode,
    fontFamily,
    scrollbackLines,
    lineHeight,
    defaultFontSize,
    openTerminalMode,
    customBackgroundColor,
    customForegroundColor,
  } = terminalState;

  // Get available external terminals
  const { terminals, isRefreshing, refresh } = useAvailableTerminals();
  const { data: globalSettings } = useGlobalSettings();
  const updateGlobalSettings = useUpdateGlobalSettings({ showSuccessToast: false });
  const vpsProfiles = globalSettings?.vpsProfiles ?? [];
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<VpsProfileDraft>(createEmptyVpsProfileDraft);

  const isEditingProfile = editingProfileId !== null;
  const canSaveProfile = useMemo(() => {
    return (
      profileDraft.name.trim().length > 0 &&
      profileDraft.host.trim().length > 0 &&
      profileDraft.username.trim().length > 0 &&
      profileDraft.port.trim().length > 0
    );
  }, [profileDraft.host, profileDraft.name, profileDraft.port, profileDraft.username]);

  const resetProfileEditor = () => {
    setEditingProfileId(null);
    setProfileDraft(createEmptyVpsProfileDraft());
  };

  const startEditingProfile = (profile: VpsProfile) => {
    setEditingProfileId(profile.id);
    setProfileDraft({
      name: profile.name,
      host: profile.host,
      port: String(profile.port ?? DEFAULT_SSH_PORT),
      username: profile.username,
      identityFile: profile.identityFile ?? '',
      hostKeyPolicy: profile.hostKeyPolicy ?? DEFAULT_HOST_KEY_POLICY,
    });
  };

  const saveVpsProfile = () => {
    const name = profileDraft.name.trim();
    const host = profileDraft.host.trim();
    const username = profileDraft.username.trim();
    const identityFile = profileDraft.identityFile.trim();
    const parsedPort = Number.parseInt(profileDraft.port.trim(), 10);

    if (!name) {
      toast.error('Profile name is required');
      return;
    }
    if (!host || host.includes('\0') || /\s/.test(host)) {
      toast.error('Host is invalid', {
        description: 'Host cannot be empty and must not contain spaces.',
      });
      return;
    }
    if (!username || username.includes('\0') || /\s/.test(username)) {
      toast.error('Username is invalid', {
        description: 'Username cannot be empty and must not contain spaces.',
      });
      return;
    }
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      toast.error('Port must be an integer between 1 and 65535');
      return;
    }
    if (identityFile.includes('\0')) {
      toast.error('Identity file path is invalid');
      return;
    }

    const profileId =
      editingProfileId ?? `vps-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const nextProfile: VpsProfile = {
      id: profileId,
      name,
      host,
      port: parsedPort,
      username,
      identityFile: identityFile || undefined,
      hostKeyPolicy: profileDraft.hostKeyPolicy,
    };

    const nextProfiles = editingProfileId
      ? vpsProfiles.map((profile) => (profile.id === editingProfileId ? nextProfile : profile))
      : [...vpsProfiles, nextProfile];

    updateGlobalSettings.mutate(
      { vpsProfiles: nextProfiles },
      {
        onSuccess: () => {
          toast.success(isEditingProfile ? 'VPS profile updated' : 'VPS profile saved');
          resetProfileEditor();
        },
      }
    );
  };

  const deleteVpsProfile = (profileId: string) => {
    const nextProfiles = vpsProfiles.filter((profile) => profile.id !== profileId);
    updateGlobalSettings.mutate(
      { vpsProfiles: nextProfiles },
      {
        onSuccess: () => {
          if (editingProfileId === profileId) {
            resetProfileEditor();
          }
          toast.success('VPS profile deleted');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div
        className={cn(
          'rounded-2xl overflow-hidden',
          'border border-border/50',
          'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
          'shadow-sm shadow-black/5'
        )}
      >
        <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center border border-green-500/20">
              <SquareTerminal className="w-5 h-5 text-green-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">Terminal</h2>
          </div>
          <p className="text-sm text-muted-foreground/80 ml-12">
            Customize terminal appearance and behavior. Theme follows your app theme in Appearance
            settings.
          </p>
        </div>
        <div className="p-6 space-y-6">
          {/* Default External Terminal */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default External Terminal</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={refresh}
                disabled={isRefreshing}
                title="Refresh available terminals"
                aria-label="Refresh available terminals"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Terminal to use when selecting "Open in Terminal" from the worktree menu
            </p>
            <Select
              value={defaultTerminalId ?? 'integrated'}
              onValueChange={(value) => {
                setDefaultTerminalId(value === 'integrated' ? null : value);
                toast.success(
                  value === 'integrated'
                    ? 'Integrated terminal set as default'
                    : 'Default terminal changed'
                );
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a terminal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="integrated">
                  <span className="flex items-center gap-2">
                    <Terminal className="w-4 h-4" />
                    Integrated Terminal
                  </span>
                </SelectItem>
                {terminals.map((terminal) => {
                  const TerminalIcon = getTerminalIcon(terminal.id);
                  return (
                    <SelectItem key={terminal.id} value={terminal.id}>
                      <span className="flex items-center gap-2">
                        <TerminalIcon className="w-4 h-4" />
                        {terminal.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {terminals.length === 0 && !isRefreshing && (
              <p className="text-xs text-muted-foreground italic">
                No external terminals detected. Click refresh to re-scan.
              </p>
            )}
          </div>

          {/* Default Open Mode */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Default Open Mode</Label>
            <p className="text-xs text-muted-foreground">
              How to open the integrated terminal when using "Open in Terminal" from the worktree
              menu
            </p>
            <Select
              value={openTerminalMode}
              onValueChange={(value: 'newTab' | 'split') => {
                setOpenTerminalMode(value);
                toast.success(
                  value === 'newTab'
                    ? 'New terminals will open in new tabs'
                    : 'New terminals will split the current tab'
                );
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newTab">
                  <span className="flex items-center gap-2">
                    <SquarePlus className="w-4 h-4" />
                    New Tab
                  </span>
                </SelectItem>
                <SelectItem value="split">
                  <span className="flex items-center gap-2">
                    <SplitSquareHorizontal className="w-4 h-4" />
                    Split Current Tab
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* VPS Profiles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-foreground font-medium">VPS Profiles</Label>
                <p className="text-xs text-muted-foreground">
                  Save SSH hosts for quickly opening one or multiple remote terminals.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={resetProfileEditor}
              >
                <SquarePlus className="w-3.5 h-3.5" />
                New
              </Button>
            </div>

            <div className="space-y-2">
              {vpsProfiles.length === 0 ? (
                <div className="rounded-lg border border-border/50 bg-accent/20 p-3 text-xs text-muted-foreground">
                  No VPS profiles configured yet.
                </div>
              ) : (
                vpsProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-lg border border-border/50 bg-accent/20 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{profile.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {profile.username}@{profile.host}:{profile.port ?? DEFAULT_SSH_PORT}
                      </p>
                      {profile.identityFile && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Key: {profile.identityFile}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEditingProfile(profile)}
                        title="Edit profile"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteVpsProfile(profile.id)}
                        title="Delete profile"
                        disabled={updateGlobalSettings.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-border/60 bg-accent/20 p-4 space-y-3">
              <Label className="text-foreground font-medium">
                {isEditingProfile ? 'Edit VPS Profile' : 'Add VPS Profile'}
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={profileDraft.name}
                    onChange={(e) =>
                      setProfileDraft((current) => ({ ...current, name: e.target.value }))
                    }
                    placeholder="Production VPS"
                    className="bg-background border-border/60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Host</Label>
                  <Input
                    value={profileDraft.host}
                    onChange={(e) =>
                      setProfileDraft((current) => ({ ...current, host: e.target.value }))
                    }
                    placeholder="vps.example.com"
                    className="bg-background border-border/60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Username</Label>
                  <Input
                    value={profileDraft.username}
                    onChange={(e) =>
                      setProfileDraft((current) => ({ ...current, username: e.target.value }))
                    }
                    placeholder="ubuntu"
                    className="bg-background border-border/60"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  <Input
                    value={profileDraft.port}
                    onChange={(e) =>
                      setProfileDraft((current) => ({ ...current, port: e.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="22"
                    className="bg-background border-border/60"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Identity File (optional)</Label>
                  <Input
                    value={profileDraft.identityFile}
                    onChange={(e) =>
                      setProfileDraft((current) => ({
                        ...current,
                        identityFile: e.target.value,
                      }))
                    }
                    placeholder="~/.ssh/id_ed25519"
                    className="bg-background border-border/60"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs text-muted-foreground">Host Key Policy</Label>
                  <Select
                    value={profileDraft.hostKeyPolicy}
                    onValueChange={(value: SshHostKeyPolicy) =>
                      setProfileDraft((current) => ({
                        ...current,
                        hostKeyPolicy: value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full bg-background border-border/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="accept-new">Accept New (recommended)</SelectItem>
                      <SelectItem value="yes">Always Trust</SelectItem>
                      <SelectItem value="no">Strict (manual trust only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetProfileEditor}
                  disabled={updateGlobalSettings.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveVpsProfile}
                  disabled={!canSaveProfile || updateGlobalSettings.isPending}
                >
                  {isEditingProfile ? 'Save Changes' : 'Add Profile'}
                </Button>
              </div>
            </div>
          </div>

          {/* Font Family */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Font Family</Label>
            <Select
              value={fontFamily || DEFAULT_FONT_VALUE}
              onValueChange={(value) => {
                setTerminalFontFamily(value);
                toast.info('Font family changed', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Default (Menlo / Monaco)" />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_FONT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span
                      style={{
                        fontFamily: option.value === DEFAULT_FONT_VALUE ? undefined : option.value,
                      }}
                    >
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Background Color */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Background Color</Label>
              {customBackgroundColor && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setTerminalBackgroundColor(null);
                    toast.success('Background color reset to theme default');
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Override the terminal background color. Leave empty to use the theme default.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-10 h-10 rounded-lg border border-border/50 shadow-sm flex items-center justify-center"
                  style={{
                    backgroundColor: customBackgroundColor || 'var(--card)',
                  }}
                >
                  <Palette
                    className={cn(
                      'w-5 h-5',
                      customBackgroundColor ? 'text-white/80' : 'text-muted-foreground'
                    )}
                  />
                </div>
                <Input
                  type="color"
                  value={customBackgroundColor || '#000000'}
                  onChange={(e) => {
                    const color = e.target.value;
                    setTerminalBackgroundColor(color);
                  }}
                  className="w-14 h-10 p-1 cursor-pointer bg-transparent border-border/50"
                  title="Pick a color"
                />
                <Input
                  type="text"
                  value={customBackgroundColor || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Validate hex color format
                    if (value === '' || /^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                        setTerminalBackgroundColor(value || null);
                      }
                    }
                  }}
                  placeholder="e.g., #1a1a1a"
                  className="flex-1 bg-accent/30 border-border/50 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Foreground Color */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Foreground Color</Label>
              {customForegroundColor && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setTerminalForegroundColor(null);
                    toast.success('Foreground color reset to theme default');
                  }}
                >
                  <X className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Override the terminal text/foreground color. Leave empty to use the theme default.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-10 h-10 rounded-lg border border-border/50 shadow-sm flex items-center justify-center"
                  style={{
                    backgroundColor: customForegroundColor || 'var(--foreground)',
                  }}
                >
                  <Type
                    className={cn(
                      'w-5 h-5',
                      customForegroundColor ? 'text-black/80' : 'text-background'
                    )}
                  />
                </div>
                <Input
                  type="color"
                  value={customForegroundColor || '#ffffff'}
                  onChange={(e) => {
                    const color = e.target.value;
                    setTerminalForegroundColor(color);
                  }}
                  className="w-14 h-10 p-1 cursor-pointer bg-transparent border-border/50"
                  title="Pick a color"
                />
                <Input
                  type="text"
                  value={customForegroundColor || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Validate hex color format
                    if (value === '' || /^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                      if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                        setTerminalForegroundColor(value || null);
                      }
                    }
                  }}
                  placeholder="e.g., #ffffff"
                  className="flex-1 bg-accent/30 border-border/50 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Default Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Default Font Size</Label>
              <span className="text-sm text-muted-foreground">{defaultFontSize}px</span>
            </div>
            <Slider
              value={[defaultFontSize]}
              min={8}
              max={32}
              step={1}
              onValueChange={([value]) => setTerminalDefaultFontSize(value)}
              className="flex-1"
            />
          </div>

          {/* Line Height */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Line Height</Label>
              <span className="text-sm text-muted-foreground">{lineHeight.toFixed(1)}</span>
            </div>
            <Slider
              value={[lineHeight]}
              min={1.0}
              max={2.0}
              step={0.1}
              onValueChange={([value]) => {
                setTerminalLineHeight(value);
              }}
              onValueCommit={() => {
                toast.info('Line height changed', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
              className="flex-1"
            />
          </div>

          {/* Scrollback Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Scrollback Buffer</Label>
              <span className="text-sm text-muted-foreground">
                {(scrollbackLines / 1000).toFixed(0)}k lines
              </span>
            </div>
            <Slider
              value={[scrollbackLines]}
              min={1000}
              max={100000}
              step={1000}
              onValueChange={([value]) => setTerminalScrollbackLines(value)}
              onValueCommit={() => {
                toast.info('Scrollback changed', {
                  description: 'Restart terminal for changes to take effect',
                });
              }}
              className="flex-1"
            />
          </div>

          {/* Default Run Script */}
          <div className="space-y-3">
            <Label className="text-foreground font-medium">Default Run Script</Label>
            <p className="text-xs text-muted-foreground">
              Command to run automatically when opening a new terminal (e.g., "claude", "codex")
            </p>
            <Input
              value={defaultRunScript}
              onChange={(e) => setTerminalDefaultRunScript(e.target.value)}
              placeholder="e.g., claude, codex, npm run dev"
              className="bg-accent/30 border-border/50"
            />
          </div>

          {/* Screen Reader Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-foreground font-medium">Screen Reader Mode</Label>
              <p className="text-xs text-muted-foreground">
                Enable accessibility mode for screen readers
              </p>
            </div>
            <Switch
              checked={screenReaderMode}
              onCheckedChange={(checked) => {
                setTerminalScreenReaderMode(checked);
                toast.success(
                  checked ? 'Screen reader mode enabled' : 'Screen reader mode disabled',
                  {
                    description: 'Restart terminal for changes to take effect',
                  }
                );
              }}
            />
          </div>
        </div>
      </div>

      <TerminalConfigSection />
    </div>
  );
}
