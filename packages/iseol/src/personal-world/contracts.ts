import type { Principal } from "../identity/contracts.js";

export type CharacterType = "a" | "b" | "c" | "d";

export type CharacterAppearance = Record<string, string | number | boolean>;

export type WorldRecord = {
  version: 1;
  userId: string;
  displayName: string;
  handle: string;
  character: CharacterType;
  interests: string[];
  activities: string[];
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CharacterRecord = {
  version: 1;
  userId: string;
  character: CharacterType;
  appearance: CharacterAppearance;
  updatedAt: string;
};

export type WorldPatch = {
  displayName?: string;
  handle?: string;
  character?: CharacterType;
  interests?: string[];
  activities?: string[];
  onboardingCompleted?: boolean;
};

export type CharacterPatch = {
  character?: CharacterType;
  appearance?: CharacterAppearance;
};

export type PersonalWorldService = {
  getWorld(principal: Principal): Promise<WorldRecord>;
  updateWorld(principal: Principal, patch: WorldPatch): Promise<WorldRecord>;
  getCharacter(principal: Principal): Promise<CharacterRecord>;
  updateCharacter(principal: Principal, patch: CharacterPatch): Promise<CharacterRecord>;
};
