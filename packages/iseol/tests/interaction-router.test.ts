import assert from "node:assert/strict";
import test from "node:test";
import { routeInteraction, type InteractionRouterDependencies } from "../src/interactions/interaction-router.js";

function dependencies(calls: string[]): InteractionRouterDependencies {
  return {
    handleProjectAutocomplete: async () => { calls.push("project-autocomplete"); },
    handleMusicAutocomplete: async () => { calls.push("music-autocomplete"); },
    handleScrumAutocomplete: async () => { calls.push("scrum-autocomplete"); },
    handleProjectCommand: async () => { calls.push("project-command"); },
    handleContestCommand: async () => { calls.push("contest-command"); },
    handleJobCommand: async () => { calls.push("job-command"); },
    handleGitHubCommand: async () => { calls.push("github-command"); },
    handleScrumCommand: async () => { calls.push("scrum-command"); },
    handleVoiceCommand: async () => { calls.push("voice-command"); },
    handleMusicCommand: async () => { calls.push("music-command"); },
    handleCalendarButton: async () => { calls.push("calendar-button"); return true; },
    handleContestVoteButton: async () => { calls.push("contest-vote-button"); },
    handleProjectJoinButton: async () => { calls.push("project-join-button"); },
    handleCalendarModal: async () => { calls.push("calendar-modal"); return true; },
    handleProjectJoinModal: async () => { calls.push("project-join-modal"); },
    afterProjectCommand: async () => { calls.push("project-after"); },
    afterContestVote: async () => { calls.push("contest-vote-after"); },
  };
}

test("project command routes through existing handler and post-command hook", async () => {
  const calls: string[] = [];
  const interaction = {
    commandName: "project",
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isButton: () => false,
    isModalSubmit: () => false,
  };

  assert.equal(await routeInteraction(interaction, dependencies(calls)), true);
  assert.deepEqual(calls, ["project-command", "project-after"]);
});

test("calendar button and modal keep their prefix routing", async () => {
  const buttonCalls: string[] = [];
  const button = {
    customId: "calendar:add:project-1",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
  };
  assert.equal(await routeInteraction(button, dependencies(buttonCalls)), true);
  assert.deepEqual(buttonCalls, ["calendar-button"]);

  const modalCalls: string[] = [];
  const modal = {
    customId: "calendar_add_modal:project-1",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => true,
  };
  assert.equal(await routeInteraction(modal, dependencies(modalCalls)), true);
  assert.deepEqual(modalCalls, ["calendar-modal"]);
});

test("project join button and modal are routed outside the entrypoint", async () => {
  const buttonCalls: string[] = [];
  const button = {
    customId: "project_join:project-1",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
  };
  assert.equal(await routeInteraction(button, dependencies(buttonCalls)), true);
  assert.deepEqual(buttonCalls, ["project-join-button"]);

  const modalCalls: string[] = [];
  const modal = {
    customId: "project_join_modal:project-1",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => true,
  };
  assert.equal(await routeInteraction(modal, dependencies(modalCalls)), true);
  assert.deepEqual(modalCalls, ["project-join-modal"]);
});

test("contest vote button preserves announcement refresh hook", async () => {
  const calls: string[] = [];
  const interaction = {
    customId: "contest_vote:vote-1",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
  };

  assert.equal(await routeInteraction(interaction, dependencies(calls)), true);
  assert.deepEqual(calls, ["contest-vote-button", "contest-vote-after"]);
});

test("all existing slash commands preserve their handler routing", async () => {
  const cases = [
    ["contest", "contest-command"],
    ["job", "job-command"],
    ["github", "github-command"],
    ["scrum", "scrum-command"],
    ["voice", "voice-command"],
    ["music", "music-command"],
  ] as const;

  for (const [commandName, expected] of cases) {
    const calls: string[] = [];
    const interaction = {
      commandName,
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
    };

    assert.equal(await routeInteraction(interaction, dependencies(calls)), true);
    assert.deepEqual(calls, [expected]);
  }
});

test("all existing autocomplete commands preserve their handler routing", async () => {
  const cases = [
    ["project", "project-autocomplete"],
    ["music", "music-autocomplete"],
    ["scrum", "scrum-autocomplete"],
  ] as const;

  for (const [commandName, expected] of cases) {
    const calls: string[] = [];
    const interaction = {
      commandName,
      isAutocomplete: () => true,
      isChatInputCommand: () => false,
      isButton: () => false,
      isModalSubmit: () => false,
    };

    assert.equal(await routeInteraction(interaction, dependencies(calls)), true);
    assert.deepEqual(calls, [expected]);
  }
});

test("unknown interactions are left untouched", async () => {
  const calls: string[] = [];
  const interaction = {
    customId: "other:action",
    isAutocomplete: () => false,
    isChatInputCommand: () => false,
    isButton: () => true,
    isModalSubmit: () => false,
  };

  assert.equal(await routeInteraction(interaction, dependencies(calls)), false);
  assert.deepEqual(calls, []);
});
