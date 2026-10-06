import { z } from "zod";

export const ciReviewFindingSchema = z.object({
  tool: z.string().min(1),
  filePath: z.string().min(1),
  line: z.number().int().positive(),
  severity: z.enum(["critical", "major", "minor"]),
  category: z.enum(["correctness", "security", "performance", "maintainability"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string().min(1).max(1200),
  suggestion: z.string().max(2000).optional(),
  ruleId: z.string().max(300).optional(),
});

export const ciReviewCheckSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  detail: z.string().max(1000).optional(),
});

export const ciReviewArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  repository: z.string().min(3),
  pullNumber: z.number().int().positive(),
  headSha: z.string().min(1),
  generatedAt: z.string().datetime(),
  checks: z.array(ciReviewCheckSchema).max(100),
  findings: z.array(ciReviewFindingSchema).max(500),
});

export type CiReviewFinding = z.infer<typeof ciReviewFindingSchema>;
export type CiReviewCheck = z.infer<typeof ciReviewCheckSchema>;
export type CiReviewArtifact = z.infer<typeof ciReviewArtifactSchema>;
