import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { clearMusicRuntime } from "../services/music.js";
import { renderVoiceGrass } from "../services/voice-grass.js";
import {
  assertUserInBotVoiceChannel,
  getGuildVoiceConnection,
  joinUserVoiceChannel,
  leaveGuildVoiceChannel,
} from "../services/voice-connection.js";
import {
  ensureStudySession,
  getDailyStudySeconds,
  stopStudySessionsForGuild,
} from "../services/voice-time.js";
import { formatUserFacingError } from "../security/user-error.js";

export const voiceCommand = new SlashCommandBuilder()
  .setName("voice")
  .setDescription("이설이의 음성 채널 및 공부 시간 기능을 사용합니다.")
  .addSubcommand((subcommand) => subcommand
    .setName("join")
    .setDescription("내가 있는 음성 채널로 이설이를 부르고 공부 시간 측정을 시작합니다."))
  .addSubcommand((subcommand) => subcommand
    .setName("add")
    .setDescription("같은 음성 채널의 사용자를 공부 시간 측정에 추가합니다.")
    .addUserOption((option) => option
      .setName("user")
      .setDescription("공부 시간 측정에 추가할 사용자")
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("leave")
    .setDescription("이설이를 음성 채널에서 내보내고 진행 중인 공부 측정을 저장합니다."))
  .addSubcommand((subcommand) => subcommand
    .setName("grass")
    .setDescription("내 음성 공부 시간을 GitHub 잔디 형태로 확인합니다."));

export async function handleVoiceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "grass") {
    await interaction.deferReply();
    try {
      const dailySeconds = await getDailyStudySeconds(interaction.guild.id, interaction.user.id);
      const displayName = interaction.user.globalName ?? interaction.user.username;
      const image = await renderVoiceGrass(dailySeconds, displayName);
      const totalSeconds = Object.values(dailySeconds).reduce((sum, value) => sum + value, 0);
      const totalHours = (totalSeconds / 3600).toFixed(1);

      await interaction.editReply({
        content: `🌱 <@${interaction.user.id}>님의 누적 음성 공부 시간은 **${totalHours}시간**입니다.`,
        files: [new AttachmentBuilder(image, { name: "voice-study-grass.png" })],
        allowedMentions: { users: [] },
      });
    } catch (error) {
      const message = formatUserFacingError(error);
      await interaction.editReply(`❌ 공부 잔디 생성 실패\n\`${message}\``);
    }
    return;
  }

  await interaction.deferReply();

  try {
    if (subcommand === "join") {
      const connection = await joinUserVoiceChannel(interaction.guild, interaction.user.id);
      const channelId = connection.joinConfig.channelId;
      if (!channelId) throw new Error("연결된 음성 채널을 확인할 수 없습니다.");

      const started = await ensureStudySession(interaction.guild.id, interaction.user.id, channelId);
      await interaction.editReply(
        `🔊 이설이가 <#${channelId}> 음성 채널에 들어왔습니다.\n` +
        (started
          ? `⏱️ <@${interaction.user.id}>님의 공부 시간 측정을 자동으로 시작했습니다.`
          : `⏱️ <@${interaction.user.id}>님의 공부 시간은 이미 측정 중이라 계속 기록합니다.`),
      );
      return;
    }

    if (subcommand === "add") {
      const target = interaction.options.getUser("user", true);
      if (target.bot) throw new Error("봇은 공부 시간 측정에 추가할 수 없습니다.");

      await assertUserInBotVoiceChannel(interaction.guild, interaction.user.id);
      await assertUserInBotVoiceChannel(interaction.guild, target.id);

      const channelId = getGuildVoiceConnection(interaction.guild.id)?.joinConfig.channelId;
      if (!channelId) throw new Error("이설이가 들어가 있는 음성 채널이 없습니다.");

      const started = await ensureStudySession(interaction.guild.id, target.id, channelId);
      await interaction.editReply(
        started
          ? `➕ <@${target.id}>님을 공부 시간 측정에 추가했습니다. 이제 음성 채널을 나갈 때까지 자동으로 기록합니다.`
          : `ℹ️ <@${target.id}>님은 이미 공부 시간이 측정 중입니다.`,
      );
      return;
    }

    if (subcommand === "leave") {
      await assertUserInBotVoiceChannel(interaction.guild, interaction.user.id);
      const stopped = await stopStudySessionsForGuild(interaction.guild.id);
      clearMusicRuntime(interaction.guild.id);
      const left = leaveGuildVoiceChannel(interaction.guild.id);
      if (!left) throw new Error("이설이가 들어가 있는 음성 채널이 없습니다.");

      await interaction.editReply(
        stopped.length > 0
          ? `👋 음성 채널에서 나왔습니다. 공부 시간 측정 **${stopped.length}명**의 기록을 저장했습니다.`
          : "👋 음성 채널에서 나왔습니다.",
      );
    }
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ 음성 명령 처리 실패\n\`${message}\``);
  }
}
