---
name: forgejo
description: "Use when interacting with Forgejo in any way: triaging notifications, discovering new issues, responding to @ mentions, checking PR status, exploring repositories, or performing any Git-forge workflow on Forgejo. This is the base skill — load specialized sub-skills (forgejo-coder, forgejo-reviewer, forgejo-pm) when the task requires implementation, code review, or issue decomposition."
---

# Forgejo Skill

## Purpose

This skill gives the agent full situational awareness of Forgejo-hosted projects. It handles **exploration, triage, communication, and coordination** — everything the agent needs to understand what is happening on Forgejo and decide what to do next.

For **implementation** (coding, committing, opening PRs, addressing review feedback), load the `forgejo-coder` sub-skill.
For **code review** (reading diffs, leaving structured reviews, approving/requesting changes), load the `forgejo-reviewer` sub-skill.
For **issue decomposition & delegation** (breaking complex issues into sub-tasks, assigning to agents, tracking progress), load the `forgejo-pm` sub-skill.

Typical entry points:

- "Check what's new on Forgejo" / "do I have anything to work on?"
- A notification arrives (@ mention, review request, issue assignment).
- The agent is running on a schedule and needs to poll for work.
- Any question about Forgejo issues, PRs, repos, or users.

## Communication Rules

- **Always reply in the same language as the person you are communicating with.** If an issue or comment is written in Chinese, reply in Chinese. If in English, reply in English. Match the language of the most recent message or the issue author.

---

## Access Token & Git Authentication

The Forgejo personal access token is not only used for API calls — it can also be used for **git operations over HTTPS** (clone, fetch, push, pull).

### How to obtain the token

Read the Forgejo MCP resource `forgejo://server/info`. It returns a JSON object with:

```json
{
  "url": "https://<forgejo-host>",
  "token": "<access-token>",
  "user": { "login": "<username>", ... }
}
```

Extract `token`, `url`, and `user.login` from this resource.

### Using the token for git operations

Authenticate using the token in the HTTPS URL:

```
git clone https://<username>:<token>@<forgejo-host>/<owner>/<repo>.git
```

Or configure the remote for an existing repository:

```
git remote set-url origin https://<username>:<token>@<forgejo-host>/<owner>/<repo>.git
```

This is essential for `forgejo-coder` workflows (pushing branches, opening PRs) and any scenario that requires direct git access.

---

## Forgejo MCP Tool Reference

Always be aware of the full tool set. Choose the right tool for the situation.

### Query & Search

| Tool | Purpose |
|---|---|
| `get_user` | Confirm the authenticated account identity |
| `get_user_info` | Look up any user's public profile |
| `search_issues` | Search issues/PRs across all repos (supports filters: `assigned`, `mentioned`, `review_requested`, `state`, `type`, `labels`, `owner`) |
| `search_repos` | Search repositories by keyword or owner |
| `list_issues` | List issues in a specific repository |
| `list_pull_requests` | List PRs in a specific repository |
| `list_issue_comments` | Read the comment thread on an issue or PR |
| `list_pull_request_reviews` | Read review submissions on a PR |
| `list_notifications` | List all unread notifications for the authenticated user |
| `get_issue` | Get full details of a single issue |
| `get_pull_request` | Get full details of a single PR |
| `get_pull_request_diff` | Get the plain-text diff of a PR |
| `get_pull_request_files` | List files changed in a PR |
| `get_repo` | Get repository metadata |

### Write & Mutate

| Tool | Purpose |
|---|---|
| `create_issue` | Open a new issue |
| `create_comment` | Post a comment on an issue or PR |
| `create_pull_request` | Open a new pull request (`head`, `base`, `title`, `body`) |
| `edit_issue` | Update issue title, body, state, assignees, labels |
| `edit_pull_request` | Update PR title, body, state |
| `merge_pull_request` | Merge a PR (`Do`: merge / rebase / squash) |
| `update_pull_request_branch` | Rebase or merge PR branch with base branch |
| `mark_notification_read` | Mark a single notification thread as read |
| `mark_all_notifications_read` | Mark all notifications as read (optionally filter by date) |

### PR Review

| Tool | Purpose |
|---|---|
| `create_pull_request_review` | Submit a review (APPROVED / REQUEST_CHANGES / COMMENT / PENDING) with optional line-level comments |
| `get_pull_request_review` | Get details of a specific review by review_id |
| `submit_pull_request_review` | Submit a previously created PENDING review |
| `delete_pull_request_review` | Delete a review |
| `dismiss_pull_request_review` | Dismiss a review with a reason message |
| `get_pull_request_review_comments` | List line-level comments of a specific review |

---

## Conventions

Instead of a rigid step-by-step workflow, follow these core conventions when operating on Forgejo Tasks:

1. **Language Matching**: Always reply in the same language as the person you are communicating with. If an issue or comment is written in Chinese, reply in Chinese. If in English, reply in English.
2. **Self-Assignment**: When picking up an unassigned issue to work on, you MUST self-assign it via `edit_issue` (`assignees`) before starting work.
3. **Truth over Memory**: Rely on Forgejo API data (like `get_issue`, `search_issues`, `list_notifications`) rather than internal memory.
4. **Sub-skill Handoff**: 
   - Use `forgejo-coder` for implementation tasks.
   - Use `forgejo-reviewer` for code review tasks.
   - Use `forgejo-pm` for breaking down complex issues.

## Failure & Blocker Reporting

When the agent encounters a blocker or cannot complete a task, it **must** report the failure on Forgejo so that humans and other agents have visibility. Silent failures are never acceptable.

### When to Report

- **Notifications**: A notification cannot be processed (e.g. referenced issue/repo is inaccessible, MCP tool call fails).
- **Discovery**: No suitable work is found, or a selected task turns out to be blocked.
- **Mentions**: An @ mention cannot be addressed (e.g. missing context, unclear request after best-effort analysis).
- **Any sub-skill**: The sub-skill (forgejo-coder, forgejo-reviewer, forgejo-pm) encounters an unrecoverable error.

### How to Report

Post a comment via `create_comment` on the **relevant issue or PR** with the following structure:

```
⚠️ **Blocked — unable to complete this task**

**What I attempted:**
- <step 1>
- <step 2>

**Blocking reason:**
- <specific error, missing dependency, ambiguous requirement, access issue, etc.>

**What is needed to unblock:**
- <human action, clarification, access grant, upstream fix, etc.>
```

If the blocker is related to a **notification** that has no specific issue/PR to comment on, log the failure and move on to the next notification. Do not stop processing other notifications because of one failure.

### Rules

1. **Always be specific.** "Something went wrong" is not acceptable. Include error messages, tool names, and context.
2. **Report before giving up.** The comment must be posted before the agent moves on or stops.
3. **One comment per blocker.** Do not spam — consolidate related issues into a single comment.
4. **Update memory.** Record the blocked status in task memory (see Task Memory section below) so future runs are aware.

---

## Task Memory

Use the **memory MCP** and/or **filesystem MCP** to persist task state so that context survives across conversations, restarts, and scheduled runs. The agent should never rely solely on conversational context to track what it has done.

This section applies to all Forgejo workflows, including those in sub-skills. Sub-skills should follow these same memory conventions.

### What to Record

Record structured facts at each major workflow checkpoint:

| Checkpoint | What to store | Example |
|---|---|---|
| Task selected | Issue number, title, repo, assignee, timestamp | `working on openmanbo/bot#42 "Add rate limiting" assigned to manbo-bot, started 2026-03-29` |
| Implementation started | Branch name, planned approach summary | `branch: issue/42-rate-limiting, approach: add middleware in src/server/ratelimit.ts` |
| PR opened | PR number, URL, branch, base | `PR #18 opened for issue #42, head: issue/42-rate-limiting, base: main` |
| Review feedback received | PR number, reviewer, summary of requested changes | `PR #18: reviewer alice requested "add tests for edge case"` |
| Task completed | Issue number, PR number, merge status, final summary | `issue #42 resolved via PR #18, merged via squash, all checks passed` |
| Task blocked | Issue number, blocker description, next action | `issue #42 blocked: missing API spec from upstream, asked for clarification in comment` |

### How to Record

- **Memory MCP** (knowledge graph): Use `create_entities` and `create_relations` to store structured task nodes and their relationships. Use `search_nodes` to recall past work. This is the preferred method for facts that need to be queried later (e.g. "what issues have I worked on?", "what's the status of PR #18?").
- **Filesystem MCP**: Write a running log or status file to `.openmanbo/filesystem/` (e.g. `task-log.md`) when a human-readable audit trail is useful.

### When to Read Memory

- **At the start of every workflow**: Before picking new work, check memory for in-progress tasks. Resume unfinished work before starting something new.
- **Before posting a comment or PR**: Check if a similar comment or PR was already created in a prior run to avoid duplicates.
- **When handling a notification**: Check memory to see if the referenced issue/PR is already tracked and what the last known state was.
- **After a restart or new conversation**: The first action should be to read memory and restore awareness of ongoing tasks.

### Memory Hygiene

- Update task status promptly — do not leave stale "in-progress" entries.
- When a task is completed or abandoned, mark it as such in memory.
- Periodically consolidate memory: remove entries for merged PRs or closed issues that no longer need tracking.

---

## Guardrails

### Authentication & Authorization
- Always call `get_user` at the start of any workflow to confirm identity.
- Do not perform write actions (assign, comment, create PR, merge) on repositories without confirmed write access.
- Do not self-assign issues in repositories the agent does not contribute to unless the user explicitly requests it.

### Safety
- **Never auto-merge** a PR without explicit user approval.
- Do not merge a PR whose title still starts with `WIP: `.
- Do not force-push or rewrite shared branch history.

### Communication
- Do not skip issue/PR comments — important acceptance details and context often live there.
- When posting comments, be concise and reference specific context.
- If a task is blocked or underspecified, surface the blocker clearly via `create_comment` instead of fabricating a solution.
- Do not respond to purely informational notifications unless a response is expected.

### Sub-Skill Delegation
- Do not attempt implementation work (coding, committing, opening PRs) within this base skill. Load the appropriate sub-skill instead.
- Do not attempt issue decomposition or agent delegation within this base skill. Load `forgejo-pm` instead.
- Always pass gathered context (issue details, notification classification, memory state) to the sub-skill so it does not repeat discovery work.
