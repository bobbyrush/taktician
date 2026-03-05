/**
 * VPS workspace project routes
 *
 * These routes create/list SSH-backed workspace projects and provide a one-time
 * cleanup endpoint for removing legacy local projects from settings.
 */

import type { Request, Response } from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import * as secureFs from '../../../lib/secure-fs.js';
import { getDataDirectory } from '@taktician/platform';
import type { SettingsService } from '../../../services/settings-service.js';
import type { GlobalSettings, ProjectRef, TrashedProjectRef } from '../../../types/settings.js';
import { getErrorMessage, logError } from '../common.js';

const VPS_WORKSPACES_DIR = 'vps-workspaces';
const VPS_PROJECT_TYPE = 'vps';

type VpsProjectRef = ProjectRef & {
  workspaceType: 'vps';
  vpsProfileId: string;
  remotePath: string;
};

function getVpsWorkspacesRoot(): string {
  const dataDir = getDataDirectory();
  if (!dataDir) {
    throw new Error('DATA_DIR is not configured');
  }
  return path.join(dataDir, VPS_WORKSPACES_DIR);
}

function isVpsProject(project: ProjectRef | TrashedProjectRef): project is VpsProjectRef {
  return project.workspaceType === VPS_PROJECT_TYPE;
}

function normalizeInput(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateName(name: string): string | null {
  if (!name) return 'name is required';
  if (name.includes('\0')) return 'name contains invalid characters';
  if (name.length > 120) return 'name is too long (max 120 chars)';
  return null;
}

function validateRemotePath(remotePath: string): string | null {
  if (!remotePath) return 'remotePath is required';
  if (remotePath.includes('\0')) return 'remotePath contains invalid characters';
  if (remotePath.length > 1024) return 'remotePath is too long';
  return null;
}

export function createListVpsProjectsHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await settingsService.getGlobalSettings();
      const projects = (settings.projects || []).filter(isVpsProject);
      res.json({ success: true, projects });
    } catch (error) {
      logError(error, 'List VPS projects failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createCreateVpsProjectHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const name = normalizeInput((req.body as { name?: unknown })?.name);
      const vpsProfileId = normalizeInput((req.body as { vpsProfileId?: unknown })?.vpsProfileId);
      const remotePath = normalizeInput((req.body as { remotePath?: unknown })?.remotePath);

      const nameError = validateName(name);
      if (nameError) {
        res.status(400).json({ success: false, error: nameError });
        return;
      }

      if (!vpsProfileId) {
        res.status(400).json({ success: false, error: 'vpsProfileId is required' });
        return;
      }

      const remotePathError = validateRemotePath(remotePath);
      if (remotePathError) {
        res.status(400).json({ success: false, error: remotePathError });
        return;
      }

      const settings = await settingsService.getGlobalSettings();
      const profileExists = (settings.vpsProfiles || []).some(
        (profile) => profile.id === vpsProfileId
      );
      if (!profileExists) {
        res.status(404).json({ success: false, error: 'VPS profile not found' });
        return;
      }

      const existing = (settings.projects || []).find(
        (project) =>
          project.workspaceType === VPS_PROJECT_TYPE &&
          project.vpsProfileId === vpsProfileId &&
          project.remotePath === remotePath
      );

      if (existing) {
        res.json({
          success: true,
          created: false,
          project: existing,
        });
        return;
      }

      const id = `vps-${randomUUID()}`;

      const workspaceRoot = getVpsWorkspacesRoot();
      const storagePath = path.join(workspaceRoot, id);
      await secureFs.mkdir(storagePath, { recursive: true });
      await secureFs.mkdir(path.join(storagePath, '.taktician'), { recursive: true });

      const project: VpsProjectRef = {
        id,
        name,
        path: storagePath,
        lastOpened: new Date().toISOString(),
        workspaceType: VPS_PROJECT_TYPE,
        vpsProfileId,
        remotePath,
      };

      await settingsService.updateGlobalSettings({
        projects: [...(settings.projects || []), project],
        currentProjectId: project.id,
      });

      res.json({ success: true, created: true, project });
    } catch (error) {
      logError(error, 'Create VPS project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createPurgeLocalProjectsHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await settingsService.getGlobalSettings();
      const existingProjects = settings.projects || [];
      const existingTrashedProjects = settings.trashedProjects || [];

      const projects = existingProjects.filter(isVpsProject);
      const trashedProjects = existingTrashedProjects.filter(isVpsProject);
      const removedCount = existingProjects.length - projects.length;
      const allowedIds = new Set(projects.map((project) => project.id));

      const projectHistory = (settings.projectHistory || []).filter((id) => allowedIds.has(id));
      const currentProjectId =
        settings.currentProjectId && allowedIds.has(settings.currentProjectId)
          ? settings.currentProjectId
          : (projects[0]?.id ?? null);

      const projectHistoryIndex = projectHistory.length > 0 ? 0 : -1;

      const updates: Partial<GlobalSettings> & Record<string, unknown> = {
        projects,
        trashedProjects,
        currentProjectId,
        projectHistory,
        projectHistoryIndex,
      };
      // Explicitly allow empty project arrays during SSH-only migration.
      if (projects.length === 0) {
        updates.__allowProjectWipe = true;
      }

      await settingsService.updateGlobalSettings(updates as Partial<GlobalSettings>);

      res.json({
        success: true,
        removedCount,
        projects,
        currentProjectId,
      });
    } catch (error) {
      logError(error, 'Purge local projects failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
