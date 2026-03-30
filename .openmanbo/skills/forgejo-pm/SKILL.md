---
name: forgejo-pm
description: "Use when a complex Forgejo issue needs decomposition into sub-issues, task delegation to other agents, or tracking sub-issue progress. This is a sub-skill of forgejo — it handles issue analysis, breakdown, delegation, and aggregation."
---

# Forgejo PM Skill

## Purpose

This is the **product management sub-skill** of the base `forgejo` skill. It takes over when an issue is too large or complex for a single agent to implement directly. The PM decomposes the issue into concrete sub-issues, assigns each to an available agent, tracks progress via a checklist on the parent issue, and aggregates results when all sub-tasks complete.

Responsibilities:
- Analyze complex issues and identify independent sub-tasks.
- Create sub-issues with clear acceptance criteria and assign them to agents.
- Maintain a progress checklist on the parent issue.
- Monitor agent @ mentions reporting completion, verify results, and update tracking.
- Aggregate outcomes and finalize the parent issue when all sub-tasks are done.

This skill does **not** handle implementation — that belongs to `forgejo-coder`.
This skill does **not** handle code review — that belongs to `forgejo-reviewer`.
This skill does **not** handle discovery or triage — that belongs to the base `forgejo` skill.

## Preconditions

- The base `forgejo` skill has identified a complex issue that needs decomposition.
- A Forgejo MCP server is configured and authenticated.
- The agent has write access to the target repository (to create issues, post comments, edit issue bodies).

---

## Agent Registry

The PM needs to know which agents are available for delegation.

### How to discover agents

1. **Memory MCP** (preferred): Search for an entity named `agent-registry` or similar. It should contain a list of agent usernames and their capabilities.
2. **Fall back to user**: If no registry exists in memory, ask the user which agent usernames are available and what each can do.
3. **Bootstrap**: On first use, create an `agent-registry` entity in memory MCP with the known agents:
   ```
   Entity: agent-registry
   Observations:
     - "@agent-a: capabilities=coder, status=active"
     - "@agent-b: capabilities=coder,reviewer, status=active"
   ```

### Registry maintenance

- When an agent reports unavailability or repeated failures, update the registry.
- When new agents are introduced, add them to the registry.
- Periodically verify agent availability by checking their Forgejo user profiles via `get_user_info`.

---

## Parent Issue Checklist Format

When decomposing an issue, maintain this checklist format in the parent issue body (appended via `edit_issue`):

```markdown
## Sub-Issues

- [ ] #43 — Implement rate limiting middleware (@agent-a)
- [ ] #44 — Add rate limit tests (@agent-b)
- [x] #45 — Update API docs (@agent-c) ✅
```

Rules:
- Each line links the sub-issue number, a short description, and the assigned agent.
- Mark `[x]` when the sub-issue is verified complete (PR merged or issue closed).
- Append ` ✅` after `[x]` items for visual clarity.
- Keep the checklist in the **same order** as the sub-issues were created.

---

## Scenarios

### Scenario A: Decompose & Delegate

**When**: A complex issue has been identified that needs to be broken down into sub-tasks and assigned to other agents.

**Steps**:

#### A.1 — Analyze the complex issue

1. `get_issue` for the full issue body.
2. `list_issue_comments` for the discussion thread.
3. Extract: overall goal, acceptance criteria, constraints, dependencies, non-goals.
4. Identify why this issue is complex — multiple independent work streams, different skill requirements, large scope, etc.

#### A.2 — Design the decomposition

1. Break the issue into **concrete, independent sub-tasks**. Each sub-task should:
   - Be completable by a single agent.
   - Have clear, specific acceptance criteria.
   - Be as independent as possible from other sub-tasks.
2. Identify any **ordering constraints** — note which sub-tasks depend on others.
3. For each sub-task, determine which agent is best suited (check the agent registry).
4. If the decomposition results in **more than 5 sub-issues**, present the plan to the user for approval before creating them.

#### A.3 — Create sub-issues

For each sub-task, call `create_issue` with:
- `title`: `[Part of #<parent-number>] <sub-task title>`
- `body`:
  ```markdown
  ## Parent Issue
  
  This is a sub-task of #<parent-number>.
  
  ## Task
  
  <specific task description>
  
  ## Acceptance Criteria
  
  - <criterion 1>
  - <criterion 2>
  - <criterion 3>
  
  ## Completion
  
  When this task is done, please **@ mention @<pm-username>** on this issue to report completion.
  Example: `@<pm-username> Done — PR #XX merged.`
  ```
- `assignees`: `["<target-agent-username>"]`

If there are ordering constraints, note them in the sub-issue body (e.g. "This depends on #43 being completed first.").

#### A.4 — Update parent issue checklist

Call `edit_issue` to update the parent issue body — append the "Sub-Issues" checklist section listing all created sub-issues with their numbers, titles, and assigned agents. Use the checklist format defined above.

Preserve the original issue body — append the checklist at the end, do not overwrite existing content.

#### A.5 — Post summary comment

Post a `create_comment` on the parent issue summarizing the decomposition:
- How many sub-issues were created.
- Brief description of each sub-task and who it's assigned to.
- Any ordering constraints or dependencies.
- Expected next steps.

#### A.6 — Notify assigned agents

For each sub-issue, post a `create_comment` that **@ mentions the assigned agent**:
- Example: `@agent-a This sub-issue is assigned to you. Please review the acceptance criteria and start when ready. When done, @ mention me (@<pm-username>) on this issue to report completion.`

#### A.7 — Record in memory

Record structured facts:
- Parent issue number, title, repo.
- List of all sub-issue numbers with assigned agents.
- Decomposition timestamp.
- Status: `decomposed, awaiting completion`.

---

### Scenario B: Track Progress

**When**: Sub-issues have been created and the PM needs to monitor agent progress — triggered by notifications (agent @ mentions), polling, or user request.

**Steps**:

#### B.1 — Check for completion reports

- Check `list_notifications` for @ mentions from agents on sub-issues.
- Alternatively, for each tracked sub-issue: `get_issue` to check state, `list_issue_comments` for agent reports.

#### B.2 — Verify completed sub-issues

For each sub-issue an agent reports as done:
1. `get_issue` — check if the issue is closed or if a linked PR is merged.
2. `list_issue_comments` — read the agent's completion report.
3. If verified complete:
   - Update the parent issue checklist: change `- [ ] #N` to `- [x] #N ... ✅` via `edit_issue` on the parent.
   - Post an acknowledgement `create_comment` on the sub-issue: `@agent-a Thanks — verified complete. Updated the parent issue checklist.`
4. If **not** verified (e.g. PR still open, tests failing):
   - Post a `create_comment` on the sub-issue asking the agent to clarify or continue.

#### B.3 — Handle blockers

If an agent reports a blocker on a sub-issue:
1. Assess the blocker — is it a dependency on another sub-issue, a missing requirement, or an external block?
2. Options:
   - **Adjust scope**: Edit the sub-issue body via `edit_issue` to narrow the task.
   - **Reassign**: Change `assignees` via `edit_issue` to a different agent. Post a comment explaining the reassignment.
   - **Create a new sub-issue**: If the blocker reveals a missing sub-task, create it (same as A.3) and update the parent checklist.
   - **Escalate**: Post a comment on the parent issue explaining the blocker and ask the user for guidance.

#### B.4 — Progress summary

When the user asks for status, or periodically during long-running decompositions:
- Read the parent issue checklist (or memory) to get current state.
- Post a `create_comment` on the parent issue summarizing: how many sub-issues done, how many remaining, any blocks.

#### B.5 — Update memory

Update the task memory with current progress: which sub-issues are done, which are pending, any blockers.

---

### Scenario C: Aggregate & Finalize

**When**: All sub-issues in the parent checklist are marked complete (`[x]`).

**Steps**:

#### C.1 — Verify overall completion

1. Read the parent issue body — confirm all checklist items are `[x]`.
2. For each sub-issue, do a final `get_issue` check — confirm all are closed or have merged PRs.
3. Review the original acceptance criteria on the parent issue — confirm they are satisfied by the combined sub-task outcomes.

#### C.2 — Post final summary

Post a `create_comment` on the parent issue with a completion summary:
- List each sub-issue with its outcome (PR merged, issue closed, etc.).
- Confirm the original acceptance criteria are met.
- Note any caveats or follow-up items.

#### C.3 — Close the parent issue

- Call `edit_issue` with `state: "closed"` on the parent issue.
- If project policy requires human closure, skip this step and note it in the summary comment instead.

#### C.4 — Update memory

Mark the parent task as completed in memory with a full summary — parent issue number, all sub-issue numbers, final status, completion timestamp.

---

## @ Mention Rules

These rules apply across all scenarios in this skill:

1. **After creating & assigning each sub-issue** (Scenario A step A.6): @ mention the **assigned agent** on the sub-issue, instructing them to start work and @ the PM when done.
2. **After verifying a sub-issue completion** (Scenario B step B.2): @ mention the **reporting agent** on the sub-issue to acknowledge.
3. **After all sub-issues are complete** (Scenario C step C.2): @ mention relevant **stakeholders** (e.g. the original issue reporter, project maintainers) on the parent issue.
4. **Expect inbound @ mentions**: Agents will @ mention the PM on sub-issues when they complete work or encounter blockers. The PM should monitor notifications for these.
5. **Format**: Use `@username` at the start of a `create_comment`, with a brief actionable message.

---

## Guardrails

### Decomposition Quality
- Do not decompose issues that are already small and concrete enough for direct implementation — route those to `forgejo-coder` instead.
- Each sub-issue must have **specific, verifiable acceptance criteria**. Do not create vague sub-tasks like "improve performance" without measurable goals.
- Prefer fewer, well-scoped sub-issues over many tiny ones. Aim for 2–5 sub-issues per decomposition.
- Keep sub-issues **as independent as possible**. If ordering constraints exist, document them explicitly.

### Delegation
- Do not assign sub-issues to agents not in the agent registry.
- Do not reassign sub-issues without posting a comment explaining why.
- If the decomposition is large (>5 sub-issues), **require user approval** before creating them.

### Tracking
- Do not mark a sub-issue as complete without verifying it (PR merged, tests pass, acceptance criteria met).
- Do not close the parent issue until all sub-issues are verified complete.
- Keep the parent issue checklist up-to-date — stale checklists lead to confusion.

### Safety
- Do not create duplicate sub-issues. Before creating, check memory and search existing issues (`search_issues`) for overlap.
- Do not modify the original issue body content when appending the checklist — preserve all existing content.
- Always include a back-reference to the parent issue in each sub-issue body.

### Communication
- All sub-issue bodies must include the instruction for assigned agents to @ mention the PM on completion.
- Keep all communication on Forgejo issues (not only in memory) so that human stakeholders have visibility.
