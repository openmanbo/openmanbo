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

## Conventions

Instead of a rigid step-by-step workflow, follow these core conventions when managing complex issues:

1. **Checklist Tracking**: Maintain a `- [ ]` markdown checklist of the generated sub-tasks inside the parent issue's body. Update it to `- [x]` when tasks are completed.
2. **Cross-Referencing**: When creating sub-issues, you MUST include a reference to the parent issue in the title (e.g., `[Part of #<parent-id>]`) and the body.
3. **Parent Lifecycle**: Only close the parent issue when ALL sub-tasks in the checklist are confirmed complete.
4. **Notify Agents**: Use `@` mentions to assign or notify the relevant agents whenever a sub-issue is ready to be handled.

## @ Mention Rules

These rules apply to all actions in this skill:

1. **After creating & assigning each sub-issue**: @ mention the **assigned agent** on the sub-issue, instructing them to start work and @ the PM when done.
2. **After verifying a sub-issue completion**: @ mention the **reporting agent** on the sub-issue to acknowledge.
3. **After all sub-issues are complete**: @ mention relevant **stakeholders** (e.g. the original issue reporter, project maintainers) on the parent issue.
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
