import type { Client, Message, TextChannel } from "discord.js";
import type { DiscordProgressNotification, ProgressNotificationAdapter } from "./progress-notifications.js";
import { loadDiscordProjectBinding } from "./binding-store.js";
import { findProject, listProjects, withProjectDeleteLock, type StoredProject } from "../services/projects.js";

export type ProgressChannelResolver = (client: Client, notification: DiscordProgressNotification) => Promise<TextChannel | null>;
type ProgressChannelLifecycleGuard = <T>(notification: DiscordProgressNotification, task: () => Promise<T>) => Promise<T | undefined>;
type BoundProjectProgressChannelResolver = ProgressChannelResolver & {
  withProjectLifecycleLock?: ProgressChannelLifecycleGuard;
};

/** The production boundary for progress notifications. Channel lookup remains
 * injected so project binding and permission policy stay owned by the existing
 * Discord services. */
export function createDiscordProgressAdapter(client: Client, resolveChannel: ProgressChannelResolver): ProgressNotificationAdapter {
  const lifecycleResolver = resolveChannel as BoundProjectProgressChannelResolver;
  const deliver = async (notification: DiscordProgressNotification): Promise<{ accepted: boolean; messageId?: string }> => {
    const channel = await resolveChannel(client, notification);
    if (!channel) return { accepted: false };
    const message = await channel.send({ content: notification.content, allowedMentions: { parse: [] } }) as Message;
    return { accepted: true, messageId: message.id };
  };

  return {
    send: async (notification) => {
      if (notification.projectId && lifecycleResolver.withProjectLifecycleLock) {
        const result = await lifecycleResolver.withProjectLifecycleLock(notification, () => deliver(notification));
        return result ?? { accepted: false };
      }
      return deliver(notification);
    },
  };
}

export function createBoundProjectProgressChannelResolver(options: {
  bindingRoot: string;
  loadProjects?: () => Promise<StoredProject[]>;
  findProject?: (projectId: string) => Promise<StoredProject | null>;
}): ProgressChannelResolver {
  const load = options.loadProjects ?? listProjects;
  const find = options.findProject ?? findProject;
  const findBoundProject = async (notification: DiscordProgressNotification): Promise<StoredProject | null> => {
    if (!notification.projectId) return null;
    const projects = await load();
    for (const project of projects) {
      const binding = await loadDiscordProjectBinding(options.bindingRoot, project.guildId, project.id);
      if (!binding || binding.projectId !== notification.projectId) continue;
      return project;
    }
    return null;
  };

  const resolveChannel = (async (client, notification) => {
    const project = await findBoundProject(notification);
    if (!project) return null;
    const guild = client.guilds.cache.get(project.guildId) ?? await client.guilds.fetch(project.guildId).catch(() => null);
    if (!guild) return null;
    const channelIds = [project.frontendLogChannelId, project.backendLogChannelId].filter((value): value is string => Boolean(value));
    for (const channelId of channelIds) {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && "send" in channel && typeof channel.send === "function") return channel as TextChannel;
    }
    return null;
  }) as BoundProjectProgressChannelResolver;

  resolveChannel.withProjectLifecycleLock = async (notification, task) => {
    const initial = await findBoundProject(notification);
    if (!initial) return undefined;
    return withProjectDeleteLock(initial.guildId, initial.id, async () => {
      const current = await find(initial.id);
      if (!current || current.guildId !== initial.guildId) return undefined;
      const binding = await loadDiscordProjectBinding(options.bindingRoot, current.guildId, current.id);
      if (!binding || binding.projectId !== notification.projectId) return undefined;
      return task();
    });
  };

  return resolveChannel;
}
