import { EvidenceLedger } from "./evidence-ledger.js";
import { QaPlan, type QaCheckSpec } from "./qa-plan.js";
import { runIndependentQa, type IndependentQaReportV1, type QaStatus } from "./independent-runner.js";

export type QaExecutionResult = {
  status: QaStatus;
  summary: string;
  command?: string;
  exitStatus?: number;
  stdout?: string;
  stderr?: string;
  artifactPaths?: string[];
  verificationIds?: string[];
};

export type QaExecutor = (
  check: QaCheckSpec,
  context: { workspace: string; revision: string; plan: QaPlan },
) => Promise<QaExecutionResult> | QaExecutionResult;

export class QaOrchestrator {
  readonly evidenceLedger: EvidenceLedger;
  private readonly execute: QaExecutor;

  constructor(input: { execute: QaExecutor; evidenceLedger?: EvidenceLedger }) {
    this.execute = input.execute;
    this.evidenceLedger = input.evidenceLedger ?? new EvidenceLedger();
  }

  async run(plan: QaPlan, workspace: string, revision: string): Promise<IndependentQaReportV1> {
    const checks = plan.requiredChecks.map((check) => ({
      id: check.id,
      label: check.label,
      run: async () => this.runCheck(check, plan, workspace, revision),
    }));
    return runIndependentQa({
      projectId: plan.projectId,
      projectRevision: revision,
      checks: [
        {
          id: "qa-latest-revision",
          label: "latest integrated revision",
          run: () => {
            if (plan.projectRevision !== "unknown" && plan.projectRevision !== revision) {
              const evidenceId = this.evidenceLedger.record({
                checkId: "qa-latest-revision",
                command: "revision-identity-check",
                exitStatus: 1,
                stderr: `expected ${plan.projectRevision}, received ${revision}`,
                workspace,
                revision,
              });
              return { status: "FAIL", summary: "QA plan is stale for the integrated revision", evidenceIds: [evidenceId] };
            }
            const evidenceId = this.evidenceLedger.record({
              checkId: "qa-latest-revision",
              command: "revision-identity-check",
              exitStatus: 0,
              stdout: revision,
              workspace,
              revision,
            });
            return { status: "PASS", summary: "QA ran against the planned revision", evidenceIds: [evidenceId] };
          },
        },
        ...checks,
      ],
    });
  }

  private async runCheck(
    check: QaCheckSpec,
    plan: QaPlan,
    workspace: string,
    revision: string,
  ): Promise<{ status: QaStatus; summary: string; evidenceIds: string[] }> {
    let result: QaExecutionResult;
    try {
      result = await this.execute(check, { workspace, revision, plan });
    } catch (error) {
      const evidenceId = this.evidenceLedger.record({
        checkId: check.id,
        command: "qa-executor",
        exitStatus: 1,
        stderr: error instanceof Error ? error.message : "QA executor failed",
        workspace,
        revision,
      });
      return { status: "FAIL", summary: "QA executor failed", evidenceIds: [evidenceId] };
    }

    if (!result.command?.trim() || result.exitStatus === undefined) {
      const evidenceId = this.evidenceLedger.record({
        checkId: check.id,
        command: "qa-evidence-required-check",
        exitStatus: 1,
        stderr: "Agent completion text is not QA evidence",
        workspace,
        revision,
      });
      return { status: "FAIL", summary: "Required QA evidence is missing", evidenceIds: [evidenceId] };
    }

    const evidenceId = this.evidenceLedger.record({
      checkId: check.id,
      command: result.command,
      exitStatus: result.exitStatus,
      stdout: result.stdout,
      stderr: result.stderr,
      workspace,
      revision,
      artifactPaths: result.artifactPaths,
      verificationIds: result.verificationIds,
    });
    if (result.status === "PASS" && result.exitStatus !== 0) {
      return { status: "FAIL", summary: "QA command exited unsuccessfully", evidenceIds: [evidenceId] };
    }
    return { status: result.status, summary: result.summary, evidenceIds: [evidenceId] };
  }
}
