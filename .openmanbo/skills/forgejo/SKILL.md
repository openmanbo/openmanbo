---
name: forgejo
description: "Use when interacting with Forgejo in any way: triaging notifications, discovering new issues, responding to @ mentions, checking PR status, exploring repositories, or performing any Git-forge workflow on Forgejo. This is the base skill — load specialized sub-skills (forgejo-coder, etc.) when the task requires implementation or deep review."
---

# Forgejo Skill

## Purpose

This skill gives the agent full situational awareness of Forgejo-hosted projects. It handles **exploration, triage, communication, and coordination** — everything the agent needs to understand what is happening on Forgejo and decide what to do next.

For **implementation** (coding, committing, opening PRs, addressing review feedback), load the `forgejo-coder` sub-skill.
Future sub-skills (e.g. `forgejo-reviewer`) can extend this base with additional specialized workflows.

Typical entry points:

- "Check what's new on Forgejo" / "do I have anything to work on?"
- A notification arrives (@ mention, review request, issue assignment).
- The agent is running on a schedule and needs to poll for work.
- Any question about Forgejo issues, PRs, repos, or users.

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

---

## Decision Routing

When activated, determine which scenario to follow based on the trigger:

```
START
 │
 ├─ User asks to check notifications / "what's new?"
 │   └─► Scenario A: Triage Notifications
 │
 ├─ User asks to find work / "pick a task" / scheduled poll
 │   └─► Scenario B: Discover & Claim Work
 │
 ├─ Notification or user mentions an @ mention to respond to
 │   └─► Scenario C: Respond to @ Mentions
 │
 ├─ A specific issue needs implementation / PR change requests
 │   └─► Load sub-skill: forgejo-coder
 │
 ├─ User asks to review or merge a PR
 │   └─► Scenario D: Review & Merge PRs
 │
 └─ Ambiguous — start with Scenario A to get situational awareness,
     then route from there
```

If the trigger is unclear, **always start with Scenario A** (triage notifications) to build situational awareness before taking action.

**Before entering any scenario**, read memory first to check for in-progress tasks. Resume unfinished work before starting something new.

### Sub-Skill Routing

When a scenario requires specialized work, load the appropriate sub-skill via `load-skill`:

| Trigger | Sub-Skill | When to load |
|---|---|---|
| Issue selected for implementation | `forgejo-coder` | After Scenario B selects a task, or when Scenario C identifies an action request |
| PR has review comments requesting code changes | `forgejo-coder` | When triage or notification identifies change requests on the agent's PR |
| Deep code review needed | *(future: `forgejo-reviewer`)* | When Scenario D needs thorough review beyond simple feedback |

The base `forgejo` skill handles **discovery and routing**. Sub-skills handle **execution**.

---

## Scenarios

### Scenario A: Triage Notifications

**When**: The agent needs to understand what requires attention on Forgejo.

**Steps**:

1. Call `get_user` to confirm the authenticated identity.
2. Call `list_notifications` to fetch unread notifications.
3. Classify each notification:
   - **Issue assignment** → note for Scenario B or sub-skill routing.
   - **@ mention in issue/PR** → note for Scenario C.
   - **Review request or review comment** → note for sub-skill routing (forgejo-coder).
   - **PR merged / issue closed** → informational, summarize only.
4. For each actionable notification, fetch context with `get_issue` or `get_pull_request` as appropriate.
5. Prioritize actionable items:
   - Items requiring a response (mentions, review requests) first.
   - Items requiring implementation (assigned issues) second.
   - Informational items last.
6. **If running in autonomous mode** (e.g. triggered by the notification poller): auto-route directly to the appropriate scenario / sub-skill for each actionable item. Do not wait for user input — process all items.
7. **If a user is present in the conversation**: present a prioritized summary and ask which item to handle, or auto-route if the user gave blanket permission to proceed.

---

### Scenario B: Discover & Claim Work

**When**: The agent is looking for the next task to pick up — either assigned work or unassigned work that fits.

**Steps**:

1. Call `get_user` to confirm identity.
2. Search for **assigned open issues**:
   - `search_issues` with `assigned: true`, `state: "open"`, `type: "issues"`.
   - If a specific repo is known, narrow with `owner` + `list_issues`.
3. If no assigned issues, search for **available unassigned work**:
   - `search_issues` with relevant labels (e.g. `help wanted`, `good first issue`) or by repo.
   - Filter out issues that are blocked, in-progress by others, or lack clear acceptance criteria.
4. Rank candidates by:
   - Clarity of acceptance criteria.
   - Recent activity and urgency signals (labels, milestones).
   - Alignment with the current repository context.
   - Absence of unresolved blockers.
5. Present the ranked list to the user with a recommended pick.
6. Once a task is selected:
   - If the issue is unassigned, self-assign via `edit_issue` (set `assignees`).
   - Post a status comment via `create_comment` announcing work has started.
   - **Record in memory**: issue number, title, repo, and timestamp (see Task Memory).
   - **Load `forgejo-coder`** sub-skill for implementation.

---

### Scenario C: Respond to @ Mentions

**When**: The agent is mentioned in an issue or PR comment and needs to respond.

**Steps**:

1. Identify the source — from `list_notifications` or a direct user instruction.
2. Fetch full context:
   - `get_issue` or `get_pull_request` for the parent item.
   - `list_issue_comments` or `list_pull_request_reviews` for the full conversation thread.
3. Understand what is being asked:
   - **A question** → research and reply with `create_comment`.
   - **A request to take action** (e.g. "can you fix this?") → acknowledge with a comment, then load the appropriate sub-skill (`forgejo-coder` for implementation).
   - **A status check** (e.g. "any update?") → check memory for current task state and reply.
   - **An FYI / informational mention** → acknowledge briefly or skip if no response is needed.
4. When replying, be concise and reference specific context (issue numbers, code lines, prior comments).
5. If the mention requires implementation work, do not start coding in the reply — load the sub-skill and link back.

---

### Scenario D: Review & Merge PRs

**When**: The agent is asked to review someone else's PR, or to merge a PR that is ready.

**Steps**:

1. Fetch PR context:
   - `get_pull_request` for metadata.
   - `get_pull_request_diff` for the full diff.
   - `get_pull_request_files` for the file list.
   - `list_pull_request_reviews` for existing reviews.
   - `list_issue_comments` for discussion.
2. If reviewing:
   - Read the diff carefully. Check for correctness, style, test coverage, unintended changes.
   - Post review comments via `create_comment` with specific, actionable feedback.
   - Reference line numbers and file paths.
3. If merging:
   - Confirm all checks pass and the PR is approved.
   - Confirm the PR title does **not** start with `WIP: ` — if it does, the PR is not ready to merge.
   - Use `merge_pull_request` with the appropriate method (`Do`: `merge`, `rebase`, or `squash` — follow project convention).
   - Optionally set `delete_branch_after_merge: true` for cleanup.
4. If the branch is behind base, use `update_pull_request_branch` before merging.

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
- Always pass gathered context (issue details, notification classification, memory state) to the sub-skill so it does not repeat discovery work.
