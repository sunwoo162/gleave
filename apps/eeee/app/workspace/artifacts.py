"""Write human-readable artifacts without executing workspace commands."""

from pathlib import Path

from app.domain.models import CandidateScore, Decision, RequestBrief


class WorkspaceArtifactWriter:
    """Create deterministic Markdown artifacts for one task."""

    def write_plan(
        self,
        workspace: str | Path,
        task_id: str,
        *,
        request_text: str,
        revision: str,
        selected: list[CandidateScore],
    ) -> Path:
        content = [
            "# Development Plan",
            "",
            f"- Task: `{task_id}`",
            f"- Revision: `{revision}`",
            f"- Request: {request_text}",
            "",
            "## Approved OSS candidates",
        ]
        content.extend(
            f"- `{candidate.repository.full_name}` — {candidate.repository.description}"
            for candidate in selected
        )
        return self._write(workspace, task_id, "plan.md", "\n".join(content) + "\n")

    def write_verification(
        self,
        workspace: str | Path,
        task_id: str,
        *,
        status: str,
        summary: str,
        checks: list[dict[str, object]],
    ) -> Path:
        content = [
            "# Verification Report",
            "",
            f"- Status: `{status}`",
            f"- Summary: {summary}",
            "",
            "## Checks",
        ]
        content.extend(
            self._render_check(check)
            for check in checks
        )
        return self._write(
            workspace,
            task_id,
            "verification.md",
            "\n".join(content) + "\n",
        )

    def write_run_bundle(
        self,
        workspace: str | Path,
        run_id: str,
        *,
        brief: RequestBrief,
        decision: Decision,
        candidates: list[CandidateScore],
        status: str,
        summary: str,
        changed_files: list[str],
        test_commands: list[str],
        error: str | None,
    ) -> list[Path]:
        """Write the portable evidence bundle for one API run."""
        by_name = {candidate.repository.full_name: candidate for candidate in candidates}
        selected = [by_name[name] for name in decision.selected if name in by_name]
        decision_lines = [
            "# OSS Decision Record",
            "",
            f"- Request: {brief.raw_text}",
            f"- Run: `{run_id}`",
            "",
            "## Selected repositories",
        ]
        for candidate in selected:
            repository = candidate.repository
            decision_lines.extend(
                [
                    f"- `{repository.full_name}`",
                    f"  - URL: {repository.html_url}",
                    f"  - License: {repository.license_spdx or 'unknown'}",
                    f"  - Default branch: `{repository.default_branch}`",
                    f"  - Evidence: {'; '.join(candidate.evidence) or 'none recorded'}",
                    f"  - Risks: {'; '.join(candidate.risks) or 'none recorded'}",
                ]
            )
        decision_lines.extend(["", "## Alternatives", *[f"- `{name}`" for name in decision.alternatives]])

        dependency_lines = [
            "# Dependency and source pins",
            "",
            "# No packages were installed automatically by this local-first MVP.",
        ]
        dependency_lines.extend(
            f"{candidate.repository.full_name} @ {candidate.repository.default_branch}"
            for candidate in selected
        )

        test_lines = [
            "# Test Results",
            "",
            f"- Run status: `{status}`",
            f"- Summary: {summary}",
            "",
            "## Commands",
        ]
        test_lines.extend(f"- `{command}`" for command in test_commands or ["No test command reported"])
        if error:
            test_lines.extend(["", f"- Error: {error}"])

        final_lines = [
            "# Final Report",
            "",
            f"- Status: `{status}`",
            f"- Summary: {summary}",
            f"- Changed files: {', '.join(changed_files) or 'none reported'}",
            f"- Verification commands: {', '.join(test_commands) or 'none reported'}",
        ]
        if error:
            final_lines.append(f"- Error: {error}")

        contents = {
            "OSS-DECISIONS.md": decision_lines,
            "DEPENDENCIES.lock": dependency_lines,
            "TEST-RESULTS.md": test_lines,
            "FINAL-REPORT.md": final_lines,
        }
        return [
            self._write(workspace, run_id, filename, "\n".join(lines) + "\n")
            for filename, lines in contents.items()
        ]

    @staticmethod
    def _render_check(check: dict[str, object]) -> str:
        lines = [
            f"- `{check.get('name', 'unnamed')}`: `{check.get('status', 'unknown')}`"
        ]
        command = check.get("command")
        if command is not None:
            rendered_command = " ".join(str(part) for part in command)
            lines.append(f"  - Command: `{rendered_command}`")
        if "exit_code" in check:
            lines.append(f"  - Exit code: `{check.get('exit_code')}`")
        if "duration_ms" in check:
            lines.append(f"  - Duration: `{check.get('duration_ms')} ms`")
        if "stdout" in check:
            lines.append(f"  - stdout: `{check.get('stdout', '')}`")
        if "stderr" in check:
            lines.append(f"  - stderr: `{check.get('stderr', '')}`")
        if "truncated" in check:
            lines.append(f"  - Output truncated: `{check.get('truncated')}`")
        return "\n".join(lines)

    def _write(self, workspace: str | Path, task_id: str, filename: str, content: str) -> Path:
        task_directory = Path(workspace) / task_id
        task_directory.mkdir(parents=True, exist_ok=True)
        path = task_directory / filename
        path.write_text(content, encoding="utf-8")
        return path
