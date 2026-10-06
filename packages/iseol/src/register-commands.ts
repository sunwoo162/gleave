import { REST, Routes } from "discord.js";
import { contestCommandV2 } from "./commands/contest-v2.js";
import { githubCommand } from "./commands/github.js";
import { config } from "./config.js";
import { musicCommand } from "./commands/music.js";
import { projectCommand } from "./commands/project.js";
import { scrumCommand } from "./commands/scrum.js";
import { voiceCommand } from "./commands/voice.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);
const commands = [
  projectCommand.toJSON(),
  contestCommandV2.toJSON(),
  githubCommand.toJSON(),
  scrumCommand.toJSON(),
  voiceCommand.toJSON(),
  musicCommand.toJSON(),
];

await rest.put(
  Routes.applicationCommands(config.discordClientId),
  { body: commands },
);

console.log(`Global slash command 등록 완료: ${commands.length}개`);

if (config.discordGuildId) {
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
      { body: [] },
    );
    console.log(`기존 Guild slash command 정리 완료: ${config.discordGuildId}`);
  } catch (error) {
    console.warn(`기존 Guild slash command 정리 실패 (${config.discordGuildId})`, error);
  }
}
