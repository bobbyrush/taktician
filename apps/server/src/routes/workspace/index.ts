/**
 * Workspace routes
 * Provides API endpoints for workspace directory management
 */

import { Router } from 'express';
import { createConfigHandler } from './routes/config.js';
import { createDirectoriesHandler } from './routes/directories.js';
import {
  createCreateVpsProjectHandler,
  createListVpsProjectsHandler,
  createPurgeLocalProjectsHandler,
} from './routes/vps-projects.js';
import type { SettingsService } from '../../services/settings-service.js';

export function createWorkspaceRoutes(settingsService: SettingsService): Router {
  const router = Router();

  router.get('/config', createConfigHandler());
  router.get('/directories', createDirectoriesHandler());
  router.get('/vps-projects', createListVpsProjectsHandler(settingsService));
  router.post('/vps-projects', createCreateVpsProjectHandler(settingsService));
  router.post('/purge-local-projects', createPurgeLocalProjectsHandler(settingsService));

  return router;
}
