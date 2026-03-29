---
name: forgejo-reviewer
description: "Use when reviewing a Forgejo pull request: reading diffs, providing line-level code review feedback, approving, requesting changes, dismissing reviews, or merging PRs after review. This is a sub-skill of forgejo — it handles structured PR review workflows."
---

# Forgejo Reviewer Skill

## Purpose

This is the **code review sub-skill** of the base `forgejo` skill. It takes over when a PR needs structured review — reading the diff, leaving line-level comments, approving or requesting changes, and following up after the author addresses feedback.

Responsibilities:
- Review PRs: read diffs, analyze changes, post structured reviews with line-level comments.
- Approve or request changes using the Forgejo review API.
- Follow up after the author pushes fixes — re-review and approve or request further changes.
- Merge PRs that pass review.

This skill does **not** handle discovery, triage, or notification routing — that belongs to the base `forgejo` skill.
This skill does **not** handle implementation — that belongs to `forgejo-coder`.

## Preconditions

- The base `forgejo` skill has identified a PR that needs review.
- A Forgejo MCP server is configured and authenticated.
- The agent has read access to the target repository.

---

## Review Tool Reference

These tools are specific to the review workflow. For the full Forgejo tool set, see the base `forgejo` skill.

| Tool | Purpose |
|---|---|
| `create_pull_request_review` | Submit a review: APPROVED, REQUEST_CHANGES, COMMENT, or PENDING. Supports line-level `comments` with `path`, `new_position`, `old_position`. |
| `get_pull_request_review` | Get details of a specific review by `review_id`. |
| `submit_pull_request_review` | Submit a previously created PENDING review. |
| `delete_pull_request_review` | Delete a review. |
| `dismiss_pull_request_review` | Dismiss a review with a `message` explaining why. |
| `get_pull_request_review_comments` | List line-level comments of a specific review. |

Supporting tools (from the base tool set):

| Tool | Purpose |
|---|---|
| `get_pull_request` | PR metadata (assignees, state, branches). |
| `get_pull_request_diff` | Full diff as plain text — the primary input for review. |
| `get_pull_request_files` | List of changed files. |
| `list_pull_request_reviews` | All existing reviews on the PR. |
| `list_issue_comments` | General PR comments / discussion thread. |
| `create_comment` | Post a general comment (not a review comment). |
| `merge_pull_request` | Merge after approval. |
| `update_pull_request_branch` | Rebase/merge PR branch before merging. |

---

## Scenarios

### Scenario A: Review a Pull Request

**When**: A PR has been identified for review (by the base skill's triage/routing, a notification, or a direct user instruction).

**Steps**:

#### A.1 — Gather full PR context

1. `get_pull_request` for metadata: author, assignees, branches, state, labels.
2. `get_pull_request_diff` — read the full diff carefully. This is the primary review input.
3. `get_pull_request_files` — get the file list for an overview of scope.
4. `list_pull_request_reviews` — check for existing reviews (avoid duplicate reviews).
5. `list_issue_comments` — read the discussion thread for context, especially the PR description and any linked issue.

#### A.2 — Analyze the changes

For each changed file, evaluate:
- **Correctness**: Does the logic do what the PR description claims? Are there edge cases?
- **Style**: Does the code follow project conventions?
- **Tests**: Are new behaviors covered by tests? Are existing tests still valid?
- **Scope**: Are there unintended changes, debug leftovers, or scope creep?
- **Security**: Are there any obvious vulnerabilities introduced?

#### A.3 — Prepare the review

Decide the review outcome:
- **APPROVED** — the changes are correct and complete. No blocking issues.
- **REQUEST_CHANGES** — there are issues that must be fixed before merging.
- **COMMENT** — observations or questions that don't block merging.

Prepare:
- A **body** summarizing the overall review (what looks good, what needs attention).
- **Line-level comments** for specific feedback, using `path`, `new_position` (for added/changed lines) or `old_position` (for removed lines).

#### A.4 — Submit the review

Call `create_pull_request_review` with:
- `event`: one of `APPROVED`, `REQUEST_CHANGES`, or `COMMENT`.
- `body`: the overall review summary.
- `comments`: array of line-level comments (each with `body`, `path`, and position).

#### A.5 — Notify the assignee

After submitting the review:
- **If REQUEST_CHANGES**: Post a `create_comment` that **@ mentions the PR assignee(s)** (not necessarily the person who last commented or requested the review — look at the `assignees` field from `get_pull_request`). Example: `@assignee-username I've left some review feedback — please take a look when you get a chance.`
- **If APPROVED**: Post a `create_comment` that @ mentions the PR assignee(s) confirming approval. Example: `@assignee-username LGTM! Approved — ready to merge when you are.`
- **If COMMENT**: @ mention only if the comments require a response. Skip for minor observations.

**Important**: The person to @ is determined by the PR's `assignees` field, not by who requested the review or who opened the PR. If there are no assignees, fall back to the PR author.

#### A.6 — Update memory

Record the review: PR number, repo, review outcome, summary of feedback given.

---

### Scenario B: Re-review After Author Fixes

**When**: The PR author (or `forgejo-coder`) has pushed new commits addressing review feedback, and the reviewer needs to verify the fixes.

**Steps**:

1. Fetch updated context:
   - `get_pull_request` — check for new commits since last review.
   - `get_pull_request_diff` — read the updated diff.
   - `list_pull_request_reviews` — find the previous review(s).
   - `get_pull_request_review_comments` — read the specific comments from the prior review to verify each was addressed.
2. For each previously raised point:
   - Check if the fix is correct and complete.
   - Note any unresolved items.
3. Submit a new review via `create_pull_request_review`:
   - **APPROVED** if all feedback has been addressed.
   - **REQUEST_CHANGES** if issues remain (include only the still-open items).
   - **COMMENT** for minor follow-ups that don't block merging.
4. **@ mention the PR assignee(s)** after submitting (same rule as A.5 — use the `assignees` field).
5. **Update memory**: record re-review outcome.

---

### Scenario C: Merge After Approval

**When**: The PR is approved and ready to merge.

**Steps**:

1. `get_pull_request` — confirm:
   - The PR is approved (check `list_pull_request_reviews` for an APPROVED review).
   - The PR title does **not** start with `WIP: `.
   - The PR state is `open`.
2. If the branch is behind base, call `update_pull_request_branch` first.
3. Call `merge_pull_request` with:
   - `Do`: follow project convention (`merge`, `rebase`, or `squash`).
   - Optionally `delete_branch_after_merge: true`.
4. Requires **explicit user approval** before executing the merge (see Guardrails).

---

### Scenario D: Dismiss a Review

**When**: A previously submitted review is no longer valid (e.g. the context changed, the reviewer made an error, or the review is stale).

**Steps**:

1. `list_pull_request_reviews` — find the review to dismiss.
2. Call `dismiss_pull_request_review` with:
   - `review_id`: the review to dismiss.
   - `message`: clear explanation of why the review is being dismissed.
3. Post a `create_comment` explaining the dismissal to the PR thread.

---

## @ Mention Rules

These rules apply across all scenarios in this skill:

1. **After submitting a review (REQUEST_CHANGES or APPROVED)**: Always @ mention the **PR assignee(s)**. Get assignees from `get_pull_request` → `assignees` field.
2. **If no assignees are set**: Fall back to the PR **author** (the `user` field from `get_pull_request`).
3. **Never assume** the person who requested the review is the person to notify — they may be a different user from the assignee.
4. **Format**: Use `@username` at the start of a `create_comment` on the PR, with a brief summary of what action is needed.

---

## Guardrails

### Review Quality
- Always read the full diff before submitting a review. Do not review based on file names or PR description alone.
- Reference specific file paths and line numbers in feedback. Vague feedback is not actionable.
- Distinguish blocking issues (REQUEST_CHANGES) from suggestions (COMMENT). Do not block a PR for style preferences unless they violate project conventions.

### Safety
- **Never auto-merge** without explicit user approval.
- Do not merge a PR whose title still starts with `WIP: `.
- Do not dismiss other reviewers' reviews unless explicitly authorized.
- Do not approve a PR the agent itself authored — request review from a human instead.

### Communication
- Keep review comments concise and actionable.
- When requesting changes, explain **why** the change is needed, not just **what** to change.
- When the same issue appears in multiple places, mention it once in the review body rather than repeating it on every line.
- Always @ mention the correct person (assignee, not arbitrary participants).
