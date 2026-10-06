import { EmbedBuilder } from "discord.js";
import { contestCommandV2 } from "../commands/contest-v2.js";
import { githubCommand } from "../commands/github.js";
import { musicCommand } from "../commands/music.js";
import { projectCommand } from "../commands/project.js";
import { scrumCommand } from "../commands/scrum.js";
import { voiceCommand } from "../commands/voice.js";

type HelpOption = {
  type: number;
  name: string;
  description: string;
  options?: HelpOption[];
};

type HelpCommand = {
  toJSON(): {
    name: string;
    description: string;
    options?: readonly unknown[];
  };
};

const commands: HelpCommand[] = [
  projectCommand,
  contestCommandV2,
  githubCommand,
  scrumCommand,
  voiceCommand,
  musicCommand,
];

function commandUsageLines(command: HelpCommand): string[] {
  const data = command.toJSON();
  const options = (data.options ?? []) as HelpOption[];
  const subcommands = options.filter((option) => option.type === 1 || option.type === 2);

  if (subcommands.length === 0) {
    return [`\`/${data.name}\` — ${data.description}`];
  }

  const lines: string[] = [];

  for (const option of subcommands) {
    if (option.type === 1) {
      lines.push(`\`/${data.name} ${option.name}\` — ${option.description}`);
      continue;
    }

    for (const child of option.options ?? []) {
      if (child.type !== 1) continue;
      lines.push(`\`/${data.name} ${option.name} ${child.name}\` — ${child.description}`);
    }
  }

  return lines;
}

export function commandHelpEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📖 이설 명령어 안내")
    .setDescription("이설에서 사용할 수 있는 명령어와 기능입니다. 슬래시 명령어를 입력하면 필요한 옵션도 Discord가 바로 보여줍니다.")
    .addFields({
      name: "도움말",
      value: "`!명령어` — 이 명령어 안내를 다시 확인합니다.",
    });

  for (const command of commands) {
    const data = command.toJSON();
    const lines = commandUsageLines(command);
    embed.addFields({
      name: `/${data.name}`,
      value: lines.join("\n").slice(0, 1024),
    });
  }

  return embed.setFooter({ text: "명령어는 서버 안에서 사용할 수 있습니다." });
}
