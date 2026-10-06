export type InteractionLike = {
  commandName?: string;
  customId?: string;
  isAutocomplete(): boolean;
  isChatInputCommand(): boolean;
  isButton(): boolean;
  isModalSubmit(): boolean;
};

export type InteractionRouterDependencies = {
  handleProjectAutocomplete(interaction: any): Promise<void>;
  handleMusicAutocomplete(interaction: any): Promise<void>;
  handleScrumAutocomplete(interaction: any): Promise<void>;
  handleProjectCommand(interaction: any): Promise<void>;
  handleContestCommand(interaction: any): Promise<void>;
  handleJobCommand(interaction: any): Promise<void>;
  handleGitHubCommand(interaction: any): Promise<void>;
  handleScrumCommand(interaction: any): Promise<void>;
  handleVoiceCommand(interaction: any): Promise<void>;
  handleMusicCommand(interaction: any): Promise<void>;
  handleCalendarButton(interaction: any): Promise<boolean>;
  handleContestVoteButton(interaction: any): Promise<void>;
  handleProjectJoinButton(interaction: any): Promise<void>;
  handleCalendarModal(interaction: any): Promise<boolean>;
  handleProjectJoinModal(interaction: any): Promise<void>;
  afterProjectCommand(): Promise<void>;
  afterContestVote(): Promise<void>;
};

export async function routeInteraction(
  interaction: InteractionLike,
  dependencies: InteractionRouterDependencies,
): Promise<boolean> {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "project") {
      await dependencies.handleProjectAutocomplete(interaction);
      return true;
    }
    if (interaction.commandName === "music") {
      await dependencies.handleMusicAutocomplete(interaction);
      return true;
    }
    if (interaction.commandName === "scrum") {
      await dependencies.handleScrumAutocomplete(interaction);
      return true;
    }
    return false;
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "project") {
      await dependencies.handleProjectCommand(interaction);
      await dependencies.afterProjectCommand();
      return true;
    }
    if (interaction.commandName === "contest") {
      await dependencies.handleContestCommand(interaction);
      return true;
    }
    if (interaction.commandName === "job") {
      await dependencies.handleJobCommand(interaction);
      return true;
    }
    if (interaction.commandName === "github") {
      await dependencies.handleGitHubCommand(interaction);
      return true;
    }
    if (interaction.commandName === "scrum") {
      await dependencies.handleScrumCommand(interaction);
      return true;
    }
    if (interaction.commandName === "voice") {
      await dependencies.handleVoiceCommand(interaction);
      return true;
    }
    if (interaction.commandName === "music") {
      await dependencies.handleMusicCommand(interaction);
      return true;
    }
    return false;
  }

  if (interaction.isButton()) {
    if (interaction.customId?.startsWith("calendar:")) {
      return dependencies.handleCalendarButton(interaction);
    }
    if (interaction.customId?.startsWith("contest_vote:")) {
      await dependencies.handleContestVoteButton(interaction);
      await dependencies.afterContestVote();
      return true;
    }
    if (interaction.customId?.startsWith("project_join:")) {
      await dependencies.handleProjectJoinButton(interaction);
      return true;
    }
    return false;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId?.startsWith("calendar_")) {
      return dependencies.handleCalendarModal(interaction);
    }
    if (interaction.customId?.startsWith("project_join_modal:")) {
      await dependencies.handleProjectJoinModal(interaction);
      return true;
    }
    return false;
  }

  return false;
}
