---
name: forgejo-coder
description: "Use when a Forgejo issue needs implementation, a PR needs code changes to address review feedback, or any coding work tied to a Forgejo task. This is a sub-skill of forgejo — it handles implementation, validation, committing, and PR lifecycle."
---

# Forgejo Coder Skill

## Purpose

This is the **implementation sub-skill** of the base `forgejo` skill. It takes over when a task has been identified (by the base skill's triage or discovery scenarios) and needs actual code changes.

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

## Scenarios

### Scenario A: Handle PR Change Requests

**When**: A pull request the agent authored (or is responsible for) has received review comments requesting changes.

**Steps**:

1. Identify the PR — from the base skill's triage output or a direct user instruction.
2. Fetch full review context:
   - `get_pull_request` for PR metadata (branch, base, state).
   - `list_pull_request_reviews` for all review submissions.
   - `list_issue_comments` for general PR comments.
   - `get_pull_request_diff` to see the current diff.
   - `get_pull_request_files` to see which files are affected.
3. For each review comment or requested change:
   - Understand exactly what the reviewer wants changed and why.
   - Classify: code style fix, logic bug, missing test, design disagreement, scope question.
4. If the request is a **design disagreement** or **scope question**, respond with a `create_comment` explaining the rationale before changing code.
5. For actionable changes:
   - Check out the PR branch locally.
   - Implement the requested fixes (directly or via Claude Code — see Appendix A).
   - Run validation (tests, linters).
   - Commit with a message referencing the review, e.g. `fix: address review feedback on #<number>`.
   - Push to the same branch (the PR updates automatically).
6. After pushing, post a summary comment via `create_comment`:
   - List what was changed per review point.
   - Note anything intentionally not changed, with reasoning.
   - **@ mention the reviewer(s)** who requested changes, notifying them that fixes are ready for re-review. Get reviewer usernames from `list_pull_request_reviews`. Example: `@reviewer-username I've addressed your feedback — please take another look.`
7. **Update memory**: record that review feedback was addressed, with a summary of changes made.

---

### Scenario B: Implement an Issue

**When**: A specific issue has been selected for implementation (typically routed from the base `forgejo` skill).

**Steps**:

#### B.1 — Announce start

- Post a comment on the issue via `create_comment` announcing that you are starting work. Keep it brief, e.g. "I'm picking this up now — will open a WIP PR shortly."
- This lets watchers know the issue is being actively worked on.

#### B.2 — Gather full issue context

- `get_issue` for the full issue body.
- `list_issue_comments` for the discussion thread.
- Extract: task description, expected behavior, acceptance criteria, constraints, labels, dependencies, non-goals.
- If ambiguous, prepare clarifying questions and post them via `create_comment` before proceeding.

#### B.3 — Analyze the local repository

- Inspect relevant files, tests, scripts, and configuration in the local repository.
- Identify the change surface, affected modules, risks, and validation approach.
- Write a short implementation plan.

#### B.4 — Implement

Choose one:

- **Direct implementation**: Make the changes yourself if the task is straightforward.
- **Delegate to Claude Code**: For complex tasks, build a structured prompt and hand off (see Appendix A for the prompt template).

In both cases:
- Keep changes minimal and focused.
- Follow existing code style.
- Do not modify unrelated files.

#### B.5 — Validate

- Run tests, linters, and project checks.
- Confirm the implementation matches the issue acceptance criteria.
- Review the diff for accidental churn, debug leftovers, or scope creep.

#### B.6 — Commit & push

- Create or switch to a branch: `issue/<number>-<short-slug>`.
- Review `git status` and `git diff` before committing.
- Commit with message: `fix: resolve issue #<number> — <short-summary>` (or `feat:` as appropriate).
- Ensure the commit contains only task-relevant changes.
- Push the branch.

#### B.7 — Open the merge request

- Call `create_pull_request` with:
  - `title`: **prefix with `WIP: `** while work is not yet complete, e.g. `WIP: fix: resolve #<number> — <short-summary>`
  - `head`: the feature branch
  - `base`: the default branch (usually `main`)
  - `body`: issue link, implementation summary, validation performed, remaining caveats
- If the repository has assignees or labels to set, use `edit_pull_request` after creation.
- The `WIP: ` prefix signals that the PR is not ready for final review or merge. Remove it only when all work is complete (see B.7).

#### B.8 — Monitor & iterate

- After the MR is created, check for review feedback:
  - `list_pull_request_reviews` and `list_issue_comments` on the PR.
- If changes are requested, route to **Scenario A** (Handle PR Change Requests).
- When all implementation and review feedback are addressed and validation passes, **remove the `WIP: ` prefix** from the PR title via `edit_pull_request`.
- After removing the `WIP: ` prefix, **@ mention the reviewer(s)** via `create_comment` to signal the PR is ready for final review or merge. Example: `@reviewer-username WIP removed — this PR is ready for final review.`
- The task is done only when the PR is approved or merged.
- **Update memory** at each state change: PR opened → review received → changes pushed → WIP removed → merged/closed.

---

## @ Mention Rules

These rules apply across all scenarios in this skill:

1. **After addressing review feedback** (Scenario A step 6): Always @ mention the **reviewer(s)** who requested changes. Get their usernames from `list_pull_request_reviews` — look for reviews with `REQUEST_CHANGES` state.
2. **After removing WIP prefix** (Scenario B step B.8): @ mention the reviewer(s) to signal readiness for final review.
3. **Never assume** who the reviewer is — always check `list_pull_request_reviews` for the actual reviewer usernames.
4. **Format**: Use `@username` at the start of a `create_comment` on the PR, with a brief summary of what action is needed.

---

## Guardrails

### Scope Control
- Do not start coding before confirming which issue or PR to work on.
- Do not let Claude Code choose the task — task selection and scoping happen in the base `forgejo` skill.
- Do not modify unrelated files during implementation.
- Keep every commit focused on a single task.

### Safety
- Before pushing, verify that the git `origin` remote is configured correctly (`git remote -v`). If the remote URL is missing or points to the wrong repository, fix it before pushing.
- Do not open a merge request with failing checks unless the user explicitly accepts the risk.
- Do not force-push or rewrite shared branch history.
- Do not push to existing branches (e.g. `main`, `master`, `develop`). Always create a new feature branch (e.g. `issue/<number>-<slug>`).
- Do not close issues — issues are closed automatically when the linked PR is merged, or by a human.
- Do not remove the `WIP: ` prefix from a PR title until all work is verified complete.
- Do not merge a PR whose title still starts with `WIP: `.

### Iteration
- After opening a PR, the work is not done — monitor for review feedback.
- Address review comments promptly via Scenario A rather than ignoring them.

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
