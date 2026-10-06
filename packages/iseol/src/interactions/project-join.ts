import {
  ActionRowBuilder,
  ButtonInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { GitHubWebhookService } from "../services/github.js";
import { findProject, withProjectDeleteLock, type StoredProject } from "../services/projects.js";
import { formatUserFacingError } from "../security/user-error.js";

type OrganizationInviter = Pick<GitHubWebhookService, "inviteOrganizationMember">;

export async function withProjectJoinLifecycleLock<T>(
  guildId: string,
  projectId: string,
  task: (current: StoredProject) => Promise<T>,
): Promise<T | undefined> {
  return withProjectDeleteLock(guildId, projectId, async () => {
    const current = await findProject(projectId);
    if (!current || current.guildId !== guildId) return undefined;
    return task(current);
  });
}

export async function handleProjectJoinButton(interaction: ButtonInteraction): Promise<void> {
  const projectId = interaction.customId.split(":")[1];
  if (!projectId || !interaction.guildId) {
    await interaction.reply({ content: "프로젝트 정보를 찾을 수 없습니다.", ephemeral: true });
    return;
  }

  const shown = await withProjectJoinLifecycleLock(interaction.guildId, projectId, async (project) => {
    const username = new TextInputBuilder()
      .setCustomId("github_username")
      .setLabel("GitHub 사용자명")
      .setPlaceholder("예: sunwoo162")
      .setMinLength(1)
      .setMaxLength(39)
      .setRequired(true)
      .setStyle(TextInputStyle.Short);
    const modal = new ModalBuilder()
      .setCustomId(`project_join_modal:${project.id}`)
      .setTitle(`${project.name} 참여`);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(username));
    await interaction.showModal(modal);
    return true;
  });
  if (shown !== true) {
    await interaction.reply({ content: "프로젝트 정보를 찾을 수 없습니다.", ephemeral: true });
  }
}

export async function handleProjectJoinModal(
  interaction: ModalSubmitInteraction,
  github: OrganizationInviter,
): Promise<void> {
  const projectId = interaction.customId.split(":")[1];
  if (!projectId || !interaction.guildId) {
    await interaction.reply({ content: "프로젝트 정보를 찾을 수 없습니다.", ephemeral: true });
    return;
  }

  const username = interaction.fields.getTextInputValue("github_username").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) {
    await interaction.reply({ content: "❌ 올바른 GitHub 사용자명을 입력해주세요.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const invited = await withProjectJoinLifecycleLock(interaction.guildId, projectId, async (project) => {
      await github.inviteOrganizationMember(project.organization, username);
      await interaction.editReply(
        `✅ **@${username}** 계정으로 **${project.organization}** Organization 초대를 보냈습니다.\nGitHub 알림 또는 이메일에서 초대를 수락하면 합류가 완료됩니다.`,
      );
      return true;
    });
    if (invited !== true) {
      await interaction.editReply("프로젝트 정보를 찾을 수 없습니다.");
    }
  } catch (error) {
    const message = formatUserFacingError(error);
    await interaction.editReply(
      `❌ GitHub Organization 초대에 실패했습니다.\n\`${message}\`\n\n이미 멤버/초대 대기 중인지, 또는 토큰에 Organization Members 쓰기 권한이 있는지 확인해주세요.`,
    );
  }
}
