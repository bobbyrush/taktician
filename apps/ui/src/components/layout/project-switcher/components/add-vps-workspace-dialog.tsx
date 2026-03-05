import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useGlobalSettings } from '@/hooks/queries/use-settings';
import { getHttpApiClient } from '@/lib/http-api-client';
import type { Project } from '@/lib/electron';

interface AddVpsWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
}

function normalizeRemotePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '') || '/';
}

function buildDefaultName(profileName: string, remotePath: string): string {
  if (!profileName) return '';
  const normalized = normalizeRemotePath(remotePath);
  if (!normalized || normalized === '/') {
    return `${profileName}:/`;
  }
  return `${profileName}:${normalized}`;
}

export function AddVpsWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: AddVpsWorkspaceDialogProps) {
  const { data: globalSettings } = useGlobalSettings();
  const vpsProfiles = globalSettings?.vpsProfiles ?? [];

  const [profileId, setProfileId] = useState('');
  const [remotePath, setRemotePath] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProfile = useMemo(
    () => vpsProfiles.find((profile) => profile.id === profileId) ?? null,
    [profileId, vpsProfiles]
  );

  useEffect(() => {
    if (!open) return;

    if (vpsProfiles.length > 0 && !profileId) {
      setProfileId(vpsProfiles[0].id);
    }

    if (!remotePath) {
      setRemotePath('/');
    }
  }, [open, profileId, remotePath, vpsProfiles]);

  useEffect(() => {
    if (!selectedProfile) return;
    if (name.trim().length > 0) return;

    setName(buildDefaultName(selectedProfile.name, remotePath));
  }, [selectedProfile, remotePath, name]);

  useEffect(() => {
    if (!open) {
      setIsSubmitting(false);
      setProfileId('');
      setRemotePath('');
      setName('');
    }
  }, [open]);

  const canSubmit =
    profileId.trim().length > 0 &&
    normalizeRemotePath(remotePath).length > 0 &&
    name.trim().length > 0 &&
    !isSubmitting;

  const handleCreate = async () => {
    if (!canSubmit) return;

    const normalizedPath = normalizeRemotePath(remotePath);
    if (!normalizedPath) {
      toast.error('Remote path is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await getHttpApiClient().workspace.createVpsProject({
        name: name.trim(),
        vpsProfileId: profileId,
        remotePath: normalizedPath,
      });

      if (!result.success || !result.project) {
        toast.error('Failed to create VPS workspace', {
          description: result.error || 'Unknown error',
        });
        return;
      }

      onCreated(result.project as Project);
      toast.success(result.created === false ? 'Workspace already exists' : 'Workspace created');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to create VPS workspace', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add VPS Workspace</DialogTitle>
          <DialogDescription>
            Create an SSH-only workspace bound to one VPS profile and one remote directory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="workspace-vps-profile">VPS Profile</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger id="workspace-vps-profile">
                <SelectValue placeholder="Select VPS profile" />
              </SelectTrigger>
              <SelectContent>
                {vpsProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name} ({profile.username}@{profile.host}:{profile.port})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vpsProfiles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No VPS profiles found. Add one in Settings → Terminal first.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-remote-path">Remote Path</Label>
            <Input
              id="workspace-remote-path"
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              placeholder="/var/www/app"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod-api:/var/www/api"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!canSubmit || vpsProfiles.length === 0}
          >
            {isSubmitting ? 'Creating...' : 'Create Workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
