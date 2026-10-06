import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config.js";
import { formatUserFacingError } from "../security/user-error.js";
import {
  findGitHubAccount,
  GitHubUserService,
  linkGitHubAccount,
  listGitHubAccounts,
  renderGitHubGrass,
  unlinkGitHubAccount,
} from "../services/github-user.js";
import { getTotalStudySeconds } from "../services/voice-time.js";

export const githubCommand = new SlashCommandBuilder()
  .setName("github")
  .setDescription("Discord 사용자와 GitHub 계정을 연결하고 프로필을 확인합니다.")
  .addSubcommand((subcommand) => subcommand
    .setName("connect")
    .setDescription("내 Discord 계정에 GitHub 사용자명을 연결합니다.")
    .addStringOption((option) => option
      .setName("username")
      .setDescription("GitHub 사용자명 (예: sunwoo162)")
      .setMinLength(1)
      .setMaxLength(39)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("profile")
    .setDescription("연결된 GitHub 프로필과 최근 1년 잔디를 확인합니다.")
    .addUserOption((option) => option
      .setName("user")
      .setDescription("확인할 Discord 사용자 (비우면 내 프로필)")))
  .addSubcommand((subcommand) => subcommand
    .setName("disconnect")
    .setDescription("내 Discord 계정과 GitHub 연결을 해제합니다."));

function validGitHubUsername(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function formatStudyTime(seconds: number | null): string {
  if (seconds === null) return "조회 실패";
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes.toLocaleString("ko-KR")}분`;
  return `${hours.toLocaleString("ko-KR")}시간 ${minutes}분`;
}

async function handleConnect(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  await interaction.deferReply({ ephemeral: true });
  const username = interaction.options.getString("username", true).trim().replace(/^@/, "");

  if (!validGitHubUsername(username)) {
    await interaction.editReply("❌ 올바른 GitHub 사용자명을 입력해주세요.");
    return;
  }

  try {
    const github = new GitHubUserService(config.githubToken);
    const profile = await github.getProfile(username);
    const links = await listGitHubAccounts(interaction.guildId);
    const duplicate = links.find((link) =>
      link.githubLogin.toLowerCase() === profile.login.toLowerCase()
      && link.discordUserId !== interaction.user.id,
    );

    if (duplicate) {
      await interaction.editReply("❌ 이 GitHub 계정은 이 서버의 다른 Discord 사용자에게 이미 연결되어 있습니다.");
      return;
    }

    await linkGitHubAccount(interaction.guildId, interaction.user.id, profile.login);
    await interaction.editReply(
      `✅ <@${interaction.user.id}> 계정을 GitHub **@${profile.login}**에 연결했습니다.\n이제 프로젝트 저장소에 커밋하면 연결 사용자 로그에 Discord 계정이 함께 표시됩니다.`,
    );
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ GitHub 계정 연결 실패\n\`${message}\``);
  }
}

async function handleProfile(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.guild) return;

  const target = interaction.options.getUser("user") ?? interaction.user;
  const link = await findGitHubAccount(interaction.guildId, target.id);
  if (!link) {
    const guide = target.id === interaction.user.id
      ? "먼저 `/github connect username:<GitHub 사용자명>`으로 계정을 연결해주세요."
      : "해당 사용자는 이 서버에 GitHub 계정을 연결하지 않았습니다.";
    await interaction.reply({ content: `❌ ${guide}`, ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const github = new GitHubUserService(config.githubToken);
    const profile = await github.getProfile(link.githubLogin);
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const displayName = member?.displayName ?? target.username;
    const studySeconds = await getTotalStudySeconds(interaction.guildId, target.id).catch(() => null);

    let grass: Buffer | null = null;
    let totalContributions: number | null = null;
    let totalCommitContributions: number | null = null;
    let grassWarning: string | null = null;

    try {
      const calendar = await github.getContributionCalendar(profile.login);
      totalContributions = calendar.totalContributions;
      totalCommitContributions = calendar.totalCommitContributions ?? null;
      grass = await renderGitHubGrass(calendar);
    } catch (error) {
      grassWarning = formatUserFacingError(error, "GitHub 잔디를 불러오지 못했습니다.");
      console.warn(`GitHub 잔디 조회 실패 (${profile.login})`, error);
    }

    const profileTitle = profile.name?.trim()
      ? `${profile.name.trim()} · @${profile.login}`
      : `@${profile.login}`;
    const bio = profile.bio?.trim();
    const description = bio
      ? `> ${bio.replace(/\n/g, "\n> ")}\n\n<@${target.id}>님의 개발 활동과 공부 기록입니다.`
      : `<@${target.id}>님의 개발 활동과 공부 기록입니다.`;

    const embed = new EmbedBuilder()
      .setColor(0x238636)
      .setAuthor({
        name: `${displayName} · GitHub Profile`,
        iconURL: target.displayAvatarURL({ size: 64 }),
      })
      .setTitle(profileTitle)
      .setURL(profile.htmlUrl)
      .setThumbnail(profile.avatarUrl)
      .setDescription(description)
      .addFields(
        {
          name: "🌱 최근 1년 기여",
          value: totalContributions === null
            ? "**조회 실패**"
            : `**${totalContributions.toLocaleString("ko-KR")}**`,
          inline: true,
        },
        {
          name: "💻 최근 1년 커밋",
          value: totalCommitContributions === null
            ? "**조회 실패**"
            : `**${totalCommitContributions.toLocaleString("ko-KR")}**`,
          inline: true,
        },
        {
          name: "🎧 누적 공부 시간",
          value: `**${formatStudyTime(studySeconds)}**`,
          inline: true,
        },
        {
          name: "📦 공개 저장소",
          value: `**${profile.publicRepos.toLocaleString("ko-KR")}**`,
          inline: true,
        },
        {
          name: "👤 팔로워",
          value: `**${profile.followers.toLocaleString("ko-KR")}**`,
          inline: true,
        },
        {
          name: "➡️ 팔로잉",
          value: `**${profile.following.toLocaleString("ko-KR")}**`,
          inline: true,
        },
      );

    const details = [
      profile.company ? `🏢 ${profile.company}` : null,
      profile.location ? `📍 ${profile.location}` : null,
    ].filter((value): value is string => Boolean(value));
    if (details.length > 0) {
      embed.addFields({ name: "Profile", value: details.join("\n").slice(0, 1024) });
    }

    if (grassWarning) {
      embed.setFooter({ text: `GitHub contribution graph를 불러오지 못했습니다 · ${grassWarning}`.slice(0, 2048) });
    } else {
      embed.setFooter({ text: "GitHub 최근 1년 활동 · 이설 누적 공부 시간" });
    }

    const profileButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("GitHub에서 프로필 보기")
        .setStyle(ButtonStyle.Link)
        .setURL(profile.htmlUrl)
        .setEmoji("🔗"),
    );

    if (grass) {
      embed.setImage("attachment://github-grass.png");
      await interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(grass, { name: "github-grass.png" })],
        components: [profileButton],
      });
      return;
    }

    await interaction.editReply({ embeds: [embed], components: [profileButton] });
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ GitHub 프로필 조회 실패\n\`${message}\``);
  }
}

async function handleDisconnect(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const removed = await unlinkGitHubAccount(interaction.guildId, interaction.user.id);
  if (!removed) {
    await interaction.reply({ content: "ℹ️ 현재 연결된 GitHub 계정이 없습니다.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `✅ GitHub **@${removed.githubLogin}** 연결을 해제했습니다.`,
    ephemeral: true,
  });
}

export async function handleGitHubCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "connect") await handleConnect(interaction);
  if (subcommand === "profile") await handleProfile(interaction);
  if (subcommand === "disconnect") await handleDisconnect(interaction);
}
