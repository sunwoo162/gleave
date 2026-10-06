import { calendarExternalKey, type CalendarMapping, type CalendarStateStore } from "./calendar/calendar-state.js";
import type { CalendarEventInput, CalendarEventRef } from "./calendar/google-calendar.js";

export type MilestoneSyncInput = {
  number: number;
  title: string;
  dueOn: string | null;
  state: "open" | "closed";
  htmlUrl: string;
};

type CalendarPort = {
  createEvent(calendarId: string, input: CalendarEventInput): Promise<CalendarEventRef>;
  updateEvent(calendarId: string, eventId: string, input: CalendarEventInput): Promise<CalendarEventRef>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
};

type StatePort = Pick<CalendarStateStore, "find" | "upsert" | "remove" | "withMappingLock">;

export class GitHubScheduleSyncService {
  constructor(private readonly calendar: CalendarPort, private readonly state: StatePort) {}


  async createLinkedIssue(
    projectId: string,
    calendarId: string,
    repository: string,
    input: { title: string; body: string; start: string; end: string },
    github: { createIssue(repository: string, title: string, body: string): Promise<{ number: number; htmlUrl: string }> },
  ): Promise<{ issueNumber: number; issueUrl: string; eventId: string }> {
    const issue = await github.createIssue(repository, input.title, input.body);
    const event = await this.calendar.createEvent(calendarId, {
      summary: `[Issue #${issue.number}] ${input.title}`,
      description: `${input.body}\n\n${issue.htmlUrl}`.trim(),
      start: input.start,
      end: input.end,
      metadata: { iseolProjectId: projectId, source: "issue", repository, number: String(issue.number) },
    });
    const externalKey = calendarExternalKey(projectId, repository, "issue", issue.number);
    await this.state.upsert({ externalKey, projectId, calendarId, eventId: event.id, source: "issue", repository, number: issue.number });
    return { issueNumber: issue.number, issueUrl: issue.htmlUrl, eventId: event.id };
  }
  async syncMilestone(projectId: string, calendarId: string, repository: string, milestone: MilestoneSyncInput): Promise<void> {
    const externalKey = calendarExternalKey(projectId, repository, "milestone", milestone.number);
    await this.state.withMappingLock(externalKey, async () => this.syncMilestoneUnlocked(projectId, calendarId, repository, milestone, externalKey));
  }

  private async syncMilestoneUnlocked(projectId: string, calendarId: string, repository: string, milestone: MilestoneSyncInput, externalKey: string): Promise<void> {
    const existing = await this.state.find(externalKey);

    if (milestone.state === "closed" || !milestone.dueOn) {
      if (existing) {
        await this.calendar.deleteEvent(existing.calendarId, existing.eventId);
        await this.state.remove(externalKey);
      }
      return;
    }

    const start = new Date(milestone.dueOn);
    if (Number.isNaN(start.getTime())) throw new Error("GitHub milestone due_on 값이 올바르지 않습니다.");
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const input: CalendarEventInput = {
      summary: `[Milestone] ${milestone.title}`,
      description: milestone.htmlUrl,
      start: start.toISOString(),
      end: end.toISOString(),
      metadata: {
        iseolProjectId: projectId,
        source: "milestone",
        repository,
        number: String(milestone.number),
      },
    };

    let eventId: string;
    if (existing) {
      const updated = await this.calendar.updateEvent(calendarId, existing.eventId, input);
      eventId = updated.id;
    } else {
      const created = await this.calendar.createEvent(calendarId, input);
      eventId = created.id;
    }

    const mapping: CalendarMapping = {
      externalKey,
      projectId,
      calendarId,
      eventId,
      source: "milestone",
      repository,
      number: milestone.number,
    };
    await this.state.upsert(mapping);
  }
}
