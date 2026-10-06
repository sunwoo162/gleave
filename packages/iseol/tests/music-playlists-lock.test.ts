import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MusicStore, type MusicTrack } from "../src/services/music.js";

function track(title: string, addedBy: string): MusicTrack {
  return {
    title,
    url: `https://example.com/${title}`,
    addedBy,
  };
}

test("music playlist state preserves concurrent creates from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-music-playlists-lock-"));
  const file = join(dir, "music-playlists.json");
  const first = new MusicStore(file);
  const second = new MusicStore(file);

  await Promise.all([
    first.createPlaylist("guild-a", "alpha"),
    second.createPlaylist("guild-a", "beta"),
  ]);

  const result = await new MusicStore(file).listPlaylists("guild-a");
  assert.deepEqual(result.map((playlist) => playlist.name).sort(), ["alpha", "beta"]);
  await rm(dir, { recursive: true, force: true });
});

test("music playlist state preserves concurrent track additions from independent stores", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iseol-music-playlists-track-lock-"));
  const file = join(dir, "music-playlists.json");
  const first = new MusicStore(file);
  const second = new MusicStore(file);
  await first.createPlaylist("guild-a", "queue");

  await Promise.all([
    first.addTrack("guild-a", "queue", track("alpha", "user-a")),
    second.addTrack("guild-a", "queue", track("beta", "user-b")),
  ]);

  const result = await new MusicStore(file).getPlaylist("guild-a", "queue");
  assert.ok(result);
  assert.deepEqual(result.tracks.map((item) => item.title).sort(), ["alpha", "beta"]);
  await rm(dir, { recursive: true, force: true });
});
