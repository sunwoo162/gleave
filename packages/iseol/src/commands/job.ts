import type { ChatInputCommandInteraction } from "discord.js";

export async function handleJobCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isRepliable()) return;
  await interaction.reply({
    content: "💼 취업 공고 수집 기능은 현재 비활성화되어 있습니다.",
    ephemeral: true,
  });
}
