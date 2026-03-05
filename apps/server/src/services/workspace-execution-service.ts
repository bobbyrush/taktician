/**
 * WorkspaceExecutionService
 *
 * Provides execution helpers for VPS-backed workspaces by synchronizing files
 * between remote SSH path and local project mirror path.
 */

import { spawn } from 'child_process';
import { createLogger } from '@taktician/utils';
import * as secureFs from '../lib/secure-fs.js';
import type { SettingsService } from './settings-service.js';
import type { ProjectRef, VpsProfile } from '../types/settings.js';

const logger = createLogger('WorkspaceExecutionService');
const DEFAULT_SSH_PORT = 22;
const DEFAULT_HOST_KEY_POLICY = 'accept-new';

type VpsProjectRef = ProjectRef & {
  workspaceType: 'vps';
  vpsProfileId: string;
  remotePath: string;
};

interface ResolvedVpsWorkspace {
  project: VpsProjectRef;
  profile: VpsProfile;
}

function normalizeRemotePath(remotePath: string): string {
  const trimmed = remotePath.trim();
  if (!trimmed) return '/';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isVpsProject(project: ProjectRef): project is VpsProjectRef {
  return (
    project.workspaceType === 'vps' && Boolean(project.vpsProfileId) && Boolean(project.remotePath)
  );
}

function sanitizeSshValue(value: string): string {
  return value.trim();
}

export class WorkspaceExecutionService {
  private rsyncChecked = false;
  private rsyncAvailable = false;

  constructor(private settingsService: SettingsService | null) {}

  private async ensureRsyncAvailable(): Promise<void> {
    if (this.rsyncChecked) {
      if (!this.rsyncAvailable) {
        throw new Error(
          'rsync is required for VPS workspace execution but not available on server'
        );
      }
      return;
    }

    this.rsyncChecked = true;

    await new Promise<void>((resolve, reject) => {
      const child = spawn('rsync', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.on('error', (error) => reject(error));
      child.on('exit', (code) => {
        if (code === 0) {
          this.rsyncAvailable = true;
          resolve();
          return;
        }
        reject(new Error('rsync is not installed on server'));
      });
    });
  }

  private buildRsyncSshCommand(profile: VpsProfile): string {
    const port = profile.port || DEFAULT_SSH_PORT;
    const strictHostKeyChecking = profile.hostKeyPolicy || DEFAULT_HOST_KEY_POLICY;
    const parts = [
      'ssh',
      '-p',
      String(port),
      '-o',
      `StrictHostKeyChecking=${strictHostKeyChecking}`,
    ];

    if (profile.identityFile) {
      parts.push('-i', profile.identityFile);
    }

    return parts.map((part) => (part.includes(' ') ? quoteShellArg(part) : part)).join(' ');
  }

  private runRsync(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('rsync', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => reject(error));
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `rsync failed with exit code ${String(code)}`));
      });
    });
  }

  private runSsh(profile: VpsProfile, remoteCommand: string): Promise<void> {
    const port = String(profile.port || DEFAULT_SSH_PORT);
    const strictHostKeyChecking = profile.hostKeyPolicy || DEFAULT_HOST_KEY_POLICY;
    const host = sanitizeSshValue(profile.host);
    const username = sanitizeSshValue(profile.username);

    const args = ['-p', port, '-o', `StrictHostKeyChecking=${strictHostKeyChecking}`];

    if (profile.identityFile) {
      args.push('-i', profile.identityFile);
    }

    args.push(`${username}@${host}`);
    args.push(remoteCommand);

    return new Promise((resolve, reject) => {
      const child = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => reject(error));
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `ssh failed with exit code ${String(code)}`));
      });
    });
  }

  async resolveVpsWorkspace(projectPath: string): Promise<ResolvedVpsWorkspace | null> {
    if (!this.settingsService) return null;

    const settings = await this.settingsService.getGlobalSettings();
    const project = (settings.projects || []).find((entry) => entry.path === projectPath);

    if (!project || !isVpsProject(project)) {
      return null;
    }

    const profile = (settings.vpsProfiles || []).find((entry) => entry.id === project.vpsProfileId);
    if (!profile) {
      throw new Error(
        `VPS profile "${project.vpsProfileId}" not found for workspace "${project.name}"`
      );
    }

    return {
      project,
      profile,
    };
  }

  async syncRemoteToLocal(projectPath: string): Promise<boolean> {
    const resolved = await this.resolveVpsWorkspace(projectPath);
    if (!resolved) return false;

    await this.ensureRsyncAvailable();

    const remotePath = normalizeRemotePath(resolved.project.remotePath);
    const host = sanitizeSshValue(resolved.profile.host);
    const username = sanitizeSshValue(resolved.profile.username);
    const sshCommand = this.buildRsyncSshCommand(resolved.profile);

    await secureFs.mkdir(projectPath, { recursive: true });

    logger.info(`[syncRemoteToLocal] Syncing ${username}@${host}:${remotePath} -> ${projectPath}`);

    await this.runRsync([
      '-az',
      '--delete',
      '--exclude=.taktician/',
      '-e',
      sshCommand,
      `${username}@${host}:${remotePath}`,
      `${projectPath}/`,
    ]);

    return true;
  }

  async syncLocalToRemote(projectPath: string): Promise<boolean> {
    const resolved = await this.resolveVpsWorkspace(projectPath);
    if (!resolved) return false;

    await this.ensureRsyncAvailable();

    const remotePath = normalizeRemotePath(resolved.project.remotePath);
    const host = sanitizeSshValue(resolved.profile.host);
    const username = sanitizeSshValue(resolved.profile.username);
    const sshCommand = this.buildRsyncSshCommand(resolved.profile);
    const remoteDir = remotePath === '/' ? '/' : remotePath.replace(/\/$/, '');

    // Ensure remote target directory exists before upload sync.
    if (remoteDir !== '/') {
      await this.runSsh(resolved.profile, `mkdir -p ${quoteShellArg(remoteDir)}`);
    }

    logger.info(`[syncLocalToRemote] Syncing ${projectPath} -> ${username}@${host}:${remotePath}`);

    await this.runRsync([
      '-az',
      '--exclude=.taktician/',
      '-e',
      sshCommand,
      `${projectPath}/`,
      `${username}@${host}:${remotePath}`,
    ]);

    return true;
  }
}
