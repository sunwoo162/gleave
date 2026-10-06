import "./services/fetch-fallback.js";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} from "discord.js";
import { handleContestCommandV2 } from "./commands/contest-v2.js";
import { handleContestVoteButton } from "./commands/contest.js";
import { handleGitHubCommand } from "./commands/github.js";
import { handleJobCommand } from "./commands/job.js";
import { config } from "./config.js";
import { handleMusicAutocomplete, handleMusicCommand } from "./commands/music.js";
import { handleProjectAutocomplete, handleProjectCommand } from "./commands/project.js";
import { handleScrumAutocomplete, handleScrumCommand } from "./commands/scrum.js";
import { handleVoiceCommand } from "./commands/voice.js";
import { commandHelpEmbed } from "./services/command-help.js";
import { handleCalendarButton, handleCalendarModal } from "./services/calendar/calendar-discord.js";
import { startContestAudienceFeedPolling } from "./services/contest-audience-feed.js";
import { startContestFeedPolling } from "./services/contest-feed.js";
import { ensureContestPrepAnnouncementChannels } from "./services/contest-prep-announcement.js";
import { startDailyScrumReminderScheduler } from "./services/daily-scrum.js";
import { resetGuildState } from "./services/guild-reset.js";
import { startGitHubCommitFeedPolling } from "./services/github-commit-feed.js";
import { GitHubWebhookService } from "./services/github.js";
import { startJobFeedPolling } from "./services/job-feed.js";
import { ensureProjectDiscussionChannels } from "./services/project-discussion.js";
import { routeInteraction, type InteractionRouterDependencies } from "./interactions/interaction-router.js";
import { handleProjectJoinButton, handleProjectJoinModal } from "./interactions/project-join.js";
import { handleVoiceAutoLeave } from "./services/voice-auto-leave.js";
import {
  getActiveStudySession,
  recoverInterruptedStudySessions,
  startVoiceStudyHeartbeat,
  stopStudySession,
} from "./services/voice-time.js";
import { startWebhookServer } from "./services/webhook-server.js";
import { startIseolRuntimeServices } from "./runtime/iseol-runtime-services.js";
import { createBoundProjectProgressChannelResolver, createDiscordProgressAdapter } from "./discord-project/progress-discord-adapter.js";
import { formatAdministratorResetFailure } from "./security/user-error.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});
const github = new GitHubWebhookService(config.githubToken);
let iseolRuntimeServices: Awaited<ReturnType<typeof startIseolRuntimeServices>> | null = null;
let iseolRuntimeStartup: Promise<Awaited<ReturnType<typeof startIseolRuntimeServices>>> | null = null;

function discordProgressRuntimeOptions(): {
  progressNotificationRoot?: string;
  progressNotificationAdapter?: ReturnType<typeof createDiscordProgressAdapter>;
} {
  // Progress dispatch is explicitly opt-in. The existing Discord client is
  // reused, while both durable roots must be configured before any message
  // can be sent. This keeps a partially configured deployment fail-closed.
  const notificationRoot = process.env.ISEOL_DISCORD_NOTIFICATION_ROOT?.trim();
  const bindingRoot = process.env.ISEOL_DISCORD_BINDING_ROOT?.trim();
  if (!notificationRoot || !bindingRoot) return {};
  const resolveChannel = createBoundProjectProgressChannelResolver({ bindingRoot });
  return {
    progressNotificationRoot: notificationRoot,
    progressNotificationAdapter: createDiscordProgressAdapter(client, resolveChannel),
  };
}

let shuttingDown = false;
async function shutdownIseolRuntime(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    const services = iseolRuntimeServices ?? await iseolRuntimeStartup?.catch(() => null);
    await services?.dispose();
  } catch (error) {
    console.error("Iseol runtime shutdown failed", error);
    process.exitCode = 1;
  } finally {
    process.exitCode ??= signal === "SIGINT" ? 130 : 143;
    client.destroy();
  }
}
process.once("SIGINT", () => { void shutdownIseolRuntime("SIGINT"); });
process.once("SIGTERM", () => { void shutdownIseolRuntime("SIGTERM"); });


const interactionRouterDependencies: InteractionRouterDependencies = {
  handleProjectAutocomplete,
  handleMusicAutocomplete,
  handleScrumAutocomplete,
  handleProjectCommand,
  handleContestCommand: handleContestCommandV2,
  handleJobCommand,
  handleGitHubCommand,
  handleScrumCommand,
  handleVoiceCommand,
  handleMusicCommand,
  handleCalendarButton,
  handleContestVoteButton,
  handleProjectJoinButton,
  handleCalendarModal,
  handleProjectJoinModal: (interaction) => handleProjectJoinModal(interaction, github),
  afterProjectCommand: () => ensureProjectDiscussionChannels(client),
  afterContestVote: () => ensureContestPrepAnnouncementChannels(client),
};

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`${readyClient.user.tag} 로그인 완료 · 연결 서버 ${readyClient.guilds.cache.size}개`);
  startWebhookServer(client);
  iseolRuntimeStartup = startIseolRuntimeServices({
    env: process.env,
    ...discordProgressRuntimeOptions(),
  });
  void iseolRuntimeStartup
    .then((services) => {
      if (!shuttingDown) iseolRuntimeServices = services;
    })
    .catch((error) => console.error("Iseol runtime composition failed", error));
  startContestFeedPolling(client);
  startContestAudienceFeedPolling(client);
  startJobFeedPolling(client);
  startGitHubCommitFeedPolling(client);
  startVoiceStudyHeartbeat();

  const interruptedSessions = await recoverInterruptedStudySessions();
  if (interruptedSessions > 0) {
    console.log(`이전 실행에서 종료되지 않은 음성 공부 세션 정리: ${interruptedSessions}개`);
  }

  await ensureProjectDiscussionChannels(client);
  await ensureContestPrepAnnouncementChannels(client);
  startDailyScrumReminderScheduler(client);
});

client.on(Events.GuildCreate, (guild) => {
  console.log(`Discord 서버 연결: ${guild.name} (${guild.id}) · 총 ${client.guilds.cache.size}개`);
});

client.on(Events.GuildDelete, (guild) => {
  console.log(`Discord 서버 연결 해제: ${guild.name} (${guild.id}) · 총 ${client.guilds.cache.size}개`);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (!oldState.member?.user.bot) {
    try {
      const session = await getActiveStudySession(oldState.guild.id, oldState.id);
      if (
        session
        && oldState.channelId === session.channelId
        && newState.channelId !== session.channelId
      ) {
        const stopped = await stopStudySession(oldState.guild.id, oldState.id);
        if (stopped) {
          console.log(`음성 공부 자동 종료 (${oldState.guild.id}/${oldState.id}): ${Math.round(stopped.seconds)}초`);
        }
      }
    } catch (error) {
      console.error(`음성 공부 자동 종료 실패 (${oldState.guild.id}/${oldState.id})`, error);
    }
  }

  try {
    await handleVoiceAutoLeave(newState.guild);
  } catch (error) {
    console.error(`음성 채널 자동 퇴장 상태 확인 실패 (${newState.guild.id})`, error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const content = message.content.trim();
  if (content === "!관리자권한초기화") {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({
        content: "❌ 서버 관리자만 사용할 수 있습니다.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await message.reply({
      content: "⚠️ 이설이 생성한 서버 공간과 저장 데이터를 초기화합니다. 완료 결과는 이 채널 또는 DM으로 알려드립니다.",
      allowedMentions: { repliedUser: false },
    });

    try {
      const summary = await resetGuildState(message.guild);
      const warningText = summary.warnings.length > 0
        ? `\n⚠️ 일부 정리 실패: **${summary.warnings.length}건** (서버 로그 확인)`
        : "";
      const report =
        `✅ **${message.guild.name}** 이설 초기화 완료\n` +
        `삭제한 Discord 채널/카테고리: **${summary.deletedChannels}개**\n` +
        `초기화한 저장 데이터: **${summary.clearedRecords}건**\n` +
        `삭제한 GitHub webhook: **${summary.removedExternalHooks}개**\n` +
        `삭제한 Project Workspace binding: **${summary.removedProjectBindings}개**${warningText}`;

      console.log(`관리자 서버 초기화 완료 (${message.guild.id})`, summary);
      await message.channel.send(report).catch(async () => {
        await message.author.send(report).catch(() => undefined);
      });
    } catch (error) {
      console.error(`관리자 서버 초기화 실패 (${message.guild.id})`, error);
      await message.author.send(formatAdministratorResetFailure(error)).catch(() => undefined);
    }
    return;
  }

  if (content !== "!명령어") return;

  await message.reply({
    embeds: [commandHelpEmbed()],
    allowedMentions: { repliedUser: false },
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await routeInteraction(interaction, interactionRouterDependencies);
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: "명령 처리 중 오류가 발생했습니다.", ephemeral: true }).catch(() => undefined);
    }
  }
});

await client.login(config.discordToken);
