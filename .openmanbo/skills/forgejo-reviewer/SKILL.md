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

## Conventions

Instead of a rigid step-by-step workflow, follow these core conventions when reviewing PRs:

1. **Ignore WIP PRs**: Unless explicitly asked by a human or another agent, do NOT review or merge PRs that have a `WIP: ` prefix in their title.
2. **Actionable Feedback**: When submitting a `REQUEST_CHANGES` review, provide clear, specific, and actionable feedback. Do not leave vague complaints.
3. **Verify Fixes**: When re-reviewing a PR after author edits, verify that the previously requested changes have been properly addressed.
4. **Notify Assignee**: After submitting a review, `@` mention the PR assignee to notify them of your feedback.

## @ Mention Rules

These rules apply to all actions in this skill:

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
