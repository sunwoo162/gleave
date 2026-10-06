export type PolledMilestone = {
  number: number;
  title: string;
  dueOn: string | null;
  state: "open" | "closed";
  htmlUrl: string;
  updatedAt: string;
};

export function milestonePollSignature(milestone: PolledMilestone): string {
  return JSON.stringify([
    milestone.title,
    milestone.dueOn,
    milestone.state,
    milestone.htmlUrl,
    milestone.updatedAt,
  ]);
}

export async function syncMilestonesFromPoll(input: {
  milestones: PolledMilestone[];
  previous: Record<string, string>;
  syncMilestone: (milestone: Omit<PolledMilestone, "updatedAt">) => Promise<void>;
}): Promise<Record<string, string>> {
  const next = { ...input.previous };
  const currentNumbers = new Set<string>();

  for (const milestone of input.milestones) {
    const key = String(milestone.number);
    currentNumbers.add(key);
    const signature = milestonePollSignature(milestone);
    if (input.previous[key] === signature) continue;

    const { updatedAt: _updatedAt, ...syncInput } = milestone;
    await input.syncMilestone(syncInput);
    next[key] = signature;
  }

  for (const key of Object.keys(input.previous)) {
    if (currentNumbers.has(key)) continue;
    const number = Number(key);
    if (!Number.isInteger(number)) continue;

    await input.syncMilestone({
      number,
      title: "",
      dueOn: null,
      state: "closed",
      htmlUrl: "",
    });
    delete next[key];
  }

  return next;
}
