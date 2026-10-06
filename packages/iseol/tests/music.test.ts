import assert from "node:assert/strict";
import test from "node:test";
import { addTrackToPlaylist, extractYouTubeVideoUrl } from "../src/services/music.js";

const videoId = "dQw4w9WgXcQ";

test("YouTube video identities preserve supported URL forms", () => {
  assert.equal(extractYouTubeVideoUrl(`https://youtu.be/${videoId}`), `https://www.youtube.com/watch?v=${videoId}`);
  assert.equal(extractYouTubeVideoUrl(`https://www.youtube.com/watch?v=${videoId}&si=tracking`), `https://www.youtube.com/watch?v=${videoId}`);
  assert.equal(extractYouTubeVideoUrl(`https://www.youtube.com/watch/?v=${videoId}`), `https://www.youtube.com/watch?v=${videoId}`);
  assert.equal(extractYouTubeVideoUrl(`https://youtube.com/shorts/${videoId}/`), `https://www.youtube.com/watch?v=${videoId}`);
});

test("YouTube video identities reject unsafe authority and path forms", () => {
  for (const value of [
    `https://user:password@youtube.com/watch?v=${videoId}`,
    `https://youtube.com:444/watch?v=${videoId}`,
    `https://youtube.com\\watch?v=${videoId}`,
    `https://youtu.be/${videoId}/extra`,
    `https://youtube.com/shorts/${videoId}/extra`,
      `https://youtube.com/./watch?v=${videoId}`,
      `https://youtube.com/shorts/../watch?v=${videoId}`,
      `https://youtu.be/${videoId}//`,
  ]) {
    assert.equal(extractYouTubeVideoUrl(value), null);
  }
});

test("rejected YouTube URLs stop before playback validation and playlist persistence", async () => {
  const calls = { validate: 0, videoInfo: 0, store: 0 };
  const playback = {
    validate: async () => {
      calls.validate += 1;
      return "yt_video";
    },
    video_basic_info: async () => {
      calls.videoInfo += 1;
      return { video_details: { title: "unexpected", url: "https://www.youtube.com/watch?v=unexpected" } };
    },
  };
  const store = {
    addTrack: async () => {
      calls.store += 1;
      throw new Error("playlist persistence must not run");
    },
  };

  await assert.rejects(
    () => addTrackToPlaylist(
      "guild-music-test",
      "queue",
      `https://youtu.be/${videoId}/extra`,
      "user-music-test",
      { playback, store },
    ),
    /개별 노래 링크만 추가할 수 있습니다/,
  );
  assert.deepEqual(calls, { validate: 0, videoInfo: 0, store: 0 });
});
