import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  type AudioPlayer,
} from "@discordjs/voice";
import type { Guild } from "discord.js";
import * as play from "play-dl";
import { withDurableFileStateLock } from "./file-state-lock.js";
import { joinUserVoiceChannel } from "./voice-connection.js";

const DATA_FILE = resolve(process.cwd(), "data", "music-playlists.json");

export type MusicTrack = {
  title: string;
  url: string;
  playbackUrl?: string;
  source?: "youtube" | "spotify";
  addedBy: string;
};

export type MusicPlaylist = {
  name: string;
  tracks: MusicTrack[];
};

type MusicData = {
  guilds: Record<string, MusicPlaylist[]>;
};

type GuildMusicState = {
  player: AudioPlayer;
  queue: MusicTrack[];
  loopTracks: MusicTrack[];
  activePlaylistName?: string;
  current?: MusicTrack;
  initialized: boolean;
};

type SpotifyOEmbed = {
  title?: string;
  html?: string;
};

const runtime = new Map<string, GuildMusicState>();

function normalizePlaylistName(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function findPlaylist(playlists: MusicPlaylist[], name: string): MusicPlaylist | undefined {
  const normalized = normalizePlaylistName(name);
  return playlists.find((playlist) => normalizePlaylistName(playlist.name) === normalized);
}

function clonePlaylist(playlist: MusicPlaylist): MusicPlaylist {
  return {
    ...playlist,
    tracks: playlist.tracks.map((track) => ({ ...track })),
  };
}

export class MusicStore {
  constructor(private readonly file = DATA_FILE) {}

  private async readData(): Promise<MusicData> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Partial<MusicData>;
      return { guilds: parsed.guilds ?? {} };
    } catch {
      return { guilds: {} };
    }
  }

  private async writeData(data: MusicData): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2), "utf8");
  }

  private updateData<T>(updater: (data: MusicData) => T | Promise<T>): Promise<T> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      const result = await updater(data);
      await this.writeData(data);
      return result;
    }, { waitForMs: 2_000 });
  }

  async createPlaylist(guildId: string, name: string): Promise<MusicPlaylist> {
    const cleanName = name.trim().slice(0, 80);
    if (!cleanName) throw new Error("플레이리스트 이름을 입력해주세요.");

    return this.updateData((data) => {
      const playlists = data.guilds[guildId] ?? [];
      if (findPlaylist(playlists, cleanName)) throw new Error("같은 이름의 플레이리스트가 이미 있습니다.");

      const playlist: MusicPlaylist = { name: cleanName, tracks: [] };
      playlists.push(playlist);
      data.guilds[guildId] = playlists;
      return clonePlaylist(playlist);
    });
  }

  async addTrack(guildId: string, playlistName: string, track: MusicTrack): Promise<{ playlist: MusicPlaylist; track: MusicTrack }> {
    return this.updateData((data) => {
      const playlists = data.guilds[guildId] ?? [];
      const playlist = findPlaylist(playlists, playlistName);
      if (!playlist) {
        throw new Error(`플레이리스트 \"${playlistName}\"을 찾을 수 없습니다. 먼저 /music playlist-create name:<플레이리스트 이름> 명령어로 만들어주세요.`);
      }

      playlist.tracks.push({ ...track });
      data.guilds[guildId] = playlists;
      return { playlist: clonePlaylist(playlist), track: { ...track } };
    });
  }

  async removeTrack(
    guildId: string,
    playlistName: string,
    position: number,
  ): Promise<{ playlist: MusicPlaylist; removed: MusicTrack }> {
    if (!Number.isInteger(position) || position < 1) {
      throw new Error("삭제할 노래 번호는 1 이상의 정수여야 합니다.");
    }

    return this.updateData((data) => {
      const playlists = data.guilds[guildId] ?? [];
      const playlist = findPlaylist(playlists, playlistName);
      if (!playlist) throw new Error(`플레이리스트 \"${playlistName}\"을 찾을 수 없습니다.`);
      if (position > playlist.tracks.length) {
        throw new Error(`해당 플레이리스트에는 ${playlist.tracks.length}곡만 있습니다.`);
      }

      const [removed] = playlist.tracks.splice(position - 1, 1);
      if (!removed) throw new Error("삭제할 노래를 찾을 수 없습니다.");

      data.guilds[guildId] = playlists;
      return { playlist: clonePlaylist(playlist), removed: { ...removed } };
    });
  }

  async listPlaylists(guildId: string): Promise<MusicPlaylist[]> {
    return withDurableFileStateLock(this.file, async () => {
      const data = await this.readData();
      return (data.guilds[guildId] ?? []).map(clonePlaylist);
    }, { waitForMs: 2_000 });
  }

  async getPlaylist(guildId: string, name: string): Promise<MusicPlaylist | null> {
    const playlists = await this.listPlaylists(guildId);
    return findPlaylist(playlists, name) ?? null;
  }
}

const defaultMusicStore = new MusicStore();

type MusicPlaybackProvider = {
  validate(input: string): Promise<string | false> | string | false;
  video_basic_info(input: string): Promise<{ video_details: { title?: string; url: string } }>;
};

type MusicDependencies = {
  playback: MusicPlaybackProvider;
  store: Pick<MusicStore, "addTrack">;
};

function playbackUrl(track: MusicTrack): string {
  return track.playbackUrl || track.url;
}

function sameTrack(left: MusicTrack, right: MusicTrack): boolean {
  return left.url === right.url
    && playbackUrl(left) === playbackUrl(right)
    && left.title === right.title;
}

function removeFirstMatchingTrack(tracks: MusicTrack[], target: MusicTrack): void {
  const index = tracks.findIndex((track) => sameTrack(track, target));
  if (index >= 0) tracks.splice(index, 1);
}

export function extractYouTubeVideoUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.includes("\\") || /%5c/i.test(raw)) return null;

  try {
    const url = new URL(raw);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
    const authorityEnd = raw.indexOf("://");
    const pathStart = raw.indexOf("/", authorityEnd + 3);
    const rawPath = (pathStart === -1 ? "" : raw.slice(pathStart)).split(/[?#]/, 1)[0] ?? "";
    const rawPathParts = rawPath.split("/");
    const pathParts = rawPathParts.at(-1) === "" ? rawPathParts.slice(0, -1) : rawPathParts;
    for (const part of pathParts.slice(1)) {
      let decodedPart: string;
      try {
        decodedPart = decodeURIComponent(part);
      } catch {
        return null;
      }
      if (!decodedPart || decodedPart === "." || decodedPart === ".." || /[\\/]/.test(decodedPart)) return null;
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId: string | null = null;

    if (host === "youtu.be") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 1) videoId = parts[0] ?? null;
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.searchParams.has("v")) {
        if (url.pathname !== "/watch" && url.pathname !== "/watch/") return null;
        videoId = url.searchParams.get("v");
      }

      if (!videoId) {
        const [kind, id, extra] = url.pathname.split("/").filter(Boolean);
        if ((kind === "shorts" || kind === "live" || kind === "embed") && id && !extra) {
          videoId = id;
        }
      }
    }

    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
}

function isYouTubeUrlLike(input: string): boolean {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtu.be"
      || host === "youtube.com"
      || host === "m.youtube.com"
      || host === "music.youtube.com";
  } catch {
    return /^https?:\/\/[^/?#\\]*(?:youtube\.com|youtu\.be)(?:[/?#\\:]|$)/i.test(input);
  }
}

export function createPlaylist(guildId: string, name: string): Promise<MusicPlaylist> {
  return defaultMusicStore.createPlaylist(guildId, name);
}

async function resolveSpotifyTrack(input: string, userId: string): Promise<MusicTrack> {
  const endpoint = new URL("https://open.spotify.com/oembed");
  endpoint.searchParams.set("url", input);

  const response = await fetch(endpoint, {
    headers: { "user-agent": "IseolBot/1.0" },
  });
  if (!response.ok) {
    throw new Error("Spotify 노래 정보를 가져오지 못했습니다.");
  }

  const metadata = await response.json() as SpotifyOEmbed;
  if (!metadata.html?.includes("/embed/track/")) {
    throw new Error("Spotify 플레이리스트/앨범이 아니라 개별 노래 링크를 입력해주세요.");
  }

  const title = metadata.title?.trim();
  if (!title) throw new Error("Spotify 노래 제목을 확인하지 못했습니다.");

  const results = await play.search(title, {
    limit: 5,
    source: { youtube: "video" },
  });
  const video = results[0];
  if (!video?.url) {
    throw new Error("Spotify 노래와 일치하는 YouTube 음원을 찾지 못했습니다.");
  }

  return {
    title,
    url: input,
    playbackUrl: video.url,
    source: "spotify",
    addedBy: userId,
  };
}

async function resolveTrack(query: string, userId: string, playback: MusicPlaybackProvider = play): Promise<MusicTrack> {
  const input = query.trim();
  if (!input) throw new Error("YouTube 또는 Spotify 노래 링크를 입력해주세요.");

  if (/^https?:\/\/(?:open\.spotify\.com|spotify\.link)\//i.test(input)) {
    return resolveSpotifyTrack(input, userId);
  }

  const youtubeVideoUrl = extractYouTubeVideoUrl(input);
  if (youtubeVideoUrl) {
    const validation = await playback.validate(youtubeVideoUrl);
    if (validation === "yt_video") {
      const info = await playback.video_basic_info(youtubeVideoUrl);
      return {
        title: info.video_details.title ?? youtubeVideoUrl,
        url: info.video_details.url,
        source: "youtube",
        addedBy: userId,
      };
    }
  }

  if (isYouTubeUrlLike(input)) {
    throw new Error("YouTube 또는 Spotify의 개별 노래 링크만 추가할 수 있습니다.");
  }

  const validation = await playback.validate(input);
  if (validation === "yt_video") {
    const info = await playback.video_basic_info(input);
    return {
      title: info.video_details.title ?? input,
      url: info.video_details.url,
      source: "youtube",
      addedBy: userId,
    };
  }

  if (validation === "yt_playlist") {
    throw new Error("재생목록 전체 링크만으로는 노래를 고를 수 없습니다. 재생목록 안에서 추가할 노래 하나를 연 뒤 그 영상 링크를 넣어주세요.");
  }

  throw new Error("YouTube 또는 Spotify의 개별 노래 링크만 추가할 수 있습니다.");
}

export async function addTrackToPlaylist(
  guildId: string,
  playlistName: string,
  query: string,
  userId: string,
  dependencies: MusicDependencies = { playback: play, store: defaultMusicStore },
): Promise<{ playlist: MusicPlaylist; track: MusicTrack }> {
  const track = await resolveTrack(query, userId, dependencies.playback);

  const result = await dependencies.store.addTrack(guildId, playlistName, track);

  const state = runtime.get(guildId);
  if (state?.activePlaylistName
    && normalizePlaylistName(state.activePlaylistName) === normalizePlaylistName(result.playlist.name)) {
    state.loopTracks.push({ ...track });
    state.queue.push({ ...track });
  }

  return result;
}

export async function removeTrackFromPlaylist(
  guildId: string,
  playlistName: string,
  position: number,
): Promise<{ playlist: MusicPlaylist; removed: MusicTrack }> {
  const result = await defaultMusicStore.removeTrack(guildId, playlistName, position);

  const state = runtime.get(guildId);
  if (state?.activePlaylistName
    && normalizePlaylistName(state.activePlaylistName) === normalizePlaylistName(result.playlist.name)) {
    removeFirstMatchingTrack(state.loopTracks, result.removed);
    removeFirstMatchingTrack(state.queue, result.removed);
  }

  return result;
}

export function listPlaylists(guildId: string): Promise<MusicPlaylist[]> {
  return defaultMusicStore.listPlaylists(guildId);
}

export function getPlaylist(guildId: string, name: string): Promise<MusicPlaylist | null> {
  return defaultMusicStore.getPlaylist(guildId, name);
}

function getRuntimeState(guildId: string): GuildMusicState {
  const existing = runtime.get(guildId);
  if (existing) return existing;

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  const state: GuildMusicState = {
    player,
    queue: [],
    loopTracks: [],
    initialized: false,
  };

  player.on(AudioPlayerStatus.Idle, () => {
    state.current = undefined;
    void playNext(guildId);
  });
  player.on("error", (error) => {
    console.error(`음악 재생 실패 (${guildId})`, error);
    state.current = undefined;
    void playNext(guildId);
  });

  runtime.set(guildId, state);
  return state;
}

async function playNext(guildId: string): Promise<void> {
  const state = runtime.get(guildId);
  if (!state || state.current) return;

  const attempted = new Set<string>();
  const uniqueLoopTracks = new Set(state.loopTracks.map(playbackUrl)).size;

  while (!state.current) {
    if (state.queue.length === 0) {
      if (state.loopTracks.length === 0) return;
      if (uniqueLoopTracks > 0 && attempted.size >= uniqueLoopTracks) {
        console.error(`플레이리스트의 모든 노래 스트림 생성 실패 (${guildId})`);
        return;
      }
      state.queue = state.loopTracks.map((track) => ({ ...track }));
    }

    const track = state.queue.shift();
    if (!track) return;

    const streamUrl = playbackUrl(track);
    attempted.add(streamUrl);
    state.current = track;

    try {
      const stream = await play.stream(streamUrl);
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      state.player.play(resource);
      return;
    } catch (error) {
      console.error(`노래 스트림 생성 실패 (${track.title})`, error);
      state.current = undefined;
    }
  }
}

export async function playMusicPlaylist(
  guild: Guild,
  userId: string,
  playlistName: string,
): Promise<{ playlist: MusicPlaylist; current?: MusicTrack; queued: number; looping: boolean }> {
  const playlist = await getPlaylist(guild.id, playlistName);
  if (!playlist) throw new Error(`플레이리스트 \"${playlistName}\"을 찾을 수 없습니다.`);
  if (playlist.tracks.length === 0) throw new Error("플레이리스트에 노래가 없습니다.");

  const connection = await joinUserVoiceChannel(guild, userId);
  const state = getRuntimeState(guild.id);
  connection.subscribe(state.player);
  state.initialized = true;

  const wasPlaying = Boolean(state.current);
  state.activePlaylistName = playlist.name;
  state.loopTracks = playlist.tracks.map((track) => ({ ...track }));
  state.queue = playlist.tracks.map((track) => ({ ...track }));
  state.current = undefined;

  if (wasPlaying) {
    state.player.stop(true);
  } else {
    await playNext(guild.id);
  }

  return {
    playlist,
    current: state.current,
    queued: state.queue.length,
    looping: true,
  };
}

export function skipMusic(guildId: string): MusicTrack | null {
  const state = runtime.get(guildId);
  if (!state?.current) return null;
  const skipped = state.current;
  state.current = undefined;
  state.player.stop(true);
  return skipped;
}

export function stopMusic(guildId: string): boolean {
  const state = runtime.get(guildId);
  if (!state) return false;
  state.queue = [];
  state.loopTracks = [];
  state.activePlaylistName = undefined;
  state.current = undefined;
  state.player.stop(true);
  return true;
}

export function clearMusicRuntime(guildId: string): void {
  const state = runtime.get(guildId);
  if (!state) return;
  state.queue = [];
  state.loopTracks = [];
  state.activePlaylistName = undefined;
  state.current = undefined;
  state.player.stop(true);
  runtime.delete(guildId);
}
