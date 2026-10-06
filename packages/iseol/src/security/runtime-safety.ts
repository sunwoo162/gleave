export type SelfHostedIntegrationState = "disabled" | "configured";

export type SelfHostedIntegrationSummary = {
  discord: SelfHostedIntegrationState;
  github: SelfHostedIntegrationState;
  ai: SelfHostedIntegrationState;
};

type EnvLike = Record<string, string | undefined>;

function configured(env: EnvLike, names: string[]): SelfHostedIntegrationState {
  return names.every((name) => Boolean(env[name]?.trim())) ? "configured" : "disabled";
}

export function describeSelfHostedIntegrations(env: EnvLike): SelfHostedIntegrationSummary {
  return {
    discord: configured(env, ["DISCORD_TOKEN", "DISCORD_CLIENT_ID"]),
    github: configured(env, ["GITHUB_TOKEN"]),
    ai: configured(env, ["GEMINI_API_KEY"]),
  };
}
