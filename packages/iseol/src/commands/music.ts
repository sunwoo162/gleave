import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import {
  addTrackToPlaylist,
  createPlaylist,
  getPlaylist,
  listPlaylists,
  playMusicPlaylist,
  removeTrackFromPlaylist,
  skipMusic,
  stopMusic,
  type MusicTrack,
} from "../services/music.js";
import { formatUserFacingError } from "../security/user-error.js";
import {
  assertUserInBotVoiceChannel,
  getGuildVoiceConnection,
} from "../services/voice-connection.js";
import { ensureStudySession } from "../services/voice-time.js";

const NO_PLAYLIST_CHOICE = "__create_playlist_first__";
const CREATE_PLAYLIST_GUIDE = "먼저 /music playlist create name:<플레이리스트 이름> 명령어로 플레이리스트를 만들어주세요.";

export const musicCommand = new SlashCommandBuilder()
  .setName("music")
  .setDescription("이설이의 음악 플레이리스트를 관리하고 재생합니다.")
  .addSubcommandGroup((group) => group
    .setName("playlist")
    .setDescription("플레이리스트를 만들고 곡을 관리합니다.")
    .addSubcommand((subcommand) => subcommand
      .setName("create")
      .setDescription("새 플레이리스트를 만듭니다.")
      .addStringOption((option) => option
        .setName("name")
        .setDescription("플레이리스트 이름")
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("add")
      .setDescription("플레이리스트에 YouTube/Spotify 노래 링크를 추가합니다.")
      .addStringOption((option) => option
        .setName("playlist")
        .setDescription("노래를 추가할 플레이리스트")
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption((option) => option
        .setName("song")
        .setDescription("YouTube 노래 링크(재생목록에서 연 링크 포함) 또는 Spotify 개별 노래 링크")
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("remove")
      .setDescription("플레이리스트에서 노래를 삭제합니다.")
      .addStringOption((option) => option
        .setName("playlist")
        .setDescription("노래를 삭제할 플레이리스트")
        .setRequired(true)
        .setAutocomplete(true))
      .addIntegerOption((option) => option
        .setName("number")
        .setDescription("/music playlist show에 표시되는 노래 번호")
        .setMinValue(1)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("show")
      .setDescription("플레이리스트 목록 또는 수록곡을 확인합니다.")
      .addStringOption((option) => option
        .setName("playlist")
        .setDescription("확인할 플레이리스트 이름 (비우면 전체 목록)")
        .setAutocomplete(true))))
  .addSubcommand((subcommand) => subcommand
    .setName("play")
    .setDescription("저장한 플레이리스트를 반복 재생하고 공부 시간 측정을 시작합니다.")
    .addStringOption((option) => option
      .setName("playlist")
      .setDescription("재생할 플레이리스트")
      .setRequired(true)
      .setAutocomplete(true)))
  .addSubcommand((subcommand) => subcommand
    .setName("skip")
    .setDescription("현재 재생 중인 노래를 넘깁니다."))
  .addSubcommand((subcommand) => subcommand
    .setName("stop")
    .setDescription("음악 반복 재생을 정지합니다."));

function playlistEmbed(name: string, tracks: MusicTrack[]): EmbedBuilder {
  const lines = tracks.slice(0, 30).map((track, index) => {
    const source = track.source === "spotify" ? " · Spotify" : track.source === "youtube" ? " · YouTube" : "";
    return `${index + 1}. [${track.title}](${track.url})${source}`;
  });
  const hidden = Math.max(0, tracks.length - lines.length);

  return new EmbedBuilder()
    .setTitle(`🎵 ${name}`)
    .setDescription(lines.length > 0
      ? `${lines.join("\n")}${hidden > 0 ? `\n\n외 ${hidden}곡` : ""}`
      : "아직 추가된 노래가 없습니다.")
    .setFooter({ text: `총 ${tracks.length}곡 · 마지막 곡 이후 처음부터 반복 재생` });
}

export async function handleMusicAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId || interaction.commandName !== "music") return;

  const focused = interaction.options.getFocused(true);
  if (focused.name !== "playlist") return;

  const query = focused.value.toString().trim().toLowerCase();
  const playlists = await listPlaylists(interaction.guildId);

  if (playlists.length === 0) {
    await interaction.respond([{
      name: "플레이리스트가 없습니다 · /music playlist create로 먼저 만들어주세요.",
      value: NO_PLAYLIST_CHOICE,
    }]);
    return;
  }

  const choices = playlists
    .filter((playlist) => !query || playlist.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map((playlist) => ({
      name: `${playlist.name} · ${playlist.tracks.length}곡`.slice(0, 100),
      value: playlist.name,
    }));

  await interaction.respond(choices);
}

export async function handleMusicCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: "서버 안에서만 사용할 수 있습니다.", ephemeral: true });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply();

  try {
    if (group === "playlist" && subcommand === "create") {
      const name = interaction.options.getString("name", true);
      const playlist = await createPlaylist(interaction.guild.id, name);
      await interaction.editReply(`✅ **${playlist.name}** 플레이리스트를 만들었습니다.`);
      return;
    }

    if (group === "playlist" && subcommand === "add") {
      const playlists = await listPlaylists(interaction.guild.id);
      if (playlists.length === 0) throw new Error(CREATE_PLAYLIST_GUIDE);

      const playlistName = interaction.options.getString("playlist", true);
      if (playlistName === NO_PLAYLIST_CHOICE) throw new Error(CREATE_PLAYLIST_GUIDE);

      const song = interaction.options.getString("song", true);
      const { playlist, track } = await addTrackToPlaylist(
        interaction.guild.id,
        playlistName,
        song,
        interaction.user.id,
      );

      const source = track.source === "spotify" ? "Spotify" : "YouTube";
      await interaction.editReply(
        `➕ **${playlist.name}**에 [${track.title}](${track.url})을 추가했습니다.\n` +
        `출처: **${source}** · 현재 **${playlist.tracks.length}곡**`,
      );
      return;
    }

    if (group === "playlist" && subcommand === "remove") {
      const playlistName = interaction.options.getString("playlist", true);
      const number = interaction.options.getInteger("number", true);
      const { playlist, removed } = await removeTrackFromPlaylist(
        interaction.guild.id,
        playlistName,
        number,
      );

      await interaction.editReply(
        `🗑️ **${playlist.name}**에서 [${removed.title}](${removed.url})을 삭제했습니다.\n` +
        `현재 **${playlist.tracks.length}곡**입니다.`,
      );
      return;
    }

    if (group === "playlist" && subcommand === "show") {
      const name = interaction.options.getString("playlist")?.trim();
      if (name) {
        const playlist = await getPlaylist(interaction.guild.id, name);
        if (!playlist) throw new Error(`플레이리스트 \"${name}\"을 찾을 수 없습니다.`);
        await interaction.editReply({ embeds: [playlistEmbed(playlist.name, playlist.tracks)] });
        return;
      }

      const playlists = await listPlaylists(interaction.guild.id);
      if (playlists.length === 0) {
        await interaction.editReply(`아직 만든 플레이리스트가 없습니다.\n${CREATE_PLAYLIST_GUIDE}`);
        return;
      }

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("🎶 플레이리스트")
          .setDescription(playlists.map((playlist, index) => `${index + 1}. **${playlist.name}** · ${playlist.tracks.length}곡`).join("\n"))],
      });
      return;
    }

    if (!group && subcommand === "play") {
      const playlistName = interaction.options.getString("playlist", true);
      const result = await playMusicPlaylist(interaction.guild, interaction.user.id, playlistName);
      if (!result.current && result.queued === 0) {
        throw new Error("노래 음원 스트림을 시작하지 못했습니다. 잠시 후 다시 시도하거나 서버 로그를 확인해주세요.");
      }

      const channelId = getGuildVoiceConnection(interaction.guild.id)?.joinConfig.channelId;
      if (!channelId) throw new Error("연결된 음성 채널을 확인할 수 없습니다.");
      const studyStarted = await ensureStudySession(interaction.guild.id, interaction.user.id, channelId);

      await interaction.editReply(
        `▶️ **${result.playlist.name}** 반복 재생을 시작했습니다.\n` +
        `${result.current ? `현재 곡: **${result.current.title}**\n` : ""}` +
        `남은 곡: **${result.queued}곡**\n` +
        "🔁 마지막 곡이 끝나면 첫 곡부터 다시 재생합니다.\n" +
        (studyStarted
          ? `⏱️ <@${interaction.user.id}>님의 공부 시간 측정을 자동으로 시작했습니다.`
          : `⏱️ <@${interaction.user.id}>님의 공부 시간은 이미 측정 중이라 계속 기록합니다.`),
      );
      return;
    }

    if (!group && subcommand === "skip") {
      await assertUserInBotVoiceChannel(interaction.guild, interaction.user.id);
      const skipped = skipMusic(interaction.guild.id);
      if (!skipped) throw new Error("현재 재생 중인 노래가 없습니다.");
      await interaction.editReply(`⏭️ **${skipped.title}**을 건너뛰었습니다.`);
      return;
    }

    if (!group && subcommand === "stop") {
      await assertUserInBotVoiceChannel(interaction.guild, interaction.user.id);
      const stopped = stopMusic(interaction.guild.id);
      if (!stopped) throw new Error("현재 재생 중인 음악이 없습니다.");
      await interaction.editReply("⏹️ 음악 반복 재생을 정지했습니다.");
    }
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(`❌ 음악 명령 처리 실패\n\`${message}\``);
  }
}
