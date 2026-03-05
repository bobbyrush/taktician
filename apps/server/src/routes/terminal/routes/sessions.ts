/**
 * GET /sessions endpoint - List all active terminal sessions
 * POST /sessions endpoint - Create a new terminal session
 */

import type { Request, Response } from 'express';
import {
  getTerminalService,
  type TerminalConnectionOptions,
  type TerminalHostKeyPolicy,
} from '../../../services/terminal-service.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@taktician/utils';

const logger = createLogger('Terminal');
const DEFAULT_SSH_PORT = 22;
const DEFAULT_HOST_KEY_POLICY: TerminalHostKeyPolicy = 'accept-new';

function normalizeConnectionPayload(payload: unknown): {
  connection?: TerminalConnectionOptions;
  error?: string;
} {
  if (payload === undefined || payload === null) {
    return {};
  }

  if (typeof payload !== 'object') {
    return { error: 'connection must be an object' };
  }

  const connectionType = (payload as { type?: unknown }).type;
  if (connectionType === 'local') {
    return { connection: { type: 'local' } };
  }

  if (connectionType !== 'ssh') {
    return { error: 'connection.type must be either "local" or "ssh"' };
  }

  const ssh = (payload as { ssh?: unknown }).ssh;
  if (!ssh || typeof ssh !== 'object') {
    return { error: 'connection.ssh is required for SSH sessions' };
  }

  const hostRaw = (ssh as { host?: unknown }).host;
  const usernameRaw = (ssh as { username?: unknown }).username;
  const portRaw = (ssh as { port?: unknown }).port;
  const identityFileRaw = (ssh as { identityFile?: unknown }).identityFile;
  const hostKeyPolicyRaw = (ssh as { hostKeyPolicy?: unknown }).hostKeyPolicy;
  const labelRaw = (ssh as { label?: unknown }).label;

  if (typeof hostRaw !== 'string' || hostRaw.trim().length === 0) {
    return { error: 'connection.ssh.host is required' };
  }
  if (typeof usernameRaw !== 'string' || usernameRaw.trim().length === 0) {
    return { error: 'connection.ssh.username is required' };
  }

  const host = hostRaw.trim();
  const username = usernameRaw.trim();

  if (host.includes('\0') || /\s/.test(host)) {
    return { error: 'connection.ssh.host must not contain spaces or control characters' };
  }
  if (username.includes('\0') || /\s/.test(username)) {
    return { error: 'connection.ssh.username must not contain spaces or control characters' };
  }

  let port = DEFAULT_SSH_PORT;
  if (portRaw !== undefined) {
    if (
      typeof portRaw !== 'number' ||
      !Number.isInteger(portRaw) ||
      portRaw < 1 ||
      portRaw > 65535
    ) {
      return { error: 'connection.ssh.port must be an integer between 1 and 65535' };
    }
    port = portRaw;
  }

  let identityFile: string | undefined;
  if (identityFileRaw !== undefined) {
    if (typeof identityFileRaw !== 'string' || identityFileRaw.trim().length === 0) {
      return { error: 'connection.ssh.identityFile must be a non-empty string when provided' };
    }
    if (identityFileRaw.includes('\0')) {
      return { error: 'connection.ssh.identityFile contains invalid characters' };
    }
    identityFile = identityFileRaw.trim();
  }

  let label: string | undefined;
  if (labelRaw !== undefined) {
    if (typeof labelRaw !== 'string') {
      return { error: 'connection.ssh.label must be a string when provided' };
    }
    if (labelRaw.includes('\0')) {
      return { error: 'connection.ssh.label contains invalid characters' };
    }
    const trimmedLabel = labelRaw.trim();
    if (trimmedLabel.length > 0) {
      label = trimmedLabel.slice(0, 120);
    }
  }

  let hostKeyPolicy: TerminalHostKeyPolicy = DEFAULT_HOST_KEY_POLICY;
  if (hostKeyPolicyRaw !== undefined) {
    if (
      hostKeyPolicyRaw !== 'accept-new' &&
      hostKeyPolicyRaw !== 'yes' &&
      hostKeyPolicyRaw !== 'no'
    ) {
      return { error: 'connection.ssh.hostKeyPolicy must be "accept-new", "yes", or "no"' };
    }
    hostKeyPolicy = hostKeyPolicyRaw;
  }

  return {
    connection: {
      type: 'ssh',
      ssh: {
        host,
        username,
        port,
        identityFile,
        hostKeyPolicy,
        label,
      },
    },
  };
}

export function createSessionsListHandler() {
  return (_req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const sessions = terminalService.getAllSessions();
    res.json({
      success: true,
      data: sessions,
    });
  };
}

export function createSessionGetHandler() {
  return (req: Request, res: Response): void => {
    const terminalService = getTerminalService();
    const { id } = req.params;
    const session = terminalService.getSessionInfo(id);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    res.json({
      success: true,
      data: session,
    });
  };
}

export function createSessionsCreateHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const terminalService = getTerminalService();
      const { cwd, cols, rows, shell, connection: connectionPayload } = req.body;
      const { connection, error: connectionError } = normalizeConnectionPayload(connectionPayload);

      if (connectionError) {
        res.status(400).json({
          success: false,
          error: connectionError,
        });
        return;
      }

      const session = await terminalService.createSession({
        cwd,
        cols: cols || 80,
        rows: rows || 24,
        shell,
        connection,
      });

      // Check if session creation was refused due to limit
      if (!session) {
        const maxSessions = terminalService.getMaxSessions();
        const currentSessions = terminalService.getSessionCount();
        logger.warn(`Session limit reached: ${currentSessions}/${maxSessions}`);
        res.status(429).json({
          success: false,
          error: 'Maximum terminal sessions reached',
          details: `Server limit is ${maxSessions} concurrent sessions. Please close unused terminals.`,
          currentSessions,
          maxSessions,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: session.id,
          cwd: session.cwd,
          shell: session.shell,
          createdAt: session.createdAt,
          connection: session.connection,
        },
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (message === 'SSH client not found on server') {
        res.status(503).json({
          success: false,
          error: message,
        });
        return;
      }
      if (message.startsWith('Invalid SSH') || message === 'SSH connection settings are required') {
        res.status(400).json({
          success: false,
          error: message,
        });
        return;
      }
      logError(error, 'Create terminal session failed');
      res.status(500).json({
        success: false,
        error: 'Failed to create terminal session',
        details: message,
      });
    }
  };
}
