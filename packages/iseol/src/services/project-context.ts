import type { RepositoryRef } from "./github.js";
import { findProject, type StoredProject } from "./projects.js";

export type ProjectContext = {
  projectId: string;
  name: string;
  guildId: string;
  categoryId: string;
  organization: string;
  repositories: {
    frontend: RepositoryRef;
    backend: RepositoryRef;
  };
  integrations: {
    calendar: { id?: string; url?: string; channelId?: string };
    figma: { url?: string; fileKey?: string; channelId?: string };
    notion: { url?: string; pageId?: string; channelId?: string };
  };
  channels: {
    frontendLogId?: string;
    backendLogId?: string;
  };
};

export function mapStoredProjectContext(project: StoredProject): ProjectContext {
  return {
    projectId: project.id,
    name: project.name,
    guildId: project.guildId,
    categoryId: project.categoryId,
    organization: project.organization,
    repositories: {
      frontend: { ...project.frontend },
      backend: { ...project.backend },
    },
    integrations: {
      calendar: {
        ...(project.calendarId ? { id: project.calendarId } : {}),
        ...(project.calendarUrl ? { url: project.calendarUrl } : {}),
        ...(project.calendarChannelId ? { channelId: project.calendarChannelId } : {}),
      },
      figma: {
        ...(project.figmaUrl ? { url: project.figmaUrl } : {}),
        ...(project.figmaFileKey ? { fileKey: project.figmaFileKey } : {}),
        ...(project.figmaChannelId ? { channelId: project.figmaChannelId } : {}),
      },
      notion: {
        ...(project.notionUrl ? { url: project.notionUrl } : {}),
        ...(project.notionPageId ? { pageId: project.notionPageId } : {}),
        ...(project.notionChannelId ? { channelId: project.notionChannelId } : {}),
      },
    },
    channels: {
      ...(project.frontendLogChannelId ? { frontendLogId: project.frontendLogChannelId } : {}),
      ...(project.backendLogChannelId ? { backendLogId: project.backendLogChannelId } : {}),
    },
  };
}

export async function resolveProjectContext(
  projectId: string,
  guildId: string,
  find: (id: string) => Promise<StoredProject | null> = findProject,
): Promise<ProjectContext | null> {
  const project = await find(projectId);
  if (!project || project.guildId !== guildId) return null;
  return mapStoredProjectContext(project);
}

export function selectProjectRepository(
  context: ProjectContext,
  side: "frontend" | "backend",
): RepositoryRef {
  return context.repositories[side];
}
