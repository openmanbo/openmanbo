---
name: forgejo-coder
description: "Use when a Forgejo issue needs implementation, a PR needs code changes to address review feedback, or any coding work tied to a Forgejo task. This is a sub-skill of forgejo — it handles implementation, validation, committing, and PR lifecycle."
---

# Forgejo Coder Skill

## Purpose

This is the **implementation sub-skill** of the base `forgejo` skill. It takes over when a task has been identified (by the base skill's triage or discovery) and needs actual code changes.

Responsibilities:
- Implement issues: analyze code, make changes, validate, commit, open a PR.
- Handle PR change requests: read review feedback, fix code, push updates.
- Manage the PR lifecycle: `WIP:` prefix convention, iteration on feedback, finalization.

This skill does **not** handle discovery, triage, or notification routing — that belongs to the base `forgejo` skill.

## Preconditions

- The base `forgejo` skill has already identified the task (issue or PR).
- A Forgejo MCP server is configured and authenticated.
- The target repository exists locally and can be edited.
- Git push access is available.
- Claude Code CLI is available if implementation will be delegated (optional).

---

## Conventions

Instead of a rigid step-by-step workflow, follow these core conventions when implementing tasks:

1. **WIP Prefix**: When opening a Pull Request that is NOT fully ready for review, you MUST prefix the title with `WIP: ` (e.g., `WIP: fix: resolve #42`). Remove the prefix only when the PR is fully implemented, verified, and ready.
2. **Reviewer Notification**: When addressing feedback or marking a PR ready (removing `WIP:`), you MUST `@` mention the reviewer(s) who requested changes or need to review. Example: `@reviewer-username I've addressed the feedback, please take a look.`
3. **Blocker Reporting**: If you encounter an unrecoverable error, missing dependency, or ambiguous requirement, you MUST leave a comment on the relevant issue or PR explaining the blocker clearly. Do not silently fail.
4. **Focused Commits**: Ensure commits are task-relevant, without modifying unrelated files.

## @ Mention Rules

These rules apply to all actions in this skill:

1. **After addressing review feedback**: Always @ mention the **reviewer(s)** who requested changes. Get their usernames from `list_pull_request_reviews` — look for reviews with `REQUEST_CHANGES` state.
2. **After removing WIP prefix**: @ mention the reviewer(s) to signal readiness for final review.
3. **Never assume** who the reviewer is — always check `list_pull_request_reviews` for the actual reviewer usernames.
4. **Format**: Use `@username` at the start of a `create_comment` on the PR, with a brief summary of what action is needed.
5. **After completing a sub-issue**: If the issue title contains `[Part of #N]` or the body references a parent issue, @ mention the **issue creator** (the PM agent who created and assigned this sub-issue) on this issue to report completion. Get the creator username from `get_issue` → `user` field.

---

## Failure & Blocker Reporting

When implementation fails or is blocked at any point, the agent **must** report the failure on the relevant Forgejo issue or PR before stopping. Silent failures are never acceptable.

### When to Report

- **Build/test failures** that cannot be fixed after a reasonable attempt.
- **Missing dependencies** (packages, APIs, upstream changes) that prevent implementation.
- **Ambiguous requirements** that cannot be resolved by reading the issue, comments, and codebase.
- **Access or permission errors** (e.g. cannot push, cannot read a required repo).
- **Merge conflicts** that require human judgment to resolve.
- **Any unrecoverable error** during the implementation workflow.

### How to Report

Post a comment via `create_comment` on the **issue being implemented** (or the PR if one was already opened) with:

```
⚠️ **Blocked — implementation could not be completed**

**What I attempted:**
- <brief summary of work done so far>

**Blocking reason:**
- <specific error message, failing test output, missing dependency name, etc.>

**What is needed to unblock:**
- <concrete next step: fix upstream dependency, clarify requirement X, grant access to Y, etc.>
```

If a **WIP PR** was already opened, update the PR body or post a comment there as well so reviewers see the blocker.

### Rules

1. **Be specific.** Include error messages, file paths, test names, and command output. Vague reports waste human time.
2. **Report at the earliest opportunity.** Do not attempt the same failing operation repeatedly — report after a reasonable attempt.
3. **Update task memory.** Record the blocked status so the agent does not re-attempt the same failing work in subsequent runs.
4. **Do not close or abandon.** Leave the issue open and assigned. The blocker report is a request for help, not a surrender.

---

## Guardrails

### Scope Control
- Do not start coding before confirming which issue or PR to work on.
- Do not let Claude Code choose the task — task selection and scoping happen in the base `forgejo` skill.
- Do not modify unrelated files during implementation.
- Keep every commit focused on a single task.

### Safety
- Before pushing, verify that the git `origin` remote is configured correctly (`git remote -v`). If the remote URL is missing or points to the wrong repository, fix it before pushing. If authentication is needed, read the `forgejo://server/info` MCP resource to get the access token and instance URL, then use them in the HTTPS git URL — see the base `forgejo` skill's "Access Token & Git Authentication" section for details.
- Do not open a merge request with failing checks unless the user explicitly accepts the risk.
- Do not force-push or rewrite shared branch history.
- Do not push to existing branches (e.g. `main`, `master`, `develop`). Always create a new feature branch (e.g. `issue/<number>-<slug>`).
- Do not close issues — issues are closed automatically when the linked PR is merged, or by a human.
- Do not remove the `WIP: ` prefix from a PR title until all work is verified complete.
- Do not merge a PR whose title still starts with `WIP: `.

### Iteration
- After opening a PR, the work is not done — monitor for review feedback.
- Address review comments promptly promptly rather than ignoring them.

---

## Appendix A: Claude Code Prompt Template

When delegating implementation to Claude Code CLI, use this structured prompt:

```text
You are working in repository: <absolute-or-workspace-path>

Task
- Implement Forgejo issue #<number>: <title>

Issue Summary
- <short problem statement>
- <expected outcome>

Acceptance Criteria
- <criterion 1>
- <criterion 2>
- <criterion 3>

Constraints
- Keep the change focused.
- Follow the existing code style and public APIs unless the issue requires otherwise.
- Do not modify unrelated files.
- If requirements are ambiguous, stop and explain the blocker clearly.

Relevant Context
- Repository owner/repo: <owner>/<repo>
- Relevant files or directories to inspect first:
	- <path 1>
	- <path 2>
- Validation commands:
	- <command 1>
	- <command 2>

Execution Requirements
1. Inspect the existing implementation before changing code.
2. Implement the smallest correct fix or feature.
3. Run the relevant tests or checks.
4. Summarize what changed, why, and what still needs attention.

Return Format
- Summary of code changes
- Tests and checks run
- Remaining risks or follow-up items
```

Build the prompt in English. Include all context you gathered in earlier steps — do not ask Claude Code to guess what you already know.
