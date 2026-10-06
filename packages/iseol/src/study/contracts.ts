import type { ActivityService } from "../activity/contracts.js";
import type { LearningService } from "../learning/contracts.js";
import type { Principal } from "../identity/contracts.js";
import type { TeamService } from "../teams/contracts.js";

export type StudySpace = {
  version: 1;
  id: string;
  teamId: string;
  ownerUserId: string;
  title: string;
  description: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type CurriculumLink = {
  version: 1;
  id: string;
  studySpaceId: string;
  kind: "learning-goal" | "resource";
  referenceId: string;
  label: string;
  createdByUserId: string;
  createdAt: string;
};

export type StudyTask = {
  version: 1;
  id: string;
  studySpaceId: string;
  createdByUserId: string;
  title: string;
  instructions: string;
  dueLocalDate?: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
};

export type StudyTaskSubmission = {
  version: 1;
  id: string;
  studySpaceId: string;
  taskId: string;
  userId: string;
  answer: string;
  status: "draft" | "submitted";
  createdAt: string;
  updatedAt: string;
};

export type StudySpaceView = {
  space: StudySpace;
  curriculumLinks: CurriculumLink[];
  tasks: StudyTask[];
  mySubmissions: StudyTaskSubmission[];
};

export type StudyService = {
  createStudySpace(principal: Principal, input: { teamId: string; title: string; description: string }): Promise<StudySpace>;
  listStudySpaces(principal: Principal): Promise<StudySpace[]>;
  getStudySpace(principal: Principal, studySpaceId: string): Promise<StudySpaceView | null>;
  addCurriculumLink(principal: Principal, studySpaceId: string, input: { kind: CurriculumLink["kind"]; referenceId: string; label: string }): Promise<CurriculumLink>;
  createTask(principal: Principal, studySpaceId: string, input: { title: string; instructions: string; dueLocalDate?: string }): Promise<StudyTask>;
  saveTaskSubmission(principal: Principal, studySpaceId: string, taskId: string, input: { answer: string; status: StudyTaskSubmission["status"] }): Promise<StudyTaskSubmission>;
};

export type StudyServiceOptions = {
  teamService: TeamService;
  teamMembershipRoot?: string;
  learningService?: LearningService;
  activityService?: ActivityService;
  now?: () => string;
};
