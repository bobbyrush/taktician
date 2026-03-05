import { useState, useCallback, useEffect, useMemo, startTransition } from 'react';
import { Plus, Bug, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { cn, isMac } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useOSDetection } from '@/hooks/use-os-detection';
import { ProjectSwitcherItem } from './components/project-switcher-item';
import { ProjectContextMenu } from './components/project-context-menu';
import { EditProjectDialog } from './components/edit-project-dialog';
import { NotificationBell } from './components/notification-bell';
import { AddVpsWorkspaceDialog } from './components/add-vps-workspace-dialog';
import {
  MACOS_ELECTRON_TOP_PADDING_CLASS,
  SIDEBAR_FEATURE_FLAGS,
} from '@/components/layout/sidebar/constants';
import type { Project } from '@/lib/electron';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';

const SSH_ONLY_MIGRATION_KEY = 'taktician:ssh-only-local-projects-purged-v1';

function getOSAbbreviation(os: string): string {
  switch (os) {
    case 'mac':
      return 'M';
    case 'windows':
      return 'W';
    case 'linux':
      return 'L';
    default:
      return '?';
  }
}

function isVpsWorkspaceProject(project: Project): boolean {
  return project.workspaceType === 'vps';
}

export function ProjectSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hideWiki } = SIDEBAR_FEATURE_FLAGS;
  const isWikiActive = location.pathname === '/wiki';

  const projects = useAppStore((s) => s.projects);
  const currentProject = useAppStore((s) => s.currentProject);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const setProjects = useAppStore((s) => s.setProjects);

  const [contextMenuProject, setContextMenuProject] = useState<Project | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [editDialogProject, setEditDialogProject] = useState<Project | null>(null);
  const [showAddVpsWorkspaceDialog, setShowAddVpsWorkspaceDialog] = useState(false);

  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
  const { os } = useOSDetection();
  const appMode = import.meta.env.VITE_APP_MODE || '?';
  const versionSuffix = `${getOSAbbreviation(os)}${appMode}`;

  const vpsProjects = useMemo(() => projects.filter(isVpsWorkspaceProject), [projects]);

  const handleContextMenu = (project: Project, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuProject(project);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenuProject(null);
    setContextMenuPosition(null);
  };

  const handleEditProject = (project: Project) => {
    setEditDialogProject(project);
    handleCloseContextMenu();
  };

  const handleProjectClick = useCallback(
    async (project: Project) => {
      if (project.id === currentProject?.id) {
        navigate({ to: '/board' });
        return;
      }

      startTransition(() => {
        setCurrentProject(project);
        navigate({ to: '/board' });
      });
    },
    [currentProject?.id, navigate, setCurrentProject]
  );

  const handleBugReportClick = useCallback(() => {
    const api = getElectronAPI();
    api.openExternalLink('https://github.com/bobbyrush/taktician/issues');
  }, []);

  const handleWikiClick = useCallback(() => {
    navigate({ to: '/wiki' });
  }, [navigate]);

  const handleVpsWorkspaceCreated = useCallback(
    (project: Project) => {
      const existing = useAppStore.getState().projects;
      const alreadyExists = existing.some((entry) => entry.id === project.id);
      const nextProjects = alreadyExists
        ? existing.map((entry) => (entry.id === project.id ? project : entry))
        : [...existing, project];

      setProjects(nextProjects);
      setCurrentProject(project);
      navigate({ to: '/board' });
    },
    [navigate, setCurrentProject, setProjects]
  );

  useEffect(() => {
    // One-time migration for this SSH-only fork: remove legacy local projects.
    if (localStorage.getItem(SSH_ONLY_MIGRATION_KEY) === '1') {
      return;
    }

    let cancelled = false;

    const purgeLegacyLocalProjects = async () => {
      try {
        const result = await getHttpApiClient().workspace.purgeLocalProjects();
        if (!result.success || cancelled) {
          return;
        }

        const nextProjects = (result.projects ?? []) as Project[];
        setProjects(nextProjects);

        const currentId = result.currentProjectId;
        const nextCurrent = currentId
          ? (nextProjects.find((project) => project.id === currentId) ?? null)
          : null;
        setCurrentProject(nextCurrent);

        localStorage.setItem(SSH_ONLY_MIGRATION_KEY, '1');

        if ((result.removedCount ?? 0) > 0) {
          toast.success('Migrated to SSH-only workspaces', {
            description: `Removed ${result.removedCount} local project entries.`,
          });
        }
      } catch (error) {
        if (!cancelled) {
          toast.error('Failed to migrate local projects', {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    };

    void purgeLegacyLocalProjects();

    return () => {
      cancelled = true;
    };
  }, [setCurrentProject, setProjects]);

  useEffect(() => {
    // Ensure selected project is always a VPS workspace in SSH-only mode.
    if (currentProject && isVpsWorkspaceProject(currentProject)) {
      return;
    }

    const firstVpsProject = vpsProjects[0] ?? null;
    if (firstVpsProject) {
      setCurrentProject(firstVpsProject);
    } else if (currentProject) {
      setCurrentProject(null);
    }
  }, [currentProject, setCurrentProject, vpsProjects]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const key = event.key;
      let projectIndex: number | null = null;

      if (key >= '1' && key <= '9') {
        projectIndex = Number.parseInt(key, 10) - 1;
      } else if (key === '0') {
        projectIndex = 9;
      }

      if (projectIndex !== null && projectIndex < vpsProjects.length) {
        const targetProject = vpsProjects[projectIndex];
        if (targetProject && targetProject.id !== currentProject?.id) {
          void handleProjectClick(targetProject);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vpsProjects, currentProject?.id, handleProjectClick]);

  return (
    <>
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col w-16 z-50 relative',
          'bg-gradient-to-b from-sidebar/95 via-sidebar/85 to-sidebar/90 backdrop-blur-2xl',
          'border-r border-border/60 shadow-[1px_0_20px_-5px_rgba(0,0,0,0.1)]'
        )}
        data-testid="project-switcher"
      >
        <div
          className={cn(
            'flex flex-col items-center pb-2 px-2',
            isMac && isElectron() ? MACOS_ELECTRON_TOP_PADDING_CLASS : 'pt-3'
          )}
        >
          <button
            onClick={() => navigate({ to: '/dashboard' })}
            className="group flex flex-col items-center gap-0.5"
            title="Go to Dashboard"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 256 256"
              role="img"
              aria-label="Taktician Logo"
              className="size-10 group-hover:rotate-12 transition-transform duration-300 ease-out"
            >
              <defs>
                <linearGradient
                  id="bg-switcher"
                  x1="0"
                  y1="0"
                  x2="256"
                  y2="256"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: 'var(--brand-400)' }} />
                  <stop offset="100%" style={{ stopColor: 'var(--brand-600)' }} />
                </linearGradient>
              </defs>
              <rect x="16" y="16" width="224" height="224" rx="56" fill="url(#bg-switcher)" />
              <g
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M92 92 L52 128 L92 164" />
                <path d="M144 72 L116 184" />
                <path d="M164 92 L204 128 L164 164" />
              </g>
            </svg>
            <span className="text-[0.625rem] text-muted-foreground leading-none font-medium">
              v{appVersion} {versionSuffix}
            </span>
          </button>

          <div className="flex justify-center mt-2">
            <NotificationBell projectPath={currentProject?.path ?? null} />
          </div>
          <div className="w-full h-px bg-border mt-3" />
        </div>

        <div className="flex-1 overflow-y-auto pt-1 pb-3 px-2 space-y-2">
          {vpsProjects.map((project, index) => (
            <ProjectSwitcherItem
              key={project.id}
              project={project}
              isActive={currentProject?.id === project.id}
              hotkeyIndex={index < 10 ? index : undefined}
              onClick={() => void handleProjectClick(project)}
              onContextMenu={(e) => handleContextMenu(project, e)}
            />
          ))}

          {vpsProjects.length > 0 && <div className="w-full h-px bg-border my-2" />}

          <button
            onClick={() => setShowAddVpsWorkspaceDialog(true)}
            className={cn(
              'w-full aspect-square rounded-xl flex items-center justify-center',
              'transition-all duration-200 ease-out',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50 border border-transparent hover:border-border/40',
              'hover:shadow-sm hover:scale-105 active:scale-95'
            )}
            title="Add VPS Workspace"
            data-testid="new-project-button"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        <div className="p-2 border-t border-border/40 space-y-2">
          {!hideWiki && (
            <button
              onClick={handleWikiClick}
              className={cn(
                'w-full aspect-square rounded-xl flex items-center justify-center',
                'transition-all duration-200 ease-out',
                isWikiActive
                  ? [
                      'bg-gradient-to-r from-brand-500/20 via-brand-500/15 to-brand-600/10',
                      'text-foreground',
                      'border border-brand-500/30',
                      'shadow-md shadow-brand-500/10',
                    ]
                  : [
                      'text-muted-foreground hover:text-foreground',
                      'hover:bg-accent/50 border border-transparent hover:border-border/40',
                      'hover:shadow-sm hover:scale-105 active:scale-95',
                    ]
              )}
              title="Wiki"
              data-testid="wiki-button"
            >
              <BookOpen
                className={cn('w-5 h-5', isWikiActive && 'text-brand-500 drop-shadow-sm')}
              />
            </button>
          )}

          <button
            onClick={handleBugReportClick}
            className={cn(
              'w-full aspect-square rounded-xl flex items-center justify-center',
              'transition-all duration-200 ease-out',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent/50 border border-transparent hover:border-border/40',
              'hover:shadow-sm hover:scale-105 active:scale-95'
            )}
            title="Report Bug / Feature Request"
            data-testid="bug-report-button"
          >
            <Bug className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {contextMenuProject && contextMenuPosition && (
        <ProjectContextMenu
          project={contextMenuProject}
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          onEdit={handleEditProject}
        />
      )}

      {editDialogProject && (
        <EditProjectDialog
          project={editDialogProject}
          open={!!editDialogProject}
          onOpenChange={(open) => !open && setEditDialogProject(null)}
        />
      )}

      <AddVpsWorkspaceDialog
        open={showAddVpsWorkspaceDialog}
        onOpenChange={setShowAddVpsWorkspaceDialog}
        onCreated={handleVpsWorkspaceCreated}
      />
    </>
  );
}
